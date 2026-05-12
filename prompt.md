This document describes the design of the upcoming ColorSAT solver tool. We want to build a graph of color tokens connected by constraints. We will provide a fixed color value for some tokens (at least one in the graph), and we will solve the graph to determine color values of the remaining tokens which satisfy all provided constraints.

This tool will have two main modules: the Solver and the Frontend. This document uses TypeScript syntax to describe data structures and algorithms, but the precise type shapes might vary in the final implementation.

# Solver module

Solver is a purely functional module where all inputs and outputs are plain serializable JavaScript objects. Inputs to functions are validated with Zod schemas. The main function is `solveGraph`. Here are the basic types involved:

```ts
function solveGraph(graph: Graph): SolvedGraph;
function solveGraphIncr(solvedGraph: SolvedGraph, graphChanges: GraphChanges): SolvedGraph;

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

type GraphChanges = {
  // TODO
}
```

Each node in our graph will represent a token, and each directed edge will represent a dependency (the source token depends on the target token). Each edge also has an array of constraints that must be satisfied to solve the graph.

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
      value: number; // Directly add to the source token's OKLCH "L" value, can be negative
      tolerance: number;
    }
  | {
      type: "add-chroma";
      value: number; // Directly add to the source token's OKLCH "C" value, can be negative
      tolerance: number;
    }
  | {
      type: "add-hue";
      value: number; // Directly add to the source token's OKLCH "H" value, can be negative, does modulo 360
      tolerance: number;
    }
  | {
      type: "multiply-lightness";
      value: number; // Multiply the source token's OKLCH "L" value, can be negative
      tolerance: number;
    }
  | {
      type: "multiply-chroma";
      value: number; // Multiply the source token's OKLCH "C" value, can be negative
      tolerance: number;
    }
  | {
      type: "multiply-hue";
      value: number; // Multiply the source token's OKLCH "H" value, can be negative, does modulo 360
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

Then we are saying that the source token's lightness should be equal to the target token's lightness plus 0.1, and the chroma and hue should be the same as the source token.

## Tolerance

The 'tolerance' fields refer to percent error, i.e. `const error = (actual, target) => Math.abs((actual - target) / target))`. For example, a tolerance of 0.1 means that the tolerated error is 10%, so if the target value is 5.0, then any actual value between 4.5 and 5.5 will satisfy the constraint.

# Frontend module

## Tree Layout

While the underlying data structure is a true directed (acyclic) graph, we will lay it out in the UI as a tree (similar to a file system directory structure) for simplicity. This widget is called the Token Outline. This means we also need each node to have an optional parent node (multiple nodes can have an undefined parent node, meaning they're at the top level of the directory structure). Next to each node in the UI will be an "Add token" button which creates a new node with the parentNode set _and_ with a directed edge to the parent node. Edges can also be added between nodes outside of this tree structure (as long as no cycles are created).

## User Interface

Each node will have the "Add token" button described above, as well as an "Add edge" button which allows the user to create a directed edge from this node to any other node in the graph (except if the same edge already exists or if it would create a cycle).

Clicking on a node will select it, and a right sidebar will display the details of the selected node. This is called the Token Sidebar. This will include:

- The token's name (editable)
- The token's fixed color value (OKLCH, editable, optional)
- If a solved color value exists, a "solved color" section showing the current solved color value for the token along with all the constraints that led to that solution and their respective errors
- A list of the node's outgoing edges (each with a Delete button) in a section called Source Tokens.
- Beneath each of the outgoing edges, a list of constraints for that edge (each with a Delete button and editable fields)

# Example User Story

1. I create the first token, name it bg-primary, and set its fixed color value to `oklch(1 0 0)` (pure white).
2. Next to the bg-primary in the Token Outline, I click "Add token" to create a child token which I name text-primary.
3. I click on text-primary in the Token Outline to select it, then in the Token Sidebar under Source Tokens I click "Add constraint" under the bg-primary token. I add a contrast constraint with the background set to "source" (bg-primary), a value of 90, and a tolerance of 0.1.
4. Next to the bg-primary in the Token Outline, I click "Add token" to create a second child token which I name text-secondary.
5. In the Token Sidebar for text-secondary, I add a similar constrast constraint but with a value of 70.
6. Now I click Solve in the top bar. text-primary and text-secondary should be solved with reasonable color values (a very dark grey for text-primary, and a lighter grey for text-secondary).
