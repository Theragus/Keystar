import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", href: "/mining/pnl", label: "Overview" },
  { id: "expenses", href: "/mining/pnl/expenses", label: "Expenses" },
  { id: "settings", href: "/mining/pnl/settings", label: "Settings" },
] as const;

/** Overview / Expenses / Settings, keeping the date range and character filter. */
export function PnlTabs({ current, query }: { current: (typeof TABS)[number]["id"]; query: string }) {
  return (
    <nav aria-label="Mining P&L" className="glass-inset inline-flex items-center gap-0.5 rounded-lg p-0.5">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={query ? `${t.href}?${query}` : t.href}
          aria-current={t.id === current ? "page" : undefined}
          className={cn(
            "rounded-md px-3.5 py-1.5 text-xs font-medium transition-all duration-200",
            t.id === current ? "glass-chip text-ink" : "text-ink-3 hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
