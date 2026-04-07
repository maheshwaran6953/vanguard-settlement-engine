import { Pool } from 'pg';

export interface IdempotencyRecord {
id:               string;
idempotency_key:  string;
org_id:           string;
request_path:     string;
request_method:   string;
status:           'PROCESSING' | 'COMPLETED' | 'FAILED';
response_status:  number | null;
response_body:    Record<string, unknown> | null;
expires_at:       Date;
created_at:       Date;
updated_at:       Date;
}

export interface IIdempotencyRepository {
tryInsert(
    key:    string,
    orgId:  string,
    path:   string
): Promise<{ record: IdempotencyRecord; isNew: boolean }>;

markCompleted(
    key:            string,
    orgId:          string,
    path:           string,
    responseStatus: number,
    responseBody:   Record<string, unknown>
): Promise<void>;

markFailed(
    key:   string,
    orgId: string,
    path:  string
): Promise<void>;

deleteKey(key: string, orgId: string, path: string): Promise<void>;
}

// PostgreSQL unique violation code
const PG_UNIQUE_VIOLATION = '23505';

export class IdempotencyRepository implements IIdempotencyRepository {
constructor(private readonly pool: Pool) {}

// ----------------------------------------------------------------
// tryInsert
// Attempts to INSERT a new key in PROCESSING state.
//
// If the INSERT succeeds:  isNew = true  (first request)
// If a UNIQUE conflict:    isNew = false (retry — return cached)
//
// The ON CONFLICT DO NOTHING + subsequent SELECT is an atomic
// read-your-writes pattern. No race condition is possible because
// the UNIQUE constraint is enforced at the DB engine level.
// ----------------------------------------------------------------
async tryInsert(
    key:   string,
    orgId: string,
    path:  string
): Promise<{ record: IdempotencyRecord; isNew: boolean }> {

    try {
    const result = await this.pool.query<IdempotencyRecord>(
        `INSERT INTO idempotency_keys
        (idempotency_key, org_id, request_path)
        VALUES ($1, $2, $3)
        RETURNING *`,
        [key, orgId, path]
    );
    return { record: result.rows[0]!, isNew: true };

    } catch (err: unknown) {
    // Key already exists — fetch the existing record
    if (
        typeof err === 'object' && err !== null &&
        'code' in err &&
        (err as { code: string }).code === PG_UNIQUE_VIOLATION
    ) {
        const existing = await this.pool.query<IdempotencyRecord>(
        `SELECT * FROM idempotency_keys
        WHERE idempotency_key = $1
            AND org_id          = $2
            AND request_path    = $3
        LIMIT 1`,
        [key, orgId, path]
        );
        return { record: existing.rows[0]!, isNew: false };
    }
    throw err;
    }
}

async markCompleted(
    key:            string,
    orgId:          string,
    path:           string,
    responseStatus: number,
    responseBody:   Record<string, unknown>
): Promise<void> {
    await this.pool.query(
    `UPDATE idempotency_keys
    SET status          = 'COMPLETED',
        response_status = $4,
        response_body   = $5,
        updated_at      = now()
    WHERE idempotency_key = $1
        AND org_id          = $2
        AND request_path    = $3`,
    [key, orgId, path, responseStatus, JSON.stringify(responseBody)]
    );
}

async markFailed(
    key:   string,
    orgId: string,
    path:  string
): Promise<void> {
    await this.pool.query(
    `UPDATE idempotency_keys
    SET status     = 'FAILED',
        updated_at = now()
    WHERE idempotency_key = $1
        AND org_id          = $2
        AND request_path    = $3`,
    [key, orgId, path]
    );
}

async deleteKey(
    key:   string,
    orgId: string,
    path:  string
): Promise<void> {
    await this.pool.query(
    `DELETE FROM idempotency_keys
    WHERE idempotency_key = $1
        AND org_id          = $2
        AND request_path    = $3`,
    [key, orgId, path]
    );
}
}