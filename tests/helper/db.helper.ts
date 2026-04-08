import path   from 'path';
import dotenv from 'dotenv';

// Load test environment BEFORE the pool is created.
// This must be the first import in every test file — the pool
// reads env vars at module load time, so we must override them
// before anything in core/ is imported.
dotenv.config({
path: path.resolve(__dirname, '../../infra/config/.env.test'),
override: true,
});

import { pool } from '../../core/database/pool';

// ----------------------------------------------------------------
// cleanDatabase
// Truncates all tables in dependency order and resets sequences.
// Called in beforeEach() so every test starts with a clean slate.
//
// TRUNCATE ... CASCADE handles foreign key dependencies.
// RESTART IDENTITY resets UUID generation sequences (not used for
// UUID primary keys, but included for completeness).
// ----------------------------------------------------------------
export async function cleanDatabase(): Promise<void> {
await pool.query(`
    TRUNCATE TABLE
    invoice_events,
    ledger_entries,
    virtual_accounts,
    invoices,
    organisation_credentials,
    organisations
    RESTART IDENTITY CASCADE;
`);
}

// ----------------------------------------------------------------
// closeDatabase
// Ends the pool connection. Called in afterAll() so Jest can exit
// cleanly without the "open handles" warning.
// ----------------------------------------------------------------
export async function closeDatabase(): Promise<void> {
await pool.end();
}