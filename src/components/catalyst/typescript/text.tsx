import clsx from "clsx";
import { Link } from "./link";

export function Text({ className, ...props }: React.ComponentPropsWithoutRef<"p">) {
  return (
    <p
      data-slot="text"
      {...props}
      className={clsx("text-base/6 text-gray-500 sm:text-sm/6 dark:text-gray-400", className)}
    />
  );
}

export function TextLink({ className, ...props }: React.ComponentPropsWithoutRef<typeof Link>) {
  return (
    <Link
      {...props}
      className={clsx(
        "text-gray-950 underline decoration-gray-950/50 data-hover:decoration-gray-950 dark:text-white dark:decoration-white/50 dark:data-hover:decoration-white",
        className,
      )}
    />
  );
}

export function Strong({ className, ...props }: React.ComponentPropsWithoutRef<"strong">) {
  return (
    <strong {...props} className={clsx("font-medium text-gray-950 dark:text-white", className)} />
  );
}

export function Code({ className, ...props }: React.ComponentPropsWithoutRef<"code">) {
  return (
    <code
      {...props}
      className={clsx(
        "text-sm font-medium text-gray-950 sm:text-[0.8125rem] dark:text-white",
        className,
      )}
    />
  );
}
