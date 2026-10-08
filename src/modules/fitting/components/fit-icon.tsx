"use client";

import { createContext, useContext, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { FitIconName } from "../icons";

/* Plain <img>: the icons are our own static files, already sized. */
/* eslint-disable @next/next/no-img-element */

/** Icon name → URL, from the manifest the runtime loaded (scripts/copy-fitting-assets.mjs writes it). */
export const FitIconsContext = createContext<Readonly<Record<string, string>>>({});

/**
 * One of the game's symbols (`src/modules/fitting/icons.ts`). Renders nothing when the build has no file for
 * it, so a missing icon costs a symbol, never a broken image.
 */
export function FitIcon({ name, size = 16, className, title, style }: { name: FitIconName; size?: number; className?: string; title?: string; style?: CSSProperties }) {
  const src = useContext(FitIconsContext)[name];
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      title={title}
      width={size}
      height={size}
      loading="lazy"
      className={cn("inline-block shrink-0 select-none", className)}
      style={{ width: size, height: size, ...style }}
    />
  );
}
