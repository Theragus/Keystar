import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // UI renders numbers and dates in the viewer's language (src/i18n).
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
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
