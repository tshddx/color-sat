import { oklchToLinearAndSrgbInto, oklchToLinearInto } from "@colordx/core";
import { linearToP3ChannelsInto } from "@colordx/core/plugins/p3";
import { C_MAX, H_MAX, L_MAX, RENDER_GAP, Space, type PickerAxis, type PickerPlane } from "./color";

export type PaintKind = "plane" | "slider";

export type PaintRequest = {
  id: number;
  kind: PaintKind;
  target: PickerPlane | PickerAxis;
  color: { l: number; c: number; h: number };
  displayP3: boolean;
  from: number;
  to: number;
  width: number;
  height: number;
};

export type PaintResponse = {
  id: number;
  from: number;
  pixels: ArrayBuffer;
  width: number;
};

const LIN_BUF = new Float64Array(3);
const SRGB_BUF = new Float64Array(3);
const P3_BUF = new Float64Array(3);
const BOUNDARY = [20, 20, 20, 210] as const;

function inGamut(value1: number, value2: number, value3: number): boolean {
  return (
    value1 >= -RENDER_GAP &&
    value1 <= 1 + RENDER_GAP &&
    value2 >= -RENDER_GAP &&
    value2 <= 1 + RENDER_GAP &&
    value3 >= -RENDER_GAP &&
    value3 <= 1 + RENDER_GAP
  );
}

function clampByte(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 255;
  return Math.floor(value * 255);
}

function classifyAndWrite(
  data: Uint8ClampedArray,
  pos: number,
  l: number,
  c: number,
  h: number,
  displayP3: boolean,
): Space {
  if (displayP3) {
    oklchToLinearInto(LIN_BUF, l, c, h);
    linearToP3ChannelsInto(P3_BUF, LIN_BUF[0], LIN_BUF[1], LIN_BUF[2]);
    data[pos] = clampByte(P3_BUF[0]);
    data[pos + 1] = clampByte(P3_BUF[1]);
    data[pos + 2] = clampByte(P3_BUF[2]);
  } else {
    oklchToLinearAndSrgbInto(LIN_BUF, SRGB_BUF, l, c, h);
    data[pos] = clampByte(SRGB_BUF[0]);
    data[pos + 1] = clampByte(SRGB_BUF[1]);
    data[pos + 2] = clampByte(SRGB_BUF[2]);
  }

  if (inGamut(LIN_BUF[0], LIN_BUF[1], LIN_BUF[2])) {
    data[pos + 3] = 255;
    return Space.Srgb;
  }

  if (!displayP3) {
    linearToP3ChannelsInto(P3_BUF, LIN_BUF[0], LIN_BUF[1], LIN_BUF[2]);
  }

  if (inGamut(P3_BUF[0], P3_BUF[1], P3_BUF[2])) {
    data[pos + 3] = 255;
    return Space.P3;
  }

  data[pos] = 0;
  data[pos + 1] = 0;
  data[pos + 2] = 0;
  data[pos + 3] = 0;
  return Space.Out;
}

function colorForPlane(
  plane: PickerPlane,
  fixedColor: PaintRequest["color"],
  x: number,
  y: number,
  width: number,
  height: number,
): PaintRequest["color"] {
  if (plane === "l") {
    return { l: fixedColor.l, c: (y / height) * C_MAX, h: (x / width) * H_MAX };
  }

  if (plane === "c") {
    return { l: (y / height) * L_MAX, c: fixedColor.c, h: (x / width) * H_MAX };
  }

  return { l: (x / width) * L_MAX, c: (y / height) * C_MAX, h: fixedColor.h };
}

function colorForSlider(
  axis: PickerAxis,
  fixedColor: PaintRequest["color"],
  x: number,
  width: number,
): PaintRequest["color"] {
  if (axis === "l") {
    return { ...fixedColor, l: (x / width) * L_MAX };
  }

  if (axis === "c") {
    return { ...fixedColor, c: (x / width) * C_MAX };
  }

  return { ...fixedColor, h: (x / width) * H_MAX };
}

function markBoundary(data: Uint8ClampedArray, pos: number): void {
  data[pos] = BOUNDARY[0];
  data[pos + 1] = BOUNDARY[1];
  data[pos + 2] = BOUNDARY[2];
  data[pos + 3] = BOUNDARY[3];
}

export function paintPicker(request: PaintRequest): PaintResponse {
  const partWidth = request.to - request.from;
  const data = new Uint8ClampedArray(partWidth * request.height * 4);
  const spaces = new Uint8Array(partWidth * request.height);
  const xMax = Math.max(1, request.width - 1);
  const yMax = Math.max(1, request.height - 1);

  for (let localX = 0; localX < partWidth; localX += 1) {
    const globalX = request.from + localX;

    for (let canvasY = 0; canvasY < request.height; canvasY += 1) {
      const colorY = yMax - canvasY;
      const color =
        request.kind === "plane"
          ? colorForPlane(request.target as PickerPlane, request.color, globalX, colorY, xMax, yMax)
          : colorForSlider(request.target as PickerAxis, request.color, globalX, xMax);
      const index = canvasY * partWidth + localX;
      const pos = index * 4;
      spaces[index] = classifyAndWrite(data, pos, color.l, color.c, color.h, request.displayP3);
    }
  }

  for (let localX = 0; localX < partWidth; localX += 1) {
    for (let y = 0; y < request.height; y += 1) {
      const index = y * partWidth + localX;
      const current = spaces[index];
      if (current === Space.Out) continue;

      const right = localX + 1 < partWidth ? spaces[index + 1] : current;
      const down = y + 1 < request.height ? spaces[index + partWidth] : current;
      if (
        (current === Space.Srgb && (right === Space.P3 || down === Space.P3)) ||
        (current === Space.P3 && (right === Space.Srgb || down === Space.Srgb))
      ) {
        markBoundary(data, index * 4);
      }
    }
  }

  return { id: request.id, from: request.from, pixels: data.buffer, width: partWidth };
}
