"use client";

import type { CSSProperties } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  buildPaletteForBackground,
  COLOR_TARGETS,
  formatOklchValue,
  isHexColor,
} from "../lib/color-contrast";

const STORAGE_KEY = "colorsat:palettes:v1";
const DEFAULT_CURRENT_BACKGROUND = "#ffffff";
const DEFAULT_BACKGROUND_COLORS = [
  "#ffffff",
  "#f3f4f6",
  "#e8e9eb",
  "#fee2dc",
  "#ffe4c8",
  "#eef507",
  "#cfff35",
  "#bdffa2",
  "#93fffb",
  "#dfe9fe",
  "#fedcff",
] as const;

interface SavedBackground {
  color: string;
  id: string;
}

interface StoredColorToolState {
  backgrounds: SavedBackground[];
  currentBackground: string;
}

interface InputProps {
  borderColor: string;
  placeholder: string;
  placeholderColor: string;
  textColor: string;
  value?: string;
}

function createSavedBackground(color: string): SavedBackground {
  return {
    color,
    id: crypto.randomUUID(),
  };
}

function createDefaultBackgrounds() {
  return DEFAULT_BACKGROUND_COLORS.map((color) => createSavedBackground(color));
}

function normalizeHex(value: string) {
  return value.trim().toLowerCase();
}

function parseStoredState(value: string | null): StoredColorToolState | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<StoredColorToolState>;
    const backgrounds = Array.isArray(parsed.backgrounds)
      ? parsed.backgrounds.flatMap((entry) => {
          if (typeof entry === "string") {
            const color = normalizeHex(entry);

            return isHexColor(color) ? [createSavedBackground(color)] : [];
          }

          if (
            typeof entry === "object" &&
            entry !== null &&
            "color" in entry &&
            "id" in entry &&
            typeof entry.color === "string" &&
            typeof entry.id === "string"
          ) {
            const color = normalizeHex(entry.color);

            return isHexColor(color) ? [{ color, id: entry.id }] : [];
          }

          return [];
        })
      : [];
    const currentBackground =
      typeof parsed.currentBackground === "string" && isHexColor(parsed.currentBackground)
        ? normalizeHex(parsed.currentBackground)
        : DEFAULT_CURRENT_BACKGROUND;

    return {
      backgrounds: backgrounds.filter(
        (background, index, current) =>
          current.findIndex((entry) => entry.color === background.color) === index,
      ),
      currentBackground,
    };
  } catch {
    return null;
  }
}

function formatRoundedLc(value: number) {
  return Math.abs(value).toFixed(1);
}

function LoadingSpinner() {
  return (
    <span
      aria-label="Updating previews"
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-400/40 border-t-gray-700 align-middle"
      role="status"
    />
  );
}

function Input({ borderColor, placeholder, placeholderColor, textColor, value }: InputProps) {
  return (
    <input
      className="w-full rounded-lg bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[var(--placeholder-color)]"
      defaultValue={value}
      placeholder={placeholder}
      style={
        {
          "--placeholder-color": placeholderColor,
          border: `1px solid ${borderColor}`,
          color: textColor,
        } as CSSProperties
      }
      type="text"
    />
  );
}

