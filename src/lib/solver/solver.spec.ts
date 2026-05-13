import { Result } from "better-result";
import { describe, expect, it } from "vite-plus/test";
import {
  applyGraphChange,
  applyGraphChanges,
  constraintError,
  exampleGraph,
  solveGraph,
  solveGraphIncr,
  validateGraph,
  type Constraint,
  type Edge,
  type Graph,
  type Node,
} from "./index";

const white = { l: 1, c: 0, h: 0 };
const black = { l: 0, c: 0, h: 0 };

function node(id: string, fixedColor?: Node["fixedColor"], parentNodeId?: string): Node {
  return { id, parentNodeId, displayName: id, fixedColor };
}

function edge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  constraints: Constraint[] = [],
): Edge {
  return { id, sourceNodeId, targetNodeId, constraints };
}

function okValue<T, E>(result: Result<T, E>): T {
  expect(Result.isOk(result)).toBe(true);
  return result.unwrap();
}

function errTag<T>(result: Result<T, { _tag: string }>) {
  expect(Result.isError(result)).toBe(true);
  return result.match({ ok: () => undefined, err: (error) => error._tag });
}

describe("solver schemas and graph validation", () => {
  it("parses a valid graph and allows graphs without fixed colors", () => {
    const graph = { nodes: [node("a"), node("b")], edges: [edge("a-b", "a", "b")] };

    expect(Result.isOk(validateGraph(graph))).toBe(true);
  });

  it("rejects invalid colors and tolerances", () => {
    expect(errTag(validateGraph({ nodes: [node("a", { l: 2, c: 0, h: 0 })], edges: [] }))).toBe(
      "SchemaValidationError",
    );
    expect(
      errTag(
        validateGraph({
          nodes: [node("a", white), node("b")],
          edges: [edge("a-b", "a", "b", [{ type: "fixed-lightness", value: 0.5, tolerance: 0 }])],
        }),
      ),
    ).toBe("SchemaValidationError");
  });

  it("rejects duplicate IDs, dangling edges, edge pairs, and cycles", () => {
    expect(errTag(validateGraph({ nodes: [node("a"), node("a")], edges: [] }))).toBe(
      "DuplicateIdError",
    );
    expect(errTag(validateGraph({ nodes: [node("a")], edges: [edge("a-b", "a", "b")] }))).toBe(
      "DanglingEdgeError",
    );
    expect(
      errTag(
        validateGraph({
          nodes: [node("a"), node("b")],
          edges: [edge("a-b", "a", "b"), edge("a-b-2", "a", "b")],
        }),
      ),
    ).toBe("DuplicateEdgePairError");
    expect(
      errTag(
        validateGraph({
          nodes: [node("a"), node("b")],
          edges: [edge("a-b", "a", "b"), edge("b-a", "b", "a")],
        }),
      ),
    ).toBe("CycleError");
  });

  it("rejects dangling parents and parent cycles", () => {
    expect(errTag(validateGraph({ nodes: [node("a", undefined, "missing")], edges: [] }))).toBe(
      "DanglingParentError",
    );
    expect(
      errTag(
        validateGraph({
          nodes: [node("a", undefined, "b"), node("b", undefined, "a")],
          edges: [],
        }),
      ),
    ).toBe("ParentCycleError");
  });
});

