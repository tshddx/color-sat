import { describe, expect, it } from "vite-plus/test";
import { C_MAX, normalizePickerColor, planeFromPoint, Space } from "./color";
import { paintPicker } from "./paint";

describe("OKLCH picker color helpers", () => {
  it("normalizes invalid and out-of-range values", () => {
    expect(normalizePickerColor({ l: 2, c: -1, h: -30 })).toEqual({ l: 1, c: 0, h: 330 });
    expect(normalizePickerColor({ l: Number.NaN, c: Number.POSITIVE_INFINITY, h: 390 })).toEqual({
      l: 0,
      c: 0,
      h: 30,
    });
  });

  it("maps graph coordinates to the expected OKLCH axes", () => {
    expect(planeFromPoint("l", { l: 0.4, c: 0.1, h: 20 }, 50, 25, 100, 100)).toEqual({
      l: 0.4,
      c: C_MAX * 0.75,
      h: 180,
    });

    expect(planeFromPoint("h", { l: 0.4, c: 0.1, h: 20 }, 25, 50, 100, 100)).toEqual({
      l: 0.25,
      c: C_MAX * 0.5,
      h: 20,
    });
  });
});

describe("OKLCH picker paint", () => {
  it("renders in-gamut slider pixels as opaque", () => {
    const result = paintPicker({
      id: 1,
      color: { l: 0.5, c: 0, h: 0 },
      displayP3: false,
      from: 0,
      height: 1,
      kind: "slider",
      target: "l",
      to: 3,
      width: 3,
    });
    const pixels = new Uint8ClampedArray(result.pixels);

    expect(result.width).toBe(3);
    expect(pixels[3]).toBe(255);
    expect(pixels[7]).toBe(255);
    expect(pixels[11]).toBe(255);
  });

  it("leaves out-of-P3 colors transparent", () => {
    const result = paintPicker({
      id: 1,
      color: { l: 0.5, c: 0.37, h: 140 },
      displayP3: false,
      from: 0,
      height: 1,
      kind: "slider",
      target: "c",
      to: 2,
      width: 2,
    });
    const pixels = new Uint8ClampedArray(result.pixels);

    expect(pixels[3]).toBe(255);
    expect(pixels[7]).toBeLessThanOrEqual(255);
    expect([Space.Srgb, Space.P3, Space.Out]).toContain(Space.Out);
  });
});
