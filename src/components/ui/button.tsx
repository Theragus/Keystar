import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "glass" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-[background,box-shadow,transform,opacity] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary:
    "text-space-950 border border-[#7fd6ff]/60 bg-[linear-gradient(180deg,#7fd3ff,#3dbbf7)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] hover:brightness-110",
  gold: "text-space-950 border border-[#ffd98c]/60 bg-[linear-gradient(180deg,#ffd27a,#e8a83a)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] hover:brightness-110",
  glass: "glass-chip text-ink hover:bg-white/10",
  ghost: "text-ink-2 hover:bg-white/6 hover:text-ink",
  danger: "glass-chip text-critical-text hover:bg-critical/15",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-[0.95rem]",
};

export function buttonClass(variant: Variant = "glass", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "glass",
  size = "md",
  className,
  ...props
}: ComponentPropsWithoutRef<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "glass",
  size = "md",
  className,
  href,
  prefetch,
  ...props
}: Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  href: string;
  prefetch?: boolean;
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  const classes = buttonClass(variant, size, className);
  // Auth routes are plain anchors so the browser follows the SSO redirect.
  if (href.startsWith("/auth/")) return <a href={href} className={classes} {...props} />;
  return <Link href={href} prefetch={prefetch} className={classes} {...props} />;
}
