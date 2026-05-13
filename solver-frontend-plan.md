# Solver Frontend Implementation Plan

This plan implements the `/solver` route described in `prompt.md`, using the solver module from `solver-plan.md` as the domain boundary for graph validation, graph changes, and solving.

## Scope

Build an interactive Token Outline and Token Sidebar UI for constructing color-token graphs, adding constraints, solving the graph, and viewing solved colors and constraint errors.

The frontend is responsible for:

- A new TanStack Router file route at `src/routes/solver.tsx`.
- React components for the solver app, token outline, token sidebar, add-edge dialog, inline alerts, and constraint editors.
- Local graph state and versioned local-storage persistence.
- Calling `applyGraphChange(s)`, `solveGraph`, and `solveGraphIncr` explicitly and handling both `Ok` and `Err` branches.
- Rendering graph-wide and node/edge-specific errors without throwing.
- Manual and hybrid incremental solve UX.

The frontend is not responsible for:

- Reimplementing graph validation.
- Reimplementing cycle detection.
- Returning or mutating invalid graph states.
- Rendering a graph canvas in v1.
- Dedicated frontend tests in the first implementation pass.

## Dependencies

The solver implementation adds:

```sh
vp add better-result zod
```

No additional frontend libraries are planned for v1. Use existing React, TanStack Router, Tailwind 4, and Catalyst components under `src/components/catalyst/typescript/`.

## Existing Codebase Constraints

- Routes are file-based TanStack Router routes under `src/routes`.
- Existing routes use `createFileRoute`, e.g. `/spectrum` in `src/routes/spectrum.tsx`.
- Existing UI imports Catalyst components directly from `src/components/catalyst/typescript/*`.
- Catalyst `Alert` is a modal dialog, not an inline alert. Do not use it for persistent inline solver errors.
- Existing app state persistence uses `localStorage` with a versioned key pattern.
- Use Vite+ commands for verification: `vp check --fix` and `vp test`.

## Route and File Layout

Add:

```txt
src/routes/solver.tsx
src/components/solver/
  add-edge-dialog.tsx
  constraint-editor.tsx
  inline-alert.tsx
  solver-app.tsx
  solver-empty-state.tsx
  solver-errors.tsx
  token-outline.tsx
  token-sidebar.tsx
  oklch-fields.tsx
```

Optional helper files:

```txt
src/components/solver/graph-view-model.ts
src/components/solver/solver-storage.ts
```

Keep component splitting pragmatic. If an initial implementation is clearer with fewer files, prefer fewer files, but keep solver-domain logic out of component bodies where it becomes hard to reason about.

## Route

`src/routes/solver.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SolverApp } from "../components/solver/solver-app";

export const Route = createFileRoute("/solver")({ component: SolverPage });

function SolverPage() {
  return <SolverApp />;
}
```

The route should render on desktop and mobile. Desktop can use a three-region layout; mobile should stack the outline and sidebar vertically.

## State Model

Use component-local React state with local-storage persistence.

Storage key:

```ts
const STORAGE_KEY = "colorsat:solver:v1";
```

Persist a serializable state shape similar to:

```ts
type StoredSolverState = {
  graph: Graph;
  selectedNodeId: string | undefined;
  hasSolvedBaseline: boolean;
};
```

Runtime state should additionally track:

```ts
type SolverUiState = {
  graph: Graph;
  selectedNodeId: string | undefined;
  solvedGraph: SolvedGraph | undefined;
  hasSolvedBaseline: boolean;
  solutionStale: boolean;
  currentError: SolveError | undefined;
  addEdgeTargetNodeId: string | undefined;
  searchQuery: string;
};
```

Use the solver's Zod schemas or exported parse helpers when hydrating from local storage. If persisted data fails validation:

- Fall back to an empty graph.
- Clear `selectedNodeId`.
- Clear `hasSolvedBaseline`.
- Show a non-blocking inline warning that saved solver state could not be loaded.

Do not persist transient errors. Recompute errors through solver APIs.

If persisted state has `hasSolvedBaseline: true`, call `solveGraph(graph)` during hydration after the graph validates. On success, restore `solvedGraph`, keep `hasSolvedBaseline: true`, and clear stale state. On failure, load the graph, set `hasSolvedBaseline: false`, and show the solve error inline. This avoids persisting stale solved output while still preserving the user's expectation that a previously solved graph resumes with a baseline.

## Graph State Changes

