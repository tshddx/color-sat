# Solver Implementation Plan

This plan implements the Solver module described in `prompt.md`, with the decisions made during planning captured here as source-of-truth implementation constraints.

## Scope

Build a purely functional TypeScript solver module for color-token graphs. The module accepts plain serializable JavaScript objects, validates inputs with Zod, returns `better-result` `Result` values instead of throwing, and exposes graph-change helpers that the frontend can use as its state transition boundary.

The solver is responsible for:

- Type definitions and Zod schemas for graphs, changes, colors, constraints, solved graphs, and errors.
- Full graph validation, including dataflow structure and outline parent structure.
- Applying graph changes immutably.
- Solving valid graphs in topological order.
- Incrementally re-solving changed subgraphs with output equivalence to full solving.
- Evaluating constraints and reporting per-constraint absolute errors.

The solver is not responsible for:

- React state management or UI rendering.
- Local storage persistence.
- CSS color formatting except through small color-space helpers.
- Creating visual graph layouts.

## Confirmed Deviations From `prompt.md`

The plan intentionally differs from the initial prompt in these areas:

- Constraint `error` is absolute error in the same unit as the constraint, not percent error.
- `tolerance` is absolute and must be greater than zero.
- `SolutionConstraint.error` is `number | undefined`, because undefined source/target colors cannot be numerically evaluated.
- Duplicate ordered edge pairs are solver-invalid, not just frontend-invalid.
- `parentNodeId` is solver-validated, even though it is not relevant to numerical solving.
- `remove-node` cascades attached edge deletion and reparents direct outline children to the removed node's parent.
- `remove-node` does not create replacement dataflow edges for reparented children.
- Graphs are valid even when they contain no fixed colors.
- Valid solved colors must be inside Display P3. The solver must not return out-of-gamut OKLCH values.

## Dependencies

Add required runtime dependencies:

```sh
vp add better-result zod
```

Do not install Vitest directly. Tests should import from `vite-plus/test`.

## Proposed File Layout

Create a focused folder module under `src/lib/solver/`:

```txt
src/lib/solver/
  color-space.ts
  constraints.ts
  errors.ts
  graph.ts
  index.ts
  schemas.ts
  solve.ts
  types.ts
  *.spec.ts
```

Suggested responsibilities:

- `types.ts`: exported serializable types.
- `errors.ts`: `TaggedError` classes and `SolveError` union.
- `schemas.ts`: Zod schemas and parse helpers.
- `graph.ts`: graph validation, topological sorting, graph-change application, affected-node discovery.
- `color-space.ts`: Display P3 validity, APCA conversion, OKLCH normalization helpers.
- `constraints.ts`: constraint metadata, target evaluation, error evaluation, objective scoring.
- `solve.ts`: `solveGraph` and `solveGraphIncr` implementation.
- `index.ts`: public exports.

## Public API

Export these functions from `src/lib/solver/index.ts`:

```ts
import type { Result } from "better-result";

export function solveGraph(graph: Graph): Result<SolvedGraph, SolveError>;

export function solveGraphIncr(
  solvedGraph: SolvedGraph,
  graphChanges: GraphChanges,
): Result<SolvedGraph, SolveError>;

export function applyGraphChange(graph: Graph, graphChange: GraphChange): Result<Graph, SolveError>;

export function applyGraphChanges(
  graph: Graph,
  graphChanges: GraphChanges,
): Result<Graph, SolveError>;
```

`applyGraphChange` and `applyGraphChanges` validate the full resulting graph before returning `Ok`. The frontend should use these APIs as the source of truth for graph state transitions.

Optional query helpers may be exported if useful, but keep them secondary to the core API:

```ts
export function getIncomingEdges(graph: Graph, nodeId: string): Edge[];
export function getOutgoingEdges(graph: Graph, nodeId: string): Edge[];
export function getChildren(graph: Graph, parentNodeId: string | undefined): Node[];
```

Avoid exporting mutation helpers that bypass validation.

## Core Types

Use the prompt's types as the baseline, with the following adjusted solved constraint shape:

```ts
export type SolutionConstraint = {
  type: Constraint["type"];
  value: number;
  error: number | undefined;
  valueInTolerance: boolean;
};
```

Keep `OklchColor` serializable and required:

```ts
export type OklchColor = {
  l: number;
  c: number;
  h: number;
};
```

Normalize missing, non-finite, or meaningless hue to `0`. Never persist or return `NaN`.

Do not add `inGamut` or `gamut` to `SolutionNode` for v1. The solver's contract is that returned colors are Display P3-valid.

## Error Types

