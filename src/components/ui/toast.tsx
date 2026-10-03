"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
} from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

export type ToastTone = "neutral" | "good" | "warning" | "critical";

export interface ToastOptions {
  tone?: ToastTone;
  title: ReactNode;
  description?: ReactNode;
  /** Replaces the tone icon, e.g. a portrait. */
  leading?: ReactNode;
  /** Makes the card a link that opens in a new tab; the close button stays separate. */
  href?: string;
  /** One button under the text; clicking it also dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /** Lifetime in milliseconds, shown by the progress bar. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  leaving: boolean;
}

interface ToastApi {
  /** Shows a toast and returns its id. */
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION = 6000;
/** Older toasts make room when a new one would exceed this. */
const MAX_VISIBLE = 3;

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a <ToastProvider>");
  return api;
}

/** Hosts the toast stack in the top-right corner, below the top bar. Mounted once in the app layout. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  // Leaving starts the exit animation; the card removes itself when it ends.
  const dismiss = useCallback((id: number) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, leaving: true } : i)));
  }, []);
  const remove = useCallback((id: number) => setItems((list) => list.filter((i) => i.id !== id)), []);

  const toast = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setItems((list) => {
      const staying = list.filter((i) => !i.leaving);
      const overflow = new Set(staying.slice(0, Math.max(0, staying.length - MAX_VISIBLE + 1)).map((i) => i.id));
      return [...list.map((i) => (overflow.has(i.id) ? { ...i, leaving: true } : i)), { ...options, id, leaving: false }];
    });
    return id;
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section
        aria-label={t.common.toast.region}
        aria-live="polite"
        className="pointer-events-none fixed top-[4.25rem] right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col-reverse gap-2"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} onRemove={remove} closeLabel={t.common.toast.close} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

const toneIcon = {
  neutral: <Info className="size-4 text-accent" aria-hidden />,
  good: <CheckCircle2 className="size-4 text-good-text" aria-hidden />,
  warning: <AlertTriangle className="size-4 text-warning" aria-hidden />,
  critical: <XCircle className="size-4 text-critical-text" aria-hidden />,
} satisfies Record<ToastTone, ReactNode>;

const toneBar = {
  neutral: "bg-accent",
  good: "bg-good",
  warning: "bg-warning",
  critical: "bg-critical",
} satisfies Record<ToastTone, string>;

function ToastCard({
  item,
  onDismiss,
  onRemove,
  closeLabel,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
  onRemove: (id: number) => void;
  closeLabel: string;
}) {
  const tone = item.tone ?? "neutral";
  const content = (
    <>
      <div className="mt-0.5 shrink-0">{item.leading ?? toneIcon[tone]}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{item.title}</div>
        {item.description && <div className="mt-0.5 text-xs text-ink-2">{item.description}</div>}
      </div>
    </>
  );

  // The bar's animation is the timer: hover and focus pause both at once.
  const onBarEnd = (e: AnimationEvent) => {
    e.stopPropagation();
    onDismiss(item.id);
  };
  const onCardEnd = (e: AnimationEvent) => {
    if (e.target === e.currentTarget && item.leaving) onRemove(item.id);
  };

  return (
    <div
      role={tone === "critical" ? "alert" : "status"}
      data-leaving={item.leaving || undefined}
      onAnimationEnd={onCardEnd}
      className="toast glass pointer-events-auto overflow-hidden bg-space-800/95 shadow-2xl"
    >
      {item.href ? (
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex gap-3 py-3 pr-10 pl-3.5 transition-colors hover:bg-surface-contrast/4"
        >
          {content}
        </a>
      ) : (
        <div className="flex gap-3 py-3 pr-10 pl-3.5">{content}</div>
      )}
      {item.action && (
        <div className="-mt-1 flex pr-10 pb-3 pl-10.5">
          <button
            type="button"
            onClick={() => {
              item.action!.onClick();
              onDismiss(item.id);
            }}
            className="rounded-md px-2 py-1 text-xs font-semibold text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/12"
          >
            {item.action.label}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label={closeLabel}
        className="absolute top-2 right-2 grid size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-contrast/8 hover:text-ink"
      >
        <X className="size-3.5" aria-hidden />
      </button>
      <div
        aria-hidden
        onAnimationEnd={onBarEnd}
        style={{ animationDuration: `${item.duration ?? DEFAULT_DURATION}ms` }}
        className={cn("toast-bar absolute inset-x-0 bottom-0 h-0.5 opacity-80", toneBar[tone])}
      />
    </div>
  );
}
