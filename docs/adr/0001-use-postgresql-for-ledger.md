# ADR 0001: Use PostgreSQL for Financial Ledger

## Status
Accepted

## Context
We need a database to store invoice data, partner details, and transaction logs. Financial data requires strict ACID compliance.

## Decision
We will use **PostgreSQL**.

## Consequences
- **Pros:** Strong data integrity, support for complex queries, and industry standard for fintech.
- **Cons:** Requires more setup than NoSQL, but necessary for financial accuracy.