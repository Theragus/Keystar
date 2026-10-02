import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/core/db/schema/*.ts", "./src/modules/*/schema.ts"],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://keystar:keystar@localhost:5432/keystar",
  },
  strict: true,
  verbose: true,
});
