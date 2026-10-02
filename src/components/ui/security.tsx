import { displaySecurity, securityColor } from "@/core/eve/images";

/** EVE-style security status pill (number on its conventional colour). */
export function SecurityStatus({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-3">—</span>;
  const color = securityColor(value);
  const shown = displaySecurity(value);
  // Pick ink by luminance so the label always clears contrast on its fill.
  const hex = color.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (
    <span
      className="inline-block min-w-[2.4rem] rounded-md px-1.5 py-0.5 text-center text-[0.7rem] font-semibold tabular-nums"
      style={{ background: color, color: lum > 0.5 ? "#06101c" : "#ffffff" }}
      title={`Security status ${value.toFixed(3)}`}
    >
      {shown}
    </span>
  );
}