Implement the prompt's `better-result` tagged errors and add the required structural errors:

```ts
class CycleError extends TaggedError("CycleError")<{ cycleNodeIds: string[] }>() {}

class DanglingEdgeError extends TaggedError("DanglingEdgeError")<{
  edgeId: string;
  missingNodeId: string;
  role: "source" | "target";
}>() {}

class DuplicateIdError extends TaggedError("DuplicateIdError")<{
  kind: "node" | "edge";
  id: string;
}>() {}

class DuplicateEdgePairError extends TaggedError("DuplicateEdgePairError")<{
  sourceNodeId: string;
  targetNodeId: string;
  edgeIds: string[];
}>() {}

class UnknownIdError extends TaggedError("UnknownIdError")<{
  kind: "node" | "edge";
  id: string;
}>() {}

class ImmutableFieldError extends TaggedError("ImmutableFieldError")<{
  kind: "node" | "edge";
  id: string;
  field: "id" | "sourceNodeId" | "targetNodeId";
}>() {}

class DanglingParentError extends TaggedError("DanglingParentError")<{
  nodeId: string;
  missingParentNodeId: string;
}>() {}

class ParentCycleError extends TaggedError("ParentCycleError")<{
  cycleNodeIds: string[];
}>() {}

class SchemaValidationError extends TaggedError("SchemaValidationError")<{
  issues: ZodIssue[];
}>() {}
```

`SolveError` should include all of these.

Structural invalidity returns `Err`. Numerically unsatisfied constraints do not return `Err`; they return `Ok` with best-effort valid colors and `valueInTolerance: false` on failing constraints.

## Schema Validation

Use Zod for all public inputs:

- `Graph`
- `Node`
- `Edge`
- `Constraint`
- `GraphChange`
- `GraphChanges`
- `SolvedGraph` if needed by `solveGraphIncr`

Validation rules:

- `Node.id`, `Edge.id`, `sourceNodeId`, `targetNodeId`, and `displayName` are strings.
- `parentNodeId` is `string | undefined`.
- `fixedColor` is `OklchColor | undefined`.
- OKLCH bounds:
  - `l`: `0 <= l <= 1`
  - `c`: `0 <= c`, with candidate validity ultimately checked against Display P3. Schema may use a conservative upper bound if desired, but Display P3 is authoritative.
  - `h`: finite number, normalized modulo 360 after parsing.
- Constraint values:
  - `contrast.value`: `0 <= value <= 106`
  - `fixed-lightness.value`: `0 <= value <= 1`
  - `fixed-chroma.value`: `0 <= value`
  - `fixed-hue.value`: finite number, normalized modulo 360
  - additive and multiplicative values: finite numbers, with final candidates constrained by valid color bounds.
- Every `tolerance` must be finite and greater than `0`.

Any Zod parse failure becomes `SchemaValidationError`.

## Full Graph Validation

After schema validation, validate graph-level invariants:

- Node IDs are unique.
- Edge IDs are unique.
- Every edge source and target exists.
- No duplicate ordered edge pairs exist for `(sourceNodeId, targetNodeId)`.
- Dataflow edges form a DAG.
- Every non-undefined `parentNodeId` exists.
- Parent chains form a forest with no cycles.

Do not require at least one fixed-color node. Graphs with no anchors are valid.

Validation should short-circuit on the first error. Keep ordering deterministic for testability.

## Graph Change Semantics

`GraphChange` remains whole-object replacement:

```ts
type GraphChange =
  | { type: "add-node"; node: Node }
  | { type: "remove-node"; nodeId: string }
  | { type: "update-node"; node: Node }
  | { type: "add-edge"; edge: Edge }
  | { type: "remove-edge"; edgeId: string }
  | { type: "update-edge"; edge: Edge };
```

Apply changes immutably and in order.

### Add Node

- Return `DuplicateIdError` if the ID already exists.
- Insert the node.
- Validate full resulting graph.

### Remove Node

- Return `UnknownIdError` if the node does not exist.
- Remove the node.
- Remove all incoming and outgoing dataflow edges attached to that node.
- Reparent every direct outline child to the removed node's parent.
- Do not create replacement dataflow edges for reparented children.
- Validate full resulting graph.

### Update Node

- Return `UnknownIdError` if the node does not exist.
- Return `ImmutableFieldError` if `id` changes.
- Replace the whole node object.
- Validate full resulting graph.

Changing `parentNodeId`, `displayName`, or `fixedColor` is allowed.

### Add Edge

- Return `DuplicateIdError` if the ID already exists.
- Insert the edge.
- Validate full resulting graph. This catches dangling nodes, duplicate edge pairs, and cycles.

