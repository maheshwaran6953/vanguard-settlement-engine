import { checkDbConnection } from '../core/database/pool';
import { env } from '../core/config/env';

async function bootstrap(): Promise<void> {
    console.log(`🚀 Starting ${env.APP_NAME} in ${env.NODE_ENV} mode`);
    await checkDbConnection();
    console.log(`✅ Bootstrap complete. Listening on port ${env.PORT}`);
}

bootstrap().catch((err) => {
    console.error('Fatal bootstrap error:', err);
    process.exit(1);
});