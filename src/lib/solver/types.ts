export type OklchColor = {
  l: number;
  c: number;
  h: number;
};

export type ContrastConstraint = {
  type: "contrast";
  background: "source" | "target";
  value: number;
  tolerance: number;
};

export type Constraint =
  | ContrastConstraint
  | { type: "fixed-lightness"; value: number; tolerance: number }
  | { type: "fixed-chroma"; value: number; tolerance: number }
  | { type: "fixed-hue"; value: number; tolerance: number }
  | { type: "add-lightness"; value: number; tolerance: number }
  | { type: "add-chroma"; value: number; tolerance: number }
  | { type: "add-hue"; value: number; tolerance: number }
  | { type: "multiply-lightness"; value: number; tolerance: number }
  | { type: "multiply-chroma"; value: number; tolerance: number }
  | { type: "multiply-hue"; value: number; tolerance: number };

export type Node = {
  id: string;
  parentNodeId: string | undefined;
  displayName: string;
  fixedColor: OklchColor | undefined;
};

export type Edge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  constraints: Constraint[];
};

export type Graph = {
  nodes: Node[];
  edges: Edge[];
};

export type SolutionNode = {
  id: string;
  solvedColor: OklchColor | undefined;
};

export type SolutionConstraint = {
  type: Constraint["type"];
  value: number;
  actual: number | undefined;
  error: number | undefined;
  valueInTolerance: boolean;
};

export type SolutionEdge = {
  id: string;
  constraints: SolutionConstraint[];
};

export type SolvedGraph = {
  graph: Graph;
  nodes: SolutionNode[];
  edges: SolutionEdge[];
};

export type GraphChange =
  | { type: "add-node"; node: Node }
  | { type: "remove-node"; nodeId: string }
  | { type: "update-node"; node: Node }
  | { type: "add-edge"; edge: Edge }
  | { type: "remove-edge"; edgeId: string }
  | { type: "update-edge"; edge: Edge };

export type GraphChanges = GraphChange[];
