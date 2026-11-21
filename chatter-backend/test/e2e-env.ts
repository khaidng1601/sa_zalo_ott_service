import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Runs before the e2e spec is imported, so ConfigModule sees these values.
// Each run gets its own database and upload folder, which the spec removes afterwards.
const runId = `${Date.now()}_${process.pid}`;
const mongoBase = (process.env.E2E_MONGODB_URL ?? 'mongodb://localhost:27017').replace(/\/+$/, '');

process.env.MONGODB_URI = `${mongoBase}/chatter_e2e_${runId}`;
process.env.AUTH_JWT_SECRET = 'e2e-test-secret-that-is-at-least-32-characters-long';
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'false';
// Registering with this email creates a system admin.
process.env.ADMIN_BOOTSTRAP_EMAIL = 'admin@e2e.chatter.vn';
process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), 'chatter-e2e-uploads-'));
