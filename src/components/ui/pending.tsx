"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PendingContextValue {
  isPending: boolean;
  /** Navigate to a new query string for the current page inside a transition. */
  navigate: (query: string) => void;
}

const PendingContext = createContext<PendingContextValue>({ isPending: false, navigate: () => {} });

/**
 * Wraps a filterable page. While new filters load, the previous render stays
 * on screen at reduced opacity — no skeletons, no layout jump.
 */
export function PendingProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const navigate = (query: string) =>
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  return <PendingContext.Provider value={{ isPending, navigate }}>{children}</PendingContext.Provider>;
}

export function usePendingNavigation() {
  return useContext(PendingContext);
}

export function PendingFrame({ children, className }: { children: ReactNode; className?: string }) {
  const { isPending } = usePendingNavigation();
  return (
    <div aria-busy={isPending} className={cn("transition-opacity duration-200", isPending && "opacity-55", className)}>
      {children}
    </div>
  );
}
