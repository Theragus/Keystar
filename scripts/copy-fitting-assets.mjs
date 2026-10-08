// Copies the fitting calculator's static assets into public/fitting/ (ignored by git): the dogma engine's
// WebAssembly and the patched SDE data file, both named by version so browsers can cache them forever, plus a
// manifest the page reads to find them. Runs before `next dev` and `next build` (see package.json).
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const enginePkg = require.resolve("@eveshipfit/dogma-engine/package.json");
const sdePkg = require.resolve("@eveshipfit/sde/package.json");
const engineVersion = require(enginePkg).version;
const sdeVersion = require(sdePkg).version; // <major>.<SDE build>.<patch>
const [sdeMajor, sdeBuild] = sdeVersion.split(".").map(Number);

const outDir = path.resolve(import.meta.dirname, "..", "public", "fitting");
mkdirSync(outDir, { recursive: true });
for (const stale of readdirSync(outDir)) rmSync(path.join(outDir, stale), { force: true });

const engine = `engine.${engineVersion}.wasm`;
const sde = `sde.${sdeVersion}.dat`;
copyFileSync(path.join(path.dirname(enginePkg), "esf_dogma_engine_bg.wasm"), path.join(outDir, engine));
copyFileSync(path.join(path.dirname(sdePkg), "dist", "sde.dat"), path.join(outDir, sde));
writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify({ engine: `/fitting/${engine}`, engineVersion, sde: `/fitting/${sde}`, sdeVersion, sdeMajor, sdeBuild }, null, 2),
);
console.log(`fitting assets: engine ${engineVersion}, SDE build ${sdeBuild} (major ${sdeMajor}) → public/fitting/`);
