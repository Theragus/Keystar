import init, * as dogma from "@eveshipfit/dogma-engine";
import type { Calculation, Fit, Options } from "@eveshipfit/dogma-engine";
import { readSde, type Sde } from "../sde/reader";

/*
 * The fitting runtime: EVEShipFit's dogma engine (Rust, as WebAssembly) and the patched SDE it calculates with,
 * both served from /fitting/ (scripts/copy-fitting-assets.mjs). Everything runs in the browser; the server only
 * hands out the two files. Loaded once per page session and shared by every component.
 */

/** public/fitting/manifest.json, written at build time. */
export interface FittingManifest {
  engine: string;
  engineVersion: string;
  sde: string;
  sdeVersion: string;
  sdeMajor: number;
  sdeBuild: number;
  /** `@eveshipfit/images` version the icons came from. */
  imagesVersion?: string;
  /** Icon name (src/modules/fitting/icons.ts) → URL of the copied file. */
  icons?: Record<string, string>;
}

export type Engine = typeof dogma;

export interface FittingRuntime {
  manifest: FittingManifest;
  sde: Sde;
  engine: Engine;
  calculate(fit: Fit, options?: Options): Calculation;
}

const globalState = globalThis as unknown as { __keystarFitting?: Promise<FittingRuntime>; __keystarFittingSdeLoaded?: boolean };

/**
 * Hands the SDE bytes to the engine (which may only load it once per process: dev hot reloads reuse the loaded
 * one) and to the reader. `init` must have resolved before this is called.
 */
export function createRuntime(bytes: Uint8Array, manifest: FittingManifest): FittingRuntime {
  if (!globalState.__keystarFittingSdeLoaded) {
    dogma.load_sde(bytes);
    globalState.__keystarFittingSdeLoaded = true;
  }
  const sde = readSde(bytes);
  return { manifest, sde, engine: dogma, calculate: (fit, options) => dogma.calculate(fit, options ?? null) };
}

/** Initialises the WebAssembly from bytes or a URL; resolves once it is ready. */
export async function initEngine(source: string | URL | BufferSource): Promise<void> {
  await init({ module_or_path: source });
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function load(): Promise<FittingRuntime> {
  const res = await fetch("/fitting/manifest.json");
  if (!res.ok) throw new Error(`HTTP ${res.status} for /fitting/manifest.json`);
  const manifest = (await res.json()) as FittingManifest;
  const [bytes] = await Promise.all([fetchBytes(manifest.sde), initEngine(manifest.engine)]);
  return createRuntime(bytes, manifest);
}

/** The runtime for the browser, loaded on first use and shared; a failed load is retried on the next call. */
export function loadFittingRuntime(): Promise<FittingRuntime> {
  globalState.__keystarFitting ??= load().catch((err) => {
    globalState.__keystarFitting = undefined;
    throw err;
  });
  return globalState.__keystarFitting;
}
