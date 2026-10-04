import pkg from "../../package.json";

/**
 * The running Keystar version, from package.json at build time. Releases are
 * cut from it: see docs/releasing.md.
 */
export const KEYSTAR_VERSION: string = pkg.version;

export interface BuildInfo {
  version: string;
  /** Git commit the image was built from (KEYSTAR_COMMIT build arg); null outside published images. */
  commit: string | null;
  /** Image tag, e.g. "0.11.0" or "main" (KEYSTAR_IMAGE_TAG build arg). */
  imageTag: string | null;
  /** ISO timestamp of the image build (KEYSTAR_BUILD_DATE build arg). */
  buildDate: string | null;
  /** Dependency versions as declared in package.json. */
  dependencies: Record<string, string>;
}

const KEY_DEPENDENCIES = ["next", "react", "drizzle-orm", "postgres", "zod"] as const;

/** Build metadata. The image's build args are read at runtime, so `next build` doesn't freeze them. */
export function buildInfo(): BuildInfo {
  const deps: Record<string, string> = pkg.dependencies;
  return {
    version: KEYSTAR_VERSION,
    commit: process.env.KEYSTAR_COMMIT || null,
    imageTag: process.env.KEYSTAR_IMAGE_TAG || null,
    buildDate: process.env.KEYSTAR_BUILD_DATE || null,
    dependencies: Object.fromEntries(KEY_DEPENDENCIES.filter((d) => deps[d]).map((d) => [d, deps[d]])),
  };
}
