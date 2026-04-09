import { converter, formatHex } from "culori";
import { describe, expect, it } from "vite-plus/test";
import { calcAPCA } from "apca-w3";
import {
  buildPaletteForBackground,
  COLOR_TARGETS,
  generateTextColorForContrast,
  isHexColor,
} from "./color-contrast";

const toOklch = converter("oklch");
const toRgb = converter("rgb");

interface BruteForceResult {
  actualLc: number;
  chroma: number;
  errorRatio: number;
  hex: string;
  polarity: "lighter" | "darker";
}

function bruteForceBestCandidate(
  backgroundHex: string,
  targetLc: number,
  allowChromaReduction = true,
): BruteForceResult | null {
  const backgroundColor = toOklch(backgroundHex);

  if (!backgroundColor) {
    return null;
  }

  let best: BruteForceResult | null = null;
  const originalChroma = backgroundColor.c ?? 0;
  const chromaSteps = allowChromaReduction ? 200 : 0;

  for (let chromaStep = 0; chromaStep <= chromaSteps; chromaStep += 1) {
    const chroma =
      chromaSteps === 0 ? originalChroma : originalChroma * (1 - chromaStep / chromaSteps);

    for (const [polarity, minLightness, maxLightness] of [
      ["darker", 0, backgroundColor.l ?? 0],
      ["lighter", backgroundColor.l ?? 0, 1],
    ] as const) {
      for (let step = 0; step <= 1000; step += 1) {
        const ratio = step / 1000;
        const lightness = minLightness + (maxLightness - minLightness) * ratio;
        const rgb = toRgb({
          mode: "oklch",
          l: lightness,
          c: chroma,
          h: backgroundColor.h,
        });

        if (!rgb) {
          continue;
        }

        const hex = formatHex(rgb);

        if (!hex) {
          continue;
        }

        const actualLc = calcAPCA(hex, backgroundHex);
        const errorRatio = Math.abs(Math.abs(actualLc) - targetLc) / targetLc;
        const candidate = {
          actualLc,
          chroma,
          errorRatio,
          hex: hex.toLowerCase(),
          polarity,
        } satisfies BruteForceResult;

        if (!best) {
          best = candidate;
          continue;
        }

        const bestWithinTolerance = best.errorRatio <= 0.01;
        const candidateWithinTolerance = candidate.errorRatio <= 0.01;

        if (bestWithinTolerance !== candidateWithinTolerance) {
          if (candidateWithinTolerance) {
            best = candidate;
          }
          continue;
        }

        if (candidateWithinTolerance && bestWithinTolerance) {
          if (candidate.chroma > best.chroma) {
            best = candidate;
            continue;
          }

          if (candidate.chroma === best.chroma && candidate.errorRatio < best.errorRatio) {
            best = candidate;
            continue;
          }
        }

        if (candidate.errorRatio < best.errorRatio) {
          best = candidate;
          continue;
        }

        if (
          candidate.errorRatio === best.errorRatio &&
          Math.abs(candidate.actualLc) > Math.abs(best.actualLc)
        ) {
          best = candidate;
        }
      }
    }
  }

  return best;
}

describe("color-contrast", () => {
  it("validates six-digit hex colors", () => {
    expect(isHexColor("#abcdef")).toBe(true);
    expect(isHexColor("#ABCDEF")).toBe(true);
    expect(isHexColor("#abc")).toBe(false);
    expect(isHexColor("abcdef")).toBe(false);
  });

  it("hits reachable targets for light backgrounds", () => {
    const result = generateTextColorForContrast("#f5f5f5", "primaryText", 90);

    expect(result).not.toBeNull();
    expect(result?.polarity).toBe("darker");
    expect(result?.errorRatio).toBeLessThanOrEqual(0.01);
  });

  it("hits reachable targets for dark backgrounds", () => {
    const result = generateTextColorForContrast("#111111", "secondaryText", 60);

    expect(result).not.toBeNull();
    expect(result?.polarity).toBe("lighter");
    expect(result?.errorRatio).toBeLessThanOrEqual(0.01);
  });

  it("reduces chroma when needed for the reported saturated LC90 case", () => {
    const backgroundHex = "#d57b67";
    const targetLc = 90;

    const result = generateTextColorForContrast(backgroundHex, "primaryText", targetLc);
    const bruteForce = bruteForceBestCandidate(backgroundHex, targetLc);
    const fixedChromaOnly = bruteForceBestCandidate(backgroundHex, targetLc, false);

    expect(result).not.toBeNull();
    expect(bruteForce).not.toBeNull();
    expect(fixedChromaOnly).not.toBeNull();
    expect(result?.hex).toBe("#ffffff");
    expect(result?.isWithinTolerance).toBe(false);
    expect(Math.abs(result?.actualLc ?? 0)).toBeGreaterThan(
      Math.abs(fixedChromaOnly?.actualLc ?? 0),
    );
    expect(
      Math.abs(Math.abs(result?.actualLc ?? 0) - Math.abs(bruteForce?.actualLc ?? 0)),
    ).toBeLessThan(0.75);
    expect((result?.errorRatio ?? 1) - (bruteForce?.errorRatio ?? 0)).toBeLessThan(0.01);
  });

  it("tracks brute-force results for representative backgrounds and targets", () => {
    const cases = [
      { backgroundHex: "#2d6cdf", key: "primaryText" as const, targetLc: 90 },
      { backgroundHex: "#00a3a3", key: "secondaryText" as const, targetLc: 60 },
      { backgroundHex: "#f0c419", key: "secondaryText" as const, targetLc: 60 },
      { backgroundHex: "#444444", key: "primaryText" as const, targetLc: 90 },
    ];

    for (const testCase of cases) {
      const result = generateTextColorForContrast(
        testCase.backgroundHex,
        testCase.key,
        testCase.targetLc,
      );
      const bruteForce = bruteForceBestCandidate(testCase.backgroundHex, testCase.targetLc);

      expect(result).not.toBeNull();
      expect(bruteForce).not.toBeNull();
      expect(
        Math.abs(Math.abs(result?.actualLc ?? 0) - Math.abs(bruteForce?.actualLc ?? 0)),
      ).toBeLessThan(0.75);
      expect((result?.errorRatio ?? 1) - (bruteForce?.errorRatio ?? 0)).toBeLessThan(0.01);

      if (bruteForce && bruteForce.errorRatio <= 0.01) {
        expect(result?.isWithinTolerance).toBe(true);
      }
    }
  }, 15000);

  it("builds all palette samples for a valid background", () => {
    const palette = buildPaletteForBackground("#2d6cdf");

    expect(palette).not.toBeNull();
    expect(Object.keys(palette?.samples ?? {})).toHaveLength(COLOR_TARGETS.length);
    expect(palette?.samples.primaryText.targetLc).toBe(90);
    expect(palette?.samples.secondaryText.targetLc).toBe(60);
    expect(palette?.samples.placeholderText.targetLc).toBe(30);
    expect(palette?.samples.divider.targetLc).toBe(15);
    expect(palette?.samples.secondaryBackground.targetLc).toBe(7.5);
    expect(palette?.backgroundHex).toBe("#2d6cdf");
  });
});
