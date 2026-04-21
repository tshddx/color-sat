import { colordxAdapter } from "./oklch-adapter-colordx";
import { culoriAdapter } from "./oklch-adapter-culori";

/** Converts an OKLCH triplet to a gamut-checked sRGB hex string. */
export interface OklchAdapter {
  /** Display name shown in the UI selector. */
  readonly label: string;
  /**
   * Convert OKLCH to a lowercase hex string (e.g. "#a3c2f0"),
   * or null if the color is outside the sRGB gamut.
   */
  oklchToHex(l: number, c: number, h: number): string | null;
}

export const ADAPTER_KEYS = ["culori", "colordx"] as const;
export type AdapterKey = (typeof ADAPTER_KEYS)[number];

export const ADAPTERS: Record<AdapterKey, OklchAdapter> = {
  culori: culoriAdapter,
  colordx: colordxAdapter,
};
