import { NodeSDK }                     from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter }           from '@opentelemetry/exporter-trace-otlp-http';
import { SimpleSpanProcessor }         from '@opentelemetry/sdk-trace-node';
import { resourceFromAttributes }      from '@opentelemetry/resources';
import {
ATTR_SERVICE_NAME,
ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

// ----------------------------------------------------------------
// This file must be imported before any other application module.
// It patches Node.js internals so that Express, pg, and http
// are all instrumented from the moment they first load.
// ----------------------------------------------------------------

const exporter = new OTLPTraceExporter({
url: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ??
    'http://localhost:4318/v1/traces',
});

const sdk = new NodeSDK({
resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]:    'vanguard-settlement-engine',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': process.env['NODE_ENV'] ?? 'development',
}),
spanProcessors: [new SimpleSpanProcessor(exporter)],
instrumentations: [
    getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
],
});

sdk.start();
console.log('✅ OpenTelemetry SDK initialised');

process.on('SIGTERM', () => {
sdk.shutdown()
    .then(() => console.log('OpenTelemetry SDK shut down cleanly'))
    .catch(console.error)
    .finally(() => process.exit(0));
});