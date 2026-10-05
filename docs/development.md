# CarbonPilot development guide

## Prerequisites

- Node.js 18+
- npm
- MongoDB running locally or reachable through `DATABASE_URL`

## Environment setup

Copy `.env.example` to `.env` and fill in the expected values.

```bash
cp .env.example .env
```

Relevant environment variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `APP_URL`
- `API_URL`
- `AI_API_KEY`
- `STORAGE_PROVIDER`
- `LOG_LEVEL`

## Build and test

```bash
npm install
npm run build
npm test --workspace=@carbonpilot/api
```

## Start apps

Run each command in a separate terminal:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

## Notes

- The backend logs structured messages and sanitizes sensitive fields before emitting them.
- The API can run without a live MongoDB connection, but it logs the connection failure and continues in a degraded mode.
- The web app is intended as a portal foundation and can expand feature by feature without a large architectural rewrite.
