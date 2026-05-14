"use client";

import { Result } from "better-result";
import { useEffect, useMemo, useRef, useState } from "react";
import { throttle } from "throttle-debounce";
import { OklchPicker } from "../oklch-picker/oklch-picker";
import { Badge } from "../catalyst/typescript/badge";
import { Button } from "../catalyst/typescript/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "../catalyst/typescript/dialog";
import { Divider } from "../catalyst/typescript/divider";
import { Heading, Subheading } from "../catalyst/typescript/heading";
import { Input } from "../catalyst/typescript/input";
import { Select } from "../catalyst/typescript/select";
import { Text } from "../catalyst/typescript/text";
import {
  applyGraphChange,
  applyGraphChanges,
  exampleGraph,
  solveGraph,
  solveGraphIncr,
  toCssOklch,
  validateGraph,
  type Constraint,
  type Edge,
  type Graph,
  type GraphChange,
  type GraphChanges,
  type Node,
  type OklchColor,
  type SolutionConstraint,
  type SolvedGraph,
  type SolveError,
} from "../../lib/solver";

const STORAGE_KEY = "colorsat:solver:v1";
const DEFAULT_PREVIEW_URL = "http://localhost:44100/people/2";
const EMPTY_GRAPH: Graph = { nodes: [], edges: [] };
const DARK_TEXT = "!text-gray-950 dark:!text-gray-950";
const MUTED_TEXT = "!text-gray-500 dark:!text-gray-500";
const PLAIN_BUTTON = "!text-gray-700 dark:!text-gray-700 hover:!bg-gray-950/5";
const OUTLINE_BUTTON = "!text-gray-950 dark:!text-gray-950";
const SAFE_TOKEN_NAME_PATTERN = /^[A-Za-z0-9._~-]+$/;
const PREVIEW_REFRESH_MS = 500;

type StoredSolverState = {
  graph: Graph;
  selectedNodeId: string | undefined;
  hasSolvedBaseline: boolean;
  previewUrl: string;
};

type AlertVariant = "error" | "warning" | "info";

const CONSTRAINT_TYPES: Constraint["type"][] = [
  "contrast",
  "fixed-lightness",
  "fixed-chroma",
  "fixed-hue",
  "add-lightness",
  "add-chroma",
  "add-hue",
  "multiply-lightness",
  "multiply-chroma",
  "multiply-hue",
];

const DEFAULT_CONSTRAINTS: Record<Constraint["type"], Constraint> = {
  contrast: { type: "contrast", background: "source", value: 60, tolerance: 1 },
  "fixed-lightness": { type: "fixed-lightness", value: 0.5, tolerance: 0.01 },
  "fixed-chroma": { type: "fixed-chroma", value: 0.1, tolerance: 0.01 },
  "fixed-hue": { type: "fixed-hue", value: 0, tolerance: 1 },
  "add-lightness": { type: "add-lightness", value: 0, tolerance: 0.01 },
  "add-chroma": { type: "add-chroma", value: 0, tolerance: 0.01 },
  "add-hue": { type: "add-hue", value: 0, tolerance: 1 },
  "multiply-lightness": { type: "multiply-lightness", value: 1, tolerance: 0.01 },
  "multiply-chroma": { type: "multiply-chroma", value: 1, tolerance: 0.01 },
  "multiply-hue": { type: "multiply-hue", value: 1, tolerance: 1 },
};

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function labelForNode(node: Node | undefined) {
  return node?.displayName.trim() || node?.id || "Unknown token";
}

function formatNumber(value: number | undefined, digits = 3) {
  return value === undefined ? "-" : value.toFixed(digits).replace(/\.?0+$/, "");
}

function formatSolveError(error: SolveError) {
  switch (error._tag) {
    case "SchemaValidationError": {
      const first = error.issues[0];
      return first
        ? `Invalid graph data: ${first.path.join(".") || "value"} ${first.message}`
        : "Invalid graph data.";
    }
    case "CycleError":
      return `Dataflow cycle detected: ${error.cycleNodeIds.join(" -> ")}.`;
    case "DanglingEdgeError":
      return `Edge ${error.edgeId} references missing ${error.role} node ${error.missingNodeId}.`;
    case "DuplicateIdError":
      return `Duplicate ${error.kind} ID: ${error.id}.`;
    case "DuplicateEdgePairError":
      return `Duplicate edge from ${error.sourceNodeId} to ${error.targetNodeId}.`;
    case "UnknownIdError":
      return `Unknown ${error.kind} ID: ${error.id}.`;
    case "ImmutableFieldError":
      return `Cannot change ${error.kind} ${error.id} field ${error.field}.`;
    case "DanglingParentError":
      return `Token ${error.nodeId} references missing outline parent ${error.missingParentNodeId}.`;
    case "ParentCycleError":
      return `Outline parent cycle detected: ${error.cycleNodeIds.join(" -> ")}.`;
  }
}

