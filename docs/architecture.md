# CarbonPilot architecture

## Overview

CarbonPilot is structured as a monorepo with a Next.js customer-facing frontend, an Express API backend, and shared TypeScript packages for domain types and validation.

## Frontend

The web application lives in `apps/web` and uses:

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- reusable UI primitives such as Button, Input, Card, and layout shells

The current frontend includes the landing page and a customer dashboard shell with route groups for purchases, invoices, purchase orders, suppliers, and data requests.

## Backend

The backend lives in `apps/api/src` and uses a modular route/service pattern:

- `config/` for environment and MongoDB configuration
- `middleware/` for auth, validation, and error handling
- `models/` for Mongoose schemas
- `modules/` for domain features (auth, organizations, suppliers, products, facilities, procurement, documents, evidence, verification, anomalies, questionnaires, carbon, reports, notifications, audit)
- `services/` for AI abstractions and provider interfaces
- `utils/` for logging and response helpers

## Shared packages

- `packages/shared`: enums and domain interfaces
- `packages/validation`: Zod validation schemas
- `packages/config`: app-level constants and role permission mappings

## Actual product flow

The codebase is aligned with the intended evidence-first model:

1. Documents are uploaded and associated with suppliers/organizations.
2. Extraction and AI services can classify and extract fields.
3. Claims, evidence links, and verification checks are modeled.
4. Anomaly and reporting layers are scaffolded but not yet full business logic.

## Current status

The architecture is functioning as a foundation, not as a fully implemented sustainability platform. Most of the core structure exists, while advanced verification and carbon logic remain intentionally placeholder-driven.
