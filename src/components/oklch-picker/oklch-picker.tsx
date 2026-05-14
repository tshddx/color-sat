import { useCallback, useEffect, useRef, useState } from "react";
import type { OklchColor } from "../../lib/solver";
import {
  axisMax,
  normalizePickerColor,
  planeAxisPosition,
  planeFromPoint,
  planeTitle,
  setAxis,
  type PickerAxis,
  type PickerPlane,
} from "./color";
import type { PaintRequest, PaintResponse } from "./paint";

const PLANES: PickerPlane[] = ["l", "c", "h"];
const AXES: PickerAxis[] = ["l", "c", "h"];
const PLANE_LABELS: Record<PickerPlane, string> = {
  c: "Chroma",
  h: "Hue",
  l: "Lightness",
};
const PLANE_SIZE = "h-32";
const SLIDER_SIZE = "h-7";
const GRAPH_WIDTH = "w-[350px] max-w-full";

type PaintTarget = {
  canvas: HTMLCanvasElement;
  color: OklchColor;
  displayP3: boolean;
  height: number;
  key: string;
  kind: PaintRequest["kind"];
  target: PickerAxis | PickerPlane;
  width: number;
};

type PendingPaint = Omit<PaintTarget, "key">;

type WorkerState = {
  all: Worker[];
  available: Worker[];
  busy: Set<string>;
  lastPending: Map<string, PendingPaint>;
  nextId: number;
};

function createWorker(): Worker {
  return new Worker(new URL("./oklch-picker-worker.ts", import.meta.url), { type: "module" });
}

function getCanvasSize(canvas: HTMLCanvasElement): [number, number] {
  const ratio = Math.ceil(window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * ratio));
  const height = Math.max(1, Math.floor(rect.height * ratio));
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
  return [width, height];
}

function getCanvasContext(canvas: HTMLCanvasElement, displayP3: boolean): CanvasRenderingContext2D {
  return canvas.getContext("2d", { colorSpace: displayP3 ? "display-p3" : "srgb" })!;
}

function supportsDisplayP3Canvas(): boolean {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("2d", { colorSpace: "display-p3" }));
}

function startPaint(state: WorkerState, paint: PaintTarget): void {
  if (state.busy.has(paint.key)) {
    state.lastPending.set(paint.key, paint);
    return;
  }

  if (state.available.length === 0) {
    state.lastPending.set(paint.key, paint);
    return;
  }

  const workerCount = Math.min(
    state.available.length,
    Math.max(1, Math.floor(state.available.length / 3)),
  );
  const workers = state.available.splice(0, workerCount);
  const requestId = state.nextId;
  state.nextId += 1;
  state.busy.add(paint.key);

  const parts: [ImageData, number][] = [];
  let finished = 0;

  for (let index = 0; index < workers.length; index += 1) {
    const worker = workers[index]!;
    const from = Math.floor((paint.width * index) / workers.length);
    const to = Math.floor((paint.width * (index + 1)) / workers.length);
    const message: PaintRequest = {
      id: requestId,
      color: paint.color,
      displayP3: paint.displayP3,
      from,
      height: paint.height,
      kind: paint.kind,
      target: paint.target,
      to,
      width: paint.width,
    };

    worker.addEventListener(
      "message",
      (event: MessageEvent<PaintResponse>) => {
        state.available.push(worker);
        finished += 1;

        parts.push([
          new ImageData(new Uint8ClampedArray(event.data.pixels), event.data.width, paint.height),
          event.data.from,
        ]);

        if (finished === workers.length) {
          state.busy.delete(paint.key);

          const context = getCanvasContext(paint.canvas, paint.displayP3);
          for (const [image, imageFrom] of parts.sort((a, b) => a[1] - b[1])) {
            context.putImageData(image, imageFrom, 0);
          }

          const nextEntry = state.lastPending.entries().next().value as
            | [string, PendingPaint]
            | undefined;
          if (nextEntry) {
            const [nextKey, nextPaint] = nextEntry;
            state.lastPending.delete(nextKey);
            startPaint(state, { ...nextPaint, key: nextKey });
          }
        }
      },
      { once: true },
    );
    worker.postMessage(message);
  }
}

function usePickerPainter() {
  const stateRef = useRef<WorkerState | undefined>(undefined);

  useEffect(() => {
    const workerCount = Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 8));
    const workers = Array.from({ length: workerCount }, () => createWorker());
    const state: WorkerState = {
      all: workers,
      available: [...workers],
      busy: new Set(),
      lastPending: new Map(),
      nextId: 1,
    };
    stateRef.current = state;

    return () => {
      for (const worker of state.all) {
        worker.terminate();
      }
      state.all = [];
      state.available = [];
      state.lastPending.clear();
      state.busy.clear();
    };
  }, []);

  return useCallback((paint: PaintTarget) => {
    const state = stateRef.current;
    if (!state) return;
    startPaint(state, paint);
  }, []);
}

function useRafCallback(callback: () => void) {
  const frameRef = useRef<number | undefined>(undefined);

  return useCallback(() => {
    if (frameRef.current !== undefined) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = undefined;
      callback();
    });
  }, [callback]);
}

function pointerToColor(
  plane: PickerPlane,
  canvas: HTMLCanvasElement,
  color: OklchColor,
  clientX: number,
  clientY: number,
): OklchColor {
  const rect = canvas.getBoundingClientRect();
  return planeFromPoint(
    plane,
    color,
    clientX - rect.left,
    clientY - rect.top,
    rect.width,
    rect.height,
  );
}

function formatValue(value: number, precision = 3): string {
  return String(Number(value.toFixed(precision)));
}