All graph mutations must go through the solver-domain API:

```ts
applyGraphChange(graph, change);
applyGraphChanges(graph, changes);
```

If the result is `Ok`:

- Update `graph` with the returned graph.
- Update local storage on the next persistence effect.
- If a solved baseline exists, call `solveGraphIncr(previousSolvedGraph, [change])` or `solveGraph` if incremental cannot be applied safely.

If the result is `Err`:

- Do not update `graph`.
- Render the error inline.

The frontend should construct whole-object `GraphChange` values. Do not add patch-style frontend-to-solver changes.

## Solving UX

Use the hybrid solve model:

- Initial solve is manual.
- Top bar has a `Solve` button when there is no solved baseline.
- Top bar has `Re-solve` after a baseline exists.
- After a successful manual solve, subsequent graph edits use `solveGraphIncr`.
- If incremental solving returns `Err`, keep the last good solved graph visible, set `solutionStale: true`, and render the error.
- Manual `Re-solve` always calls `solveGraph(graph)` and clears stale state on success.

On `Ok`:

- Store the solved graph.
- Clear current solve error.
- Set `hasSolvedBaseline: true`.
- Set `solutionStale: false`.

On `Err`:

- Store current error.
- Do not throw.
- Do not overwrite last good solved graph unless there is no baseline.
- Mark stale if the graph has changed since the last good solution.

## Initial State and Empty State

If no persisted graph exists, start with an empty graph.

When the graph is empty, render a central empty-state card with two actions:

- `Create first token`
- `Load example`

`Create first token`:

- Adds a root node with `parentNodeId: undefined`, no edge, no fixed color.
- Selects the new node.

`Load example`:

- Creates the user-story graph from `prompt.md`:
  - `bg-primary`, fixed `oklch(1 0 0)`.
  - `text-primary`, child of `bg-primary`, edge `bg-primary -> text-primary`, contrast `background: "source"`, `value: 90`, reasonable absolute tolerance.
  - `text-secondary`, child of `bg-primary`, edge `bg-primary -> text-secondary`, contrast `background: "source"`, `value: 70`, reasonable absolute tolerance.
- Calls `solveGraph` immediately.
- Selects `bg-primary` or `text-primary`; prefer `text-primary` to show a solved derived token.

Because tolerances are now absolute, do not use the prompt's percent tolerance values directly. Use APCA Lc tolerance values such as `1` or `2` for example contrast constraints.

## Layout

Desktop layout:

- Top bar: title, solve status, `Add root token`, `Solve/Re-solve`.
- Left pane: Token Outline.
- Main/right pane: Token Sidebar for selected token.

Suggested responsive structure:

- `main` with full viewport minimum height.
- On large screens, grid columns like `minmax(18rem, 22rem) minmax(0, 1fr)`.
- On mobile, stack top bar, outline, and sidebar.

Use Catalyst primitives where they fit:

- `Button`
- `Heading`, `Subheading`
- `Input`
- `Textarea` if needed
- `Select` or `Listbox` if appropriate
- `Dialog` for Add Edge
- `Badge`
- `Divider`
- `Text`, `Code`

Use Tailwind 4 utility classes matching the existing app's rounded cards, borders, gray palette, and spacing.

## Inline Alert

Create a local inline alert component instead of using Catalyst `Alert`:

```tsx
type InlineAlertProps = {
  children: React.ReactNode;
  title?: string;
  variant?: "error" | "warning" | "info";
};
```

Use it for:

- Graph-wide validation errors near the top bar.
- Stale solution warnings.
- Selected-node or selected-edge errors in the sidebar when error metadata identifies a relevant node/edge.
- Saved-state hydration warnings.

Keep styling consistent with Catalyst cards: rounded border, subtle background, compact text.

## Error Rendering

Create a helper component or function in `solver-errors.tsx`:

```ts
function formatSolveError(error: SolveError): string;
```

Use `matchError` from `better-result` for exhaustive handling when available.

Render messages for all solver errors:

- `SchemaValidationError`: summarize the first issue and expose a compact details list if useful.
- `CycleError`: name the involved node IDs.
- `DanglingEdgeError`: identify edge and missing source/target.
- `DuplicateIdError`: identify duplicate node/edge ID.
- `DuplicateEdgePairError`: identify source/target pair.
- `UnknownIdError`: identify missing node/edge.
- `ImmutableFieldError`: identify immutable field.
- `DanglingParentError`: identify node and missing parent.
- `ParentCycleError`: identify cycle node IDs.

