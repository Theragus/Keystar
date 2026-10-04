import { env } from "@/core/env";
import { getEsi } from "@/core/esi";
import { errorMessage } from "@/core/logger";
import { getZkill } from "@/modules/killboard/sync";

/** The services Keystar talks to: ESI (all sync jobs), EVE SSO (sign-in) and zKillboard (killboard, threat intel). */
export const NETWORK_TARGETS = ["esi", "sso", "zkill"] as const;
export type NetworkTarget = (typeof NETWORK_TARGETS)[number];

export interface NetworkProbe {
  target: NetworkTarget;
  /** Got an HTTP answer at all, whatever its status. */
  reachable: boolean;
  status: number | null;
  ms: number;
  /** Network error code (ENOTFOUND, ECONNREFUSED, timeout …); scrubbed again in the support package. */
  error: string | null;
}

/** A probe: resolves with the HTTP status of one request, throws when no answer arrives. */
export type Probe = () => Promise<{ status: number }>;

/** Each probe gives up after this long, so an unreachable service can't stall the page. */
export const PROBE_TIMEOUT_MS = 5_000;

/** The useful part of a fetch failure: undici puts the code (ENOTFOUND …) in `cause`. */
export function networkError(err: unknown): string {
  const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
  if (cause?.code) return cause.code;
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return "timeout";
  return errorMessage(cause?.message ? cause : err).slice(0, 200);
}

async function probe(target: NetworkTarget, run: Probe, timeoutMs: number): Promise<NetworkProbe> {
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { status } = await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })), timeoutMs);
      }),
    ]);
    return { target, reachable: true, status, ms: Math.round(performance.now() - started), error: null };
  } catch (err) {
    return { target, reachable: false, status: null, ms: Math.round(performance.now() - started), error: networkError(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** The real probes. ESI and zKillboard go through their clients (User-Agent, counters, request spacing). */
export function defaultProbes(): Record<NetworkTarget, Probe> {
  return {
    esi: () => getEsi().ping("/status"),
    // The key set every sign-in needs to verify EVE's tokens (src/core/auth/sso.ts).
    sso: async () => {
      const res = await fetch(new URL("/oauth/jwks", env().SSO_BASE_URL), { signal: AbortSignal.timeout(10_000) });
      await res.body?.cancel().catch(() => undefined);
      return { status: res.status };
    },
    zkill: () => getZkill().ping(),
  };
}

/** Probes every target in parallel; never throws. */
export async function collectNetwork(
  probes: Record<NetworkTarget, Probe> = defaultProbes(),
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<NetworkProbe[]> {
  return Promise.all(NETWORK_TARGETS.map((t) => probe(t, probes[t], timeoutMs)));
}