describe("graph changes", () => {
  it("adds, updates, and removes nodes and edges immutably", () => {
    const graph: Graph = { nodes: [node("a", white)], edges: [] };
    const changed = okValue(
      applyGraphChanges(graph, [
        { type: "add-node", node: node("b") },
        { type: "add-edge", edge: edge("a-b", "a", "b") },
        {
          type: "update-edge",
          edge: edge("a-b", "a", "b", [{ type: "fixed-lightness", value: 0.2, tolerance: 0.01 }]),
        },
        { type: "remove-edge", edgeId: "a-b" },
      ]),
    );

    expect(changed.nodes.map((changedNode) => changedNode.id)).toEqual(["a", "b"]);
    expect(changed.edges).toEqual([]);
    expect(graph.nodes).toHaveLength(1);
  });

  it("returns graph change structural errors", () => {
    const graph: Graph = { nodes: [node("a"), node("b")], edges: [edge("a-b", "a", "b")] };

    expect(errTag(applyGraphChange(graph, { type: "add-node", node: node("a") }))).toBe(
      "DuplicateIdError",
    );
    expect(errTag(applyGraphChange(graph, { type: "remove-edge", edgeId: "missing" }))).toBe(
      "UnknownIdError",
    );
    expect(
      errTag(applyGraphChange(graph, { type: "update-edge", edge: edge("a-b", "b", "a") })),
    ).toBe("ImmutableFieldError");
  });

  it("remove-node cascades edges and reparents direct children", () => {
    const graph: Graph = {
      nodes: [
        node("root"),
        node("child", undefined, "root"),
        node("grandchild", undefined, "child"),
      ],
      edges: [edge("root-child", "root", "child"), edge("child-grandchild", "child", "grandchild")],
    };
    const changed = okValue(applyGraphChange(graph, { type: "remove-node", nodeId: "child" }));

    expect(changed.nodes).toEqual([node("root"), node("grandchild", undefined, "root")]);
    expect(changed.edges).toEqual([]);
  });
});

describe("constraint evaluation", () => {
  it("uses absolute tolerance and shortest hue distance", () => {
    expect(
      constraintError(
        white,
        { l: 0.55, c: 0, h: 0 },
        { type: "fixed-lightness", value: 0.5, tolerance: 0.01 },
      ),
    ).toBeCloseTo(0.05);
    expect(
      constraintError(
        { l: 0, c: 0, h: 359 },
        { l: 0, c: 0, h: 1 },
        { type: "fixed-hue", value: 359, tolerance: 1 },
      ),
    ).toBeCloseTo(2);
  });

  it("evaluates contrast orientation and undefined colors", () => {
    const sourceBackground = constraintError(white, black, {
      type: "contrast",
      background: "source",
      value: 90,
      tolerance: 1,
    });
    const targetBackground = constraintError(black, white, {
      type: "contrast",
      background: "target",
      value: 90,
      tolerance: 1,
    });

    expect(sourceBackground).toBeDefined();
    expect(targetBackground).toBeDefined();
    expect(sourceBackground).toBeCloseTo(targetBackground ?? 0);
    expect(
      constraintError(undefined, white, { type: "fixed-lightness", value: 0.5, tolerance: 0.1 }),
    ).toBeUndefined();
  });
});

