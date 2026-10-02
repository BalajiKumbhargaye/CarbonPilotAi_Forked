# CarbonPilot database model inventory

The application uses MongoDB via Mongoose. The actual model layer is defined under `apps/api/src/models` and exported from `apps/api/src/models/index.ts`.

## Core models

- User
- Organization
- OrganizationMember
- SupplierRelationship
- Supplier
- Product
- Facility
- Purchase
- Invoice
- PurchaseOrder
- Document
- DocumentExtraction
- Claim
- ClaimEvidenceLink
- EvidenceCheck
- VerificationRun
- Anomaly
- DataRequest
- QuestionResponse
- Certificate
- CarbonFactor
- CarbonCalculation
- EvidencePack
- AuditLog
- Notification

## Relationship patterns

- Organization → Users via OrganizationMember
- Supplier → organization
- Supplier → products and facilities
- Purchase → customer organization + supplier organization + product
- Document → organization and optional supplier
- Claim → supplier, product, facility
- VerificationRun → claim and evidence checks
- EvidencePack → claims, documents, carbon calculations, verification runs
- AuditLog → user, organization, entity references

## Status and taxonomy

The shared enum layer defines the platform's normalized statuses, including:

- UserRole
- OrganizationType
- DocumentStatus
- ClaimStatus
- VerificationStatus
- EvidenceCheckType / EvidenceCheckResult
- AnomalyType / AnomalySeverity / AnomalyStatus
- CertificateStatus
- DataRequestStatus

## Important note

The database schema is present and connected to the app, but the feature logic around complete evidence chains, verification outcomes, and carbon computation remains intentionally foundation-only rather than fully connected business logic.
