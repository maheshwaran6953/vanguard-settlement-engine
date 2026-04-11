import { pool }                    from './pool';
import { Queue }                   from 'bullmq';
import { InvoiceRepository }       from '../repositories/invoice.repository';
import { EventRepository }         from '../repositories/event.repository';
import { VanRepository }           from '../repositories/van.repository';
import { AuthRepository }          from '../repositories/auth.repository';
import { OrganisationRepository }  from '../repositories/organisation.repository';
import { IdempotencyRepository }   from '../repositories/idempotency.repository';
import { InvoiceService }          from '../services/invoice.service';
import { VanService }              from '../services/van.service';
import { RiskService }             from '../services/risk/risk.service';
import { AuthService }             from '../services/auth.service';

// --- Repositories ---
export const invoiceRepository     = new InvoiceRepository(pool);
export const eventRepository       = new EventRepository(pool);
export const vanRepository         = new VanRepository(pool);
export const authRepository        = new AuthRepository(pool);
export const orgRepository         = new OrganisationRepository(pool);
export const idempotencyRepository = new IdempotencyRepository(pool);

// --- Queue Builders (Lazy Loading to prevent silent crashes) ---
function buildNotificationQueue(): Queue {
if (process.env['NODE_ENV'] === 'test') {
    return {
    add:   async () => ({ id: 'null-job' }),
    close: async () => {},
    } as unknown as Queue;
}
const { notificationQueue } = require('../../infra/queue/queues');
return notificationQueue;
}

function buildDocumentQueue(): Queue {
if (process.env['NODE_ENV'] === 'test') {
    return {
    add:   async () => ({ id: 'null-job' }),
    close: async () => {},
    } as unknown as Queue;
}
const { documentQueue } = require('../../infra/queue/queues');
return documentQueue;
}

// Initialize Queues
const notificationQueue = buildNotificationQueue();
const documentQueue     = buildDocumentQueue();

// --- Services ---
export const invoiceService = new InvoiceService(
invoiceRepository,
eventRepository,
orgRepository,
notificationQueue
);

export const vanService = new VanService(
vanRepository,
invoiceRepository,
eventRepository,
documentQueue  // Now properly injected
);

export const riskService = new RiskService(
invoiceRepository,
eventRepository
);

export const authService = new AuthService(
authRepository,
orgRepository
);