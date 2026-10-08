import icons from "./fit-icons.json";

/*
 * The game's own symbols the fitting tool shows, by name. Each resolves to one image of `@eveshipfit/images`
 * (EVE's icons as the client draws them): a dogma attribute's icon, a UI texture below `res:/ui/texture/`, or a
 * meta group's marker. `scripts/copy-fitting-assets.mjs` resolves this list at build time, copies just those
 * files to public/fitting/icons/ and writes their URLs into the manifest; the build fails when a name no longer
 * resolves, so a renamed texture never reaches users as a broken image.
 */

export type FitIconSource = { attribute: number } | { ui: string } | { metaGroup: number };

export const FIT_ICONS: Record<FitIconName, FitIconSource> = icons;

export type FitIconName = keyof typeof icons;

export const META_ICON: Record<number, FitIconName> = { 2: "meta2", 3: "meta3", 4: "meta4", 5: "meta5", 6: "meta6", 14: "meta14", 15: "meta15" };