Do not let solver errors bubble to route-level exceptions.

## Token Outline

The Token Outline is a tree/forest view based on `parentNodeId`.

Required behavior:

- Header includes `Add root token`.
- Multiple root nodes are allowed.
- Each token row includes:
  - Name.
  - Solved swatch if a solved color exists.
  - Fixed-color indicator if fixed.
  - `Add child` button.
  - `Add edge` button.
  - Optional delete button.
- Clicking a row selects the node.
- Selected row is visually highlighted.
- If solved color is `undefined`, show a subtle empty/unsolved indicator.

`Add root token`:

- Creates a node with `parentNodeId: undefined`.
- No edge is created.
- Selects the new node.

`Add child`:

- Creates a child node with `parentNodeId` set to the parent node ID.
- Creates a dataflow edge from parent to child with `constraints: []`.
- Empty constraints are meaningful: they imply full inheritance from source unless explicit constraints elsewhere touch attributes.
- Use `applyGraphChanges` for the batch so node and edge are validated together.
- Selects the child node.

`Delete`:

- Dispatches `remove-node`.
- Solver semantics remove attached dataflow edges and reparent direct outline children to the removed node's parent.
- If the selected node is removed, select a nearby remaining node or clear selection.
- The UI should confirm deletion when the node has attached edges or children, because deletion has cascading/reparenting effects.

## Add Edge Dialog

Each Token Outline row has `Add edge`. Clicking it:

- Sets that row's node as the edge target.
- Opens a dialog with a searchable list of valid source candidates.

Candidate filtering:

- Exclude the target itself.
- Exclude candidates where an edge pair `candidate -> target` already exists.
- Exclude candidates where adding `candidate -> target` would introduce a cycle.
- Do not duplicate cycle logic manually. Prefer testing candidate graph changes with `applyGraphChange(graph, { type: "add-edge", edge })` and include only candidates that return `Ok`.

Dialog behavior:

- Search by `displayName` and ID.
- Show enough context to disambiguate similarly named nodes.
- On selection, create the edge with `constraints: []`.
- Close the dialog and select the target node.
- If the add unexpectedly returns `Err`, close or keep open based on implementation simplicity, but render the error inline.

## Token Sidebar

When no node is selected:

- Show an empty selection card: "Select a token to edit it."

When a node is selected, show:

- Editable token name.
- Fixed color controls.
- Solved color section if solved color exists.
- Source Tokens section listing incoming edges.
- Constraint editors under each incoming edge.

### Token Name

- Use an `Input`.
- On change or blur, construct a full replacement `Node` and dispatch `update-node`.
- Keep ID immutable.
- Empty display names should either be allowed with fallback label or prevented in UI; recommendation is to allow but display node ID fallback in outline.

### Fixed Color

Use three numeric OKLCH fields for v1:

- L: range `0` to `1`, step `0.001`.
- C: minimum `0`, step `0.001`.
- H: range `0` to `360`, step `0.1`, normalized modulo 360.

Controls:

- Checkbox or button to enable/disable fixed color.
- Numeric fields visible when fixed color is enabled.

Behavior:

- Fixed color wins over incoming constraints.
- Incoming constraints are still evaluated and displayed against the fixed result.
- Invalid fixed colors should be rejected by `applyGraphChange`; show the resulting error inline.

### Solved Color

If solved color exists:

- Render a swatch with CSS `oklch(...)` so Display P3 colors are not clipped to sRGB.
- Show numeric L/C/H values.
- Show stale marker if `solutionStale` is true.

If solved color is undefined:

- Show "No solved color yet".
- If the node has no fixed color and no solved sources, suggest adding a fixed color or source token.

### Source Tokens

For each incoming edge:

- Show source token display name and ID fallback.
- Show delete edge button.
- Show constraints under the edge.

Delete edge:

- Dispatch `remove-edge`.
- If solved baseline exists, incremental solve should seed the old target node and downstream nodes.

## Constraint Editor

Use inline editable constraint rows.

Each edge has an `Add constraint` button that appends a default contrast constraint:

```ts
{
  type: "contrast",
  background: "source",
  value: 60,
  tolerance: 1,
}
```

Constraint row fields:

- Type select.
- Value numeric input.
- Tolerance numeric input.
- For `contrast`, background select: `source` or `target`.
- Delete button.

When changing constraint type:

