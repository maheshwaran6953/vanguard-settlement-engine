import pino               from 'pino';
import { context, trace } from '@opentelemetry/api';
import { env }            from '../config/env';

// ----------------------------------------------------------------
// build the base pino logger
// ----------------------------------------------------------------
const isDev = env.NODE_ENV === 'development';

export const logger = pino({
level: isDev ? 'debug' : 'info',

// pino-pretty for human-readable dev output.
// In production, output is raw JSON consumed by your log aggregator
// (Loki, Datadog, CloudWatch).
transport: isDev
    ? { target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard',
                ignore: 'pid,hostname' } }
    : undefined,

// Base fields present on every log line
base: {
    service: 'vanguard-settlement-engine',
    env:     env.NODE_ENV,
},

// ----------------------------------------------------------------
// Trace-log correlation hook
// This runs on every log call and injects the active OTel span's
// trace_id and span_id into the log record — before it is
// serialised to JSON or pretty-printed.
//
// Result: every log line from a request handler contains the same
// trace_id as the OTel span for that request. You can paste the
// trace_id into Jaeger and see the exact execution path, or paste
// it into your log aggregator and see every log line for that
// specific request. This is the "correlation" in trace-log
// correlation.
// ----------------------------------------------------------------
mixin() {
    const span = trace.getSpan(context.active());
    if (!span) return {};

    const ctx = span.spanContext();
    return {
    trace_id: ctx.traceId,
    span_id:  ctx.spanId,
    };
},
});

// ----------------------------------------------------------------
// Child logger factory
// Use this to create module-scoped loggers with a fixed component
// label. Every log line from that module will carry the component
// field, making log filtering trivial.
//
// Usage:
//   const log = createLogger('InvoiceService');
//   log.info({ invoice_id }, 'Invoice submitted');
// ----------------------------------------------------------------
export function createLogger(component: string) {
return logger.child({ component });
}