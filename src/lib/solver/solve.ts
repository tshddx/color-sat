import { Result } from "better-result";
import { circularAverage, hueDistance, isDisplayP3Oklch, normalizeOklch } from "./color-space";
import {
  constraintError,
  constraintTouches,
  evaluateEdgeConstraints,
  targetValue,
  type Attribute,
} from "./constraints";
import { applyGraphChanges, getIncomingEdges, topologicalNodeIds, validateGraph } from "./graph";
import { parseSolvedGraph } from "./schemas";
import type {
  Constraint,
  Edge,
  Graph,
  GraphChanges,
  OklchColor,
  SolvedGraph,
  SolutionEdge,
  SolutionNode,
} from "./types";
import type { SolveError } from "./errors";

const LIGHTNESS_STEPS = 40;
const CHROMA_STEPS = 36;
const HUE_STEPS = 72;
const SEARCH_ITERATIONS = 28;
const SCORE_EPSILON = 0.000000001;

type SourceEdge = { edge: Edge; sourceColor: OklchColor };

type CandidateScore = {
  color: OklchColor;
  inToleranceCount: number;
  objective: number;
  distanceToDefault: number;
};

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function defaultColor(sourceEdges: SourceEdge[]): OklchColor {
  return normalizeOklch({
    l: average(sourceEdges.map(({ sourceColor }) => sourceColor.l)),
    c: average(sourceEdges.map(({ sourceColor }) => sourceColor.c)),
    h: circularAverage(sourceEdges.map(({ sourceColor }) => sourceColor.h)),
  });
}

function touchedAttributes(sourceEdges: SourceEdge[]) {
  const touched = new Set<Attribute>();

  for (const { edge } of sourceEdges) {
    for (const constraint of edge.constraints) {
      for (const attribute of constraintTouches(constraint)) {
        touched.add(attribute);
      }
    }
  }

  return touched;
}

function constraintsForAttribute(sourceEdges: SourceEdge[], attribute: Attribute) {
  return sourceEdges.flatMap(({ edge, sourceColor }) =>
    edge.constraints
      .filter((constraint) => constraintTouches(constraint).includes(attribute))
      .map((constraint) => ({ constraint, sourceColor })),
  );
}

function solveNumericAttribute(sourceEdges: SourceEdge[], attribute: Attribute, fallback: number) {
  const constraints = constraintsForAttribute(sourceEdges, attribute).filter(
    ({ constraint }) => constraint.type !== "contrast",
  );

  if (constraints.length === 0) {
    return fallback;
  }

  if (attribute === "h") {
    let best = fallback;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let step = 0; step < HUE_STEPS; step += 1) {
      const candidate = (step / HUE_STEPS) * 360;
      const score = constraints.reduce((sum, { constraint, sourceColor }) => {
        const expected = targetValue(sourceColor, constraint);
        return sum + (hueDistance(candidate, expected) / constraint.tolerance) ** 2;
      }, 0);

      if (
        score < bestScore ||
        (score === bestScore && hueDistance(candidate, fallback) < hueDistance(best, fallback))
      ) {
        best = candidate;
        bestScore = score;
      }
    }

    return normalizeOklch({ l: 0, c: 0, h: best }).h;
  }

  const domainMin = attribute === "l" ? 0 : 0;
  const domainMax = attribute === "l" ? 1 : 0.45;
  let low = domainMin;
  let high = domainMax;
  let best = fallback;

  for (let iteration = 0; iteration < SEARCH_ITERATIONS; iteration += 1) {
    const left = low + (high - low) / 3;
    const right = high - (high - low) / 3;
    const leftScore = scoreScalar(left, constraints, attribute);
    const rightScore = scoreScalar(right, constraints, attribute);

    if (leftScore <= rightScore) {
      high = right;
      best = left;
    } else {
      low = left;
      best = right;
    }
  }

  return Math.min(domainMax, Math.max(domainMin, best));
}

function scoreScalar(
  candidate: number,
  constraints: { constraint: Constraint; sourceColor: OklchColor }[],
  attribute: Attribute,
) {
  return constraints.reduce((sum, { constraint, sourceColor }) => {
    const expected = targetValue(sourceColor, constraint);
    const error =
      attribute === "h" ? hueDistance(candidate, expected) : Math.abs(candidate - expected);
    return sum + (error / constraint.tolerance) ** 2;
  }, 0);
}

function scoreCandidate(
  sourceEdges: SourceEdge[],
  candidate: OklchColor,
  fallback: OklchColor,
): CandidateScore {
  let objective = 0;
  let inToleranceCount = 0;

  for (const { edge, sourceColor } of sourceEdges) {
    for (const constraint of edge.constraints) {
      const error = constraintError(sourceColor, candidate, constraint);

      if (error === undefined) {
        continue;
      }

      objective += (error / constraint.tolerance) ** 2;

      if (error <= constraint.tolerance) {
        inToleranceCount += 1;
      }
    }
  }

  return {
    color: candidate,
    inToleranceCount,
    objective,
    distanceToDefault:
      Math.abs(candidate.l - fallback.l) +
      Math.abs(candidate.c - fallback.c) +
      hueDistance(candidate.h, fallback.h) / 360,
  };
}

function pickBetterCandidate(current: CandidateScore | undefined, next: CandidateScore) {
  if (!current) {
    return next;
  }

  if (next.inToleranceCount !== current.inToleranceCount) {
    return next.inToleranceCount > current.inToleranceCount ? next : current;
  }

  if (Math.abs(next.objective - current.objective) > SCORE_EPSILON) {
    return next.objective < current.objective ? next : current;
  }

  if (Math.abs(next.distanceToDefault - current.distanceToDefault) > SCORE_EPSILON) {
    return next.distanceToDefault < current.distanceToDefault ? next : current;
  }

  if (next.color.l !== current.color.l) {
    return next.color.l < current.color.l ? next : current;
  }

  if (next.color.c !== current.color.c) {
    return next.color.c < current.color.c ? next : current;
  }

  return next.color.h < current.color.h ? next : current;
}

