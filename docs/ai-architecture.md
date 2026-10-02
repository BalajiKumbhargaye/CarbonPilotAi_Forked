# CarbonPilot AI architecture

## AI layer structure

The AI subsystem is intentionally separated from deterministic business logic.

- `Document AI`: document classification and field extraction
- `Evidence AI`: methodology and boundary interpretation
- `Questionnaire AI`: generation of missing-data questions

This is implemented as an orchestrator in `apps/api/src/services/ai/AIOrchestrator.ts`.

## Provider abstraction

The system exposes the `IAIProviderService` interface and includes a `MockAIProviderService` implementation as a safe fallback. This allows future replacement with OpenAI, Gemini, or another provider without changing domain logic.

## Design principle

Deterministic logic remains in backend modules for:

- auth and authorization
- date comparison
- quantity checks
- certificate expiry
- carbon arithmetic
- status transitions
- audit logging

AI is used only for interpreting unstructured inputs and drafting follow-up questions or extraction suggestions.

## Current status

The AI foundation is in place and intentionally conservative; no fake verification claims or fabricated carbon results are produced by the current implementation.
