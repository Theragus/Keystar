import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Images } from "@eveshipfit/images";
import { describe, expect, it } from "vitest";
import { FIT_ICONS, META_ICON } from "@/modules/fitting/icons";

const require = createRequire(import.meta.url);
const imagesDir = path.dirname(require.resolve("@eveshipfit/images/dist/images.dat"));

describe("fitting icons", () => {
  /** The daily image package may rename a texture: every symbol the tool names must still resolve. */
  it("names only images the package has", () => {
    const images = new Images(new Uint8Array(readFileSync(path.join(imagesDir, "images.dat"))), { baseUrl: "/icons/" });
    const missing = Object.entries(FIT_ICONS).filter(([, source]) => {
      const url =
        "attribute" in source
          ? images.attributeIcon(source.attribute)
          : "metaGroup" in source
            ? images.metaGroupIcon(source.metaGroup)
            : images.uiTexture(source.ui);
      return !url;
    });
    expect(missing.map(([name]) => name)).toEqual([]);
  });

  it("has a marker for every meta group it names", () => {
    for (const name of Object.values(META_ICON)) expect(FIT_ICONS[name]).toBeDefined();
  });
});