describe("solving", () => {
  it("inherits source colors over empty edges", () => {
    const solved = okValue(
      solveGraph({ nodes: [node("a", white), node("b")], edges: [edge("a-b", "a", "b")] }),
    );

    expect(solved.nodes[1]?.solvedColor).toEqual(white);
  });

  it("fixed colors win but incoming constraints still report errors", () => {
    const solved = okValue(
      solveGraph({
        nodes: [node("a", white), node("b", black)],
        edges: [edge("a-b", "a", "b", [{ type: "fixed-lightness", value: 1, tolerance: 0.01 }])],
      }),
    );

    expect(solved.nodes[1]?.solvedColor).toEqual(black);
    expect(solved.edges[0]?.constraints[0]).toMatchObject({ error: 1, valueInTolerance: false });
  });

  it("solves simple derivation constraints within tolerance", () => {
    const solved = okValue(
      solveGraph({
        nodes: [node("a", { l: 0.4, c: 0.1, h: 30 }), node("b")],
        edges: [
          edge("a-b", "a", "b", [
            { type: "add-lightness", value: 0.2, tolerance: 0.02 },
            { type: "multiply-chroma", value: 0.5, tolerance: 0.02 },
            { type: "add-hue", value: 30, tolerance: 6 },
          ]),
        ],
      }),
    );

    expect(solved.nodes[1]?.solvedColor?.l).toBeCloseTo(0.6, 1);
    expect(solved.nodes[1]?.solvedColor?.c).toBeCloseTo(0.05, 1);
    expect(solved.edges[0]?.constraints.every((constraint) => constraint.valueInTolerance)).toBe(
      true,
    );
  });

  it("finds a dark color for high contrast from white", () => {
    const solved = okValue(
      solveGraph({
        nodes: [node("background", white), node("text")],
        edges: [
          edge("background-text", "background", "text", [
            { type: "contrast", background: "source", value: 90, tolerance: 3 },
          ]),
        ],
      }),
    );

    expect(solved.nodes[1]?.solvedColor?.l).toBeLessThan(0.5);
    expect(solved.edges[0]?.constraints[0]?.valueInTolerance).toBe(true);
  });

  it("preserves source hue and chroma for example graph text colors", () => {
    const graph = exampleGraph();
    const solved = okValue(solveGraph(graph));
    const pairs = [
      ["bg-primary", "text-primary"],
      ["bg-primary", "text-secondary"],
      ["bg-yellow", "text-yellow"],
      ["bg-yellow", "text-yellow-secondary"],
      ["bg-purple", "text-purple"],
      ["bg-purple", "text-purple-secondary"],
    ] as const;

    for (const [sourceName, targetName] of pairs) {
      const source = graph.nodes.find((candidate) => candidate.displayName === sourceName);
      const target = graph.nodes.find((candidate) => candidate.displayName === targetName);
      const solvedTarget = solved.nodes.find((candidate) => candidate.id === target?.id);

      expect(source?.fixedColor).toBeDefined();
      expect(solvedTarget?.solvedColor).toBeDefined();
      expect(solvedTarget?.solvedColor?.h).toBeCloseTo(source?.fixedColor?.h ?? 0, 5);
      expect(solvedTarget?.solvedColor?.c).toBeCloseTo(source?.fixedColor?.c ?? 0, 2);
    }
  });

  it("falls back to nearby chroma when source chroma cannot satisfy contrast", () => {
    const solved = okValue(
      solveGraph({
        nodes: [node("background", { l: 0.7, c: 0.1, h: 40 }), node("text")],
        edges: [
          edge("background-text", "background", "text", [
            { type: "contrast", background: "source", value: 10, tolerance: 0.5 },
          ]),
        ],
      }),
    );

    expect(solved.nodes[1]?.solvedColor?.h).toBeCloseTo(40, 5);
    expect(solved.nodes[1]?.solvedColor?.c).toBeCloseTo(0.11, 5);
    expect(solved.edges[0]?.constraints[0]?.valueInTolerance).toBe(true);
  });

  it("does not fall back to non-zero chroma from a zero-chroma source", () => {
    const solved = okValue(
      solveGraph({
        nodes: [node("background", white), node("text")],
        edges: [
          edge("background-text", "background", "text", [
            { type: "contrast", background: "source", value: 90, tolerance: 3 },
          ]),
        ],
      }),
    );

    expect(solved.nodes[1]?.solvedColor?.c).toBeCloseTo(0, 5);
    expect(solved.edges[0]?.constraints[0]?.valueInTolerance).toBe(true);
  });

  it("propagates undefined roots downstream", () => {
    const solved = okValue(
      solveGraph({ nodes: [node("a"), node("b")], edges: [edge("a-b", "a", "b")] }),
    );

    expect(solved.nodes).toEqual([
      { id: "a", solvedColor: undefined },
      { id: "b", solvedColor: undefined },
    ]);
  });

  it("incremental solving matches full solving and empty changes return previous", () => {
    const graph: Graph = { nodes: [node("a", white), node("b")], edges: [edge("a-b", "a", "b")] };
    const previous = okValue(solveGraph(graph));
    const unchanged = okValue(solveGraphIncr(previous, []));
    const changes = [
      {
        type: "update-edge" as const,
        edge: edge("a-b", "a", "b", [{ type: "fixed-lightness", value: 0.2, tolerance: 0.03 }]),
      },
    ];
    const incremental = solveGraphIncr(previous, changes);
    const full = solveGraph(okValue(applyGraphChanges(previous.graph, changes)));

    expect(unchanged).toEqual(previous);
    expect(incremental).toEqual(full);
  });
});
