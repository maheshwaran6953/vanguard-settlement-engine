// ----------------------------------------------------------------
// INITIALISATION ORDER IS CRITICAL — do not reorder these imports.
//
// 1. Tracing must patch Node internals before any app module loads.
// 2. Logger is safe to import after tracing is initialised.
// 3. App and DB can load in any order after the above two.
// ----------------------------------------------------------------
import '../infra/telemetry/tracing';      // 1. OTel — must be first
import { logger }           from '../core/utils/logger';
import { checkDbConnection } from '../core/database/pool';
import { env }              from '../core/config/env';
import { buildApp }         from './app';

async function bootstrap(): Promise<void> {
logger.info('Starting Vanguard Settlement Engine...');

await checkDbConnection();
logger.info('Database connection established');

const app = buildApp();

app.listen(env.PORT, () => {
    logger.info(
    { port: env.PORT, env: env.NODE_ENV },
    `Server listening on port ${env.PORT}`
    );
});
}

bootstrap().catch((err) => {
logger.error({ err }, 'Fatal bootstrap error');
process.exit(1);
});