- Preserve `value` and `tolerance` where possible.
- Add `background: "source"` when changing to `contrast`.
- Remove `background` when changing away from `contrast`.

Recommended default values by type:

- `contrast`: `value: 60`, `tolerance: 1`
- `fixed-lightness`: `value: 0.5`, `tolerance: 0.01`
- `fixed-chroma`: `value: 0.1`, `tolerance: 0.01`
- `fixed-hue`: `value: 0`, `tolerance: 1`
- `add-lightness`: `value: 0`, `tolerance: 0.01`
- `add-chroma`: `value: 0`, `tolerance: 0.01`
- `add-hue`: `value: 0`, `tolerance: 1`
- `multiply-lightness`: `value: 1`, `tolerance: 0.01`
- `multiply-chroma`: `value: 1`, `tolerance: 0.01`
- `multiply-hue`: `value: 1`, `tolerance: 1`

Constraint updates dispatch a full `update-edge` replacement.

## Constraint Result Rendering

For each constraint in the selected node's incoming edges, find the matching `SolutionConstraint` in the solved graph by edge and index.

Render:

- Constraint type.
- Target value.
- Error value, or "Not evaluated" if `error` is undefined.
- A pass/fail badge based on `valueInTolerance`.
- Tolerance.

If no solved graph exists yet, show "Not solved yet" instead of pass/fail.

## ID Generation

Use browser `crypto.randomUUID()` for node and edge IDs.

Node display name defaults:

- Root: `token-N` or `New token`.
- Child: `${parent.displayName}-child` if reasonable, otherwise `New token`.

IDs are opaque; display names are user-editable.

## Persistence

Hydration:

- On mount, read `colorsat:solver:v1`.
- Parse JSON defensively.
- Validate with solver schemas or parse helpers.
- If valid, load graph and selected node.
- If `hasSolvedBaseline` was persisted, recompute `solvedGraph` immediately with `solveGraph(graph)` instead of trusting stored solved output.

Persistence effect:

- After hydration, write `{ graph, selectedNodeId, hasSolvedBaseline }` when these values change.
- Do not persist `currentError`, `solutionStale`, or add-edge dialog state.

## Accessibility

- Token rows should be buttons or contain clear buttons with accessible names.
- Add Edge dialog must have a title and keyboard-operable controls.
- Numeric inputs must have labels.
- Swatches should have text equivalents via nearby numeric values.
- Error panels should use `role="alert"` for errors that appear after user actions.

## Manual QA Plan

No dedicated frontend tests in the first implementation pass. Validate manually plus TypeScript/lint/build checks.

Manual flows:

- Load `/solver` with no saved state; empty state appears.
- Create first token; it appears as a root and is selected.
- Set fixed color with numeric OKLCH fields.
- Add child; child gets parent outline relationship and empty dataflow edge.
- Solve; child inherits fixed parent color.
- Add contrast constraint under child's source edge; re-solve/incremental solve updates child color.
- Add second child and a different contrast target.
- Add Edge dialog filters out duplicate edges, self edges, and cycle-creating edges.
- Delete a node with children; direct children reparent to deleted node's parent.
- Delete a node with attached dataflow edges; attached edges disappear.
- Invalid action shows inline error and does not mutate graph.
- Refresh page; graph and selection persist.
- Corrupt local storage manually; app recovers with an inline warning.
- Mobile viewport stacks layout without clipped controls.

## Implementation Phases

1. Add route and skeleton `SolverApp` layout.
2. Add storage hydration/persistence helpers.
3. Add graph mutation wrapper around `applyGraphChange(s)`.
4. Add empty state and example graph loader.
5. Build Token Outline with add root, add child, select, delete.
6. Build Token Sidebar with name and fixed color editing.
7. Build solve top bar and hybrid solve behavior.
8. Build Source Tokens and edge deletion.
9. Build Constraint Editor.
10. Build Add Edge dialog with candidate filtering through `applyGraphChange`.
11. Add inline error formatting and stale solution rendering.
12. Manual QA and verification.

## Verification

After implementation, run:

```sh
vp check --fix
vp test
```

Also run the manual QA flows above before considering the frontend complete.

## Future Work

Not part of v1:

- Visual graph canvas.
- URL-encoded sharing.
- Dedicated frontend component tests.
- Rich OKLCH CSS string editing/copying.
- sRGB fallback export tools.
- Constraint presets.
- Undo/redo history.
