// Test environment setup — runs before every test file's module graph is resolved.
// Sets all env vars required by ~/env Zod validation and crypto helpers.
process.env.ENCRYPTION_SECRET = "0".repeat(64);
process.env.DATABASE_URL = "file:test.db";
process.env.AUTH_SECRET = "test-auth-secret-minimum-32-chars-long";
process.env.AUTH_ADMIN_EMAIL = "admin@test.local";
process.env.AUTH_ADMIN_PASSWORD = "testpassword";
process.env.LOG_LEVEL = "silent";
process.env.TUYA_STUB = "true";
