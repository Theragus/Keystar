import pkg from "../../package.json";

/**
 * The running Keystar version, from package.json at build time. Releases are
 * cut from it: see docs/releasing.md.
 */
export const KEYSTAR_VERSION: string = pkg.version;
