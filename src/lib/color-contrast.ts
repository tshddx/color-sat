import { calcAPCA } from "apca-w3";
import { converter, formatHex } from "culori";

const toOklch = converter("oklch");
const toRgb = converter("rgb");

const COARSE_SEARCH_STEPS = 48;
const SEARCH_ITERATIONS = 28;
const MAX_ACCEPTABLE_ERROR = 0.01;

export const COLOR_TARGETS = [
  {
    key: "primaryText",
    targetLc: 90,
    title: "LC90",
    role: "Headings and body text",
  },
  {
    key: "secondaryText",
    targetLc: 60,
    title: "LC60",
    role: "Secondary text",
  },
  {
    key: "placeholderText",
    targetLc: 30,
    title: "LC30",
    role: "Placeholder text",
  },
  {
    key: "divider",
    targetLc: 15,
    title: "LC15",
    role: "Divider",
  },
  {
    key: "secondaryBackground",
    targetLc: 7.5,
    title: "LC7.5",
    role: "Secondary background",
  },
] as const;

export type ColorTargetKey = (typeof COLOR_TARGETS)[number]["key"];

export interface ContrastSearchResult {
  actualLc: number;
  errorRatio: number;
  hex: string;
  isWithinTolerance: boolean;
  key: ColorTargetKey;
  oklch: string;
  polarity: "lighter" | "darker";
  targetLc: number;
}

export interface BackgroundPalette {
  backgroundHex: string;
  samples: Record<ColorTargetKey, ContrastSearchResult>;
}

interface SearchCandidate {
  actualLc: number;
  chroma: number;
  contrastMagnitude: number;
  errorRatio: number;
  hex: string;
  polarity: "lighter" | "darker";
}

function clampLightness(value: number) {
  return Math.min(1, Math.max(0, value));
}

function normalizeHex(value: string) {
  return value.trim().toLowerCase();
}

export function formatOklchValue(hex: string) {
  const color = toOklch(hex);

  if (!color) {
    return "oklch(0 0 0)";
  }

  const lightness = (color.l ?? 0).toFixed(3);
  const chroma = (color.c ?? 0).toFixed(3);
  const hue = Number.isFinite(color.h) ? color.h.toFixed(3) : "0.000";

  return `oklch(${lightness} ${chroma} ${hue})`;
}

export function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}

function evaluateCandidate(
  backgroundHex: string,
  chroma: number,
  hue: number | undefined,
  lightness: number,
  polarity: "lighter" | "darker",
  targetLc: number,
) {
  const rgbColor = toRgb({
    mode: "oklch",
    l: clampLightness(lightness),
    c: chroma,
    h: hue,
  });

  if (!rgbColor) {
    return null;
  }

  const hex = formatHex(rgbColor);

  if (!hex) {
    return null;
  }

  const actualLc = calcAPCA(hex, backgroundHex);
  const contrastMagnitude = Math.abs(actualLc);
  const errorRatio = Math.abs(contrastMagnitude - targetLc) / targetLc;

  return {
    actualLc,
    chroma,
    contrastMagnitude,
    errorRatio,
    hex: normalizeHex(hex),
    polarity,
  } satisfies SearchCandidate;
}

function pickBestEffortCandidate(current: SearchCandidate | null, next: SearchCandidate | null) {
  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  if (next.errorRatio !== current.errorRatio) {
    return next.errorRatio < current.errorRatio ? next : current;
  }

  if (next.contrastMagnitude !== current.contrastMagnitude) {
    return next.contrastMagnitude > current.contrastMagnitude ? next : current;
  }

  if (next.chroma !== current.chroma) {
    return next.chroma > current.chroma ? next : current;
  }

  return next.hex < current.hex ? next : current;
}

function pickPreferredCandidate(current: SearchCandidate | null, next: SearchCandidate | null) {
  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  const currentWithinTolerance = current.errorRatio <= MAX_ACCEPTABLE_ERROR;
  const nextWithinTolerance = next.errorRatio <= MAX_ACCEPTABLE_ERROR;

  if (currentWithinTolerance !== nextWithinTolerance) {
    return nextWithinTolerance ? next : current;
  }

  if (currentWithinTolerance && nextWithinTolerance) {
    if (next.chroma !== current.chroma) {
      return next.chroma > current.chroma ? next : current;
    }

    if (next.errorRatio !== current.errorRatio) {
      return next.errorRatio < current.errorRatio ? next : current;
    }

    if (next.contrastMagnitude !== current.contrastMagnitude) {
      return next.contrastMagnitude > current.contrastMagnitude ? next : current;
    }
  }

  return pickBestEffortCandidate(current, next);
}

