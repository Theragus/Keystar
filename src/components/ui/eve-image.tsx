import { characterPortrait, corporationLogo, typeIcon } from "@/core/eve/images";
import { cn } from "@/lib/utils";

/* Plain <img>: images.evetech.net is already a sized CDN, no optimiser needed. */
/* eslint-disable @next/next/no-img-element */

export function Portrait({
  id,
  size = 32,
  className,
  alt = "",
}: {
  id: number;
  size?: number;
  className?: string;
  alt?: string;
}) {
  // Sharp on high-DPI screens: request about twice the displayed size.
  const src = characterPortrait(id, size > 96 ? 256 : size > 32 ? 128 : 64);
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      className={cn("shrink-0 rounded-full bg-space-700 ring-1 ring-white/15", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function CorpLogo({ id, size = 32, className }: { id: number; size?: number; className?: string }) {
  return (
    <img
      src={corporationLogo(id, 64)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={cn("shrink-0 rounded-md bg-space-700", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function TypeIcon({ id, size = 24, className }: { id: number; size?: number; className?: string }) {
  return (
    <img
      src={typeIcon(id, size > 32 ? 64 : 32)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={cn("shrink-0 rounded-md bg-space-700/60", className)}
      style={{ width: size, height: size }}
    />
  );
}
