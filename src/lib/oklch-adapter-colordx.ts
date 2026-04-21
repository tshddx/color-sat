import { colordx, oklchToLinear } from "@colordx/core";
import type { OklchAdapter, OklchResult } from "./oklch-adapter";

const TOLERANCE = 0.02;

export const colordxAdapter: OklchAdapter = {
  label: "@colordx/core",
  oklchToHex(l, c, h): OklchResult {
    // oklchToLinear returns unclamped linear sRGB — ideal for a gamut check.
    const [linR, linG, linB] = oklchToLinear(l, c, h);
    const inGamut =
      linR >= -TOLERANCE &&
      linR <= 1 + TOLERANCE &&
      linG >= -TOLERANCE &&
      linG <= 1 + TOLERANCE &&
      linB >= -TOLERANCE &&
      linB <= 1 + TOLERANCE;
    // colordx clamps out-of-gamut channels to sRGB when calling toHex()
    const hex = colordx({ l, c, h, alpha: 1 }).toHex();
    return { hex, inGamut };
  },
};
