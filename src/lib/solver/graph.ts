import { Result } from "better-result";
import {
  CycleError,
  DanglingEdgeError,
  DanglingParentError,
  DuplicateEdgePairError,
  DuplicateIdError,
  ImmutableFieldError,
  ParentCycleError,
  UnknownIdError,
  type SolveError,
} from "./errors";
import { parseGraph, parseGraphChange, parseGraphChanges } from "./schemas";
import type { Edge, Graph, GraphChange, GraphChanges, Node } from "./types";

export function getIncomingEdges(graph: Graph, nodeId: string): Edge[] {
  return graph.edges.filter((edge) => edge.targetNodeId === nodeId);
}

export function getOutgoingEdges(graph: Graph, nodeId: string): Edge[] {
  return graph.edges.filter((edge) => edge.sourceNodeId === nodeId);
}

export function getChildren(graph: Graph, parentNodeId: string | undefined): Node[] {
  return graph.nodes.filter((node) => node.parentNodeId === parentNodeId);
}

function duplicateId<T extends { id: string }>(items: T[]): string | undefined {
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.id)) {
      return item.id;
    }

    seen.add(item.id);
  }

  return undefined;
}

export function topologicalNodeIds(graph: Graph): Result<string[], SolveError> {
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
    outgoing.set(node.id, []);
  }

  for (const edge of graph.edges) {
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
    outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  }

  const queue = graph.nodes.filter((node) => inDegree.get(node.id) === 0).map((node) => node.id);
  const sorted: string[] = [];

  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    sorted.push(nodeId);

    for (const targetNodeId of outgoing.get(nodeId) ?? []) {
      const next = (inDegree.get(targetNodeId) ?? 0) - 1;
      inDegree.set(targetNodeId, next);

      if (next === 0) {
        queue.push(targetNodeId);
      }
    }
  }

  if (sorted.length !== graph.nodes.length) {
    const cycleNodeIds = graph.nodes
      .filter((node) => (inDegree.get(node.id) ?? 0) > 0)
      .map((node) => node.id);
    return Result.err(new CycleError({ cycleNodeIds }));
  }

  return Result.ok(sorted);
}

export function validateGraph(input: unknown): Result<Graph, SolveError> {
  const parsed = parseGraph(input);

  if (Result.isError(parsed)) {
    return parsed;
  }

  const graph = parsed.value;
  const duplicateNodeId = duplicateId(graph.nodes);

  if (duplicateNodeId) {
    return Result.err(new DuplicateIdError({ kind: "node", id: duplicateNodeId }));
  }

  const duplicateEdgeId = duplicateId(graph.edges);

  if (duplicateEdgeId) {
    return Result.err(new DuplicateIdError({ kind: "edge", id: duplicateEdgeId }));
  }

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgePairs = new Map<string, string[]>();

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.sourceNodeId)) {
      return Result.err(
        new DanglingEdgeError({
          edgeId: edge.id,
          missingNodeId: edge.sourceNodeId,
          role: "source",
        }),
      );
    }

    if (!nodeIds.has(edge.targetNodeId)) {
      return Result.err(
        new DanglingEdgeError({
          edgeId: edge.id,
          missingNodeId: edge.targetNodeId,
          role: "target",
        }),
      );
    }

    const pairKey = `${edge.sourceNodeId}\u0000${edge.targetNodeId}`;
    const pairEdgeIds = edgePairs.get(pairKey) ?? [];
    pairEdgeIds.push(edge.id);
    edgePairs.set(pairKey, pairEdgeIds);

    if (pairEdgeIds.length > 1) {
      return Result.err(
        new DuplicateEdgePairError({
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          edgeIds: pairEdgeIds,
        }),
      );
    }
  }

  const sorted = topologicalNodeIds(graph);

  if (Result.isError(sorted)) {
    return Result.err(sorted.error);
  }

  const parentByNodeId = new Map(graph.nodes.map((node) => [node.id, node.parentNodeId]));

  for (const node of graph.nodes) {
    if (node.parentNodeId !== undefined && !nodeIds.has(node.parentNodeId)) {
      return Result.err(
        new DanglingParentError({ nodeId: node.id, missingParentNodeId: node.parentNodeId }),
      );
    }

    const path: string[] = [];
    const seen = new Set<string>();
    let currentId: string | undefined = node.id;

    while (currentId !== undefined) {
      if (seen.has(currentId)) {
        return Result.err(new ParentCycleError({ cycleNodeIds: [...path, currentId] }));
      }

      seen.add(currentId);
      path.push(currentId);
      currentId = parentByNodeId.get(currentId);
    }
  }

  return Result.ok(graph);
}