function InlineAlert({
  children,
  title,
  variant = "info",
}: {
  children: React.ReactNode;
  title?: string;
  variant?: AlertVariant;
}) {
  const tone = {
    error: "border-red-200 bg-red-50 text-red-900",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    info: "border-blue-200 bg-blue-50 text-blue-950",
  }[variant];

  return (
    <div
      role={variant === "error" ? "alert" : undefined}
      className={`rounded-xl border px-4 py-3 text-sm ${tone}`}
    >
      {title && <div className="font-semibold">{title}</div>}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}

function ColorSwatch({ color }: { color: OklchColor | undefined }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-5 shrink-0 rounded-full border border-gray-950/10 bg-gray-100 shadow-sm"
      style={color ? { backgroundColor: toCssOklch(color) } : undefined}
    />
  );
}

function getTokenNameError(graph: Graph, nodeId: string, displayName: string) {
  if (!displayName) {
    return "Token name is required.";
  }

  if (!SAFE_TOKEN_NAME_PATTERN.test(displayName)) {
    return "Use only letters, numbers, hyphen, period, underscore, and tilde.";
  }

  if (graph.nodes.some((node) => node.id !== nodeId && node.displayName === displayName)) {
    return "Token names must be unique.";
  }

  return undefined;
}

function getGraphTokenNameError(graph: Graph) {
  const names = new Set<string>();

  for (const node of graph.nodes) {
    const nameError = getTokenNameError({ ...graph, nodes: [] }, node.id, node.displayName);

    if (nameError) {
      return nameError;
    }

    if (names.has(node.displayName)) {
      return "Token names must be unique.";
    }

    names.add(node.displayName);
  }

  return undefined;
}

function buildPreviewUrl(previewUrl: string, solvedGraph: SolvedGraph | undefined) {
  const trimmedPreviewUrl = previewUrl.trim();

  if (!trimmedPreviewUrl) {
    return { state: "empty" as const };
  }

  let url: URL;

  try {
    const urlWithProtocol = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmedPreviewUrl)
      ? trimmedPreviewUrl
      : `http://${trimmedPreviewUrl}`;
    url = new URL(urlWithProtocol);
  } catch {
    return { state: "invalid" as const };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { state: "invalid" as const };
  }

  if (!solvedGraph) {
    return { state: "valid" as const, url: url.toString(), tokenCount: 0 };
  }

  let tokenCount = 0;

  for (const solutionNode of solvedGraph.nodes) {
    if (!solutionNode.solvedColor) {
      continue;
    }

    const graphNode = solvedGraph.graph.nodes.find((node) => node.id === solutionNode.id);

    if (!graphNode) {
      continue;
    }

    url.searchParams.set(
      graphNode.displayName,
      toCssOklch(solutionNode.solvedColor).replaceAll(" ", "_"),
    );
    tokenCount += 1;
  }

  return { state: "valid" as const, url: url.toString(), tokenCount };
}

function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const setThrottledValueLeading = useMemo(
    () => throttle(intervalMs, (nextValue: T) => setThrottledValue(nextValue)),
    [intervalMs],
  );

  useEffect(() => {
    setThrottledValueLeading(value);
  }, [setThrottledValueLeading, value]);

  useEffect(() => {
    return () => setThrottledValueLeading.cancel();
  }, [setThrottledValueLeading]);

  return throttledValue;
}

