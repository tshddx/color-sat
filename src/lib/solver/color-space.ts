import { calcAPCA } from "apca-w3";
import { converter, formatHex } from "culori";
import type { OklchColor } from "./types";

const toRgb = converter("rgb");
const toOklch = converter("oklch");
const toP3 = converter("p3");

function normalizeHue(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return ((value % 360) + 360) % 360;
}

export function normalizeOklch(color: OklchColor): OklchColor {
  return {
    l: Number.isFinite(color.l) ? color.l : 0,
    c: Number.isFinite(color.c) ? Math.max(0, color.c) : 0,
    h: normalizeHue(color.h),
  };
}

function channelInRange(value: unknown) {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= -0.000001 && value <= 1.000001
  );
}

export function isDisplayP3Oklch(color: OklchColor): boolean {
  const normalized = normalizeOklch(color);

  if (normalized.l < 0 || normalized.l > 1 || normalized.c < 0) {
    return false;
  }

  const p3 = toP3({ mode: "oklch", ...normalized });
  return Boolean(p3 && channelInRange(p3.r) && channelInRange(p3.g) && channelInRange(p3.b));
}

export function apcaLc(foreground: OklchColor, background: OklchColor): number | undefined {
  const foregroundHex = toSrgbHex(foreground);
  const backgroundHex = toSrgbHex(background);

  if (!foregroundHex || !backgroundHex) {
    return undefined;
  }

  return calcAPCA(foregroundHex, backgroundHex);
}

export function toCssOklch(color: OklchColor): string {
  const normalized = normalizeOklch(color);
  return `oklch(${normalized.l.toFixed(4)} ${normalized.c.toFixed(4)} ${normalized.h.toFixed(2)})`;
}

export function toSrgbHex(color: OklchColor): string | undefined {
  const rgb = toRgb({ mode: "oklch", ...normalizeOklch(color) });

  if (!rgb) {
    return undefined;
  }

  const hex = formatHex(rgb);
  return hex ? hex.toLowerCase() : undefined;
}

export function fromSrgbHex(hex: string): OklchColor | undefined {
  const oklch = toOklch(hex);

  if (!oklch) {
    return undefined;
  }

  return normalizeOklch({ l: oklch.l, c: oklch.c ?? 0, h: oklch.h ?? 0 });
}

export function hueDistance(a: number, b: number): number {
  const delta = Math.abs(normalizeHue(a) - normalizeHue(b));
  return Math.min(delta, 360 - delta);
}

export function circularAverage(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  let x = 0;
  let y = 0;

  for (const value of values) {
    const radians = (normalizeHue(value) * Math.PI) / 180;
    x += Math.cos(radians);
    y += Math.sin(radians);
  }

  if (Math.abs(x) < 0.0000001 && Math.abs(y) < 0.0000001) {
    return 0;
  }

  return normalizeHue((Math.atan2(y, x) * 180) / Math.PI);
}
