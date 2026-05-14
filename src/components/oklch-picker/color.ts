import type { OklchColor } from "../../lib/solver";

export const L_MAX = 1;
export const C_MAX = 0.37;
export const H_MAX = 360;
export const RENDER_GAP = 1e-7;

export type PickerAxis = "l" | "c" | "h";
export type PickerPlane = "l" | "c" | "h";

export const Space = {
  Srgb: 0,
  P3: 1,
  Out: 2,
} as const;

export type Space = (typeof Space)[keyof typeof Space];

export function normalizeHue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return ((value % H_MAX) + H_MAX) % H_MAX;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizePickerColor(color: OklchColor): OklchColor {
  return {
    l: clamp(Number.isFinite(color.l) ? color.l : 0, 0, L_MAX),
    c: clamp(Number.isFinite(color.c) ? color.c : 0, 0, C_MAX),
    h: normalizeHue(color.h),
  };
}

export function axisMax(axis: PickerAxis): number {
  if (axis === "l") return L_MAX;
  if (axis === "c") return C_MAX;
  return H_MAX;
}

export function setAxis(color: OklchColor, axis: PickerAxis, value: number): OklchColor {
  if (axis === "h") {
    return normalizePickerColor({ ...color, h: value });
  }

  return normalizePickerColor({ ...color, [axis]: value });
}

export function planeFromPoint(
  plane: PickerPlane,
  color: OklchColor,
  x: number,
  y: number,
  width: number,
  height: number,
): OklchColor {
  const xRatio = width > 0 ? clamp(x / width, 0, 1) : 0;
  const yRatio = height > 0 ? clamp(1 - y / height, 0, 1) : 0;

  if (plane === "l") {
    return normalizePickerColor({ ...color, h: xRatio * H_MAX, c: yRatio * C_MAX });
  }

  if (plane === "c") {
    return normalizePickerColor({ ...color, h: xRatio * H_MAX, l: yRatio * L_MAX });
  }

  return normalizePickerColor({ ...color, l: xRatio * L_MAX, c: yRatio * C_MAX });
}

export function planeAxisPosition(plane: PickerPlane, axis: "x" | "y", color: OklchColor): number {
  const normalized = normalizePickerColor(color);

  if (plane === "l") {
    return axis === "x" ? normalized.h / H_MAX : normalized.c / C_MAX;
  }

  if (plane === "c") {
    return axis === "x" ? normalized.h / H_MAX : normalized.l / L_MAX;
  }

  return axis === "x" ? normalized.l / L_MAX : normalized.c / C_MAX;
}

export function planeTitle(plane: PickerPlane): string {
  if (plane === "l") return "L: choose chroma and hue";
  if (plane === "c") return "C: choose lightness and hue";
  return "H: choose lightness and chroma";
}
