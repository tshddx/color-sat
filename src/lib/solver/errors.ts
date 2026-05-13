import { TaggedError } from "better-result";
import type { ZodIssue } from "zod";

export class CycleError extends TaggedError("CycleError")<{ cycleNodeIds: string[] }>() {}

export class DanglingEdgeError extends TaggedError("DanglingEdgeError")<{
  edgeId: string;
  missingNodeId: string;
  role: "source" | "target";
}>() {}

export class DuplicateIdError extends TaggedError("DuplicateIdError")<{
  kind: "node" | "edge";
  id: string;
}>() {}

export class DuplicateEdgePairError extends TaggedError("DuplicateEdgePairError")<{
  sourceNodeId: string;
  targetNodeId: string;
  edgeIds: string[];
}>() {}

export class UnknownIdError extends TaggedError("UnknownIdError")<{
  kind: "node" | "edge";
  id: string;
}>() {}

export class ImmutableFieldError extends TaggedError("ImmutableFieldError")<{
  kind: "node" | "edge";
  id: string;
  field: "id" | "sourceNodeId" | "targetNodeId";
}>() {}

export class DanglingParentError extends TaggedError("DanglingParentError")<{
  nodeId: string;
  missingParentNodeId: string;
}>() {}

export class ParentCycleError extends TaggedError("ParentCycleError")<{
  cycleNodeIds: string[];
}>() {}

export class SchemaValidationError extends TaggedError("SchemaValidationError")<{
  issues: ZodIssue[];
}>() {}

export type SolveError =
  | CycleError
  | DanglingEdgeError
  | DuplicateIdError
  | DuplicateEdgePairError
  | UnknownIdError
  | ImmutableFieldError
  | DanglingParentError
  | ParentCycleError
  | SchemaValidationError;
