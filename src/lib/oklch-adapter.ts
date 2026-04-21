import { colordxAdapter } from "./oklch-adapter-colordx";
import { culoriAdapter } from "./oklch-adapter-culori";

export interface OklchResult {
  /** Lowercase hex string of the color, clamped to sRGB if out-of-gamut. */
  hex: string;
  /** True if the color is within the sRGB gamut. */
  inGamut: boolean;
}

/** Converts an OKLCH triplet to a gamut-checked sRGB hex result. */
export interface OklchAdapter {
  /** Display name shown in the UI selector. */
  readonly label: string;
  /** Convert OKLCH to a hex + gamut result. Always returns a hex string. */
  oklchToHex(l: number, c: number, h: number): OklchResult;
}

export const ADAPTER_KEYS = ["culori", "colordx"] as const;
export type AdapterKey = (typeof ADAPTER_KEYS)[number];

export const ADAPTERS: Record<AdapterKey, OklchAdapter> = {
  culori: culoriAdapter,
  colordx: colordxAdapter,
};