function loadStoredState(): {
  state: StoredSolverState;
  warning?: string;
  solvedGraph?: SolvedGraph;
  error?: SolveError;
} {
  if (typeof window === "undefined") {
    return {
      state: {
        graph: EMPTY_GRAPH,
        selectedNodeId: undefined,
        hasSolvedBaseline: false,
        previewUrl: DEFAULT_PREVIEW_URL,
      },
    };
  }

  const fallback = {
    graph: EMPTY_GRAPH,
    selectedNodeId: undefined,
    hasSolvedBaseline: false,
    previewUrl: DEFAULT_PREVIEW_URL,
  };
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return { state: fallback };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSolverState>;
    const graphResult = validateGraph(parsed.graph);

    if (Result.isError(graphResult)) {
      return { state: fallback, warning: "Saved solver state could not be loaded." };
    }

    if (getGraphTokenNameError(graphResult.value)) {
      return { state: fallback, warning: "Saved solver state could not be loaded." };
    }

    const selectedNodeId = graphResult.value.nodes.some((node) => node.id === parsed.selectedNodeId)
      ? parsed.selectedNodeId
      : undefined;
    const state = {
      graph: graphResult.value,
      selectedNodeId,
      hasSolvedBaseline: parsed.hasSolvedBaseline === true,
      previewUrl: typeof parsed.previewUrl === "string" ? parsed.previewUrl : "",
    };

    if (!state.hasSolvedBaseline) {
      return { state };
    }

    const solved = solveGraph(state.graph);

    if (Result.isError(solved)) {
      return { state: { ...state, hasSolvedBaseline: false }, error: solved.error };
    }

    return { state, solvedGraph: solved.value };
  } catch {
    return { state: fallback, warning: "Saved solver state could not be loaded." };
  }
}

