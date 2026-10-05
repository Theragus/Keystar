import raw from "./data/static.json";
import { createStaticIndex, type StaticFile } from "./static";

/**
 * The bundled wormhole and system data (about 400 KB). Server and scripts only:
 * client components get what they need through props and the search route, and
 * an ESLint rule keeps this module out of `components/`.
 */
export const WH = createStaticIndex(raw as unknown as StaticFile);
