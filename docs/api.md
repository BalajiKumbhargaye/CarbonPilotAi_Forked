# CarbonPilot API foundation

## Base endpoints

- `GET /api/health` — health check
- `POST /api/auth/register` — create organization + user + membership
- `POST /api/auth/login` — exchange credentials for JWT
- `GET /api/auth/me` — fetch current user profile

## Module routes

- `/api/organizations`
- `/api/suppliers`
- `/api/products`
- `/api/facilities`
- `/api/procurement`
- `/api/documents`
- `/api/extractions`
- `/api/claims`
- `/api/evidence`
- `/api/verifications`
- `/api/anomalies`
- `/api/questionnaires`
- `/api/certificates`
- `/api/carbon`
- `/api/reports`
- `/api/notifications`
- `/api/audit-logs`

## Authentication

The application requires a bearer token for protected routes via `authenticate` middleware. It attaches the authenticated user payload to the Express request object with:

- `userId`
- `organizationId`
- `organizationType`
- `role`
- `email`

## Response format

The API standardizes responses using a success envelope and structured error format. Errors use codes such as:

- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `INVALID_TOKEN`
- `NOT_FOUND`
- `USER_EXISTS`

## Current status

The API includes modular route registration and complete HTTP scaffolding, but some advanced business operations remain placeholder implementations until the feature work is developed in detail.