### Remove Edge

- Return `UnknownIdError` if the edge does not exist.
- Remove the edge.
- Validate full resulting graph.

### Update Edge

- Return `UnknownIdError` if the edge does not exist.
- Return `ImmutableFieldError` if `id`, `sourceNodeId`, or `targetNodeId` changes.
- Replace the whole edge object.
- Validate full resulting graph.

## Constraint Semantics

All constraint errors are absolute, not percentage-based.

`valueInTolerance` is `true` when `error !== undefined && error <= tolerance`.

Constraint-specific error units:

- `contrast`: APCA Lc units, using absolute APCA magnitude.
- `fixed-lightness`, `add-lightness`, `multiply-lightness`: OKLCH L units.
- `fixed-chroma`, `add-chroma`, `multiply-chroma`: OKLCH C units.
- `fixed-hue`, `add-hue`, `multiply-hue`: degrees, using shortest angular distance modulo 360.

Contrast orientation:

- If `background: "source"`, compute APCA with target as foreground and source as background.
- If `background: "target"`, compute APCA with source as foreground and target as background.
- Compare `Math.abs(actualLc)` with `constraint.value`.

Implicit inheritance is per target attribute across all incoming edges:

- If no explicit incoming constraint touches an attribute, inherit/average that attribute from source colors.
- If at least one explicit incoming constraint touches an attribute, do not add hidden inheritance penalties for that attribute.
- Empty-constraint edges are valid and imply full inheritance when no explicit constraints touch L/C/H.
- Contrast participates in L/C solving. Hue still inherits unless explicitly constrained.

## Color-Space Helpers

Create a small abstraction in `color-space.ts`, implemented with `culori` initially:

```ts
export function normalizeOklch(color: OklchColor): OklchColor;
export function isDisplayP3Oklch(color: OklchColor): boolean;
export function apcaLc(foreground: OklchColor, background: OklchColor): number | undefined;
export function toCssOklch(color: OklchColor): string;
export function toSrgbHex(color: OklchColor): string | undefined;
```

Solver search must reject candidates that are not valid Display P3 colors. The frontend can use `toSrgbHex` for fallback previews if needed, but solver decisions should not be clipped to sRGB.

## Solving Algorithm

Use topological order over dataflow edges. Sources solve before targets.

### Node Solving Cases

For each node:

1. If `fixedColor` is set:
   - Normalize it.
   - If it is not Display P3-valid, schema or solve validation should reject it with `SchemaValidationError` or a dedicated validation issue.
   - Use it as the solved color.
   - Evaluate incoming constraints against this fixed result and report errors.

2. If the node has no incoming edges and no `fixedColor`:
   - Return `solvedColor: undefined`.

3. If any source node for any incoming edge has `solvedColor: undefined`:
   - Return `solvedColor: undefined`.
   - Return `SolutionConstraint` rows for incoming constraints with `error: undefined` and `valueInTolerance: false`.

4. Otherwise derive a candidate color from incoming source colors and constraints.

### Search Objective

For candidate color `x`, minimize:

```ts
objective = sum((error_i / tolerance_i) ** 2);
```

Only numeric errors participate. Undefined errors occur only when no candidate/source is evaluable and should result in `solvedColor: undefined`, not a numeric optimization.

Unsatisfied constraints are not solver errors. Return the best candidate found inside Display P3.

### Attribute Defaults

Compute source defaults before applying explicit constraints:

- Lightness: arithmetic average of source `l`.
- Chroma: arithmetic average of source `c`.
- Hue: circular/angular average of source `h` values.

If all explicit constraints leave an attribute untouched, keep the averaged source default.

### Search Strategy

Use the minimal search needed by the active constraints:

- If no `contrast` constraint is present, solve constrained attributes independently with 1D search.
- If `contrast` is present, use 2D search over `(L, C)` and keep hue at its inherited/default value unless explicit hue constraints are present.
- Hue constraints are still evaluated with shortest angular distance and can be solved with 1D angular search when no contrast couples L/C.

The implementation should follow the existing `src/lib/color-contrast.ts` style:

- Coarse scan over the valid domain.
- Local refinement for promising intervals.
- Fixed iteration count, using `28` iterations as a starting point.
- Early exit when all constraints are within tolerance.
- Deterministic tie-breakers for test stability.

Candidate domains:

- `L`: `[0, 1]`
- `C`: non-negative, pruned by `isDisplayP3Oklch`
- `H`: `[0, 360)`, normalized modulo 360

Do not return candidates outside Display P3.

### Tie-Breaking

