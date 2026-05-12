This document describes the design of the upcoming ColorSAT solver tool. We want to build a graph of color tokens connected by constraints. We will provide a fixed color value for some tokens (at least one in the graph), and we will solve the graph to determine color values of the remaining tokens which satisfy all provided constraints.

This tool will have two main modules: the Solver and the Frontend. This document uses TypeScript syntax to describe data structures and algorithms, but the precise type shapes might vary in the final implementation.

# Solver module

Solver is a purely functional module where all inputs and outputs are plain serializable JavaScript objects. Inputs to functions are validated with Zod schemas. The main function is `solveGraph`. Here are the basic types involved:

```ts
// `Result` comes from the better-result library; the `SolveError` union is defined in the Solver implementation details below.
function solveGraph(graph: Graph): Result<SolvedGraph, SolveError>;
function solveGraphIncr(solvedGraph: SolvedGraph, graphChanges: GraphChanges): Result<SolvedGraph, SolveError>;

type Graph = {
  nodes: Node[];
  edges: Edge[];
};

type Node = {
  id: string;
  parentNodeId: string | undefined; // for tree layout in the UI, but not relevant to the solving process
  displayName: string;
  fixedColor: OklchColor | undefined;
};

type Edge = {
  id: string; // likely a client-generated UUID or auto-incrementing integer
  sourceNodeId: string;
  targetNodeId: string;
  constraints: Constraint[];
}

type SolvedGraph = {
  graph: Graph; // the source graph this solution corresponds to;
                // solveGraphIncr uses this to apply changes and re-solve
  nodes: SolutionNode[];
  edges: SolutionEdge[];
}

type SolutionNode = {
  id: string;
  solvedColor: OklchColor | undefined; // undefined if no solution could be found
}

type SolutionEdge = {
  id: string;
  constraints: SolutionConstraint[];
}

type SolutionConstraint = {
  type: Constraint["type"];
  value: number; // the target value from the constraint
  error: // the percent error (e.g. 0.1 means a 10% error)
  valueInTolerance: boolean;
}

type OklchColor = {
  l: number; // between 0 and 1.0
  c: number; // roughly between 0 and 0.37
  h: number; // between 0 and 360
}

type GraphChange =
  | { type: "add-node"; node: Node }
  | { type: "remove-node"; nodeId: string }
  | { type: "update-node"; node: Node }   // whole-object replacement
  | { type: "add-edge"; edge: Edge }
  | { type: "remove-edge"; edgeId: string }
  | { type: "update-edge"; edge: Edge };  // whole-object replacement

type GraphChanges = GraphChange[];
```

