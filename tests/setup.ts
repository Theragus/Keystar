// Deterministic configuration for unit tests.
process.env.APP_SECRET ??= "test-secret-test-secret-test-secret-0123456789";
process.env.EVE_CLIENT_ID ??= "test-client-id";
process.env.EVE_CLIENT_SECRET ??= "test-client-secret";
process.env.APP_URL ??= "http://localhost:3000";
process.env.LOG_LEVEL ??= "error";

// Integration tests run against TEST_DATABASE_URL (never the dev/prod database).
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