When candidate objective scores are equal or very close, prefer deterministic outputs:

1. Candidate where more constraints are in tolerance.
2. Lower objective score.
3. Candidate closer to inherited source default.
4. Lower L, then lower C, then lower normalized H as final stable tie-breakers.

The exact final tie-breaker can change, but it must be deterministic and documented in tests.

## Incremental Solving

`solveGraphIncr(prev, changes)` must be deeply equal to `solveGraph(applyGraphChanges(prev.graph, changes))` for both `Ok` and `Err` cases.

Algorithm:

1. If `changes` is empty, return `Result.ok(prev)`.
2. Apply changes in order using the same graph-change semantics as `applyGraphChanges`.
3. If applying changes returns `Err`, return the same `Err`.
4. Compute affected seed nodes from the effective change semantics:
   - Added node: seed that node.
   - Updated node: seed that node if `fixedColor` changed or other solve-relevant fields changed. `displayName` and `parentNodeId` do not affect solving.
   - Removed node: removed node disappears. For every removed outgoing edge `removed -> target`, seed `target` if target still exists.
   - Added edge: seed `targetNodeId`.
   - Updated edge: seed `targetNodeId`.
   - Removed edge: seed the removed edge's old `targetNodeId` if it still exists.
   - Cascaded edge removals from `remove-node` must be included.
5. Expand seeds to their transitive closure through outgoing edges in the post-change graph.
6. Topologically order affected nodes within the post-change graph.
7. Carry over unaffected `SolutionNode`s and `SolutionEdge`s from `prev` where their nodes/edges still exist.
8. Re-solve affected nodes, reading already-solved source colors from the merged solution map.
9. Rebuild `SolvedGraph` with the post-change graph, sorted solution nodes, and solution edges.

Removed nodes and edges must disappear from the solved output entirely.

## Output Ordering

Keep output ordering stable:

- `SolvedGraph.graph.nodes` and `.edges` preserve graph order.
- `SolvedGraph.nodes` should align with `graph.nodes` order.
- `SolvedGraph.edges` should align with `graph.edges` order.
- Constraints in `SolutionEdge.constraints` align with the source edge's constraint order.

Stable ordering is required for deep-equality incremental tests.

## Testing Plan

Emphasize helper-level unit tests. Add small end-to-end smoke coverage only where helper boundaries need integration confidence.

Test groups:

- Schema validation:
  - Valid graph parses.
  - Invalid OKLCH values fail.
  - Invalid constraint values fail.
  - `tolerance <= 0` fails.

- Graph validation:
  - Duplicate node IDs.
  - Duplicate edge IDs.
  - Duplicate ordered edge pairs.
  - Dangling edge source/target.
  - Dataflow cycle.
  - Dangling parent.
  - Parent cycle.
  - No fixed-color graph is valid.

- Graph changes:
  - Add/update/remove node.
  - Add/update/remove edge.
  - Immutable field errors.
  - `remove-node` removes attached edges.
  - `remove-node` reparents direct children to the removed node's parent.
  - `remove-node` does not create replacement dataflow edges.

- Constraint evaluation:
  - Absolute tolerance semantics.
  - Hue shortest angular distance, including `359` vs `1`.
  - Contrast orientation for `background: "source"` and `background: "target"`.
  - Contrast uses absolute APCA magnitude.
  - Undefined source/target yields `error: undefined`.

- Search helpers:
  - Empty edge inherits source color.
  - Fixed color wins over incoming constraints but still reports errors.
  - Derived node with simple fixed/add/multiply constraints solves within tolerance when possible.
  - Contrast from white background finds a dark valid Display P3 color.
  - Over-constrained node returns `Ok` with best-effort valid Display P3 color and failed constraints.
  - Root without fixed color returns `undefined`.
  - Undefined source propagates downstream.

- Incremental equivalence:
  - Representative add-node, update-node, add-edge, update-edge, remove-edge, and remove-node changes.
  - `solveGraphIncr(prev, [])` returns `Ok(prev)`.
  - Deep equality between incremental result and full result after applying changes.

## Implementation Phases

1. Add dependencies.
2. Add types, errors, schemas, and public exports.
3. Implement color-space helpers and tests.
4. Implement graph validation and topological sorting tests.
5. Implement `applyGraphChange(s)` and tests.
6. Implement constraint evaluation and tests.
7. Implement per-attribute and contrast-aware search helpers and tests.
8. Implement `solveGraph` and smoke tests.
9. Implement `solveGraphIncr` and equivalence tests.
10. Run verification.

## Verification

After implementation, run:

```sh
vp check --fix
vp test
```
