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
    JWT_SECRET:      z.string().min(32),
    JWT_EXPIRES_IN:  z.string().default('8h'),
    BCRYPT_ROUNDS:   z.coerce.number().int().default(12),
    WEBHOOK_SECRET: z.string().min(32),
    REDIS_URL:              z.string().url(),
    REDIS_JOB_QUEUE_PREFIX: z.string().min(1).default('vanguard'),
    SMTP_HOST:              z.string().min(1),
    SMTP_PORT:              z.coerce.number().int().positive(),
    SMTP_FROM:              z.string().email(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(parsed.error.format());
    process.exit(1);         // hard stop — never run with broken config
}

export const env = parsed.data;