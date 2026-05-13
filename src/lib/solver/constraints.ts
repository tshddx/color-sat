import { apcaLc, hueDistance, normalizeOklch } from "./color-space";
import type { Constraint, Edge, OklchColor, SolutionConstraint } from "./types";

export type Attribute = "l" | "c" | "h";

export function constraintTouches(constraint: Constraint): Attribute[] {
  switch (constraint.type) {
    case "contrast":
      return ["l", "c"];
    case "fixed-lightness":
    case "add-lightness":
    case "multiply-lightness":
      return ["l"];
    case "fixed-chroma":
    case "add-chroma":
    case "multiply-chroma":
      return ["c"];
    case "fixed-hue":
    case "add-hue":
    case "multiply-hue":
      return ["h"];
  }
}

export function targetValue(source: OklchColor, constraint: Constraint): number {
  const normalizedSource = normalizeOklch(source);

  switch (constraint.type) {
    case "contrast":
    case "fixed-lightness":
    case "fixed-chroma":
    case "fixed-hue":
      return constraint.value;
    case "add-lightness":
      return normalizedSource.l + constraint.value;
    case "add-chroma":
      return normalizedSource.c + constraint.value;
    case "add-hue":
      return normalizeOklch({ l: 0, c: 0, h: normalizedSource.h + constraint.value }).h;
    case "multiply-lightness":
      return normalizedSource.l * constraint.value;
    case "multiply-chroma":
      return normalizedSource.c * constraint.value;
    case "multiply-hue":
      return normalizeOklch({ l: 0, c: 0, h: normalizedSource.h * constraint.value }).h;
  }
}

export function constraintError(
  source: OklchColor | undefined,
  target: OklchColor | undefined,
  constraint: Constraint,
): number | undefined {
  if (!source || !target) {
    return undefined;
  }

  const normalizedTarget = normalizeOklch(target);
  const expected = targetValue(source, constraint);

  switch (constraint.type) {
    case "contrast": {
      const actualLc =
        constraint.background === "source" ? apcaLc(target, source) : apcaLc(source, target);
      return actualLc === undefined ? undefined : Math.abs(Math.abs(actualLc) - constraint.value);
    }
    case "fixed-lightness":
    case "add-lightness":
    case "multiply-lightness":
      return Math.abs(normalizedTarget.l - expected);
    case "fixed-chroma":
    case "add-chroma":
    case "multiply-chroma":
      return Math.abs(normalizedTarget.c - expected);
    case "fixed-hue":
    case "add-hue":
    case "multiply-hue":
      return hueDistance(normalizedTarget.h, expected);
  }
}

function actualConstraintValue(
  source: OklchColor | undefined,
  target: OklchColor | undefined,
  constraint: Constraint,
): number | undefined {
  if (!source || !target) {
    return undefined;
  }

  const normalizedTarget = normalizeOklch(target);

  switch (constraint.type) {
    case "contrast": {
      const actualLc =
        constraint.background === "source" ? apcaLc(target, source) : apcaLc(source, target);
      return actualLc === undefined ? undefined : Math.abs(actualLc);
    }
    case "fixed-lightness":
    case "add-lightness":
    case "multiply-lightness":
      return normalizedTarget.l;
    case "fixed-chroma":
    case "add-chroma":
    case "multiply-chroma":
      return normalizedTarget.c;
    case "fixed-hue":
    case "add-hue":
    case "multiply-hue":
      return normalizedTarget.h;
  }
}

export function evaluateSolutionConstraint(
  source: OklchColor | undefined,
  target: OklchColor | undefined,
  constraint: Constraint,
): SolutionConstraint {
  const error = constraintError(source, target, constraint);

  return {
    type: constraint.type,
    value: constraint.value,
    actual: actualConstraintValue(source, target, constraint),
    error,
    valueInTolerance: error !== undefined && error <= constraint.tolerance,
  };
}

export function evaluateEdgeConstraints(
  edge: Edge,
  source: OklchColor | undefined,
  target: OklchColor | undefined,
): SolutionConstraint[] {
  return edge.constraints.map((constraint) =>
    evaluateSolutionConstraint(source, target, constraint),
  );
}
