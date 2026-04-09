import * as Headless from "@headlessui/react";
import clsx from "clsx";
import type React from "react";

export function Fieldset({
  className,
  ...props
}: { className?: string } & Omit<Headless.FieldsetProps, "as" | "className">) {
  return (
    <Headless.Fieldset
      {...props}
      className={clsx("*:data-[slot=text]:mt-1 [&>*+[data-slot=control]]:mt-6", className)}
    />
  );
}

export function Legend({
  className,
  ...props
}: { className?: string } & Omit<Headless.LegendProps, "as" | "className">) {
  return (
    <Headless.Legend
      data-slot="legend"
      {...props}
      className={clsx(
        "text-base/6 font-semibold text-gray-950 data-disabled:opacity-50 sm:text-sm/6 dark:text-white",
        className,
      )}
    />
  );
}

export function FieldGroup({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return <div data-slot="control" {...props} className={clsx("space-y-8", className)} />;
}

export function Field({
  className,
  ...props
}: { className?: string } & Omit<Headless.FieldProps, "as" | "className">) {
  return (
    <Headless.Field
      {...props}
      className={clsx(
        "[&>[data-slot=label]+[data-slot=control]]:mt-3",
        "[&>[data-slot=label]+[data-slot=description]]:mt-1",
        "[&>[data-slot=description]+[data-slot=control]]:mt-3",
        "[&>[data-slot=control]+[data-slot=description]]:mt-3",
        "[&>[data-slot=control]+[data-slot=error]]:mt-3",
        "*:data-[slot=label]:font-medium",
        className,
      )}
    />
  );
}

export function Label({
  className,
  ...props
}: { className?: string } & Omit<Headless.LabelProps, "as" | "className">) {
  return (
    <Headless.Label
      data-slot="label"
      {...props}
      className={clsx(
        "text-base/6 text-gray-950 select-none data-disabled:opacity-50 sm:text-sm/6 dark:text-white",
        className,
      )}
    />
  );
}

export function Description({
  className,
  ...props
}: { className?: string } & Omit<Headless.DescriptionProps, "as" | "className">) {
  return (
    <Headless.Description
      data-slot="description"
      {...props}
      className={clsx(
        "text-base/6 text-gray-500 data-disabled:opacity-50 sm:text-sm/6 dark:text-gray-400",
        className,
      )}
    />
  );
}

export function ErrorMessage({
  className,
  ...props
}: { className?: string } & Omit<Headless.DescriptionProps, "as" | "className">) {
  return (
    <Headless.Description
      data-slot="error"
      {...props}
      className={clsx(
        "text-base/6 text-red-600 data-disabled:opacity-50 sm:text-sm/6 dark:text-red-500",
        className,
      )}
    />
  );
}
