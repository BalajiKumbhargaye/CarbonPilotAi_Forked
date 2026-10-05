import {
  UserRole,
  OrganizationType,
  UserStatus,
  OrganizationStatus,
  SupplierStatus,
  ProductStatus,
  DocumentType,
  DocumentStatus,
  DocumentClassificationSource,
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
  ProcurementDecisionStatus,
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
  sellingPrice?: number;
  currency?: string;
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
  productId?: string;
  uploadedBy: string;
  type: DocumentType;
  classificationSource?: DocumentClassificationSource;
  classifiedBy?: string;
  classifiedAt?: string | Date;
  classificationConfidence?: number;
  filename: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  contentHash?: string;
  reportingPeriod?: string;
  status: DocumentStatus;
  processingError?: string;
  reviewData?: IProcurementReviewData;
  extractedData?: IProcurementExtractedData;
  extraction?: IDocumentExtraction | null;
  invoiceId?: string;
  purchaseOrderId?: string;
  purchaseId?: string;
  purchaseIds?: string[];
  dataRequestId?: string;
  requestedItemId?: string;
  reviewedBy?: string;
  reviewedAt?: string | Date;
  uploadedAt: string | Date;
  updatedAt: string | Date;
  replacesDocumentId?: string;
  replacedByDocumentId?: string;
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
  items?: IProcurementReviewLineItem[];
  validationWarnings?: string[];
}

export interface IProcurementReviewLineItem {
  productId: string;
  description: string;
  productCode?: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  totalAmount: string;
}

export interface IProcurementExtractedLineItem {
  description?: string;
  productCode?: string;
  productMatchStatus: 'MATCHED' | 'NOT_FOUND' | 'MULTIPLE_MATCHES' | 'NEEDS_REVIEW';
  matchedProductId?: string;
  quantity?: string;
  unit?: string;
  unitPrice?: string;
  totalAmount?: string;
}

export interface IProcurementExtractedData {
  documentNumber?: string;
  documentDate?: string;
  supplierName?: string;
  supplierMatchStatus: 'MATCHED' | 'NOT_FOUND' | 'MULTIPLE_MATCHES' | 'NEEDS_REVIEW';
  matchedSupplierId?: string;
  currency?: string;
  purchaseOrderNumber?: string;
  expectedDeliveryDate?: string;
  totalAmount?: string;
  items: IProcurementExtractedLineItem[];
  missingFields: string[];
  validationWarnings: string[];
}

export interface IExtractionField {
  field: string;
  value: string | number | boolean;
  unit?: string;
  confidence?: number;
  page?: number;
  sourceText?: string;
  section?: string;
  tableReference?: string;
  extractionStatus?: 'EXTRACTED' | 'NEEDS_REVIEW';
}

export interface IDocumentExtraction {
  _id: string;
  documentId: string;
  extractionVersion: string;
  fields: IExtractionField[];
  text?: string;
  pages?: Array<{
    pageNumber: number;
    text: string;
    method: 'NATIVE_TEXT' | 'OCR';
    confidence?: number;
  }>;
  method?: 'NATIVE_TEXT' | 'OCR' | 'NATIVE_TEXT_AND_OCR';
  status?: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  language?: string;
  errorMessage?: string;
  sourceDocumentId?: string;
  pageCount?: number;
  corrections?: IExtractionCorrection[];
  processedAt: string | Date;
}

export interface IExtractionCorrection {
  field: string;
  originalValue: string | number | boolean;
  correctedValue: string | number | boolean;
  reason: string;
  correctedBy: string;
  correctedAt: string | Date;
  verificationRunId?: string;
}

