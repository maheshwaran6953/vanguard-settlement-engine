import { pool }               from './pool';
import { InvoiceRepository }  from '../repositories/invoice.repository';
import { EventRepository }    from '../repositories/event.repository';
import { InvoiceService }     from '../services/invoice.service';

export const invoiceRepository = new InvoiceRepository(pool);
export const eventRepository   = new EventRepository(pool);

// Service layer — depends on repositories, not on pool directly
export const invoiceService = new InvoiceService(
    invoiceRepository,
    eventRepository,
);