"use client";

import { useRef, useEffect, useMemo, useState } from "react";
import { ADAPTER_KEYS, ADAPTERS, type AdapterKey } from "../lib/oklch-adapter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OklchColor {
  l: number;
  c: number;
  h: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an evenly-spaced array of `count` values from `min` to `max`. */
function linspace(min: number, max: number, count: number): number[] {
  if (count <= 1) return [min];
  return Array.from({ length: count }, (_, i) => min + (i / (count - 1)) * (max - min));
}

/**
 * Determine whether a box-shadow ring should be white or black based on the
 * background color's relative luminance.
 */
function ringColor(hex: string | null): string {
  if (!hex) return "white";
  // Quick luminance estimate from the hex
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "black" : "white";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface NumberInputProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}

function NumberInput({ label, min, max, step, value, onChange }: NumberInputProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <input
        className="w-20 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm tabular-nums text-gray-900 shadow-xs focus:border-gray-400 focus:outline-none"
        max={max}
        min={min}
        step={step}
        onChange={(e) => {
          const next = parseInt(e.target.value, 10);
          if (!isNaN(next) && next >= min && next <= max) onChange(next);
        }}
        type="number"
        value={value}
      />
    </label>
  );
}

interface ChartProps {
  title: string;
  xLabel: string;
  yLabel: string;
  xValues: number[];
  yValues: number[];
  /** Build the OKLCH color for a given (xVal, yVal) cell. */
  cellColor: (xVal: number, yVal: number) => string | null;
  /** Return true if this cell is the currently selected one. */
  isSelected: (xVal: number, yVal: number) => boolean;
  /** Called when a cell is hovered while the primary mouse button is held. */
  onSelect: (xVal: number, yVal: number) => void;
  cellSize: number;
  /** Shared ref tracking whether the primary mouse button is currently held. */
  isDragging: React.RefObject<boolean>;
}

