import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({
    path: path.resolve(__dirname, '../../infra/config/.env.development'),
});

const envSchema = z.object({
    DB_HOST:     z.string().min(1),
    DB_PORT:     z.coerce.number().int().positive(),
    DB_NAME:     z.string().min(1),
    DB_USER:     z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_POOL_MIN: z.coerce.number().int().default(2),
    DB_POOL_MAX: z.coerce.number().int().default(10),
    NODE_ENV:    z.enum(['development', 'test', 'production']),
    PORT:        z.coerce.number().int().default(3000),
    APP_NAME:    z.string().default('vanguard-settlement-engine'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(parsed.error.format());
    process.exit(1);         // hard stop — never run with broken config
}

export const env = parsed.data;