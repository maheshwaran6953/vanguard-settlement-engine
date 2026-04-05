import pinoHttp          from 'pino-http';
import { logger }        from '../../core/utils/logger';
import { context, trace } from '@opentelemetry/api';

// ----------------------------------------------------------------
// pino-http middleware
// Automatically logs every incoming request and outgoing response.
// The logger instance is shared with the application logger so
// all log lines use the same configuration and mixin.
//
// The customProps hook fires after the response is sent — at that
// point the OTel span for the request is still active (pino-http
// runs inside the request lifecycle). This is where we attach the
// trace_id to the HTTP log record specifically.
// ----------------------------------------------------------------
export const requestLogger = pinoHttp({
logger,

// Suppress health check noise — /health is called every 10s by
// load balancers and would dominate your log volume.
autoLogging: {
    ignore: (req) => req.url === '/health',
},

// What appears on the request-completed log line
customProps(req, res) {
    const span = trace.getSpan(context.active());
    const spanCtx = span?.spanContext();

    return {
    trace_id:   spanCtx?.traceId,
    span_id:    spanCtx?.spanId,
    request_id: req.headers['x-request-id'],
    };
},

// Serialise only the fields you need — not the entire req object.
// Logging full request bodies in production is a data leakage risk.
serializers: {
    req(req) {
    return {
        method:     req.method,
        url:        req.url,
        user_agent: req.headers['user-agent'],
    };
    },
    res(res) {
    return { status_code: res.statusCode };
    },
},

// Log level by HTTP status code range
customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400)        return 'warn';
    return 'info';
},
});