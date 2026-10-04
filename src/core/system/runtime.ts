import { existsSync, readFileSync } from "node:fs";
import os from "node:os";

/** Facts about the current Node process and its container, safe to share (no hostnames or paths). */
export interface ProcessRuntime {
  node: string;
  platform: string;
  arch: string;
  /** "docker" inside a container, else "source" (pnpm dev / start). */
  install: "docker" | "source";
  cpus: number;
  uptimeSeconds: number;
  rssMb: number;
  heapUsedMb: number;
  /** Host memory as Node sees it. */
  totalMemoryMb: number;
  /** cgroup (container) limits; null when there is none or it can't be read. */
  memoryLimitMb: number | null;
  cpuLimit: number | null;
  timeZone: string;
  locale: string;
  icu: string | null;
  nodeOptionsSet: boolean;
}

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

function readFirst(paths: string[]): string | null {
  for (const p of paths) {
    try {
      return readFileSync(p, "utf8").trim();
    } catch {
      // Try the next location (cgroup v2, then v1).
    }
  }
  return null;
}

/** Memory limit of the container; null for "max" or values that mean "unlimited" (cgroup v1 uses a huge number). */
export function parseMemoryLimit(raw: string | null, totalBytes: number): number | null {
  if (!raw || raw === "max") return null;
  const bytes = Number(raw);
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes >= totalBytes) return null;
  return mb(bytes);
}

/** CPU limit from cgroup v2 `cpu.max` ("quota period") or v1 quota/period; null when unlimited. */
export function parseCpuLimit(max: string | null, v1Quota: string | null, v1Period: string | null): number | null {
  const [quota, period] = max ? max.split(/\s+/) : [v1Quota, v1Period];
  if (!quota || !period || quota === "max" || Number(quota) <= 0) return null;
  const limit = Number(quota) / Number(period);
  return Number.isFinite(limit) && limit > 0 ? Math.round(limit * 100) / 100 : null;
}

export function processRuntime(): ProcessRuntime {
  const mem = process.memoryUsage();
  const total = os.totalmem();
  const intl = Intl.DateTimeFormat().resolvedOptions();
  return {
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    install: existsSync("/.dockerenv") || Boolean(process.env.KEYSTAR_IMAGE_TAG) ? "docker" : "source",
    cpus: os.availableParallelism?.() ?? os.cpus().length,
    uptimeSeconds: Math.round(process.uptime()),
    rssMb: mb(mem.rss),
    heapUsedMb: mb(mem.heapUsed),
    totalMemoryMb: mb(total),
    memoryLimitMb: parseMemoryLimit(
      readFirst(["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]),
      total,
    ),
    cpuLimit: parseCpuLimit(
      readFirst(["/sys/fs/cgroup/cpu.max"]),
      readFirst(["/sys/fs/cgroup/cpu/cpu.cfs_quota_us"]),
      readFirst(["/sys/fs/cgroup/cpu/cpu.cfs_period_us"]),
    ),
    timeZone: intl.timeZone,
    locale: intl.locale,
    icu: process.versions.icu ?? null,
    nodeOptionsSet: Boolean(process.env.NODE_OPTIONS),
  };
}
