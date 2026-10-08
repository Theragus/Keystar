// Copies the fitting calculator's static assets into public/fitting/ (ignored by git): the dogma engine's
// WebAssembly, the patched SDE data file and the game icons the tool names (src/modules/fitting/fit-icons.json),
// all named by version or content hash so browsers can cache them forever, plus a manifest the page reads to find
// them. Runs before `next dev` and `next build` (see package.json).
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, readFileSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Images } from "@eveshipfit/images";

const require = createRequire(import.meta.url);
const enginePkg = require.resolve("@eveshipfit/dogma-engine/package.json");
const sdePkg = require.resolve("@eveshipfit/sde/package.json");
// The images package only exports dist/*: find it through its data file.
const imagesDat = require.resolve("@eveshipfit/images/dist/images.dat");
const engineVersion = require(enginePkg).version;
const sdeVersion = require(sdePkg).version; // <major>.<SDE build>.<patch>
const imagesVersion = JSON.parse(readFileSync(path.join(path.dirname(imagesDat), "..", "package.json"), "utf8")).version;
const [sdeMajor, sdeBuild] = sdeVersion.split(".").map(Number);

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "public", "fitting");
const iconDir = path.join(outDir, "icons");
mkdirSync(iconDir, { recursive: true });
for (const stale of readdirSync(outDir)) rmSync(path.join(outDir, stale), { recursive: true, force: true });
mkdirSync(iconDir, { recursive: true });

const engine = `engine.${engineVersion}.wasm`;
const sde = `sde.${sdeVersion}.dat`;
copyFileSync(path.join(path.dirname(enginePkg), "esf_dogma_engine_bg.wasm"), path.join(outDir, engine));
copyFileSync(path.join(path.dirname(sdePkg), "dist", "sde.dat"), path.join(outDir, sde));

// Icons: resolve each name with the package's own loader, then copy only those files.
const imagesDir = path.dirname(imagesDat);
const images = new Images(new Uint8Array(readFileSync(path.join(imagesDir, "images.dat"))), { baseUrl: "icons/" });
const wanted = JSON.parse(readFileSync(path.join(root, "src", "modules", "fitting", "fit-icons.json"), "utf8"));
const icons = {};
const missing = [];
for (const [name, source] of Object.entries(wanted)) {
  const url =
    "attribute" in source
      ? images.attributeIcon(source.attribute)
      : "metaGroup" in source
        ? images.metaGroupIcon(source.metaGroup)
        : images.uiTexture(source.ui);
  if (!url) {
    missing.push(name);
    continue;
  }
  const file = path.basename(url); // <hash>.webp
  const target = `${name}.${file}`;
  copyFileSync(path.join(imagesDir, "images", file), path.join(iconDir, target));
  icons[name] = `/fitting/icons/${target}`;
}
if (missing.length) {
  console.error(`fitting assets: no image for ${missing.join(", ")} in @eveshipfit/images ${imagesVersion}; fix src/modules/fitting/fit-icons.json`);
  process.exit(1);
}

writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(
    { engine: `/fitting/${engine}`, engineVersion, sde: `/fitting/${sde}`, sdeVersion, sdeMajor, sdeBuild, imagesVersion, icons },
    null,
    2,
  ),
);
console.log(
  `fitting assets: engine ${engineVersion}, SDE build ${sdeBuild} (major ${sdeMajor}), ${Object.keys(icons).length} icons from images ${imagesVersion} → public/fitting/`,
);
