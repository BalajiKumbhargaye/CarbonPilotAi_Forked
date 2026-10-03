import {
  UserRole,
  OrganizationType,
  UserStatus,
  OrganizationStatus,
  SupplierStatus,
  ProductStatus,
  DocumentType,
  DocumentStatus,
  ClaimStatus,
  VerificationStatus,
  EvidenceCheckType,
  EvidenceCheckResult,
  AnomalyType,
  AnomalySeverity,
  AnomalyStatus,
  CertificateStatus,
  DataRequestStatus,
  DataRequestResponseType,
  QuestionnaireCategory,
  QuestionResponseStatus,
  PurchaseStatus,
  ExtractionStatus,
  EvidencePackStatus,
} from './enums';

/**
 * Standard API Response Envelopes
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    [key: string]: unknown;
  };
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Domain Models
 */
export interface IUser {
  _id: string;
  name: string;
  email: string;
  passwordHash?: string;
  status: UserStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IOrganization {
  _id: string;
  name: string;
  type: OrganizationType;
  gstin?: string;
  industry?: string;
  address?: string;
  legalName?: string;
  country?: string;
  city?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  description?: string;
  website?: string;
  status: OrganizationStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IOrganizationMember {
  _id: string;
  organizationId: string;
  userId: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string | Date;
}

export interface ISharedDataPermissions {
  carbon: boolean;
  energy: boolean;
  certificates: boolean;
  documents: boolean;
}

export interface ISupplierRelationship {
  _id: string;
  customerOrganizationId: string;
  supplierOrganizationId: string;
  status: SupplierStatus;
  sharedDataPermissions: ISharedDataPermissions;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ISupplier {
  _id: string;
  organizationId: string;
  industry: string;
  category?: string;
  notes?: string;
  status: SupplierStatus;
  verificationStatus: VerificationStatus;
  dataCompleteness: number; // 0 to 100 percentage
  evidenceSupport: number; // 0 to 100 percentage
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IProductCarbonData {
  pcf: number; // Product Carbon Footprint value
  unit: string; // e.g. kgCO2e/kg, kgCO2e/unit
  methodology: string; // e.g. ISO 14067, GHG Protocol
  reportingPeriod: string; // e.g. 2023, FY2023-2024
  boundary: string; // e.g. Cradle-to-Gate, Cradle-to-Grave
  verificationStatus: VerificationStatus;
}

export interface IProduct {
  _id: string;
  supplierId: string;
  name: string;
  productCode?: string;
  category: string;
  categoryId?: string;
  unit: string;
  description?: string;
  status: ProductStatus;
  productionFacilityIds: string[];
  carbonData?: IProductCarbonData;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IProductCategory {
  _id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IFacility {
  _id: string;
  supplierId: string;
  name: string;
  location: string;
  productionCapacity?: string;
  products: string[];
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IPurchase {
  _id: string;
  customerOrganizationId: string;
  supplierId: string;
  supplierOrganizationId: string;
  productId: string;
  purchaseOrderId?: string;
  invoiceId?: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  totalAmount: string;
  currency: string;
  purchaseDate: string | Date;
  referenceNumber?: string;
  notes?: string;
  reportingPeriod?: string;
  carbonCalculationId?: string;
  status: PurchaseStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IInvoiceItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  productId?: string;
}

export interface IInvoice {
  _id: string;
  customerOrganizationId: string;
  supplierOrganizationId: string;
  invoiceNumber: string;
  invoiceDate: string | Date;
  currency: string;
  totalAmount: number;
  items: IInvoiceItem[];
  documentId?: string;
  purchaseOrderId?: string;
  extractionStatus: ExtractionStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IPurchaseOrder {
  _id: string;
  customerOrganizationId: string;
  supplierOrganizationId: string;
  orderNumber: string;
  orderDate: string | Date;
  expectedDeliveryDate?: string | Date;
  currency: string;
  totalAmount: number;
  items: IInvoiceItem[];
  documentId?: string;
  status: 'ISSUED' | 'FULFILLED' | 'CANCELLED';
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IDocument {
  _id: string;
  organizationId: string;
  supplierId?: string;
  uploadedBy: string;
  type: DocumentType;
  filename: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  reportingPeriod?: string;
  status: DocumentStatus;
  processingError?: string;
  reviewData?: IProcurementReviewData;
  invoiceId?: string;
  purchaseOrderId?: string;
  purchaseId?: string;
  dataRequestId?: string;
  requestedItemId?: string;
  reviewedBy?: string;
  reviewedAt?: string | Date;
  uploadedAt: string | Date;
  updatedAt: string | Date;
}

export interface IProcurementReviewData {
  supplierId: string;
  productId: string;
  documentNumber: string;
  documentDate: string | Date;
  quantity: string;
  unit: string;
  unitPrice: string;
  totalAmount: string;
  currency: string;
  purchaseOrderNumber?: string;
  expectedDeliveryDate?: string | Date;
  source: 'MANUAL' | 'EXTRACTED';
}

export interface IExtractionField {
  field: string;
  value: string | number | boolean;
  unit?: string;
  confidence: number; // 0.0 to 1.0
  page?: number;
  sourceText?: string;
}

export interface IDocumentExtraction {
  _id: string;
  documentId: string;
  extractionVersion: string;
  fields: IExtractionField[];
  processedAt: string | Date;
}

export interface IClaim {
  _id: string;
  supplierId: string;
  productId?: string;
  facilityId?: string;
  type: string; // e.g. PCF_VALUE, RECYCLED_CONTENT, ZERO_WASTE
  value: string | number;
  unit: string;
  methodology: string;
  reportingPeriod: string;
  boundary: string;
  status: ClaimStatus;
  confidence: number; // 0.0 to 1.0
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IClaimEvidenceLink {
  _id: string;
  claimId: string;
  documentId: string;
  page?: number;
  section?: string;
  sourceText?: string;
  relationshipType: string; // e.g. PRIMARY_SOURCE, CORROBORATING, BASELINE
  createdAt: string | Date;
}

export interface IEvidenceCheck {
  _id: string;
  claimId: string;
  checkType: EvidenceCheckType;
  result: EvidenceCheckResult;
  expected?: string;
  observed?: string;
  sourceDocumentId?: string;
  sourcePage?: number;
  explanation: string;
  checkedAt: string | Date;
}

export interface IVerificationRun {
  _id: string;
  claimId: string;
  triggeredBy: string;
  checks: IEvidenceCheck[];
  overallStatus: ClaimStatus;
  score: number; // 0 to 100
  verifiedAt: string | Date;
  engineVersion: string;
}

export interface IAnomaly {
  _id: string;
  supplierId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  description: string;
  documents: string[]; // document IDs
  detectedAt: string | Date;
  resolvedAt?: string | Date;
  resolutionNote?: string;
}

export interface IDataRequest {
  _id: string;
  customerOrganizationId: string;
  supplierOrganizationId: string;
  createdBy: string;
  title: string;
  description: string;
  deadline?: string | Date;
  status: DataRequestStatus;
  productId?: string;
  templateId?: string;
  requestedItems: IDataRequestItem[];
  allowPartialSubmission: boolean;
  requiredFields: string[];
  foundFields: string[];
  missingFields: string[];
  clarificationMessage?: string;
  clarificationItemIds?: string[];
  lastSubmittedAt?: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IDataRequestItem {
  _id: string;
  key: string;
  label: string;
  description?: string;
  responseType: DataRequestResponseType;
  category: QuestionnaireCategory;
  required: boolean;
  requiresEvidence?: boolean;
  unit?: string;
  options?: string[];
  conditions?: IDataRequestCondition[];
  order: number;
  metadata?: Record<string, unknown>;
}

export interface IDataRequestCondition {
  questionKey: string;
  operator: 'EQUALS' | 'NOT_EQUALS';
  value: string | number | boolean;
}

export interface IQuestionnaireTemplate {
  _id: string;
  name: string;
  description: string;
  category: QuestionnaireCategory;
  productCategories: string[];
  supplierIndustries: string[];
  questions: Array<Omit<IDataRequestItem, '_id'>>;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IQuestionResponse {
  _id: string;
  dataRequestId: string;
  supplierId: string;
  requestedItemId: string;
  question: string;
  field: string;
  answer?: string;
  value?: string | number | boolean | string[];
  unit?: string;
  evidenceDocumentId?: string;
  evidenceDocumentIds?: string[];
  status: QuestionResponseStatus;
  submittedAt?: string | Date;
}

export interface ICertificateExternalVerification {
  checked: boolean;
  status: 'VERIFIED' | 'FAILED' | 'UNVERIFIED';
}

export interface ICertificate {
  _id: string;
  supplierId: string;
  type: string; // e.g. ISO 14001, ISO 50001, FSC
  certificateNumber: string;
  issuingBody: string;
  issueDate: string | Date;
  expiryDate: string | Date;
  scope?: string;
  documentId?: string;
  status: CertificateStatus;
  externalVerification: ICertificateExternalVerification;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ICarbonFactor {
  _id: string;
  name: string;
  category: string;
  value: number;
  unit: string; // e.g. kgCO2e/kg
  region: string;
  year: number;
  source: string; // e.g. DEFRA, Ecoinvent, IEA
  methodology: string;
  version: string;
  createdAt: string | Date;
}

export interface ICarbonCalculation {
  _id: string;
  customerOrganizationId: string;
  supplierOrganizationId: string;
  purchaseId: string;
  productId: string;
  quantity: number;
  quantityUnit: string;
  carbonFactor: number;
  carbonFactorUnit: string;
  factorSource: string;
  methodology: string;
  totalEmissions: number;
  emissionsUnit: string; // kgCO2e or tCO2e
  evidenceStatus: ClaimStatus;
  claimId?: string;
  calculatedAt: string | Date;
}

export interface IEvidencePack {
  _id: string;
  supplierId: string;
  customerOrganizationId: string;
  title: string;
  claims: string[]; // Claim IDs
  documents: string[]; // Document IDs
  carbonCalculations: string[]; // Calculation IDs
  verificationRuns: string[]; // Verification run IDs
  format: 'PDF' | 'ZIP' | 'JSON';
  fileUrl?: string;
  status: EvidencePackStatus;
  createdAt: string | Date;
}

export interface IAuditLog {
  _id: string;
  organizationId?: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  timestamp: string | Date;
}

export interface INotification {
  _id: string;
  userId: string;
  organizationId: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS';
  link?: string;
  read: boolean;
  createdAt: string | Date;
}
