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
- ProcurementDecision
- EvidencePack
- AuditLog
- Notification

## Relationship patterns

- Organization → Users via OrganizationMember
- Supplier → organization
- Supplier → products and facilities
- Purchase → customer organization + supplier organization + product
- ProcurementDecision → buyer organization, product, optional selected supplier/product, scenario snapshot, and decision history
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
- CarbonCalculationStatus
- ProcurementDecisionStatus

## Important note

Procurement decisions retain the buyer's selected supplier, reason, owner, decision date, scenario quantity, and a snapshot of supplier prices, carbon data, and evidence status. Finalized decisions are immutable; scenario analysis does not create or update purchase records.