export function SolverApp() {
  const initial = useMemo(loadStoredState, []);
  const shellRef = useRef<HTMLDivElement>(null);
  const [graph, setGraph] = useState(initial.state.graph);
  const [selectedNodeId, setSelectedNodeId] = useState(initial.state.selectedNodeId);
  const [solvedGraph, setSolvedGraph] = useState<SolvedGraph | undefined>(initial.solvedGraph);
  const [hasSolvedBaseline, setHasSolvedBaseline] = useState(initial.state.hasSolvedBaseline);
  const [previewUrl, setPreviewUrl] = useState(initial.state.previewUrl);
  const [solutionStale, setSolutionStale] = useState(false);
  const [currentError, setCurrentError] = useState<SolveError | undefined>(initial.error);
  const [storageWarning, setStorageWarning] = useState(initial.warning);
  const [addEdgeTargetNodeId, setAddEdgeTargetNodeId] = useState<string | undefined>();
  const [previewPaneWidth, setPreviewPaneWidth] = useState(36);

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        graph,
        selectedNodeId,
        hasSolvedBaseline,
        previewUrl,
      } satisfies StoredSolverState),
    );
  }, [graph, selectedNodeId, hasSolvedBaseline, previewUrl]);

  function acceptGraphChange(
    result: Result<Graph, SolveError>,
    changes: GraphChanges,
    nextSelectedNodeId?: string,
  ) {
    if (Result.isError(result)) {
      setCurrentError(result.error);
      return;
    }

    setGraph(result.value);
    setSelectedNodeId(nextSelectedNodeId ?? selectedNodeId);
    setStorageWarning(undefined);

    if (!hasSolvedBaseline || !solvedGraph) {
      setSolutionStale(false);
      return;
    }

    const solved = solveGraphIncr(solvedGraph, changes);

    if (Result.isError(solved)) {
      setCurrentError(solved.error);
      setSolutionStale(true);
      return;
    }

    setSolvedGraph(solved.value);
    setCurrentError(undefined);
    setSolutionStale(false);
  }

  function commitChange(change: GraphChange, nextSelectedNodeId?: string) {
    acceptGraphChange(applyGraphChange(graph, change), [change], nextSelectedNodeId);
  }

  function commitChanges(changes: GraphChanges, nextSelectedNodeId?: string) {
    acceptGraphChange(applyGraphChanges(graph, changes), changes, nextSelectedNodeId);
  }

  function addRootToken() {
    const node: Node = {
      id: id("node"),
      parentNodeId: undefined,
      displayName: `token-${graph.nodes.length + 1}`,
      fixedColor: undefined,
    };
    commitChange({ type: "add-node", node }, node.id);
  }

  function addChild(parent: Node) {
    const node: Node = {
      id: id("node"),
      parentNodeId: parent.id,
      displayName: `${labelForNode(parent)}-child`,
      fixedColor: undefined,
    };
    const edge: Edge = {
      id: id("edge"),
      sourceNodeId: parent.id,
      targetNodeId: node.id,
      constraints: [],
    };
    commitChanges(
      [
        { type: "add-node", node },
        { type: "add-edge", edge },
      ],
      node.id,
    );
  }

  function deleteNode(node: Node) {
    const hasRelations =
      graph.nodes.some((child) => child.parentNodeId === node.id) ||
      graph.edges.some((edge) => edge.sourceNodeId === node.id || edge.targetNodeId === node.id);
    if (
      hasRelations &&
      !window.confirm(`Delete ${labelForNode(node)} and remove attached dataflow edges?`)
    ) {
      return;
    }

    const remaining = graph.nodes.find((candidate) => candidate.id !== node.id);
    commitChange(
      { type: "remove-node", nodeId: node.id },
      selectedNodeId === node.id ? remaining?.id : selectedNodeId,
    );
  }

  function solveCurrentGraph() {
    const solved = solveGraph(graph);

    if (Result.isError(solved)) {
      setCurrentError(solved.error);
      setSolutionStale(hasSolvedBaseline);
      return;
    }

    setSolvedGraph(solved.value);
    setHasSolvedBaseline(true);
    setSolutionStale(false);
    setCurrentError(undefined);
  }

  function loadExample() {
    const graph = exampleGraph();
    const solved = solveGraph(graph);
    setGraph(graph);
    setSelectedNodeId(graph.nodes[1]?.id);
    setCurrentError(Result.isError(solved) ? solved.error : undefined);
    setSolvedGraph(Result.isOk(solved) ? solved.value : undefined);
    setHasSolvedBaseline(Result.isOk(solved));
    setSolutionStale(false);
    setStorageWarning(undefined);
  }

  function resetAllState() {
    window.localStorage.clear();
    setGraph(EMPTY_GRAPH);
    setSelectedNodeId(undefined);
    setSolvedGraph(undefined);
    setHasSolvedBaseline(false);
    setPreviewUrl(DEFAULT_PREVIEW_URL);
    setSolutionStale(false);
    setCurrentError(undefined);
    setStorageWarning(undefined);
    setAddEdgeTargetNodeId(undefined);
  }

  function resizePreviewPane(clientX: number) {
    const rect = shellRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    const rightWidth = rect.right - clientX;
    const nextWidth = (rightWidth / rect.width) * 100;
    setPreviewPaneWidth(Math.min(55, Math.max(24, nextWidth)));
  }

  function startPreviewPaneResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    resizePreviewPane(event.clientX);

    function handlePointerMove(moveEvent: PointerEvent) {
      resizePreviewPane(moveEvent.clientX);
    }

    function stopResize() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
  }

  return (
    <main className="min-h-dvh bg-gray-50 p-4 text-gray-950 sm:p-6 lg:p-8 [&_h1]:dark:!text-gray-950 [&_h2]:dark:!text-gray-950 [&_input]:dark:!text-gray-950 [&_p]:dark:!text-gray-500 [&_select]:dark:!text-gray-950">
      <div
        ref={shellRef}
        className="flex w-full flex-col gap-5 lg:min-h-[calc(100dvh-4rem)] lg:flex-row lg:gap-0"
        style={
          {
            "--solver-left-width": `${100 - previewPaneWidth}%`,
            "--solver-preview-width": `${previewPaneWidth}%`,
          } as React.CSSProperties
        }
      >
        <div className="min-w-0 flex flex-col gap-5 lg:basis-[calc(var(--solver-left-width)-0.75rem)] lg:pr-5">
          <header className="flex flex-col gap-4 rounded-2xl border border-gray-950/10 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Heading className={DARK_TEXT}>ColorSAT Solver</Heading>
              <Text className={`mt-1 ${MUTED_TEXT}`}>
                Build a color-token graph, solve constraints, and inspect derived OKLCH values.
              </Text>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {hasSolvedBaseline ? (
                <Badge color={solutionStale ? "amber" : "green"}>
                  {solutionStale ? "Stale solution" : "Solved"}
                </Badge>
              ) : (
                <Badge color="gray">Not solved</Badge>
              )}
              <Button className={OUTLINE_BUTTON} outline onClick={addRootToken}>
                Add root token
              </Button>
              <Button color="dark" onClick={solveCurrentGraph}>
                {hasSolvedBaseline ? "Re-solve" : "Solve"}
              </Button>
            </div>
          </header>

          {storageWarning && <InlineAlert variant="warning">{storageWarning}</InlineAlert>}
          {solutionStale && (
            <InlineAlert variant="warning">
              The last good solution is still visible, but recent edits could not be solved
              incrementally. Re-solve after fixing the issue.
            </InlineAlert>
          )}
          {currentError && (
            <InlineAlert title="Solver error" variant="error">
              {formatSolveError(currentError)}
            </InlineAlert>
          )}

          {graph.nodes.length === 0 ? (
            <section className="rounded-3xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-sm">
              <Subheading className={DARK_TEXT}>No tokens yet</Subheading>
              <Text className={`mx-auto mt-2 max-w-lg ${MUTED_TEXT}`}>
                Create the first token from scratch or load the example from the product brief.
              </Text>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Button color="dark" onClick={addRootToken}>
                  Create first token
                </Button>
                <Button color="amber" onClick={loadExample}>
                  Load example
                </Button>
              </div>
            </section>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
              <TokenOutline
                graph={graph}
                selectedNodeId={selectedNodeId}
                solvedGraph={solvedGraph}
                onAddChild={addChild}
                onAddEdge={(nodeId) => setAddEdgeTargetNodeId(nodeId)}
                onDelete={deleteNode}
                onSelect={setSelectedNodeId}
              />
              <TokenSidebar
                graph={graph}
                node={selectedNode}
                solvedGraph={solvedGraph}
                solutionStale={solutionStale}
                onUpdateNode={(node) => commitChange({ type: "update-node", node }, node.id)}
                onDeleteEdge={(edgeId) => commitChange({ type: "remove-edge", edgeId })}
                onUpdateEdge={(edge) => commitChange({ type: "update-edge", edge })}
              />
            </div>
          )}

          <footer className="flex flex-col gap-3 rounded-2xl border border-gray-950/10 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <Text className={MUTED_TEXT}>
              Clear saved browser data and reset this solver session.
            </Text>
            <Button className={OUTLINE_BUTTON} outline onClick={resetAllState}>
              Reset local state
            </Button>
          </footer>
        </div>

        <button
          aria-label="Resize preview pane"
          className="group hidden w-5 shrink-0 cursor-col-resize touch-none items-stretch justify-center lg:flex"
          type="button"
          onPointerDown={startPreviewPaneResize}
        >
          <span className="h-full w-px bg-gray-950/10 group-hover:bg-gray-950/25" />
        </button>

        <PreviewPane
          hasSolvedBaseline={hasSolvedBaseline}
          previewUrl={previewUrl}
          solutionStale={solutionStale}
          solvedGraph={solvedGraph}
          onPreviewUrlChange={setPreviewUrl}
        />
      </div>

      <AddEdgeDialog
        graph={graph}
        targetNodeId={addEdgeTargetNodeId}
        onClose={() => setAddEdgeTargetNodeId(undefined)}
        onAddEdge={(edge) => {
          setAddEdgeTargetNodeId(undefined);
          commitChange({ type: "add-edge", edge }, edge.targetNodeId);
        }}
      />
    </main>
  );
}