function refineLightnessInterval(
  backgroundHex: string,
  targetLc: number,
  polarity: "lighter" | "darker",
  chroma: number,
  hue: number | undefined,
  firstLightness: number,
  secondLightness: number,
) {
  let low = Math.min(firstLightness, secondLightness);
  let high = Math.max(firstLightness, secondLightness);
  let lowCandidate = evaluateCandidate(backgroundHex, chroma, hue, low, polarity, targetLc);
  let highCandidate = evaluateCandidate(backgroundHex, chroma, hue, high, polarity, targetLc);
  let best = pickBestEffortCandidate(lowCandidate, highCandidate);

  if (!lowCandidate || !highCandidate) {
    return best;
  }

  for (let iteration = 0; iteration < SEARCH_ITERATIONS; iteration += 1) {
    const middle = (low + high) / 2;
    const middleCandidate = evaluateCandidate(
      backgroundHex,
      chroma,
      hue,
      middle,
      polarity,
      targetLc,
    );

    best = pickBestEffortCandidate(best, middleCandidate);

    if (!middleCandidate) {
      break;
    }

    if (middleCandidate.errorRatio <= MAX_ACCEPTABLE_ERROR) {
      return middleCandidate;
    }

    const lowDelta = lowCandidate.contrastMagnitude - targetLc;
    const middleDelta = middleCandidate.contrastMagnitude - targetLc;

    if (Math.sign(lowDelta) === Math.sign(middleDelta)) {
      low = middle;
      lowCandidate = middleCandidate;
    } else {
      high = middle;
      highCandidate = middleCandidate;
    }
  }

  return pickBestEffortCandidate(best, pickBestEffortCandidate(lowCandidate, highCandidate));
}

function searchPolarityAtChroma(
  backgroundHex: string,
  targetLc: number,
  backgroundLightness: number,
  chroma: number,
  hue: number | undefined,
  polarity: "lighter" | "darker",
) {
  const minLightness = polarity === "darker" ? 0 : backgroundLightness;
  const maxLightness = polarity === "darker" ? backgroundLightness : 1;
  const candidates: Array<{ candidate: SearchCandidate; lightness: number }> = [];

  for (let step = 0; step <= COARSE_SEARCH_STEPS; step += 1) {
    const ratio = step / COARSE_SEARCH_STEPS;
    const lightness = minLightness + (maxLightness - minLightness) * ratio;
    const candidate = evaluateCandidate(backgroundHex, chroma, hue, lightness, polarity, targetLc);

    if (!candidate) {
      continue;
    }

    if (candidate.errorRatio <= MAX_ACCEPTABLE_ERROR) {
      return candidate;
    }

    candidates.push({ candidate, lightness });
  }

  let best: SearchCandidate | null = null;

  for (const { candidate } of candidates) {
    best = pickBestEffortCandidate(best, candidate);
  }

  for (let index = 0; index < candidates.length - 1; index += 1) {
    const current = candidates[index];
    const next = candidates[index + 1];

    if (!current || !next) {
      continue;
    }

    const currentDelta = current.candidate.contrastMagnitude - targetLc;
    const nextDelta = next.candidate.contrastMagnitude - targetLc;

    if (currentDelta === 0) {
      return current.candidate;
    }

    if (nextDelta === 0) {
      return next.candidate;
    }

    if (Math.sign(currentDelta) === Math.sign(nextDelta)) {
      continue;
    }

    const refinedCandidate = refineLightnessInterval(
      backgroundHex,
      targetLc,
      polarity,
      chroma,
      hue,
      current.lightness,
      next.lightness,
    );

    if (refinedCandidate && refinedCandidate.errorRatio <= MAX_ACCEPTABLE_ERROR) {
      return refinedCandidate;
    }

    best = pickBestEffortCandidate(best, refinedCandidate);
  }

  return best;
}

function searchAtChroma(
  backgroundHex: string,
  targetLc: number,
  backgroundLightness: number,
  chroma: number,
  hue: number | undefined,
) {
  const darkerCandidate = searchPolarityAtChroma(
    backgroundHex,
    targetLc,
    backgroundLightness,
    chroma,
    hue,
    "darker",
  );
  const lighterCandidate = searchPolarityAtChroma(
    backgroundHex,
    targetLc,
    backgroundLightness,
    chroma,
    hue,
    "lighter",
  );

  return pickBestEffortCandidate(darkerCandidate, lighterCandidate);
}