function PlaneCanvas({
  color,
  onChange,
  plane,
}: {
  color: OklchColor;
  onChange: (color: OklchColor) => void;
  plane: PickerPlane;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const updateFromPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(pointerToColor(plane, canvas, color, event.clientX, event.clientY));
  };
  const xPosition = `${planeAxisPosition(plane, "x", color) * 100}%`;
  const yPosition = `${100 - planeAxisPosition(plane, "y", color) * 100}%`;

  return (
    <div className="relative rounded-lg border border-gray-950/10 bg-[linear-gradient(45deg,#eee_25%,transparent_25%),linear-gradient(-45deg,#eee_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eee_75%),linear-gradient(-45deg,transparent_75%,#eee_75%)] bg-[length:12px_12px] bg-[position:0_0,0_6px,6px_-6px,-6px_0]">
      <canvas
        ref={canvasRef}
        aria-label={planeTitle(plane)}
        className={`block w-full ${PLANE_SIZE} touch-none cursor-crosshair rounded-lg [image-rendering:crisp-edges]`}
        data-picker-kind="plane"
        data-picker-target={plane}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateFromPointer(event);
          }
        }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 w-px bg-white/70 mix-blend-difference"
        style={{ left: xPosition }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 h-px bg-white/70 mix-blend-difference"
        style={{ top: yPosition }}
      />
    </div>
  );
}

function SliderCanvas({
  axis,
  color,
  onChange,
}: {
  axis: PickerAxis;
  color: OklchColor;
  onChange: (color: OklchColor) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const max = axisMax(axis);
  const value = color[axis];

  return (
    <div className="relative rounded-lg border border-gray-950/10 bg-[linear-gradient(45deg,#eee_25%,transparent_25%),linear-gradient(-45deg,#eee_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eee_75%),linear-gradient(-45deg,transparent_75%,#eee_75%)] bg-[length:12px_12px] bg-[position:0_0,0_6px,6px_-6px,-6px_0]">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`block w-full ${SLIDER_SIZE} rounded-lg [image-rendering:crisp-edges]`}
        data-picker-kind="slider"
        data-picker-target={axis}
      />
      <input
        aria-label={`${axis.toUpperCase()} fixed color value`}
        className="absolute -top-px -left-3 z-10 h-[calc(100%+2px)] w-[calc(100%+24px)] cursor-pointer appearance-none bg-transparent accent-gray-950"
        max={max}
        min={0}
        step={axis === "h" ? 1 : 0.001}
        type="range"
        value={value}
        onChange={(event) => onChange(setAxis(color, axis, Number(event.currentTarget.value)))}
      />
    </div>
  );
}

export function OklchPicker({
  color,
  onChange,
}: {
  color: OklchColor;
  onChange: (color: OklchColor) => void;
}) {
  const normalized = normalizePickerColor(color);
  const containerRef = useRef<HTMLDivElement>(null);
  const paint = usePickerPainter();
  const [displayP3, setDisplayP3] = useState(false);

  const repaint = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;

    for (const canvas of root.querySelectorAll<HTMLCanvasElement>("canvas[data-picker-kind]")) {
      const [width, height] = getCanvasSize(canvas);
      const kind = canvas.dataset.pickerKind as PaintRequest["kind"];
      const target = canvas.dataset.pickerTarget as PickerAxis | PickerPlane;
      paint({
        canvas,
        color: normalized,
        displayP3,
        height,
        key: `${kind}:${target}`,
        kind,
        target,
        width,
      });
    }
  }, [displayP3, normalized, paint]);
  const scheduleRepaint = useRafCallback(repaint);

  useEffect(() => {
    setDisplayP3(supportsDisplayP3Canvas());
  }, []);

  useEffect(() => {
    scheduleRepaint();
  }, [normalized.l, normalized.c, normalized.h, displayP3, scheduleRepaint]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new ResizeObserver(scheduleRepaint);
    observer.observe(root);
    return () => observer.disconnect();
  }, [scheduleRepaint]);

  return (
    <div ref={containerRef} className="mt-4 space-y-5">
      <div className="flex flex-wrap gap-5">
        {PLANES.map((plane) => (
          <div key={plane} className={`${GRAPH_WIDTH} space-y-2`}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium tracking-wide text-gray-500 uppercase">
                {PLANE_LABELS[plane]}
              </span>
              <span className="text-xs tabular-nums text-gray-500">
                {plane === "l" && `L ${formatValue(normalized.l)}`}
                {plane === "c" && `C ${formatValue(normalized.c)}`}
                {plane === "h" && `H ${formatValue(normalized.h, 1)}`}
              </span>
            </div>
            <div className="[&_canvas[data-picker-kind='plane']]:h-32">
              <PlaneCanvas color={normalized} onChange={onChange} plane={plane} />
            </div>
            <SliderCanvas axis={plane} color={normalized} onChange={onChange} />
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {AXES.map((axis) => (
          <label key={axis} className="block">
            <span className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
              {axis.toUpperCase()}
            </span>
            <input
              className="relative block w-full appearance-none rounded-lg border border-gray-950/10 bg-white px-3 py-1.5 text-base text-gray-950 placeholder:text-gray-500 sm:text-sm"
              max={axisMax(axis)}
              min={0}
              step={axis === "h" ? 1 : 0.001}
              type="number"
              value={formatValue(normalized[axis], axis === "h" ? 1 : 3)}
              onChange={(event) =>
                onChange(setAxis(normalized, axis, Number(event.currentTarget.value)))
              }
            />
          </label>
        ))}
      </div>

      <div className="text-xs text-gray-500">
        Shows sRGB plus Display-P3-only color. The thin line marks the sRGB/P3 boundary.
      </div>
    </div>
  );
}