function applyParsedGraphChange(graph: Graph, change: GraphChange): Result<Graph, SolveError> {
  switch (change.type) {
    case "add-node": {
      if (graph.nodes.some((node) => node.id === change.node.id)) {
        return Result.err(new DuplicateIdError({ kind: "node", id: change.node.id }));
      }

      return validateGraph({ ...graph, nodes: [...graph.nodes, change.node] });
    }
    case "remove-node": {
      const nodeToRemove = graph.nodes.find((node) => node.id === change.nodeId);

      if (!nodeToRemove) {
        return Result.err(new UnknownIdError({ kind: "node", id: change.nodeId }));
      }

      return validateGraph({
        nodes: graph.nodes
          .filter((node) => node.id !== change.nodeId)
          .map((node) =>
            node.parentNodeId === change.nodeId
              ? { ...node, parentNodeId: nodeToRemove.parentNodeId }
              : node,
          ),
        edges: graph.edges.filter(
          (edge) => edge.sourceNodeId !== change.nodeId && edge.targetNodeId !== change.nodeId,
        ),
      });
    }
    case "update-node": {
      const existing = graph.nodes.find((node) => node.id === change.node.id);

      if (!existing) {
        return Result.err(new UnknownIdError({ kind: "node", id: change.node.id }));
      }

      return validateGraph({
        ...graph,
        nodes: graph.nodes.map((node) => (node.id === change.node.id ? change.node : node)),
      });
    }
    case "add-edge": {
      if (graph.edges.some((edge) => edge.id === change.edge.id)) {
        return Result.err(new DuplicateIdError({ kind: "edge", id: change.edge.id }));
      }

      return validateGraph({ ...graph, edges: [...graph.edges, change.edge] });
    }
    case "remove-edge": {
      if (!graph.edges.some((edge) => edge.id === change.edgeId)) {
        return Result.err(new UnknownIdError({ kind: "edge", id: change.edgeId }));
      }

      return validateGraph({
        ...graph,
        edges: graph.edges.filter((edge) => edge.id !== change.edgeId),
      });
    }
    case "update-edge": {
      const existing = graph.edges.find((edge) => edge.id === change.edge.id);

      if (!existing) {
        return Result.err(new UnknownIdError({ kind: "edge", id: change.edge.id }));
      }

      for (const field of ["id", "sourceNodeId", "targetNodeId"] as const) {
        if (existing[field] !== change.edge[field]) {
          return Result.err(new ImmutableFieldError({ kind: "edge", id: existing.id, field }));
        }
      }

      return validateGraph({
        ...graph,
        edges: graph.edges.map((edge) => (edge.id === change.edge.id ? change.edge : edge)),
      });
    }
  }
}

export function applyGraphChange(
  graph: Graph,
  graphChange: GraphChange,
): Result<Graph, SolveError> {
  const parsedGraph = validateGraph(graph);

  if (Result.isError(parsedGraph)) {
    return parsedGraph;
  }

  const parsedChange = parseGraphChange(graphChange);

  if (Result.isError(parsedChange)) {
    return Result.err(parsedChange.error);
  }

  return applyParsedGraphChange(parsedGraph.value, parsedChange.value);
}

export function applyGraphChanges(
  graph: Graph,
  graphChanges: GraphChanges,
): Result<Graph, SolveError> {
  const parsedChanges = parseGraphChanges(graphChanges);

  if (Result.isError(parsedChanges)) {
    return Result.err(parsedChanges.error);
  }

  let current = validateGraph(graph);

  if (Result.isError(current)) {
    return current;
  }

  for (const change of parsedChanges.value) {
    current = applyParsedGraphChange(current.value, change);

    if (Result.isError(current)) {
      return current;
    }
  }

  return current;
}
