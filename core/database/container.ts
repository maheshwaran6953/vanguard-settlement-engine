import { pool }               from './pool';
import { InvoiceRepository }  from '../repositories/invoice.repository';
import { EventRepository }    from '../repositories/event.repository';
import { VanRepository }      from '../repositories/van.repository';
import { InvoiceService }     from '../services/invoice.service';
import { VanService }         from '../services/van.service';
import { RiskService } from '../services/risk/risk.service';
import { AuthRepository }        from '../repositories/auth.repository';
import { OrganisationRepository } from '../repositories/organisation.repository';
import { AuthService }            from '../services/auth.service';

export const authRepository = new AuthRepository(pool);
export const orgRepository  = new OrganisationRepository(pool);

export const authService = new AuthService(
    authRepository,
    orgRepository,
);

export const invoiceRepository = new InvoiceRepository(pool);
export const eventRepository   = new EventRepository(pool);
export const vanRepository     = new VanRepository(pool);

export const invoiceService = new InvoiceService(
    invoiceRepository,
    eventRepository,
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