function PreviewPane({
  hasSolvedBaseline,
  previewUrl,
  solutionStale,
  solvedGraph,
  onPreviewUrlChange,
}: {
  hasSolvedBaseline: boolean;
  previewUrl: string;
  solutionStale: boolean;
  solvedGraph: SolvedGraph | undefined;
  onPreviewUrlChange: (previewUrl: string) => void;
}) {
  const iframePreview = buildPreviewUrl(previewUrl, solvedGraph);
  const iframeUrl = useThrottledValue(
    iframePreview.state === "valid" ? iframePreview.url : undefined,
    PREVIEW_REFRESH_MS,
  );

  return (
    <aside className="min-w-0 lg:sticky lg:top-8 lg:h-[calc(100dvh-4rem)] lg:basis-[calc(var(--solver-preview-width)-0.75rem)] lg:overflow-hidden">
      <section className="flex h-full min-h-[32rem] flex-col overflow-hidden rounded-3xl border border-gray-950/10 bg-white shadow-sm">
        <div className="grid gap-4 border-b border-gray-950/10 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Subheading className={DARK_TEXT}>Preview Pane</Subheading>
              <Text className={`mt-1 ${MUTED_TEXT}`}>
                Loads an external URL with solved token values appended as query params.
              </Text>
            </div>
            <Badge color={hasSolvedBaseline && !solutionStale ? "green" : "gray"}>
              {hasSolvedBaseline ? (solutionStale ? "Stale" : "Live") : "No tokens"}
            </Badge>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" htmlFor="preview-url">
              Preview URL
            </label>
            <Input
              id="preview-url"
              className="mt-2"
              onChange={(event) => onPreviewUrlChange(event.target.value)}
              placeholder="localhost:3000"
              type="text"
              value={previewUrl}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-gray-50 p-4">
          {iframePreview.state === "valid" && iframeUrl ? (
            <iframe
              className="h-full min-h-[28rem] w-full rounded-2xl border border-gray-950/10 bg-white"
              src={iframeUrl}
              title="External token preview"
            />
          ) : (
            <div className="flex h-full min-h-[28rem] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
              <Text className={MUTED_TEXT}>
                {iframePreview.state === "empty"
                  ? "Enter a preview URL to load an external page."
                  : "Enter a valid http or https preview URL."}
              </Text>
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}

function TokenOutline({
  graph,
  selectedNodeId,
  solvedGraph,
  onAddChild,
  onAddEdge,
  onDelete,
  onSelect,
}: {
  graph: Graph;
  selectedNodeId: string | undefined;
  solvedGraph: SolvedGraph | undefined;
  onAddChild: (node: Node) => void;
  onAddEdge: (targetNodeId: string) => void;
  onDelete: (node: Node) => void;
  onSelect: (nodeId: string) => void;
}) {
  const solvedById = new Map(solvedGraph?.nodes.map((node) => [node.id, node.solvedColor]));
  const rootNodes = graph.nodes.filter((node) => node.parentNodeId === undefined);

  function childNodes(nodeId: string) {
    return graph.nodes.filter((child) => child.parentNodeId === nodeId);
  }

  function renderNode(node: Node, depth = 0): React.ReactNode {
    const solvedColor = solvedById.get(node.id);
    const children = childNodes(node.id);

    return (
      <div key={node.id} className="space-y-1">
        <div
          className={`rounded-xl border p-2 ${selectedNodeId === node.id ? "border-gray-900 bg-gray-100" : "border-transparent hover:bg-gray-50"}`}
          style={{ marginLeft: depth * 14 }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left"
            onClick={() => onSelect(node.id)}
          >
            <ColorSwatch color={solvedColor} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-950">
              {labelForNode(node)}
            </span>
            {node.fixedColor && <Badge color="blue">Fixed</Badge>}
            {!solvedColor && <span className="text-xs text-gray-400">Unsolved</span>}
          </button>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button className={PLAIN_BUTTON} plain onClick={() => onAddChild(node)}>
              Add child
            </Button>
            <Button className={PLAIN_BUTTON} plain onClick={() => onAddEdge(node.id)}>
              Add edge
            </Button>
            <Button className={PLAIN_BUTTON} plain onClick={() => onDelete(node)}>
              Delete
            </Button>
          </div>
        </div>
        {children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-950/10 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <Subheading className={DARK_TEXT}>Token Outline</Subheading>
        <Text className={MUTED_TEXT}>{graph.nodes.length} tokens</Text>
      </div>
      <div className="mt-4 space-y-1">{rootNodes.map((node) => renderNode(node))}</div>
    </section>
  );
}

function TokenSidebar({
  graph,
  node,
  solvedGraph,
  solutionStale,
  onUpdateNode,
  onDeleteEdge,
  onUpdateEdge,
}: {
  graph: Graph;
  node: Node | undefined;
  solvedGraph: SolvedGraph | undefined;
  solutionStale: boolean;
  onUpdateNode: (node: Node) => void;
  onDeleteEdge: (edgeId: string) => void;
  onUpdateEdge: (edge: Edge) => void;
}) {
  const [draftDisplayName, setDraftDisplayName] = useState(node?.displayName ?? "");

  useEffect(() => {
    setDraftDisplayName(node?.displayName ?? "");
  }, [node?.id, node?.displayName]);

  if (!node) {
    return (
      <section className="rounded-2xl border border-gray-950/10 bg-white p-6 shadow-sm">
        <Subheading className={DARK_TEXT}>Select a token to edit it.</Subheading>
      </section>
    );
  }

  const incomingEdges = graph.edges.filter((edge) => edge.targetNodeId === node.id);
  const solvedColor = solvedGraph?.nodes.find(
    (solutionNode) => solutionNode.id === node.id,
  )?.solvedColor;
  const nameError = getTokenNameError(graph, node.id, draftDisplayName);

  return (
    <section className="rounded-2xl border border-gray-950/10 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4">
        <div>
          <Subheading className={DARK_TEXT}>Token Sidebar</Subheading>
          <Text className={`mt-1 break-all ${MUTED_TEXT}`}>{node.id}</Text>
        </div>

        <Field label="Name">
          <Input
            aria-invalid={nameError ? true : undefined}
            type="text"
            value={draftDisplayName}
            onChange={(event) => {
              const nextDisplayName = event.target.value;
              setDraftDisplayName(nextDisplayName);

              if (!getTokenNameError(graph, node.id, nextDisplayName)) {
                onUpdateNode({ ...node, displayName: nextDisplayName });
              }
            }}
          />
          {nameError ? <Text className="mt-2 text-sm text-red-600">{nameError}</Text> : null}
        </Field>

        <div className="rounded-xl border border-gray-950/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <Subheading className={DARK_TEXT}>Fixed Color</Subheading>
            <Button
              className={OUTLINE_BUTTON}
              outline
              onClick={() =>
                onUpdateNode({
                  ...node,
                  fixedColor: node.fixedColor ? undefined : { l: 1, c: 0, h: 0 },
                })
              }
            >
              {node.fixedColor ? "Clear" : "Set fixed"}
            </Button>
          </div>
          {node.fixedColor ? (
            <OklchFields
              color={node.fixedColor}
              onChange={(fixedColor) => onUpdateNode({ ...node, fixedColor })}
            />
          ) : (
            <Text className={`mt-3 ${MUTED_TEXT}`}>
              No fixed color. This token will be solved from source tokens.
            </Text>
          )}
        </div>

        <div className="rounded-xl border border-gray-950/10 p-4">
          <div className="flex items-center gap-3">
            <ColorSwatch color={solvedColor} />
            <div>
              <Subheading className={DARK_TEXT}>
                Solved Color {solutionStale && <Badge color="amber">Stale</Badge>}
              </Subheading>
              {solvedColor ? (
                <Text className={MUTED_TEXT}>
                  L {formatNumber(solvedColor.l)} / C {formatNumber(solvedColor.c)} / H{" "}
                  {formatNumber(solvedColor.h, 1)}
                </Text>
              ) : (
                <Text className={MUTED_TEXT}>
                  No solved color yet. Add a fixed color or source token, then solve.
                </Text>
              )}
            </div>
          </div>
        </div>

        <Divider />
        <div className="space-y-4">
          <Subheading className={DARK_TEXT}>Source Tokens</Subheading>
          {incomingEdges.length === 0 && (
            <Text className={MUTED_TEXT}>No source tokens feed into this token.</Text>
          )}
          {incomingEdges.map((edge) => {
            const source = graph.nodes.find((sourceNode) => sourceNode.id === edge.sourceNodeId);
            const solutionEdge = solvedGraph?.edges.find((candidate) => candidate.id === edge.id);
            return (
              <div key={edge.id} className="rounded-xl border border-gray-950/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-950">
                      {labelForNode(source)}
                    </div>
                    <Text className={`break-all ${MUTED_TEXT}`}>{edge.id}</Text>
                  </div>
                  <Button className={OUTLINE_BUTTON} outline onClick={() => onDeleteEdge(edge.id)}>
                    Delete edge
                  </Button>
                </div>
                <ConstraintEditor
                  edge={edge}
                  solutionConstraints={solutionEdge?.constraints}
                  onUpdateEdge={onUpdateEdge}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ConstraintEditor({
  edge,
  solutionConstraints,
  onUpdateEdge,
}: {
  edge: Edge;
  solutionConstraints: SolutionConstraint[] | undefined;
  onUpdateEdge: (edge: Edge) => void;
}) {
  function updateConstraint(index: number, constraint: Constraint) {
    onUpdateEdge({
      ...edge,
      constraints: edge.constraints.map((item, itemIndex) =>
        itemIndex === index ? constraint : item,
      ),
    });
  }

  return (
    <div className="mt-4 space-y-3">
      {edge.constraints.map((constraint, index) => {
        const solution = solutionConstraints?.[index];
        return (
          <div key={index} className="rounded-lg bg-gray-50 p-3">
            <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_7rem_7rem_auto]">
              <Field label="Type">
                <Select
                  value={constraint.type}
                  onChange={(event) =>
                    updateConstraint(
                      index,
                      changeConstraintType(constraint, event.target.value as Constraint["type"]),
                    )
                  }
                >
                  {CONSTRAINT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Value">
                <Input
                  type="number"
                  step={stepForConstraintValue(constraint.type)}
                  value={constraint.value}
                  onChange={(event) =>
                    updateConstraint(index, {
                      ...constraint,
                      value: numberValue(event.target.value, constraint.value),
                    } as Constraint)
                  }
                />
              </Field>
              <Field label="Tolerance">
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={constraint.tolerance}
                  onChange={(event) =>
                    updateConstraint(index, {
                      ...constraint,
                      tolerance: numberValue(event.target.value, constraint.tolerance),
                    } as Constraint)
                  }
                />
              </Field>
              <div className="flex items-end">
                <Button
                  className={PLAIN_BUTTON}
                  plain
                  onClick={() =>
                    onUpdateEdge({
                      ...edge,
                      constraints: edge.constraints.filter((_, itemIndex) => itemIndex !== index),
                    })
                  }
                >
                  Delete
                </Button>
              </div>
            </div>
            {constraint.type === "contrast" && (
              <Field label="Background" className="mt-3 max-w-xs">
                <Select
                  value={constraint.background}
                  onChange={(event) =>
                    updateConstraint(index, {
                      ...constraint,
                      background: event.target.value as "source" | "target",
                    })
                  }
                >
                  <option value="source">source</option>
                  <option value="target">target</option>
                </Select>
              </Field>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              {solution ? (
                <Badge color={solution.valueInTolerance ? "green" : "red"}>
                  {solution.valueInTolerance ? "Pass" : "Fail"}
                </Badge>
              ) : (
                <Badge color="gray">Not solved yet</Badge>
              )}
              <span>Target: {formatNumber(solution?.value ?? constraint.value, 4)}</span>
              <span>Actual: {formatNumber(solution?.actual, 4)}</span>
              <span>Error: {formatNumber(solution?.error, 4)}</span>
            </div>
          </div>
        );
      })}
      <Button
        className={OUTLINE_BUTTON}
        outline
        onClick={() =>
          onUpdateEdge({
            ...edge,
            constraints: [...edge.constraints, DEFAULT_CONSTRAINTS.contrast],
          })
        }
      >
        Add constraint
      </Button>
    </div>
  );
}

function AddEdgeDialog({
  graph,
  targetNodeId,
  onClose,
  onAddEdge,
}: {
  graph: Graph;
  targetNodeId: string | undefined;
  onClose: () => void;
  onAddEdge: (edge: Edge) => void;
}) {
  const [query, setQuery] = useState("");
  const target = graph.nodes.find((node) => node.id === targetNodeId);
  const candidates = graph.nodes.filter((node) => {
    if (!targetNodeId || node.id === targetNodeId) return false;
    if (!`${node.displayName} ${node.id}`.toLowerCase().includes(query.toLowerCase())) return false;
    const edge: Edge = { id: id("edge"), sourceNodeId: node.id, targetNodeId, constraints: [] };
    return Result.isOk(applyGraphChange(graph, { type: "add-edge", edge }));
  });

  return (
    <Dialog open={targetNodeId !== undefined} onClose={onClose} size="lg">
      <DialogTitle className={DARK_TEXT}>Add source token</DialogTitle>
      <DialogDescription className={MUTED_TEXT}>
        Choose a token that should feed into {labelForNode(target)}.
      </DialogDescription>
      <DialogBody>
        <Input
          type="search"
          placeholder="Search tokens"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="mt-4 max-h-80 space-y-2 overflow-auto">
          {candidates.length === 0 && (
            <Text className={MUTED_TEXT}>No valid source candidates.</Text>
          )}
          {candidates.map((node) => (
            <button
              key={node.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-950/10 p-3 text-left hover:bg-gray-50"
              onClick={() =>
                targetNodeId &&
                onAddEdge({ id: id("edge"), sourceNodeId: node.id, targetNodeId, constraints: [] })
              }
            >
              <span className="font-medium text-gray-950">{labelForNode(node)}</span>
              <span className="text-xs text-gray-500">{node.id}</span>
            </button>
          ))}
        </div>
      </DialogBody>
      <DialogActions>
        <Button className={OUTLINE_BUTTON} outline onClick={onClose}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function OklchFields({
  color,
  onChange,
}: {
  color: OklchColor;
  onChange: (color: OklchColor) => void;
}) {
  return <OklchPicker color={color} onChange={onChange} />;
}

function Field({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function numberValue(value: string, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function changeConstraintType(constraint: Constraint, type: Constraint["type"]): Constraint {
  const defaults = DEFAULT_CONSTRAINTS[type];
  return { ...defaults, value: constraint.value, tolerance: constraint.tolerance } as Constraint;
}

function stepForConstraintValue(type: Constraint["type"]) {
  if (type === "contrast") {
    return 1;
  }

  if (type.endsWith("hue")) {
    return 1;
  }

  if (type.endsWith("chroma")) {
    return 0.01;
  }

  return 0.05;
}