function refineChromaInterval(
  backgroundHex: string,
  targetLc: number,
  backgroundLightness: number,
  hue: number | undefined,
  passingChroma: number,
  failingChroma: number,
) {
  let low = Math.min(passingChroma, failingChroma);
  let high = Math.max(passingChroma, failingChroma);
  let best = searchAtChroma(backgroundHex, targetLc, backgroundLightness, passingChroma, hue);

  for (let iteration = 0; iteration < SEARCH_ITERATIONS; iteration += 1) {
    const middle = (low + high) / 2;
    const candidate = searchAtChroma(backgroundHex, targetLc, backgroundLightness, middle, hue);

    best = pickPreferredCandidate(best, candidate);

    if (!candidate) {
      high = middle;
      continue;
    }

    if (candidate.errorRatio <= MAX_ACCEPTABLE_ERROR) {
      low = middle;
      best = pickPreferredCandidate(best, candidate);
    } else {
      high = middle;
    }
  }

  return best;
}

export function generateTextColorForContrast(
  backgroundHex: string,
  key: ColorTargetKey,
  targetLc: number,
): ContrastSearchResult | null {
  if (!isHexColor(backgroundHex)) {
    return null;
  }

  const normalizedBackgroundHex = normalizeHex(backgroundHex);
  const backgroundColor = toOklch(normalizedBackgroundHex);

  if (!backgroundColor) {
    return null;
  }

  const backgroundLightness = clampLightness(backgroundColor.l ?? 0);
  const originalChroma = Math.max(0, backgroundColor.c ?? 0);
  const hue = backgroundColor.h;

  let bestCandidate = searchAtChroma(
    normalizedBackgroundHex,
    targetLc,
    backgroundLightness,
    originalChroma,
    hue,
  );

  if (!bestCandidate) {
    return null;
  }

  if (bestCandidate.errorRatio > MAX_ACCEPTABLE_ERROR && originalChroma > 0) {
    let previousChroma = originalChroma;

    for (let step = 1; step <= COARSE_SEARCH_STEPS; step += 1) {
      const ratio = step / COARSE_SEARCH_STEPS;
      const chroma = originalChroma * (1 - ratio);
      const candidate = searchAtChroma(
        normalizedBackgroundHex,
        targetLc,
        backgroundLightness,
        chroma,
        hue,
      );

      bestCandidate = pickPreferredCandidate(bestCandidate, candidate);

      if (!candidate) {
        previousChroma = chroma;
        continue;
      }

      if (candidate.errorRatio <= MAX_ACCEPTABLE_ERROR) {
        const refinedCandidate = refineChromaInterval(
          normalizedBackgroundHex,
          targetLc,
          backgroundLightness,
          hue,
          chroma,
          previousChroma,
        );
        bestCandidate = pickPreferredCandidate(bestCandidate, refinedCandidate);
        break;
      }

      previousChroma = chroma;
    }
  }

  if (!bestCandidate) {
    return null;
  }

  return {
    actualLc: bestCandidate.actualLc,
    errorRatio: bestCandidate.errorRatio,
    hex: bestCandidate.hex,
    isWithinTolerance: bestCandidate.errorRatio <= MAX_ACCEPTABLE_ERROR,
    key,
    oklch: formatOklchValue(bestCandidate.hex),
    polarity: bestCandidate.polarity,
    targetLc,
  };
}

export function buildPaletteForBackground(backgroundHex: string): BackgroundPalette | null {
  if (!isHexColor(backgroundHex)) {
    return null;
  }

  const normalizedBackgroundHex = normalizeHex(backgroundHex);
  const samples = Object.fromEntries(
    COLOR_TARGETS.map((target) => {
      const result = generateTextColorForContrast(
        normalizedBackgroundHex,
        target.key,
        target.targetLc,
      );

      if (!result) {
        return null;
      }

      return [target.key, result];
    }).filter((entry): entry is [ColorTargetKey, ContrastSearchResult] => entry !== null),
  );

  if (Object.keys(samples).length !== COLOR_TARGETS.length) {
    return null;
  }

  return {
    backgroundHex: normalizedBackgroundHex,
    samples: samples as Record<ColorTargetKey, ContrastSearchResult>,
  };
}
