import { pool } from './pool';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { EventRepository }   from '../repositories/event.repository';

// Single shared instances — repositories are stateless,
// so one instance per process is correct and efficient.
export const invoiceRepository = new InvoiceRepository(pool);
export const eventRepository   = new EventRepository(pool);