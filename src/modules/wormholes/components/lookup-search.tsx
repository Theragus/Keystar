"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { SystemSearch } from "./system-search";

/** Search box of the system lookup: picking a system opens its page. */
export function LookupSearch({ autoFocus }: { autoFocus?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <SystemSearch
      label={t.wormholes.lookup.searchLabel}
      autoFocus={autoFocus}
      className="w-full max-w-md"
      onSelect={(s) => router.push(`/wormholes/systems/${encodeURIComponent(s.name)}`)}
    />
  );
}