export function ColorSatApp() {
  const [currentBackground, setCurrentBackground] = useState(DEFAULT_CURRENT_BACKGROUND);
  const [backgrounds, setBackgrounds] = useState<SavedBackground[]>([]);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [editingBackgroundId, setEditingBackgroundId] = useState<string | null>(null);
  const deferredBackgrounds = useDeferredValue(backgrounds);

  useEffect(() => {
    const storedState = parseStoredState(localStorage.getItem(STORAGE_KEY));

    if (storedState) {
      setCurrentBackground(storedState.currentBackground);
      setBackgrounds(storedState.backgrounds);
    } else {
      setCurrentBackground(DEFAULT_BACKGROUND_COLORS[0]);
      setBackgrounds(createDefaultBackgrounds());
    }

    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        backgrounds,
        currentBackground,
      } satisfies StoredColorToolState),
    );
  }, [backgrounds, currentBackground, hasHydrated]);

  const palettes = useMemo(
    () =>
      deferredBackgrounds.map((background) => ({
        background,
        palette: buildPaletteForBackground(background.color),
      })),
    [deferredBackgrounds],
  );

  const liveBackgroundsById = useMemo(
    () => new Map(backgrounds.map((background) => [background.id, background])),
    [backgrounds],
  );

  const addBackground = () => {
    const normalizedBackground = normalizeHex(currentBackground);

    if (!isHexColor(normalizedBackground)) {
      return;
    }

    setBackgrounds((current) => {
      if (current.some((entry) => entry.color === normalizedBackground)) {
        return current;
      }

      return [...current, createSavedBackground(normalizedBackground)];
    });
  };

  const removeBackground = (backgroundId: string) => {
    setBackgrounds((current) => current.filter((entry) => entry.id !== backgroundId));
    setEditingBackgroundId((current) => (current === backgroundId ? null : current));
  };

  const updateBackground = (backgroundId: string, nextHex: string) => {
    const normalizedBackground = normalizeHex(nextHex);

    if (!isHexColor(normalizedBackground)) {
      return;
    }

    setBackgrounds((current) => {
      const existingBackground = current.find((entry) => entry.id === backgroundId);

      if (!existingBackground || existingBackground.color === normalizedBackground) {
        return current;
      }

      const duplicateBackground = current.find(
        (entry) => entry.id !== backgroundId && entry.color === normalizedBackground,
      );

      if (duplicateBackground) {
        setEditingBackgroundId(duplicateBackground.id);

        return current.filter((entry) => entry.id !== backgroundId);
      }

      return current.map((entry) => {
        if (entry.id !== backgroundId) {
          return entry;
        }

        return {
          ...entry,
          color: normalizedBackground,
        };
      });
    });

    setEditingBackgroundId(backgroundId);
  };

  const resetBackgrounds = () => {
    setCurrentBackground(DEFAULT_BACKGROUND_COLORS[0]);
    setBackgrounds(createDefaultBackgrounds());
    setEditingBackgroundId(null);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-8 text-gray-950">
      <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">ColorSAT</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            APCA-driven color palette explorer
          </h1>
          <p className="max-w-3xl text-sm text-gray-600">
            Start from a background color, then generate semantic foreground and surface colors by
            searching OKLCH lightness and reducing chroma when needed to reach each APCA target.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Choose background color"
            className="h-12 w-16 cursor-pointer rounded border border-gray-300 bg-transparent p-1"
            onChange={(event) => setCurrentBackground(event.target.value)}
            type="color"
            value={currentBackground}
          />
          <code>{currentBackground}</code>
          <button
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium"
            onClick={addBackground}
            type="button"
          >
            Add background
          </button>
          <button
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={backgrounds.length === 0}
            onClick={() => setBackgrounds([])}
            type="button"
          >
            Clear saved
          </button>
          <button
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium"
            onClick={resetBackgrounds}
            type="button"
          >
            Reset
          </button>
        </div>
      </section>

      {backgrounds.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
          Add a background color to generate the ColorSAT preview set.
        </section>
      ) : null}

      <div className="grid gap-6">
        {palettes.map(({ background, palette }) => {
          if (!palette) {
            return null;
          }

          const liveBackground = liveBackgroundsById.get(background.id) ?? background;
          const isDeferred = liveBackground.color !== background.color;
          const primaryText = palette.samples.primaryText;
          const secondaryText = palette.samples.secondaryText;
          const placeholderText = palette.samples.placeholderText;
          const divider = palette.samples.divider;
          const secondaryBackground = palette.samples.secondaryBackground;

          return (
            <section
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              key={background.id}
            >
              <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <button
                      aria-expanded={editingBackgroundId === background.id}
                      className="h-12 w-12 rounded-lg border border-gray-300"
                      onClick={() =>
                        setEditingBackgroundId((current) =>
                          current === background.id ? null : background.id,
                        )
                      }
                      style={{ backgroundColor: liveBackground.color }}
                      type="button"
                    />
                    {editingBackgroundId === background.id ? (
                      <div className="absolute left-0 top-14 z-10 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                        <input
                          aria-label={`Edit ${liveBackground.color} background color`}
                          className="h-12 w-16 cursor-pointer rounded border border-gray-300 bg-transparent p-1"
                          onChange={(event) => updateBackground(background.id, event.target.value)}
                          type="color"
                          value={liveBackground.color}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-medium">Background</span>
                      {isDeferred ? <LoadingSpinner /> : null}
                      <code>{liveBackground.color}</code>
                      <code>{formatOklchValue(liveBackground.color)}</code>
                    </p>
                  </div>
                </div>

                <button
                  className="w-fit rounded-md border border-gray-300 px-3 py-2 text-sm font-medium"
                  onClick={() => removeBackground(background.id)}
                  type="button"
                >
                  Remove
                </button>
              </div>

              <div className="grid gap-4 xl:grid-cols-[3fr_1fr]">
                <article className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="space-y-6 p-6" style={{ backgroundColor: palette.backgroundHex }}>
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <p
                          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                          style={{ color: secondaryText.hex }}
                        >
                          Flight-Critical Production Cell 07
                        </p>
                        <h2
                          className="max-w-2xl text-2xl font-semibold leading-tight"
                          style={{ color: primaryText.hex }}
                        >
                          Titanium airframe brackets cleared final metrology.
                        </h2>
                        <p
                          className="max-w-xl text-sm leading-6"
                          style={{ color: primaryText.hex }}
                        >
                          Process capability held within tolerance across five-axis finishing and
                          fluorescent penetrant inspection, supporting on-time shipment into
                          satellite propulsion assembly.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 text-[11px]">
                        {[
                          "NADCAP Approved",
                          "AS9100 Rev D",
                          "Lot Traceable",
                          "ITAR Controlled",
                        ].map((label) => (
                          <div
                            className="rounded-full px-2 py-1"
                            key={label}
                            style={{
                              border: `1px solid ${divider.hex}`,
                              color: secondaryText.hex,
                            }}
                          >
                            {label}
                          </div>
                        ))}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        {[
                          ["Yield", "99.2%"],
                          ["NCRs", "0 Open"],
                          ["Dispatch", "18:40 UTC"],
                        ].map(([label, value]) => (
                          <div
                            className="rounded-xl px-4 py-3"
                            key={label}
                            style={{ border: `1px solid ${divider.hex}` }}
                          >
                            <p
                              className="text-[11px] uppercase tracking-[0.16em]"
                              style={{ color: secondaryText.hex }}
                            >
                              {label}
                            </p>
                            <p
                              className="mt-1 text-lg font-semibold"
                              style={{ color: primaryText.hex }}
                            >
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div
                        className="rounded-2xl p-4"
                        style={{ border: `1px solid ${divider.hex}` }}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-2">
                            <p
                              className="text-[11px] uppercase tracking-[0.16em]"
                              style={{ color: secondaryText.hex }}
                            >
                              Work Order Summary
                            </p>
                            <p
                              className="text-lg font-semibold leading-tight"
                              style={{ color: primaryText.hex }}
                            >
                              WF-2187 ready for final packaging and cert review.
                            </p>
                            <p
                              className="max-w-lg text-sm leading-6"
                              style={{ color: primaryText.hex }}
                            >
                              Source inspection signoff, serialization audit, and dimensional
                              records are complete for this release lot.
                            </p>
                          </div>
                          <div
                            className="rounded-full px-3 py-1 text-[11px] font-medium"
                            style={{
                              border: `1px solid ${divider.hex}`,
                              color: secondaryText.hex,
                            }}
                          >
                            Ready to Ship
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                        <div
                          className="rounded-2xl p-4"
                          style={{ border: `1px solid ${divider.hex}` }}
                        >
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <p
                                className="text-[11px] uppercase tracking-[0.16em]"
                                style={{ color: secondaryText.hex }}
                              >
                                Traveler Inputs
                              </p>
                              <p
                                className="text-base font-semibold"
                                style={{ color: primaryText.hex }}
                              >
                                Final inspection handoff
                              </p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              {[
                                {
                                  label: "Work order",
                                  placeholder: "WF-2187-A",
                                  value: "WF-2187-A",
                                },
                                {
                                  label: "Inspector",
                                  placeholder: "Assign inspector",
                                  value: "",
                                },
                                {
                                  label: "Route step",
                                  placeholder: "170 - Final QA",
                                  value: "170 - Final QA",
                                },
                                {
                                  label: "Packaging",
                                  placeholder: "Cleanroom bag + foam",
                                  value: "",
                                },
                              ].map(({ label, placeholder, value }) => (
                                <div className="space-y-1" key={label}>
                                  <p
                                    className="text-[11px] uppercase tracking-[0.16em]"
                                    style={{ color: secondaryText.hex }}
                                  >
                                    {label}
                                  </p>
                                  <Input
                                    borderColor={divider.hex}
                                    placeholder={placeholder}
                                    placeholderColor={placeholderText.hex}
                                    textColor={primaryText.hex}
                                    value={value}
                                  />
                                </div>
                              ))}
                            </div>

                            <div className="space-y-1">
                              <p
                                className="text-[11px] uppercase tracking-[0.16em]"
                                style={{ color: secondaryText.hex }}
                              >
                                Notes
                              </p>
                              <div
                                className="min-h-24 rounded-xl px-3 py-3 text-sm leading-6"
                                style={{
                                  border: `1px solid ${divider.hex}`,
                                  color: secondaryText.hex,
                                }}
                              >
                                Verify serialized labels against packing sheet, include FAIR
                                reference, and hold for customer source release before dock
                                transfer.
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-3">
                              <button
                                className="rounded-lg px-4 py-2 text-sm font-medium"
                                style={{
                                  backgroundColor: secondaryBackground.hex,
                                  color: primaryText.hex,
                                }}
                                type="button"
                              >
                                Hold for review
                              </button>
                              <button
                                className="rounded-lg px-4 py-2 text-sm font-medium"
                                style={{
                                  backgroundColor: secondaryBackground.hex,
                                  color: primaryText.hex,
                                }}
                                type="button"
                              >
                                Release to shipping
                              </button>
                            </div>
                          </div>
                        </div>

                        <div
                          className="rounded-2xl p-4"
                          style={{ border: `1px solid ${divider.hex}` }}
                        >
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <p
                                className="text-[11px] uppercase tracking-[0.16em]"
                                style={{ color: secondaryText.hex }}
                              >
                                Lot Snapshot
                              </p>
                              <p
                                className="text-base font-semibold"
                                style={{ color: primaryText.hex }}
                              >
                                Recent release queue
                              </p>
                            </div>

                            <div
                              className="overflow-hidden rounded-xl"
                              style={{ border: `1px solid ${divider.hex}` }}
                            >
                              <div
                                className="grid grid-cols-[1.2fr_0.8fr_0.8fr] px-3 py-2 text-[11px] uppercase tracking-[0.16em]"
                                style={{ color: secondaryText.hex }}
                              >
                                <p>Lot</p>
                                <p>Status</p>
                                <p>Ship</p>
                              </div>
                              {[
                                ["WF-2187-A", "Ready", "Today"],
                                ["WF-2191-C", "Review", "Hold"],
                                ["WF-2204-B", "Pack", "17:10"],
                              ].map(([lot, status, ship]) => (
                                <div
                                  className="grid grid-cols-[1.2fr_0.8fr_0.8fr] px-3 py-2 text-sm"
                                  key={lot}
                                  style={{
                                    borderTop: `1px solid ${divider.hex}`,
                                    color: secondaryText.hex,
                                  }}
                                >
                                  <p style={{ color: primaryText.hex }}>{lot}</p>
                                  <p>{status}</p>
                                  <p>{ship}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2 border-t border-gray-200 bg-white p-4 text-sm text-gray-600">
                    <div className="flex items-center justify-between gap-4">
                      <span>Composite preview</span>
                      <span>Uses divider, secondaryBackground, secondaryText, primaryText</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Primary text</span>
                      <span>Headings and body copy</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Secondary text</span>
                      <span>Overlines and supporting UI detail</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Divider</span>
                      <span>Chips, table rows, and input borders</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Secondary background</span>
                      <span>Filled action buttons</span>
                    </div>
                  </div>
                </article>

                <article className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <div className="border-b border-gray-200 p-4">
                    <h3 className="text-sm font-semibold">Text Color Specs</h3>
                  </div>

                  <div className="grid gap-3 p-4">
                    {COLOR_TARGETS.map((target) => {
                      const result = palette.samples[target.key];

                      return (
                        <div className="rounded-xl border border-gray-200 p-4" key={target.key}>
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{target.key}</p>
                              <p className="text-xs text-gray-600">{target.role}</p>
                            </div>
                            <div
                              aria-hidden="true"
                              className="h-10 w-10 rounded-lg border border-black/10"
                              style={{ backgroundColor: result.hex }}
                            />
                          </div>

                          <div className="grid gap-2 text-sm text-gray-600">
                            <div className="flex items-center justify-between gap-4">
                              <span>LC</span>
                              <span>
                                {target.targetLc} ({formatRoundedLc(result.actualLc)})
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span>Hex</span>
                              <code>{result.hex}</code>
                            </div>
                            <div className="flex items-start justify-between gap-4">
                              <span>OKLCH</span>
                              <code className="max-w-[18rem] text-right">{result.oklch}</code>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
