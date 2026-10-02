import { z } from "zod";

/**
 * Runtime configuration, validated lazily so `next build` works without a
 * full environment. Call `env()` wherever configuration is needed.
 */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).default("postgres://keystar:keystar@localhost:5432/keystar"),
  /** Public base URL of the app, e.g. https://keystar.example.com (no trailing slash). */
  APP_URL: z
    .string()
    .url()
    .default("http://localhost:3000")
    .transform((v) => v.replace(/\/+$/, "")),
  /** Secret used to derive encryption keys for ESI tokens and OAuth state. 32+ chars. */
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  EVE_CLIENT_ID: z.string().optional().default(""),
  EVE_CLIENT_SECRET: z.string().optional().default(""),
  /** Contact info sent in the ESI User-Agent, as CCP asks developers to do. */
  ESI_CONTACT: z.string().optional().default("unknown"),
  ESI_BASE_URL: z.string().url().default("https://esi.evetech.net"),
  /** X-Compatibility-Date sent to ESI. Bump deliberately after checking /meta/changelog. */
  ESI_COMPATIBILITY_DATE: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default("2026-08-18"),
  SSO_BASE_URL: z.string().url().default("https://login.eveonline.com"),
  /** Comma separated character IDs that always get the admin role. */
  ADMIN_CHARACTER_IDS: z
    .string()
    .optional()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isSafeInteger(n) && n > 0),
    ),
  /**
   * Where this instance's source code lives. AGPL-3.0 §13 requires offering the
   * (modified) source to users of a network service — point this at your fork.
   */
  SOURCE_URL: z.string().url().default("https://github.com/theragus/keystar"),
  /**
   * Optional Claude API key: the killboard's weekly situation report is then
   * written by Claude. Without it, Keystar writes the report from a template.
   */
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  /** Claude model for situation reports. */
  KILLBOARD_REPORT_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  /** Enables the demo login (no EVE SSO needed). Never enable on a public instance. */
  KEYSTAR_DEMO_MODE: booleanish.default(false),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid Keystar configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function ssoConfigured(): boolean {
  const e = env();
  return Boolean(e.EVE_CLIENT_ID && e.EVE_CLIENT_SECRET);
}

export function ssoCallbackUrl(): string {
  return `${env().APP_URL}/auth/callback`;
}

/** Test hook: forget the cached env so tests can change process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