Each node in our graph will represent a token, and each directed edge will represent data flow in solving order: the target token is derived from the source token. (Equivalently: an edge `A → B` means we solve `A` first, then use `A`'s color to help solve `B`.) Each edge also has an array of constraints that must be satisfied to solve the graph.

Here are the constraint types:

```ts
type Constraint =
  | {
      type: "contrast";
      background: "source" | "target";
      value: number; // APCA's "Lc" value, between 0 and 106
      tolerance: number;
    }
  | {
      type: "fixed-lightness";
      value: number; // OKLCH's "L" value, between 0 and 1.0
      tolerance: number;
    }
  | {
      type: "fixed-chroma";
      value: number; // OKLCH's "C" value, roughly between 0 and 0.37
      tolerance: number;
    }
  | {
      type: "fixed-hue";
      value: number; // OKLCH's "H" value, between 0 and 360
      tolerance: number;
    }
  | {
      type: "add-lightness";
      value: number; // Target's L = source's L + value (can be negative)
      tolerance: number;
    }
  | {
      type: "add-chroma";
      value: number; // Target's C = source's C + value (can be negative)
      tolerance: number;
    }
  | {
      type: "add-hue";
      value: number; // Target's H = (source's H + value) mod 360 (value can be negative)
      tolerance: number;
    }
  | {
      type: "multiply-lightness";
      value: number; // Target's L = source's L * value
      tolerance: number;
    }
  | {
      type: "multiply-chroma";
      value: number; // Target's C = source's C * value
      tolerance: number;
    }
  | {
      type: "multiply-hue";
      value: number; // Target's H = (source's H * value) mod 360
      tolerance: number;
    };
```

## Constraint semantics

For any attribute not specified in a constraint, we assume the target's attribute should take the same value as the source's attribute. For example, if we have a single constraint like this:

```ts
{
  type: "add-lightness",
  value: 0.1,
  tolerance: 0.01,
}
```

Then we are saying that the target token's lightness should be equal to the source token's lightness plus 0.1, and the target's chroma and hue should be the same as the source token's.

## Tolerance

The 'tolerance' fields refer to percent error, i.e. `const error = (actual, target) => Math.abs((actual - target) / target))`. For example, a tolerance of 0.1 means that the tolerated error is 10%, so if the target value is 5.0, then any actual value between 4.5 and 5.5 will satisfy the constraint.

## Incremental Solving

`solveGraphIncr` is a performance optimization for re-solving after small edits in the UI. It re-solves only the nodes whose solutions can have changed: any node directly touched by a change, plus every node those changes transitively flow into via outgoing edges. Unaffected `SolutionNode`s and `SolutionEdge`s are carried over from the previous `SolvedGraph`.

### Output equivalence

The result of `solveGraphIncr(prev, changes)` is required to be deeply equal to the result of `solveGraph(applyChanges(prev.graph, changes))` (running `solveGraph` from scratch on the post-change graph). Equality holds for both `Ok` and `Err` cases. Removed nodes and edges disappear from the result entirely; they are not retained with `solvedColor: undefined`. Calling `solveGraphIncr` with an empty changes list returns `Result.ok(prev)`.

### Validation

`solveGraphIncr` validates the result of applying `changes` to `prev.graph` and returns an `Err` result for any of the following:

- A cycle is introduced.
- An edge references a node that does not exist after applying the changes (dangling edge). The caller is expected to include explicit `remove-edge` entries for every edge attached to a node it removes.
- An `add-node` or `add-edge` uses an ID that already exists.
- A `remove-node`, `remove-edge`, `update-node`, or `update-edge` references an ID that does not exist in `prev.graph`.
- An `update-node` changes `id`, or an `update-edge` changes `id`, `sourceNodeId`, or `targetNodeId`. (To move an edge's endpoints, remove and re-add it.)

### Algorithm (informative)

The intended approach:

1. Apply `changes` in order to produce the post-change `Graph`.
2. Run the validation rules above.
3. Compute the seed set of affected nodes from the change list:
   - any added, updated, or removed node;
   - the `targetNodeId` of any added, updated, or removed edge (the target is the node whose solution depends on the edge's constraints).
4. Expand the seed set to its transitive closure under outgoing edges (source → target) in the post-change graph.
5. Topologically order the affected nodes (sources before targets) and re-solve each one locally, reading already-solved source colors from the carried-over solutions.
6. Build the new `SolvedGraph` with the post-change `Graph` plus the merged solution set.

## Implementation details

The solver uses [better-result](https://better-result.dev) for error handling. Both `solveGraph` and `solveGraphIncr` return `Result<SolvedGraph, SolveError>` instead of throwing. Callers pattern-match on the result (e.g. with `Result.isOk` or `matchError`) and handle the `Err` branch explicitly.

`SolveError` is a tagged union built with better-result's `TaggedError` factory:

```ts
import { TaggedError, type Result } from "better-result";
import type { ZodIssue } from "zod";

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
class UnknownIdError extends TaggedError("UnknownIdError")<{
  kind: "node" | "edge";
  id: string;
}>() {}
class ImmutableFieldError extends TaggedError("ImmutableFieldError")<{
  kind: "node" | "edge";
  id: string;
  field: "id" | "sourceNodeId" | "targetNodeId";
}>() {}
class SchemaValidationError extends TaggedError("SchemaValidationError")<{
  issues: ZodIssue[];
}>() {}

type SolveError =
  | CycleError
  | DanglingEdgeError
  | DuplicateIdError
  | UnknownIdError
  | ImmutableFieldError
  | SchemaValidationError;
```

Zod schema-validation failures (from validating `Graph`, `GraphChange`, or `Constraint` inputs) become `SchemaValidationError` instances. Internally, the validation step composes Result-returning helpers with `Result.gen` so the first failure short-circuits and is surfaced as the function's `Err`. Successful solves return `Result.ok(solvedGraph)`.

# Frontend module

## Tree Layout

While the underlying data structure is a true directed (acyclic) graph, we will lay it out in the UI as a tree (similar to a file system directory structure) for simplicity. This widget is called the Token Outline. This means we also need each node to have an optional parent node (multiple nodes can have an undefined parent node, meaning they're at the top level of the directory structure). Next to each node in the UI will be an "Add token" button which creates a new node with the parentNode set _and_ with a directed edge from the parent node to the new node. Edges can also be added between nodes outside of this tree structure (as long as no cycles are created).

## User Interface

Each node will have the "Add token" button described above, as well as an "Add edge" button which allows the user to pick another node to feed into this one, creating a directed edge from the picked node to this one (except if the same edge already exists or if it would create a cycle).

Clicking on a node will select it, and a right sidebar will display the details of the selected node. This is called the Token Sidebar. This will include:

- The token's name (editable)
- The token's fixed color value (OKLCH, editable, optional)
- If a solved color value exists, a "solved color" section showing the current solved color value for the token along with all the constraints that led to that solution and their respective errors
- A list of the node's incoming edges (each with a Delete button) in a section called Source Tokens. The "source tokens" of the selected node are the tokens that flow into it (the source endpoints of its incoming edges).
- Beneath each of the incoming edges, a list of constraints for that edge (each with a Delete button and editable fields)

## Implementation details

The frontend lives on a new `/solver` route added via TanStack Router's file-based routing (`src/routes/solver.tsx`, registered with `createFileRoute("/solver")`). All UI components come from the existing Catalyst library under `src/components/catalyst/typescript/` (`Sidebar`, `Button`, `Heading`, `Input`, `Alert`, `Badge`, etc.) and are styled with Tailwind 4, matching the conventions already used on `/` and `/spectrum`.

When the route or any UI handler calls into the solver module, it receives `Result<SolvedGraph, SolveError>` and handles both branches explicitly:

- On `Ok`, the solved colors are stored in component state and rendered into the Token Outline and Token Sidebar.
- On `Err`, the error is surfaced inline in the UI using Catalyst's `Alert` component (next to the offending node or edge when the error has a `nodeId` / `edgeId` field, or at the top of the page for graph-wide failures). The frontend uses `matchError` from better-result to exhaustively handle each `SolveError` tag and render an appropriate message.

The frontend never lets solver errors bubble up as exceptions; any unexpected throw should be treated as a bug.

# Example User Story

1. I create the first token, name it bg-primary, and set its fixed color value to `oklch(1 0 0)` (pure white).
2. Next to the bg-primary in the Token Outline, I click "Add token" to create a child token which I name text-primary.
3. I click on text-primary in the Token Outline to select it, then in the Token Sidebar under Source Tokens I click "Add constraint" under the bg-primary token. I add a contrast constraint with the background set to "source" (bg-primary), a value of 90, and a tolerance of 0.1.
4. Next to the bg-primary in the Token Outline, I click "Add token" to create a second child token which I name text-secondary.
5. In the Token Sidebar for text-secondary, I add a similar constrast constraint but with a value of 70.
6. Now I click Solve in the top bar. text-primary and text-secondary should be solved with reasonable color values (a very dark grey for text-primary, and a lighter grey for text-secondary).
