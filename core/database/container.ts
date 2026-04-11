import { pool }                   from './pool';
import { InvoiceRepository }      from '../repositories/invoice.repository';
import { EventRepository }        from '../repositories/event.repository';
import { VanRepository }          from '../repositories/van.repository';
import { AuthRepository }         from '../repositories/auth.repository';
import { OrganisationRepository } from '../repositories/organisation.repository';
import { IdempotencyRepository }  from '../repositories/idempotency.repository';
import { InvoiceService }         from '../services/invoice.service';
import { VanService }             from '../services/van.service';
import { RiskService }            from '../services/risk/risk.service';
import { AuthService }            from '../services/auth.service';
import { notificationQueue }      from '../../infra/queue/queues';

export const invoiceRepository      = new InvoiceRepository(pool);
export const eventRepository        = new EventRepository(pool);
export const vanRepository          = new VanRepository(pool);
export const authRepository         = new AuthRepository(pool);
export const orgRepository          = new OrganisationRepository(pool);
export const idempotencyRepository  = new IdempotencyRepository(pool);

export const invoiceService = new InvoiceService(
  invoiceRepository,
  eventRepository,
  orgRepository,
  notificationQueue,     // ← new dependency
);

export const vanService = new VanService(
  vanRepository,
  invoiceRepository,
  eventRepository,
);

export const riskService = new RiskService(
  invoiceRepository,
  eventRepository,
);

export const authService = new AuthService(
  authRepository,
  orgRepository,
);