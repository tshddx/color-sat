"use client";

import type { CSSProperties, ReactNode } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Badge } from "./catalyst/typescript/badge";
import { Button } from "./catalyst/typescript/button";
import { Divider } from "./catalyst/typescript/divider";
import { Field, FieldGroup, Label } from "./catalyst/typescript/fieldset";
import { Heading, Subheading } from "./catalyst/typescript/heading";
import { Input as CatalystInput } from "./catalyst/typescript/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./catalyst/typescript/table";
import { Code, Text } from "./catalyst/typescript/text";
import { Textarea as CatalystTextarea } from "./catalyst/typescript/textarea";
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

interface PreviewFieldProps {
  ariaLabel: string;
  borderColor: string;
  name: string;
  placeholder: string;
  placeholderColor: string;
  textColor: string;
  value?: string;
}

interface PreviewTextareaProps {
  ariaLabel: string;
  borderColor: string;
  name: string;
  placeholderColor: string;
  textColor: string;
  value: string;
}

interface TextColorSpecCardProps {
  result: {
    actualLc: number;
    hex: string;
    oklch: string;
  };
  target: (typeof COLOR_TARGETS)[number];
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

function buildPreviewControlStyle(
  borderColor: string,
  textColor: string,
  placeholderColor: string,
): CSSProperties {
  return {
    "--preview-control-bg": "transparent",
    "--preview-control-border": borderColor,
    "--preview-control-focus": borderColor,
    "--preview-control-placeholder": placeholderColor,
    "--preview-control-text": textColor,
  } as CSSProperties;
}

function buildPreviewButtonStyle(backgroundColor: string, textColor: string): CSSProperties {
  return {
    "--btn-bg": backgroundColor,
    "--btn-border": backgroundColor,
    "--btn-hover-overlay": "rgb(255 255 255 / 0.12)",
    "--preview-button-text": textColor,
  } as CSSProperties;
}

function LoadingSpinner() {
  return (
    <span
      aria-label="Updating previews"
      className="inline-block size-3.5 animate-spin rounded-full border-2 border-gray-400/40 border-t-gray-700 align-middle"
      role="status"
    />
  );
}

function PreviewInput({
  ariaLabel,
  borderColor,
  name,
  placeholder,
  placeholderColor,
  textColor,
  value,
}: PreviewFieldProps) {
  return (
    <CatalystInput
      aria-label={ariaLabel}
      className="before:bg-[var(--preview-control-bg)] sm:focus-within:after:ring-[var(--preview-control-focus)]"
      controlStyle={buildPreviewControlStyle(borderColor, textColor, placeholderColor)}
      defaultValue={value}
      inputClassName="border-[var(--preview-control-border)] bg-transparent text-[var(--preview-control-text)] placeholder:text-[var(--preview-control-placeholder)] dark:border-[var(--preview-control-border)] dark:bg-transparent dark:text-[var(--preview-control-text)] dark:placeholder:text-[var(--preview-control-placeholder)]"
      name={name}
      placeholder={placeholder}
      type="text"
    />
  );
}

function PreviewTextarea({
  ariaLabel,
  borderColor,
  name,
  placeholderColor,
  textColor,
  value,
}: PreviewTextareaProps) {
  return (
    <CatalystTextarea
      aria-label={ariaLabel}
      className="before:bg-[var(--preview-control-bg)] sm:focus-within:after:ring-[var(--preview-control-focus)]"
      controlStyle={buildPreviewControlStyle(borderColor, textColor, placeholderColor)}
      defaultValue={value}
      inputClassName="border-[var(--preview-control-border)] bg-transparent text-[var(--preview-control-text)] placeholder:text-[var(--preview-control-placeholder)] dark:border-[var(--preview-control-border)] dark:bg-transparent dark:text-[var(--preview-control-text)] dark:placeholder:text-[var(--preview-control-placeholder)]"
      name={name}
      readOnly
      resizable={false}
      rows={4}
    />
  );
}

function PreviewBadge({
  borderColor,
  children,
  textColor,
}: {
  borderColor: string;
  children: ReactNode;
  textColor: string;
}) {
  return (
    <Badge
      className="rounded-full border bg-transparent px-2.5 py-1 font-medium"
      style={{ backgroundColor: "transparent", borderColor, color: textColor }}
    >
      {children}
    </Badge>
  );
}

function PreviewButton({
  backgroundColor,
  children,
  textColor,
}: {
  backgroundColor: string;
  children: ReactNode;
  textColor: string;
}) {
  return (
    <Button
      className="text-[var(--preview-button-text)]"
      style={buildPreviewButtonStyle(backgroundColor, textColor)}
      type="button"
    >
      {children}
    </Button>
  );
}

function TextColorSpecCardLedger({ result, target }: TextColorSpecCardProps) {
  return (
    <section className="rounded-xl border border-gray-950/10 bg-white px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="size-7 shrink-0 rounded-md border border-black/10"
          style={{ backgroundColor: result.hex }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <Subheading className="truncate text-sm/5">{target.key}</Subheading>
            <Text className="text-sm/5 font-medium tabular-nums text-gray-950">
              LC{target.targetLc} ({formatRoundedLc(result.actualLc)})
            </Text>
          </div>
          <Text className="truncate text-sm/5 text-gray-600">{target.role}</Text>
        </div>
      </div>

      <div className="mt-3 grid gap-1 border-t border-gray-950/10 pt-2 text-sm/5">
        <Code className="w-fit max-w-full truncate tabular-nums text-sm">{result.hex}</Code>
        <Code className="block max-w-full truncate text-sm">{result.oklch}</Code>
      </div>
    </section>
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

  const clearBackgrounds = () => {
    setBackgrounds([]);
    setEditingBackgroundId(null);
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
    <main className="isolate mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 py-8 text-gray-950 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-gray-950/10 bg-white p-6 shadow-sm sm:p-8">
        <div className="space-y-4">
          <div className="space-y-3">
            <Text className="font-medium text-gray-700">ColorSAT</Text>
            <Heading className="max-w-[24ch] text-balance text-3xl tracking-tight sm:text-4xl">
              APCA-driven color palette explorer
            </Heading>
            <Text className="max-w-[70ch] text-pretty text-gray-600">
              Start from a background color, then generate semantic foreground and surface colors by
              searching OKLCH lightness and reducing chroma when needed to reach each APCA target.
            </Text>
          </div>

          <Divider />

          <div className="flex flex-wrap items-center gap-3">
            <input
              aria-label="Choose background color"
              className="size-12 cursor-pointer rounded-xl border border-gray-950/10 bg-transparent p-1"
              name="current-background"
              onChange={(event) => setCurrentBackground(event.target.value)}
              type="color"
              value={currentBackground}
            />
            <Code className="tabular-nums">{currentBackground}</Code>
            <Button color="gray" onClick={addBackground} type="button">
              Add background
            </Button>
            <Button
              disabled={backgrounds.length === 0}
              onClick={clearBackgrounds}
              outline
              type="button"
            >
              Clear saved
            </Button>
            <Button onClick={resetBackgrounds} outline type="button">
              Reset
            </Button>
          </div>
        </div>
      </section>

      {backgrounds.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-gray-950/15 bg-white px-6 py-10 text-center shadow-sm">
          <Text className="text-gray-600">
            Add a background color to generate the ColorSAT preview set.
          </Text>
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
          const previewBorderStyle = { borderColor: divider.hex } as CSSProperties;
          const previewChipStyle = {
            backgroundColor: "transparent",
            borderColor: divider.hex,
            color: secondaryText.hex,
          } as CSSProperties;
          const previewFooterStyle = { borderColor: divider.hex } as CSSProperties;

          return (
            <section
              className="rounded-3xl border border-gray-950/10 bg-white p-4 shadow-sm sm:p-6"
              key={background.id}
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative shrink-0">
                      <button
                        aria-expanded={editingBackgroundId === background.id}
                        className="size-12 rounded-xl border border-gray-950/10"
                        onClick={() =>
                          setEditingBackgroundId((current) =>
                            current === background.id ? null : background.id,
                          )
                        }
                        style={{ backgroundColor: liveBackground.color }}
                        type="button"
                      />
                      {editingBackgroundId === background.id ? (
                        <div className="absolute left-0 top-14 z-10 rounded-2xl border border-gray-950/10 bg-white p-2 shadow-lg">
                          <input
                            aria-label={`Edit ${liveBackground.color} background color`}
                            className="size-12 cursor-pointer rounded-xl border border-gray-950/10 bg-transparent p-1"
                            name={`background-${background.id}`}
                            onChange={(event) =>
                              updateBackground(background.id, event.target.value)
                            }
                            type="color"
                            value={liveBackground.color}
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Text className="font-medium text-gray-700">Background</Text>
                        {isDeferred ? <LoadingSpinner /> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Code className="tabular-nums">{liveBackground.color}</Code>
                        <Code className="tabular-nums">
                          {formatOklchValue(liveBackground.color)}
                        </Code>
                      </div>
                    </div>
                  </div>

                  <Button onClick={() => removeBackground(background.id)} outline type="button">
                    Remove
                  </Button>
                </div>

                <Divider />

                <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,1fr)]">
                  <article className="overflow-hidden rounded-2xl border border-gray-950/10">
                    <div
                      className="space-y-8 p-6"
                      style={{ backgroundColor: palette.backgroundHex }}
                    >
                      <div className="space-y-4">
                        <Text
                          className="font-mono text-sm uppercase tracking-[0.18em]"
                          style={{ color: secondaryText.hex }}
                        >
                          Flight-critical production cell 07
                        </Text>
                        <Heading
                          className="max-w-[28ch] text-balance text-2xl tracking-tight"
                          level={2}
                          style={{ color: primaryText.hex }}
                        >
                          Titanium airframe brackets cleared final metrology.
                        </Heading>
                        <Text
                          className="max-w-[62ch] text-pretty"
                          style={{ color: primaryText.hex }}
                        >
                          Process capability held within tolerance across five-axis finishing and
                          fluorescent penetrant inspection, supporting on-time shipment into
                          satellite propulsion assembly.
                        </Text>
                      </div>

                      <ul className="flex flex-wrap gap-2" role="list">
                        {[
                          "NADCAP Approved",
                          "AS9100 Rev D",
                          "Lot Traceable",
                          "ITAR Controlled",
                        ].map((label) => (
                          <li key={label}>
                            <Badge
                              className="rounded-full border bg-transparent px-2.5 py-1 font-medium"
                              style={previewChipStyle}
                            >
                              {label}
                            </Badge>
                          </li>
                        ))}
                      </ul>

                      <div className="grid gap-3 sm:grid-cols-3">
                        {[
                          ["Yield", "99.2%"],
                          ["NCRs", "0 Open"],
                          ["Dispatch", "18:40 UTC"],
                        ].map(([label, value]) => (
                          <div
                            className="rounded-2xl border px-4 py-3"
                            key={label}
                            style={previewBorderStyle}
                          >
                            <Text
                              className="font-mono text-sm uppercase tracking-[0.16em]"
                              style={{ color: secondaryText.hex }}
                            >
                              {label}
                            </Text>
                            <Subheading
                              className="mt-1 text-lg tabular-nums"
                              style={{ color: primaryText.hex }}
                            >
                              {value}
                            </Subheading>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-3xl border p-4" style={previewBorderStyle}>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <Text
                              className="font-mono text-sm uppercase tracking-[0.16em]"
                              style={{ color: secondaryText.hex }}
                            >
                              Work order summary
                            </Text>
                            <Subheading
                              className="max-w-[30ch] text-lg"
                              style={{ color: primaryText.hex }}
                            >
                              WF-2187 ready for final packaging and cert review.
                            </Subheading>
                            <Text
                              className="max-w-[56ch] text-pretty"
                              style={{ color: primaryText.hex }}
                            >
                              Source inspection signoff, serialization audit, and dimensional
                              records are complete for this release lot.
                            </Text>
                          </div>
                          <PreviewBadge borderColor={divider.hex} textColor={secondaryText.hex}>
                            Ready to ship
                          </PreviewBadge>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                        <div className="rounded-3xl border p-4" style={previewBorderStyle}>
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <Text
                                className="font-mono text-sm uppercase tracking-[0.16em]"
                                style={{ color: secondaryText.hex }}
                              >
                                Traveler inputs
                              </Text>
                              <Subheading className="text-base" style={{ color: primaryText.hex }}>
                                Final inspection handoff
                              </Subheading>
                            </div>

                            <FieldGroup className="space-y-4">
                              <div className="grid gap-3 sm:grid-cols-2">
                                {[
                                  {
                                    ariaLabel: "Work order",
                                    label: "Work order",
                                    name: "work-order",
                                    placeholder: "WF-2187-A",
                                    value: "WF-2187-A",
                                  },
                                  {
                                    ariaLabel: "Inspector",
                                    label: "Inspector",
                                    name: "inspector",
                                    placeholder: "Assign inspector",
                                    value: "",
                                  },
                                  {
                                    ariaLabel: "Route step",
                                    label: "Route step",
                                    name: "route-step",
                                    placeholder: "170 - Final QA",
                                    value: "170 - Final QA",
                                  },
                                  {
                                    ariaLabel: "Packaging",
                                    label: "Packaging",
                                    name: "packaging",
                                    placeholder: "Cleanroom bag + foam",
                                    value: "",
                                  },
                                ].map(({ ariaLabel, label, name, placeholder, value }) => (
                                  <Field className="space-y-2" key={name}>
                                    <Label
                                      className="font-mono text-sm uppercase tracking-[0.16em]"
                                      style={{ color: secondaryText.hex }}
                                    >
                                      {label}
                                    </Label>
                                    <PreviewInput
                                      ariaLabel={ariaLabel}
                                      borderColor={divider.hex}
                                      name={name}
                                      placeholder={placeholder}
                                      placeholderColor={placeholderText.hex}
                                      textColor={primaryText.hex}
                                      value={value}
                                    />
                                  </Field>
                                ))}
                              </div>

                              <Field className="space-y-2">
                                <Label
                                  className="font-mono text-sm uppercase tracking-[0.16em]"
                                  style={{ color: secondaryText.hex }}
                                >
                                  Notes
                                </Label>
                                <PreviewTextarea
                                  ariaLabel="Notes"
                                  borderColor={divider.hex}
                                  name="notes"
                                  placeholderColor={placeholderText.hex}
                                  textColor={secondaryText.hex}
                                  value="Verify serialized labels against packing sheet, include FAIR reference, and hold for customer source release before dock transfer."
                                />
                              </Field>
                            </FieldGroup>

                            <div className="flex flex-wrap gap-3">
                              <PreviewButton
                                backgroundColor={secondaryBackground.hex}
                                textColor={primaryText.hex}
                              >
                                Hold for review
                              </PreviewButton>
                              <PreviewButton
                                backgroundColor={secondaryBackground.hex}
                                textColor={primaryText.hex}
                              >
                                Release to shipping
                              </PreviewButton>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-3xl border p-4" style={previewBorderStyle}>
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <Text
                                className="font-mono text-sm uppercase tracking-[0.16em]"
                                style={{ color: secondaryText.hex }}
                              >
                                Lot snapshot
                              </Text>
                              <Subheading className="text-base" style={{ color: primaryText.hex }}>
                                Recent release queue
                              </Subheading>
                            </div>

                            <div
                              className="overflow-hidden rounded-2xl border"
                              style={previewBorderStyle}
                            >
                              <Table className="[--gutter:--spacing(3)]" dense>
                                <TableHead style={{ color: secondaryText.hex }}>
                                  <TableRow>
                                    <TableHeader
                                      className="whitespace-nowrap font-medium"
                                      style={previewFooterStyle}
                                    >
                                      Lot
                                    </TableHeader>
                                    <TableHeader
                                      className="whitespace-nowrap font-medium"
                                      style={previewFooterStyle}
                                    >
                                      Status
                                    </TableHeader>
                                    <TableHeader
                                      className="whitespace-nowrap font-medium"
                                      style={previewFooterStyle}
                                    >
                                      Ship
                                    </TableHeader>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {[
                                    ["WF-2187-A", "Ready", "Today"],
                                    ["WF-2191-C", "Review", "Hold"],
                                    ["WF-2204-B", "Pack", "17:10"],
                                  ].map(([lot, status, ship]) => (
                                    <TableRow key={lot}>
                                      <TableCell
                                        className="font-medium"
                                        style={{ ...previewFooterStyle, color: primaryText.hex }}
                                      >
                                        {lot}
                                      </TableCell>
                                      <TableCell
                                        style={{ ...previewFooterStyle, color: secondaryText.hex }}
                                      >
                                        {status}
                                      </TableCell>
                                      <TableCell
                                        className="tabular-nums"
                                        style={{ ...previewFooterStyle, color: secondaryText.hex }}
                                      >
                                        {ship}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2 border-t border-gray-950/10 bg-white p-4">
                      {[
                        [
                          "Composite preview",
                          "Uses divider, secondaryBackground, secondaryText, and primaryText.",
                        ],
                        ["Primary text", "Headings and body copy."],
                        ["Secondary text", "Overlines and supporting UI detail."],
                        ["Divider", "Chips, table rows, and input borders."],
                        ["Secondary background", "Filled action buttons."],
                      ].map(([label, description]) => (
                        <div className="flex items-start justify-between gap-4" key={label}>
                          <Text className="text-sm text-gray-600">{label}</Text>
                          <Text className="max-w-[32ch] text-right text-sm text-gray-600">
                            {description}
                          </Text>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="overflow-hidden rounded-2xl border border-gray-950/10 bg-white">
                    <div className="p-4">
                      <Subheading className="text-base">Text Color Specs</Subheading>
                    </div>

                    <Divider />

                    <div className="grid gap-2 p-3 sm:p-4">
                      {COLOR_TARGETS.map((target) => {
                        const result = palette.samples[target.key];

                        return (
                          <TextColorSpecCardLedger
                            key={target.key}
                            result={result}
                            target={target}
                          />
                        );
                      })}
                    </div>
                  </article>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
