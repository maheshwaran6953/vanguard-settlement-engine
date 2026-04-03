import { Pool } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
host:     env.DB_HOST,
port:     env.DB_PORT,
database: env.DB_NAME,
user:     env.DB_USER,
password: env.DB_PASSWORD,
min:      env.DB_POOL_MIN,
max:      env.DB_POOL_MAX,
// Always return TIMESTAMPTZ as JS Date objects, not raw strings
types: {
    getTypeParser: (oid, format) => {
    // OID 1114 = TIMESTAMP, 1184 = TIMESTAMPTZ
    if (oid === 1184 || oid === 1114) {
        return (val: string) => new Date(val);
    }
    return require('pg').types.getTypeParser(oid, format);
    },
},
});

pool.on('error', (err) => {
console.error('Unexpected DB pool error:', err);
process.exit(1);
});

export async function checkDbConnection(): Promise<void> {
const client = await pool.connect();
try {
    await client.query('SELECT 1');
    console.log('✅ Database connection established');
} finally {
    client.release();
}
}