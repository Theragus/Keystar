import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// UI renders numbers and dates in the viewer's language (src/i18n).
const englishFormatters = {
  name: "@/lib/format",
  importNames: [
    "compact",
    "isk",
    "integer",
    "volume",
    "percent",
    "unitPrice",
    "formatMetric",
    "relativeTime",
    "shortDate",
    "dateTime",
  ],
  message: "These format in English. Use `f` from getI18n() (server) or useI18n() (client).",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", { paths: [englishFormatters] }],
    },
  },
  {
    // The bundled wormhole data (~400 KB) must not end up in client bundles.
    files: ["src/components/**/*.{ts,tsx}", "src/modules/wormholes/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            englishFormatters,
            {
              name: "@/modules/wormholes/static-data",
              message: "Server only. Pass what the client needs as props or fetch /api/wormholes/systems.",
            },
          ],
          patterns: [
            {
              group: ["**/data/static.json", "../data/*.json", "./data/*.json", "**/static-data"],
              message: "Server only. Pass what the client needs as props or fetch /api/wormholes/systems.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Keystar build output
    "dist/**",
  ]),
]);

export default eslintConfig;