function constraintCount(sourceEdges: SourceEdge[]) {
  return sourceEdges.reduce((count, { edge }) => count + edge.constraints.length, 0);
}

function contrastChromaSearchGroups(chroma: number) {
  const groups = [[chroma]];

  if (chroma === 0) {
    return groups;
  }

  for (let step = 1; step <= 5; step += 1) {
    const ratio = step / 10;
    groups.push([chroma * (1 - ratio), chroma * (1 + ratio)]);
  }

  return groups;
}

function solveDerivedColor(sourceEdges: SourceEdge[]) {
  const fallback = defaultColor(sourceEdges);
  const touched = touchedAttributes(sourceEdges);
  const hasContrast = sourceEdges.some(({ edge }) =>
    edge.constraints.some((constraint) => constraint.type === "contrast"),
  );

  const base = normalizeOklch({
    l: touched.has("l") ? solveNumericAttribute(sourceEdges, "l", fallback.l) : fallback.l,
    c: touched.has("c") ? solveNumericAttribute(sourceEdges, "c", fallback.c) : fallback.c,
    h: touched.has("h") ? solveNumericAttribute(sourceEdges, "h", fallback.h) : fallback.h,
  });

  if (!hasContrast && isDisplayP3Oklch(base)) {
    return base;
  }

  let best: CandidateScore | undefined;
  const hue = base.h;
  const constraints = constraintCount(sourceEdges);
  const chromaSearchGroups = hasContrast
    ? contrastChromaSearchGroups(base.c)
    : [Array.from({ length: CHROMA_STEPS + 1 }, (_, step) => (step / CHROMA_STEPS) * 0.45)];

  for (const chromaCandidates of chromaSearchGroups) {
    let bestInGroup: CandidateScore | undefined;

    for (let lStep = 0; lStep <= LIGHTNESS_STEPS; lStep += 1) {
      const l = lStep / LIGHTNESS_STEPS;

      for (const c of chromaCandidates) {
        const candidate = normalizeOklch({ l, c, h: hue });

        if (!isDisplayP3Oklch(candidate)) {
          continue;
        }

        const score = scoreCandidate(sourceEdges, candidate, fallback);
        best = pickBetterCandidate(best, score);
        bestInGroup = pickBetterCandidate(bestInGroup, score);
      }
    }

    if (bestInGroup?.inToleranceCount === constraints) {
      return bestInGroup.color;
    }
  }

  return best?.color;
}

function solveNode(
  graph: Graph,
  nodeId: string,
  solvedColors: Map<string, OklchColor | undefined>,
): SolutionNode {
  const node = graph.nodes.find((graphNode) => graphNode.id === nodeId);

  if (!node) {
    return { id: nodeId, solvedColor: undefined };
  }

  if (node.fixedColor) {
    return { id: node.id, solvedColor: normalizeOklch(node.fixedColor) };
  }

  const incomingEdges = getIncomingEdges(graph, node.id);

  if (incomingEdges.length === 0) {
    return { id: node.id, solvedColor: undefined };
  }

  const sourceEdges: SourceEdge[] = [];

  for (const edge of incomingEdges) {
    const sourceColor = solvedColors.get(edge.sourceNodeId);

    if (!sourceColor) {
      return { id: node.id, solvedColor: undefined };
    }

    sourceEdges.push({ edge, sourceColor });
  }

  return { id: node.id, solvedColor: solveDerivedColor(sourceEdges) };
}

function buildSolutionEdges(
  graph: Graph,
  solvedColors: Map<string, OklchColor | undefined>,
): SolutionEdge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    constraints: evaluateEdgeConstraints(
      edge,
      solvedColors.get(edge.sourceNodeId),
      solvedColors.get(edge.targetNodeId),
    ),
  }));
}

export function solveGraph(graph: Graph): Result<SolvedGraph, SolveError> {
  const validGraph = validateGraph(graph);

  if (Result.isError(validGraph)) {
    return Result.err(validGraph.error);
  }

  const sorted = topologicalNodeIds(validGraph.value);

  if (Result.isError(sorted)) {
    return Result.err(sorted.error);
  }

  const solvedColors = new Map<string, OklchColor | undefined>();

  for (const nodeId of sorted.value) {
    const solvedNode = solveNode(validGraph.value, nodeId, solvedColors);
    solvedColors.set(solvedNode.id, solvedNode.solvedColor);
  }

  const nodes = validGraph.value.nodes.map((node) => ({
    id: node.id,
    solvedColor: solvedColors.get(node.id),
  }));

  return Result.ok({
    graph: validGraph.value,
    nodes,
    edges: buildSolutionEdges(validGraph.value, solvedColors),
  });
}

export function solveGraphIncr(
  solvedGraph: SolvedGraph,
  graphChanges: GraphChanges,
): Result<SolvedGraph, SolveError> {
  const parsedSolvedGraph = parseSolvedGraph(solvedGraph);

  if (Result.isError(parsedSolvedGraph)) {
    return parsedSolvedGraph;
  }

  if (graphChanges.length === 0) {
    return Result.ok(parsedSolvedGraph.value);
  }

  const changedGraph = applyGraphChanges(parsedSolvedGraph.value.graph, graphChanges);

  if (Result.isError(changedGraph)) {
    return Result.err(changedGraph.error);
  }

  return solveGraph(changedGraph.value);
}
