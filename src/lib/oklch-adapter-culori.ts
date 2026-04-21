import { formatHex } from "culori";
import type { OklchAdapter, OklchResult } from "./oklch-adapter";

/**
 * Lightweight sRGB gamut check using the OKLab → LMS → linear-sRGB matrix.
 * Avoids importing culori's full converter chain.
 */
function checkGamut(l: number, c: number, h: number): boolean {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  // OKLab → LMS (cube root space)
  const lms_l = l + 0.3963377774 * a + 0.2158037573 * b;
  const lms_m = l - 0.1055613458 * a - 0.0638541728 * b;
  const lms_s = l - 0.0894841775 * a - 1.291485548 * b;

  const lL = lms_l ** 3;
  const lM = lms_m ** 3;
  const lS = lms_s ** 3;

  // LMS → linear sRGB
  const linR = +4.0767416621 * lL - 3.3077115913 * lM + 0.2309699292 * lS;
  const linG = -1.2684380046 * lL + 2.6097574011 * lM - 0.3413193965 * lS;
  const linB = -0.0041960863 * lL - 0.7034186147 * lM + 1.707614701 * lS;

  const T = 0.02;
  return linR >= -T && linR <= 1 + T && linG >= -T && linG <= 1 + T && linB >= -T && linB <= 1 + T;
}

export const culoriAdapter: OklchAdapter = {
  label: "culori",
  oklchToHex(l, c, h): OklchResult {
    const inGamut = checkGamut(l, c, h);
    const hex =
      formatHex({ mode: "oklch", l, c, h } as Parameters<typeof formatHex>[0]) ?? "#000000";
    return { hex, inGamut };
  },
};
