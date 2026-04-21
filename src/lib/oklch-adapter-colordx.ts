import { colordx, oklchToLinear } from "@colordx/core";
import type { OklchAdapter } from "./oklch-adapter";

const TOLERANCE = 0.02;

export const colordxAdapter: OklchAdapter = {
  label: "@colordx/core",
  oklchToHex(l, c, h) {
    // oklchToLinear returns unclamped linear sRGB — ideal for a gamut check.
    const [linR, linG, linB] = oklchToLinear(l, c, h);
    if (
      linR < -TOLERANCE ||
      linR > 1 + TOLERANCE ||
      linG < -TOLERANCE ||
      linG > 1 + TOLERANCE ||
      linB < -TOLERANCE ||
      linB > 1 + TOLERANCE
    ) {
      return null;
    }
    return colordx({ l, c, h, alpha: 1 }).toHex();
  },
};