function Chart({
  title,
  xLabel,
  yLabel,
  xValues,
  yValues,
  cellColor,
  isSelected,
  onSelect,
  cellSize,
  isDragging,
}: ChartProps) {
  // Pre-compute all hex values for this chart.
  // yValues drives rows (top = high y), xValues drives columns.
  const rows = useMemo(() => {
    return [...yValues].reverse().map((yVal) =>
      xValues.map((xVal) => ({
        xVal,
        yVal,
        hex: cellColor(xVal, yVal),
      })),
    );
  }, [xValues, yValues, cellColor]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <p className="text-xs text-gray-500">
          Y: {yLabel} &nbsp;·&nbsp; X: {xLabel}
        </p>
      </div>

      <div className="flex gap-2">
        {/* Y-axis label */}
        <div
          className="flex items-center justify-center"
          style={{ width: 14, writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          <span className="text-[10px] text-gray-400 uppercase tracking-widest select-none">
            {yLabel}
          </span>
        </div>

        {/* Grid */}
        <div className="flex flex-col" style={{ gap: "1px", userSelect: "none" }}>
          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex" style={{ gap: "1px" }}>
              {row.map(({ xVal, yVal, hex }) => {
                const selected = isSelected(xVal, yVal);
                const ring = ringColor(hex);
                const oppositeRing = ring === "white" ? "black" : "white";

                return (
                  <div
                    key={`${xVal}-${yVal}`}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      onSelect(xVal, yVal);
                    }}
                    onMouseEnter={() => {
                      if (isDragging.current) onSelect(xVal, yVal);
                    }}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      flexShrink: 0,
                      backgroundColor: hex ?? "transparent",
                      visibility: hex ? "visible" : "hidden",
                      boxShadow: selected
                        ? `0 0 0 1.5px ${ring}, 0 0 0 3px ${oppositeRing}`
                        : undefined,
                      cursor: "crosshair",
                      position: "relative",
                      zIndex: selected ? 1 : undefined,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* X-axis label */}
      <div className="pl-6 text-center">
        <span className="text-[10px] text-gray-400 uppercase tracking-widest select-none">
          {xLabel}
        </span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SpectrumExplorer() {
  // Color library adapter
  const [adapterKey, setAdapterKey] = useState<AdapterKey>("culori");
  const adapter = ADAPTERS[adapterKey];

  // Resolution state
  const [lSteps, setLSteps] = useState(50);
  const [cSteps, setCSteps] = useState(25);
  const [hSteps, setHSteps] = useState(25);
  const [cellSize, setCellSize] = useState(12);

  // Current color state
  const [color, setColor] = useState<OklchColor>({ l: 0.5, c: 0.1, h: 270 });

  // Shared drag state — tracked globally so dragging works across charts and
  // when the cursor briefly leaves a chart and re-enters.
  const isDragging = useRef(false);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (e.button === 0) isDragging.current = true;
    };
    const onUp = (e: MouseEvent) => {
      if (e.button === 0) isDragging.current = false;
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Axis value arrays
  const lValues = useMemo(() => linspace(0, 1, lSteps), [lSteps]);
  const cValues = useMemo(() => linspace(0, 0.4, cSteps), [cSteps]);
  const hValues = useMemo(() => linspace(0, 360, hSteps), [hSteps]);

  // Nearest grid values for the current color (for selection highlighting)
  const nearestL = useMemo(
    () =>
      lValues.reduce(
        (best, v) => (Math.abs(v - color.l) < Math.abs(best - color.l) ? v : best),
        lValues[0] ?? 0,
      ),
    [lValues, color.l],
  );
  const nearestC = useMemo(
    () =>
      cValues.reduce(
        (best, v) => (Math.abs(v - color.c) < Math.abs(best - color.c) ? v : best),
        cValues[0] ?? 0,
      ),
    [cValues, color.c],
  );
  const nearestH = useMemo(
    () =>
      hValues.reduce(
        (best, v) => (Math.abs(v - color.h) < Math.abs(best - color.h) ? v : best),
        hValues[0] ?? 0,
      ),
    [hValues, color.h],
  );

  // Current color hex for the swatch
  const currentHex = useMemo(
    () => adapter.oklchToHex(color.l, color.c, color.h) ?? "#888888",
    [adapter, color],
  );

  // Chart 1: Chroma (Y) × Lightness (X) — fixed Hue
  const cl_cellColor = useMemo(
    () => (xVal: number, yVal: number) => adapter.oklchToHex(xVal, yVal, color.h),
    [adapter, color.h],
  );

  // Chart 2: Chroma (Y) × Hue (X) — fixed Lightness
  const ch_cellColor = useMemo(
    () => (xVal: number, yVal: number) => adapter.oklchToHex(color.l, yVal, xVal),
    [adapter, color.l],
  );

  // Chart 3: Lightness (Y) × Hue (X) — fixed Chroma
  const lh_cellColor = useMemo(
    () => (xVal: number, yVal: number) => adapter.oklchToHex(yVal, color.c, xVal),
    [adapter, color.c],
  );

  return (
    <main className="isolate mx-auto flex min-h-dvh w-full max-w-fit flex-col gap-8 px-6 py-8 text-gray-950">
      {/* Header */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">OKLCH Spectrum</h1>
          <p className="text-sm text-gray-500">
            Interactive visualization of the OKLCH color space.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-xs">
          <NumberInput
            label="Lightness steps"
            min={2}
            max={200}
            step={5}
            value={lSteps}
            onChange={setLSteps}
          />
          <NumberInput
            label="Chroma steps"
            min={2}
            max={100}
            step={5}
            value={cSteps}
            onChange={setCSteps}
          />
          <NumberInput
            label="Hue steps"
            min={2}
            max={100}
            step={5}
            value={hSteps}
            onChange={setHSteps}
          />
          <NumberInput
            label="Cell size (px)"
            min={2}
            max={64}
            value={cellSize}
            onChange={setCellSize}
          />

          {/* Color library selector */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Color library
            </span>
            <div className="flex items-center gap-3">
              {ADAPTER_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    checked={adapterKey === key}
                    className="accent-gray-700"
                    name="adapter"
                    onChange={() => setAdapterKey(key)}
                    type="radio"
                    value={key}
                  />
                  <span className="text-sm text-gray-700 font-mono">{ADAPTERS[key].label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Current color swatch */}
          <div className="ml-auto flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Current color
            </span>
            <div className="flex items-center gap-2">
              <div
                className="rounded-lg border border-gray-200 shadow-xs"
                style={{ width: 32, height: 32, backgroundColor: currentHex }}
              />
              <div className="flex flex-col">
                <span className="text-xs tabular-nums text-gray-700 font-mono">{currentHex}</span>
                <span className="text-xs tabular-nums text-gray-500 font-mono">
                  oklch({color.l.toFixed(3)} {color.c.toFixed(3)} {color.h.toFixed(1)})
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Charts */}
      <div className="flex flex-col gap-10">
        {/* Chart 1: Chroma (Y) × Lightness (X), fixed Hue */}
        <Chart
          title="Chroma × Lightness"
          xLabel="Lightness"
          yLabel="Chroma"
          xValues={lValues}
          yValues={cValues}
          cellColor={cl_cellColor}
          isSelected={(xVal, yVal) => xVal === nearestL && yVal === nearestC}
          onSelect={(xVal, yVal) => setColor((prev) => ({ ...prev, l: xVal, c: yVal }))}
          cellSize={cellSize}
          isDragging={isDragging}
        />

        {/* Chart 2: Chroma (Y) × Hue (X), fixed Lightness */}
        <Chart
          title="Chroma × Hue"
          xLabel="Hue"
          yLabel="Chroma"
          xValues={hValues}
          yValues={cValues}
          cellColor={ch_cellColor}
          isSelected={(xVal, yVal) => xVal === nearestH && yVal === nearestC}
          onSelect={(xVal, yVal) => setColor((prev) => ({ ...prev, h: xVal, c: yVal }))}
          cellSize={cellSize}
          isDragging={isDragging}
        />

        {/* Chart 3: Lightness (Y) × Hue (X), fixed Chroma */}
        <Chart
          title="Lightness × Hue"
          xLabel="Hue"
          yLabel="Lightness"
          xValues={hValues}
          yValues={lValues}
          cellColor={lh_cellColor}
          isSelected={(xVal, yVal) => xVal === nearestH && yVal === nearestL}
          onSelect={(xVal, yVal) => setColor((prev) => ({ ...prev, h: xVal, l: yVal }))}
          cellSize={cellSize}
          isDragging={isDragging}
        />
      </div>
    </main>
  );
}
