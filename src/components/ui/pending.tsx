"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PendingContextValue {
  isPending: boolean;
  /**
   * Navigate to a new query string for the current page inside a transition.
   * `replace` skips the history entry, for state that changes as you type.
   */
  navigate: (query: string, options?: { replace?: boolean }) => void;
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
  const navigate = (query: string, options?: { replace?: boolean }) =>
    startTransition(() => {
      const href = query ? `${pathname}?${query}` : pathname;
      if (options?.replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
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
