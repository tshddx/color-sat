import type { Edge, Graph, Node } from "./types";

function node(
  id: string,
  displayName: string,
  fixedColor: Node["fixedColor"],
  parentNodeId?: string,
): Node {
  return { id, parentNodeId, displayName, fixedColor };
}

function contrastEdge(id: string, sourceNodeId: string, targetNodeId: string, value: number): Edge {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    constraints: [{ type: "contrast", background: "source", value, tolerance: 2 }],
  };
}

export function exampleGraph(): Graph {
  const bgPrimary = node("node-bg-primary", "bg-primary", { l: 1, c: 0, h: 0 });
  const textPrimary = node("node-text-primary", "text-primary", undefined, bgPrimary.id);
  const textSecondary = node("node-text-secondary", "text-secondary", undefined, bgPrimary.id);
  const bgYellow = node("node-bg-yellow", "bg-yellow", { l: 0.987, c: 0.022, h: 95.277 });
  const textYellow = node("node-text-yellow", "text-yellow", undefined, bgYellow.id);
  const textYellowSecondary = node(
    "node-text-yellow-secondary",
    "text-yellow-secondary",
    undefined,
    bgYellow.id,
  );
  const bgPurple = node("node-bg-purple", "bg-purple", { l: 0.969, c: 0.016, h: 293.756 });
  const textPurple = node("node-text-purple", "text-purple", undefined, bgPurple.id);
  const textPurpleSecondary = node(
    "node-text-purple-secondary",
    "text-purple-secondary",
    undefined,
    bgPurple.id,
  );

  return {
    nodes: [
      bgPrimary,
      textPrimary,
      textSecondary,
      bgYellow,
      textYellow,
      textYellowSecondary,
      bgPurple,
      textPurple,
      textPurpleSecondary,
    ],
    edges: [
      contrastEdge("edge-bg-primary-text-primary", bgPrimary.id, textPrimary.id, 90),
      contrastEdge("edge-bg-primary-text-secondary", bgPrimary.id, textSecondary.id, 60),
      contrastEdge("edge-bg-yellow-text-yellow", bgYellow.id, textYellow.id, 90),
      contrastEdge("edge-bg-yellow-text-yellow-secondary", bgYellow.id, textYellowSecondary.id, 60),
      contrastEdge("edge-bg-purple-text-purple", bgPurple.id, textPurple.id, 90),
      contrastEdge("edge-bg-purple-text-purple-secondary", bgPurple.id, textPurpleSecondary.id, 60),
    ],
  };
}
