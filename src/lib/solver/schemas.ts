import { Result } from "better-result";
import { z } from "zod";
import { isDisplayP3Oklch, normalizeOklch } from "./color-space";
import { SchemaValidationError, type SolveError } from "./errors";
import type { Graph, GraphChange, GraphChanges, SolvedGraph } from "./types";

const finiteNumber = z.number().finite();
const tolerance = finiteNumber.positive();

export const OklchColorSchema = z
  .object({
    l: finiteNumber.min(0).max(1),
    c: finiteNumber.min(0),
    h: finiteNumber,
  })
  .transform(normalizeOklch)
  .refine(isDisplayP3Oklch, { message: "OKLCH color must be valid in Display P3" });

export const ConstraintSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("contrast"),
    background: z.enum(["source", "target"]),
    value: finiteNumber.min(0).max(106),
    tolerance,
  }),
  z.object({ type: z.literal("fixed-lightness"), value: finiteNumber.min(0).max(1), tolerance }),
  z.object({ type: z.literal("fixed-chroma"), value: finiteNumber.min(0), tolerance }),
  z.object({
    type: z.literal("fixed-hue"),
    value: finiteNumber.transform((value) => normalizeOklch({ l: 0, c: 0, h: value }).h),
    tolerance,
  }),
  z.object({ type: z.literal("add-lightness"), value: finiteNumber, tolerance }),
  z.object({ type: z.literal("add-chroma"), value: finiteNumber, tolerance }),
  z.object({ type: z.literal("add-hue"), value: finiteNumber, tolerance }),
  z.object({ type: z.literal("multiply-lightness"), value: finiteNumber, tolerance }),
  z.object({ type: z.literal("multiply-chroma"), value: finiteNumber, tolerance }),
  z.object({ type: z.literal("multiply-hue"), value: finiteNumber, tolerance }),
]);

const constraintTypeOptions = ConstraintSchema.options.map((schema) => schema.shape.type);
const constraintTypeSchema = z.union(
  constraintTypeOptions as [
    (typeof constraintTypeOptions)[number],
    (typeof constraintTypeOptions)[number],
    ...(typeof constraintTypeOptions)[number][],
  ],
);

export const NodeSchema = z.object({
  id: z.string(),
  parentNodeId: z.string().optional(),
  displayName: z.string(),
  fixedColor: OklchColorSchema.optional(),
});

export const EdgeSchema = z.object({
  id: z.string(),
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  constraints: z.array(ConstraintSchema),
});

export const GraphSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export const SolutionConstraintSchema = z.object({
  type: constraintTypeSchema,
  value: finiteNumber,
  actual: finiteNumber.optional(),
  error: finiteNumber.optional(),
  valueInTolerance: z.boolean(),
});

export const SolvedGraphSchema = z.object({
  graph: GraphSchema,
  nodes: z.array(z.object({ id: z.string(), solvedColor: OklchColorSchema.optional() })),
  edges: z.array(z.object({ id: z.string(), constraints: z.array(SolutionConstraintSchema) })),
});

export const GraphChangeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add-node"), node: NodeSchema }),
  z.object({ type: z.literal("remove-node"), nodeId: z.string() }),
  z.object({ type: z.literal("update-node"), node: NodeSchema }),
  z.object({ type: z.literal("add-edge"), edge: EdgeSchema }),
  z.object({ type: z.literal("remove-edge"), edgeId: z.string() }),
  z.object({ type: z.literal("update-edge"), edge: EdgeSchema }),
]);

export const GraphChangesSchema = z.array(GraphChangeSchema);

function parseWithSchema<T>(schema: z.ZodType, value: unknown): Result<T, SolveError> {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    return Result.err(new SchemaValidationError({ issues: parsed.error.issues }));
  }

  return Result.ok(parsed.data as T);
}

export function parseGraph(value: unknown) {
  return parseWithSchema<Graph>(GraphSchema, value);
}

export function parseGraphChange(value: unknown) {
  return parseWithSchema<GraphChange>(GraphChangeSchema, value);
}

export function parseGraphChanges(value: unknown) {
  return parseWithSchema<GraphChanges>(GraphChangesSchema, value);
}

export function parseSolvedGraph(value: unknown) {
  return parseWithSchema<SolvedGraph>(SolvedGraphSchema, value);
}
