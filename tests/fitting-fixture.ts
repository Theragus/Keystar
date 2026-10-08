import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createRuntime, initEngine, type FittingRuntime } from "@/modules/fitting/engine/engine";

const require = createRequire(import.meta.url);
const sdeDir = path.dirname(require.resolve("@eveshipfit/sde/package.json"));
const engineDir = path.dirname(require.resolve("@eveshipfit/dogma-engine/package.json"));

/** The engine with the real SDE loaded, as the browser gets it; the WebAssembly runs in Node too. */
export async function loadTestRuntime(): Promise<FittingRuntime> {
  await initEngine(readFileSync(path.join(engineDir, "esf_dogma_engine_bg.wasm")));
  const version = (require(path.join(sdeDir, "package.json")) as { version: string }).version;
  const [sdeMajor, sdeBuild] = version.split(".").map(Number);
  return createRuntime(new Uint8Array(readFileSync(path.join(sdeDir, "dist", "sde.dat"))), {
    engine: "/fitting/engine.test.wasm",
    engineVersion: (require(path.join(engineDir, "package.json")) as { version: string }).version,
    sde: "/fitting/sde.test.dat",
    sdeVersion: version,
    sdeMajor,
    sdeBuild,
  });
}

/** A Rifter that fits with all skills at V (CPU 159 of 162.5, calibration 200 of 400). */
export const RIFTER_EFT = `[Rifter, Test Rifter]
Damage Control II
Gyrostabilizer II
Nanofiber Internal Structure II
Overdrive Injector System II

1MN Afterburner II
Warp Scrambler II
Stasis Webifier II

150mm Light AutoCannon II, Republic Fleet EMP S
150mm Light AutoCannon II, Republic Fleet EMP S
150mm Light AutoCannon II, Republic Fleet EMP S

Small Trimark Armor Pump I
Small Trimark Armor Pump I
Small Ancillary Current Router I
`;
