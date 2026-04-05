# 🛡️ Vanguard Settlement Engine

> An enterprise-grade B2B invoice financing platform that eliminates the working capital gap for SMEs by providing instant, risk-assessed advances against buyer-approved invoices.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-Instrumented-000000?logo=opentelemetry)](https://opentelemetry.io/)

---

## 📋 The Problem
Indian SMEs face a structural cash flow crisis: a supplier issues a ₹10,00,000 invoice and often waits **90 days** to be paid. During this window, they cannot meet payroll or take new orders. **Vanguard bridges this gap** by advancing funds against verified invoices within hours.

---

## 🏗️ Architecture Overview
```text
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway (Express)                     │
│              JWT Auth  ·  Zod Validation  ·  RBAC               │
└──────────┬──────────────────┬──────────────────┬────────────────┘
           │                  │                  │
    ┌──────▼──────┐   ┌───────▼──────┐   ┌──────▼──────┐
    │   Invoice   │   │     VAN      │   │    Risk     │
    │   Service   │   │   Service    │   │    Engine    │
    │             │   │              │   │             │
    │ State       │   │ Idempotent   │   │ Three-Way   │
    │ Machine     │   │ Ledger       │   │ Match       │
    └──────┬──────┘   └───────┬──────┘   └──────┬──────┘
           │                  │                  │
    ┌──────▼──────────────────▼──────────────────▼──────┐
    │                  PostgreSQL 16                      │
    │   invoices  ·  virtual_accounts  ·  ledger_entries │
    └───────────────────────────────────────────────────┘
           │
    ┌──────▼─────────────────────────────────────────────┐
    │           Observability Layer                       │
    │   pino (logging)  ·  OpenTelemetry (tracing)       │
    └────────────────────────────────────────────────────┘
    ```

---

## Engineering Highlights

These are the decisions that make this a financial-grade system rather
than a CRUD application.

### 1. Idempotent Ledger with Defence-in-Depth

Bank webhooks are unreliable. The same payment notification can arrive
twice, arrive out of order, or arrive after the account has already settled.
A naive implementation credits the supplier twice.

This system implements **two independent idempotency guards**:

- **Layer 1 — Application check**: Before opening a database transaction,
  the service queries existing ledger entries and compares idempotency keys.
  This handles the common case cheaply, without acquiring locks.

- **Layer 2 — Database constraint**: The `UNIQUE` constraint on
  `ledger_entries.idempotency_key` is the final physical guard. Even if two
  concurrent webhook requests pass Layer 1 simultaneously, only one `INSERT`
  succeeds. The other receives `PG error 23505` and is caught and returned
  as a success response to the bank — preventing infinite retries.
```typescript
// The bank always receives 200. It never retries. No double-credits.
if (err instanceof DuplicatePaymentError) {
  res.status(200).json({ success: true, message: 'Payment already recorded' });
}
```

### 2. Three-Way Match Risk Engine

Before the platform commits capital, every invoice passes a
**three-layer verification**:

| Layer | Check | Hard Gate? |
|-------|-------|-----------|
| Three-Way Match | Invoice vs PO vs Delivery Receipt (±2% variance) | Yes — instant reject |
| Anomaly Detection | Amount spikes, short payment terms, fraud signals | Configurable threshold |
| Buyer Risk Score | Default history, credit utilisation, payment recency | Auto-reject above 75/100 |

The engine is a **pure function** — no database calls, no side effects.
This makes it independently unit-testable and means the scoring logic
can be swapped (e.g. replaced with an ML model) without touching the
service layer.
```typescript
// Pure — same input always produces same output. No mocks needed in tests.
const result = assessInvoiceRisk(cmd);
```

### 3. Event Sourcing for Compliance

Every state change on every invoice writes an immutable event to
`invoice_events` before the status column is updated. Both writes
happen in a single `BEGIN / COMMIT` transaction.
```sql
-- The DB physically enforces immutability.
-- Even a developer with direct DB access cannot alter history.
REVOKE UPDATE, DELETE ON invoice_events FROM PUBLIC;
```

This means: if a regulator asks "why was invoice INV-2026-001 funded?",
the complete decision trail — three-way match result, anomaly score,
buyer risk score, actor ID, timestamp — is recoverable from the event log.

### 4. State Machine Enforcement

Invoices follow a strict lifecycle. An invoice cannot jump from `DRAFT`
to `FUNDED`. The transitions are validated in code before any database
write:
```
DRAFT → SUBMITTED → BUYER_APPROVED → FINANCING_REQUESTED → FUNDED → REPAID
                                                          ↘ DEFAULTED
                         (any state) → CANCELLED
```

An attempt to approve an already-approved invoice returns
`409 INVALID_TRANSITION` — the database is never touched.

### 5. Trace-Log Correlation

Every log line produced by this system carries the OpenTelemetry
`trace_id` of the active request. In an incident, a single UUID connects:

- Every log line emitted during that request (pino)
- The full distributed trace with timing (Jaeger / any OTLP collector)
- The exact PostgreSQL queries executed (auto-instrumented by OTel)
```json
{
  "level": "info",
  "component": "InvoiceService",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "invoice_id": "3f2a...",
  "msg": "Invoice submitted successfully"
}
```

---

## Technology Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Runtime | Node.js 20 + TypeScript 5 (strict) | Type safety on financial data |
| Framework | Express 4 | Minimal, explicit, production-proven |
| Database | PostgreSQL 16 (Docker) | ACID compliance, JSONB event store |
| Validation | Zod | Runtime schema enforcement on all inputs |
| Auth | JWT (jsonwebtoken) + bcrypt | Stateless, role-bearing tokens |
| Logging | pino + pino-http | Structured JSON, lowest overhead |
| Tracing | OpenTelemetry SDK (auto-instrumented) | Vendor-neutral distributed tracing |
| Architecture | Clean Architecture (Core / Services / Infra) | Testable, dependency-inverted |
| Patterns | Repository, CQRS-lite, Event Sourcing, Saga | Production financial system standards |

---

## Project Structure
```
vanguard-settlement-engine/
├── core/
│   ├── config/          # Environment validation (Zod)
│   ├── database/        # Pool, container (DI root)
│   ├── domain/          # Entity types, auth types
│   ├── repositories/    # Data access layer (interfaces + implementations)
│   ├── services/        # Business logic
│   │   ├── invoice.service.ts
│   │   ├── van.service.ts
│   │   └── risk/        # Three-layer risk engine
│   └── utils/           # Logger (pino + OTel mixin)
├── services/
│   ├── middleware/      # Auth, RBAC, error handler, request logger
│   ├── routes/          # HTTP layer (invoice, van, risk, auth, health)
│   ├── app.ts           # Express factory (buildApp)
│   └── server.ts        # Entry point — owns initialisation order
├── infra/
│   ├── config/          # Environment files
│   ├── db/migrations/   # V001 domain schema, V002 auth schema
│   └── telemetry/       # OpenTelemetry SDK initialisation
└── docs/
    └── adr/             # Architecture Decision Records
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker Desktop

### Setup
```bash
# 1. Clone and install
git clone https://github.com/your-username/vanguard-settlement-engine.git
cd vanguard-settlement-engine
npm install

# 2. Start PostgreSQL
docker-compose up -d

# 3. Apply database migrations
psql -U postgres -d vanguard_db -f infra/db/migrations/V001__initial_schema.sql
psql -U postgres -d vanguard_db -f infra/db/migrations/V002__auth_schema.sql

# 4. Configure environment
cp infra/config/.env.development infra/config/.env.local
# Edit .env.local with your DB credentials

# 5. Start the server
npm run dev
```

### API Flow (Full Lifecycle)
```bash
# Register organisations
POST /auth/register   { legal_name, role: "supplier", email, password }
POST /auth/register   { legal_name, role: "buyer",    email, password }

# Invoice lifecycle (use Bearer tokens from register responses)
POST /invoices                          # supplier submits invoice
POST /invoices/:id/approve              # buyer digitally approves
POST /invoices/:id/request-financing    # supplier requests advance

# Risk assessment
POST /risk/assess                       # platform evaluates invoice

# Settlement
POST /vans                              # create virtual account
POST /vans/webhook/payment              # bank webhook — payment received
GET  /vans/:invoiceId                   # reconciliation view
```

---

## Architecture Decision Records

| ADR | Decision | Status |
|-----|---------|--------|
| [ADR-0001](docs/adr/ADR-0001-tech-stack.md) | TypeScript + Node.js + PostgreSQL | Accepted |
| [ADR-0002](docs/adr/ADR-0002-event-sourcing.md) | Event sourcing for invoice audit trail | Accepted |
| [ADR-0003](docs/adr/ADR-0003-idempotent-ledger.md) | Defence-in-depth idempotency for payments | Accepted |
| [ADR-0004](docs/adr/ADR-0004-three-way-match.md) | Three-layer risk engine architecture | Accepted |
| [ADR-0005](docs/adr/ADR-0005-opentelemetry.md) | OpenTelemetry for observability | Accepted |

---

## Architectural Patterns in Use

**Repository Pattern** — every database interaction is behind an interface.
Business logic never writes SQL directly. This makes services testable
without a real database.

**Dependency Injection** — `core/database/container.ts` is the single
composition root. Every service receives its dependencies through the
constructor. Nothing uses global state.

**Clean Architecture** — dependencies flow inward only. The `core` layer
has zero knowledge of Express, HTTP status codes, or request bodies.
The HTTP layer is a pure translation layer.

**GitFlow** — all work developed on feature branches, merged via pull
requests into `develop`, promoted to `main` for releases. Conventional
commits (`feat:`, `fix:`, `chore:`) throughout.