export interface IClaim {
  _id: string;
  supplierId: string;
  buyerOrganizationId?: string;
  productId?: string;
  facilityId?: string;
  documentId?: string;
  dataRequestId?: string;
  claimText?: string;
  sourceReference?: {
    documentId?: string;
    questionResponseId?: string;
    page?: number;
    section?: string;
    sourceText?: string;
    sourceType?: 'DOCUMENT_EXTRACTION' | 'QUESTIONNAIRE';
    extractionMethod?: 'NATIVE_TEXT' | 'OCR' | 'NATIVE_TEXT_AND_OCR';
  };
  normalizedData?: INormalizedCarbonData;
  type: string; // e.g. PCF_VALUE, RECYCLED_CONTENT, ZERO_WASTE
  value: string | number;
  unit?: string;
  methodology?: string;
  reportingPeriod?: string;
  boundary?: string;
  status: ClaimStatus;
  confidence: number; // 0.0 to 1.0
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface INormalizedCarbonData {
  originalValue: number;
  originalUnit: string;
  normalizedValue?: number;
  normalizedUnit?: string;
  functionalUnit?: string;
  boundary?: string;
  reportingPeriod?: string;
  conversionMethod?: string;
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
  score?: number;
  startedAt?: string | Date;
  completedAt?: string | Date;
  issues?: IVerificationIssue[];
  corroborationResults?: ICorroborationResult[];
  verifiedAt: string | Date;
  engineVersion: string;
}

export interface IVerificationIssue {
  type: string;
  severity: AnomalySeverity;
  description: string;
  claimId?: string;
  documentId?: string;
  recommendedAction: string;
  status: AnomalyStatus;
}

export interface ICorroborationResult {
  source: string;
  verificationMethod: string;
  lookupIdentifier: string;
  result: 'CORROBORATED' | 'NOT_FOUND' | 'MISMATCH' | 'UNAVAILABLE' | 'NOT_CHECKED';
  checkedAt?: string | Date;
  supportingReference?: string;
}

export interface IAnomaly {
  _id: string;
  supplierId: string;
  buyerOrganizationId?: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  description: string;
  documents: string[]; // document IDs
  claimId?: string;
  recommendedAction?: string;
  reviewedBy?: string;
  reviewedAt?: string | Date;
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
  completion?: {
    completed: number;
    total: number;
    required: { completed: number; total: number };
    optional: { completed: number; total: number };
    missingRequiredItems: Array<{ _id: string; label: string }>;
  };
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
  acceptedDocumentTypes?: DocumentType[];
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
  methodology?: string;
  version: string;
  createdAt: string | Date;
}

export interface ICarbonCalculation {
  _id: string;
  customerOrganizationId: string;
  buyerOrganizationId?: string;
  supplierOrganizationId: string;
  supplierId?: string;
  purchaseId: string;
  productId: string;
  quantity: number;
  inputQuantity?: number;
  quantityUnit: string;
  inputUnit?: string;
  carbonFactor?: number;
  carbonFactorUnit?: string;
  normalizedCarbonIntensity?: number;
  normalizedUnit?: string;
  functionalUnit?: string;
  lifecycleBoundary?: string;
  reportingPeriod?: string;
  factorSource: string;
  methodology?: string;
  totalEmissions?: number;
  calculatedEmissions?: number;
  emissionsUnit: string; // kgCO2e or tCO2e
  status?: string;
  evidenceStatus: ClaimStatus;
  claimId?: string;
  sourceReference?: {
    documentId?: string;
    documentName?: string;
    page?: number;
    sourceText?: string;
    sourceType?: 'DOCUMENT_EXTRACTION' | 'QUESTIONNAIRE';
    extractionMethod?: 'NATIVE_TEXT' | 'OCR' | 'NATIVE_TEXT_AND_OCR';
  };
  reason?: string;
  calculationVersion?: number;
  calculatedAt: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IProcurementDecisionOptionSnapshot {
  supplierId: string;
  productId: string;
  supplierName: string;
  productName: string;
  pricePerUnit?: number;
  totalCost?: number;
  currency?: string;
  priceSource?: 'CURRENT_PRODUCT_PRICE' | 'NOT_AVAILABLE';
  lastRecordedPrice?: number;
  lastRecordedPriceCurrency?: string;
  lastRecordedPriceUnit?: string;
  lastRecordedPriceDate?: string | Date;
  carbonIntensity?: number;
  carbonIntensityUnit?: string;
  estimatedEmissions?: number;
  functionalUnit?: string;
  lifecycleBoundary?: string;
  reportingPeriod?: string;
  methodology?: string;
  claimId?: string;
  sourceReference?: ICarbonCalculation['sourceReference'];
  evidenceStatus: ClaimStatus | 'MISSING';
  corroborationStatus: 'CORROBORATED' | 'NOT_AVAILABLE';
  comparisonStatus: 'COMPARABLE' | 'NOT_DIRECTLY_COMPARABLE' | 'NOT_AVAILABLE';
}

export interface IProcurementDecisionHistoryEntry {
  action: string;
  actorId: string;
  changedAt: string | Date;
  details?: Record<string, unknown>;
}

export interface IProcurementDecision {
  _id: string;
  organizationId: string;
  createdBy: string;
  productId: string;
  quantity: number;
  unit: string;
  status: ProcurementDecisionStatus;
  selectedSupplierId?: string;
  selectedProductId?: string;
  decisionReason?: string;
  decisionOwnerId?: string;
  decisionDate?: string | Date;
  scenarioSnapshot: IProcurementDecisionOptionSnapshot[];
  history: IProcurementDecisionHistoryEntry[];
  createdAt: string | Date;
  updatedAt: string | Date;
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
