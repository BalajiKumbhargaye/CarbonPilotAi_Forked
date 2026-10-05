import { z } from 'zod';
import {
  UserRole,
  OrganizationType,
  DocumentType,
  ClaimStatus,
  AnomalyType,
  AnomalySeverity,
  AnomalyStatus,
  CertificateStatus,
  DataRequestStatus,
  DataRequestResponseType,
  QuestionnaireCategory,
  PurchaseStatus,
  SupplierStatus,
  ProductStatus,
  ProcurementDecisionStatus,
  PRODUCT_UNITS,
} from '@carbonpilot/shared';

/**
 * Authentication Schemas
 */
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  organizationName: z.string().trim().min(2, 'Organization name is required'),
  organizationType: z.nativeEnum(OrganizationType),
  role: z.nativeEnum(UserRole),
  industry: z.string().optional(),
  gstin: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

/**
 * Organization Schemas
 */
export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name is required'),
  type: z.nativeEnum(OrganizationType),
  gstin: z.string().optional(),
  industry: z.string().optional(),
  address: z.string().optional(),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
});

export const updateOrganizationSchema = createOrganizationSchema.partial();

export const updateSupplierRelationshipSchema = z.object({
  status: z.nativeEnum(SupplierStatus).optional(),
  sharedDataPermissions: z
    .object({
      carbon: z.boolean(),
      energy: z.boolean(),
      certificates: z.boolean(),
      documents: z.boolean(),
    })
    .optional(),
});

/**
 * Supplier & Profile Schemas
 */
export const createSupplierSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name is required'),
  legalName: z.string().trim().optional(),
  industry: z.string().trim().min(1, 'Industry is required'),
  country: z.string().trim().min(1, 'Country is required'),
  city: z.string().trim().min(1, 'City is required'),
  contactPerson: z.string().trim().min(2, 'Contact person is required'),
  contactEmail: z.string().trim().email('Invalid contact email'),
  contactPhone: z.string().trim().min(1, 'Contact phone is required'),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  category: z.string().trim().min(1, 'Supplier category is required'),
  notes: z.string().trim().optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const updateSupplierStatusSchema = z.object({
  status: z.nativeEnum(SupplierStatus),
});

export const updateSupplierProfileSchema = z.object({
  name: z.string().trim().min(2, 'Company name is required').optional(),
  legalName: z.string().trim().optional(),
  industry: z.string().trim().min(1, 'Industry is required').optional(),
  country: z.string().trim().optional(),
  city: z.string().trim().optional(),
  contactPerson: z.string().trim().optional(),
  contactEmail: z.string().trim().email('Invalid contact email').or(z.literal('')).optional(),
  contactPhone: z.string().trim().optional(),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  description: z.string().trim().optional(),
});

/**
 * Product Schemas
 */
export const productCarbonDataSchema = z.object({
  pcf: z.number().nonnegative('PCF must be greater than or equal to 0'),
  unit: z.string().min(1, 'Unit is required (e.g., kgCO2e/kg)'),
  methodology: z.string().min(1, 'Methodology is required'),
  reportingPeriod: z.string().min(1, 'Reporting period is required'),
  boundary: z.string().min(1, 'Boundary is required (e.g., Cradle-to-Gate)'),
});

export const createProductSchema = z.object({
  supplierId: z.string().optional(),
  name: z.string().trim().min(1, 'Product name is required'),
  productCode: z.string().trim().optional(),
  categoryId: z.string().min(1, 'Category is required'),
  unit: z.enum(PRODUCT_UNITS, { errorMap: () => ({ message: 'Choose a supported product unit' }) }),
  sellingPrice: z.union([
    z.number().finite().nonnegative(),
    z.string().trim().regex(/^\d+(?:\.\d{1,8})?$/, 'Enter a valid non-negative selling price'),
  ]).transform(Number).refine((value) => Number(value.toFixed(8)) === value, 'Selling price supports up to 8 decimal places').optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code').optional(),
  description: z.string().optional(),
  productionFacilityIds: z.array(z.string()).default([]),
  status: z.nativeEnum(ProductStatus).optional(),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').optional(),
  productCode: z.string().trim().optional(),
  categoryId: z.string().min(1, 'Category is required').optional(),
  unit: z.enum(PRODUCT_UNITS, { errorMap: () => ({ message: 'Choose a supported product unit' }) }).optional(),
  sellingPrice: z.union([
    z.number().finite().nonnegative(),
    z.string().trim().regex(/^\d+(?:\.\d{1,8})?$/, 'Enter a valid non-negative selling price'),
  ]).transform(Number).refine((value) => Number(value.toFixed(8)) === value, 'Selling price supports up to 8 decimal places').optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code').optional(),
  description: z.string().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
});

export const createProductCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(80),
});

/**
 * Facility Schemas
 */
export const createFacilitySchema = z.object({
  supplierId: z.string().min(1, 'Supplier ID is required'),
  name: z.string().min(1, 'Facility name is required'),
  location: z.string().min(1, 'Location is required'),
  productionCapacity: z.string().optional(),
  products: z.array(z.string()).default([]),
});

export const updateFacilitySchema = createFacilitySchema.partial();

/**
 * Procurement (Purchase, Invoice, PO) Schemas
 */
export const createPurchaseSchema = z.object({
  supplierId: z.string().min(1, 'Supplier is required'),
  productId: z.string().min(1, 'Product ID is required'),
  quantity: z.union([
    z.number().finite().positive(),
    z.string().trim().regex(/^\d+(\.\d{1,8})?$/, 'Quantity must be a positive decimal'),
  ]).transform(String).refine((value) => Number(value) > 0, 'Quantity must be greater than 0'),
  unit: z.enum(PRODUCT_UNITS, { errorMap: () => ({ message: 'Choose a supported product unit' }) }).optional(),
  purchaseDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid purchase date'),
  referenceNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
  status: z.nativeEnum(PurchaseStatus).default(PurchaseStatus.CONFIRMED),
});

export const updatePurchaseSchema = z.object({
  quantity: z.union([
    z.number().finite().positive(),
    z.string().trim().regex(/^\d+(\.\d{1,8})?$/, 'Quantity must be a positive decimal'),
  ]).transform(String).refine((value) => Number(value) > 0, 'Quantity must be greater than 0').optional(),
  purchaseDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid purchase date').optional(),
  referenceNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
  status: z.nativeEnum(PurchaseStatus).optional(),
});

export const updatePurchaseStatusSchema = z.object({
  status: z.nativeEnum(PurchaseStatus),
});

export const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Item description is required'),
  quantity: z.number().positive(),
  unit: z.string().min(1, 'Unit is required'),
  unitPrice: z.number().nonnegative(),
  totalPrice: z.number().nonnegative(),
  productId: z.string().optional(),
});

export const createInvoiceSchema = z.object({
  customerOrganizationId: z.string().min(1, 'Customer organization is required'),
  supplierOrganizationId: z.string().min(1, 'Supplier organization is required'),
  invoiceNumber: z.string().min(1, 'Invoice number is required'),
  invoiceDate: z.string().or(z.date()),
  currency: z.string().min(1, 'Currency is required').default('USD'),
  totalAmount: z.number().nonnegative(),
  items: z.array(invoiceItemSchema).min(1, 'At least one invoice item is required'),
  documentId: z.string().optional(),
});

export const createPurchaseOrderSchema = z.object({
  supplierOrganizationId: z.string().min(1, 'Supplier organization is required'),
  orderNumber: z.string().min(1, 'PO number is required'),
  orderDate: z.string().or(z.date()),
  currency: z.string().min(1, 'Currency is required').default('USD'),
  totalAmount: z.number().nonnegative(),
  items: z.array(invoiceItemSchema).min(1, 'At least one line item is required'),
  documentId: z.string().optional(),
});

const procurementDecimal = z.union([
  z.number().finite(),
  z.string().trim().regex(/^\d+(?:\.\d{1,8})?$/, 'Enter a valid decimal amount'),
]).transform(String);
const procurementMoney = z.union([
  z.number().finite(),
  z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/, 'Enter a valid currency amount'),
]).transform(String);

const procurementReviewLineItemSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid product'),
  description: z.string().trim().min(1).max(500),
  productCode: z.string().trim().max(100).optional(),
  quantity: procurementDecimal.refine((value) => Number(value) > 0, 'Quantity must be greater than 0'),
  unit: z.enum(PRODUCT_UNITS, { errorMap: () => ({ message: 'Choose a supported product unit' }) }),
  unitPrice: procurementDecimal.refine((value) => Number(value) >= 0, 'Unit price cannot be negative'),
  totalAmount: procurementMoney.refine((value) => Number(value) >= 0, 'Line total cannot be negative'),
});

const validProcurementDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const procurementDocumentReviewSchema = z.object({
  supplierId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid supplier'),
  productId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid product'),
  documentNumber: z.string().trim().min(1).max(100),
  documentDate: z.string().refine(validProcurementDate, 'Enter a valid document date in YYYY-MM-DD format'),
  quantity: procurementDecimal.refine((value) => Number(value) > 0, 'Quantity must be greater than 0'),
  unit: z.enum(PRODUCT_UNITS, { errorMap: () => ({ message: 'Choose a supported product unit' }) }),
  unitPrice: procurementDecimal.refine((value) => Number(value) >= 0, 'Unit price cannot be negative'),
  totalAmount: procurementMoney.refine((value) => Number(value) >= 0, 'Total cannot be negative'),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code'),
  purchaseOrderNumber: z.string().trim().max(100).optional(),
  expectedDeliveryDate: z.string().refine(validProcurementDate, 'Enter a valid expected delivery date in YYYY-MM-DD format').optional(),
  source: z.enum(['MANUAL', 'EXTRACTED']).optional(),
  items: z.array(procurementReviewLineItemSchema).min(1).max(100).optional(),
});

/**
 * Document Schemas
 */
export const uploadDocumentMetadataSchema = z.object({
  supplierId: z.string().optional(),
  type: z.nativeEnum(DocumentType),
  reportingPeriod: z.string().optional(),
});

export const correctDocumentClassificationSchema = z.object({
  type: z.nativeEnum(DocumentType),
});

/**
 * Claim Schemas
 */
export const createClaimSchema = z.object({
  supplierId: z.string().min(1, 'Supplier ID is required'),
  productId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  facilityId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  dataRequestId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  type: z.string().min(1, 'Claim type is required'),
  value: z.union([z.string(), z.number()]),
  unit: z.string().trim().min(1, 'Unit cannot be empty').optional(),
  functionalUnit: z.string().trim().min(1).optional(),
  methodology: z.string().trim().min(1).optional(),
  reportingPeriod: z.string().trim().min(1).optional(),
  boundary: z.string().trim().min(1).optional(),
  status: z.nativeEnum(ClaimStatus).default(ClaimStatus.PENDING),
  claimText: z.string().trim().max(2000).optional(),
});

export const updateClaimSchema = createClaimSchema.omit({ supplierId: true }).partial();

export const linkEvidenceSchema = z.object({
  claimId: z.string().min(1, 'Claim ID is required'),
  documentId: z.string().min(1, 'Document ID is required'),
  page: z.number().int().positive().optional(),
  section: z.string().optional(),
  sourceText: z.string().optional(),
  relationshipType: z.string().default('PRIMARY_SOURCE'),
});

/**
 * Anomaly Schemas
 */
export const createAnomalySchema = z.object({
  supplierId: z.string().min(1, 'Supplier ID is required'),
  type: z.nativeEnum(AnomalyType),
  severity: z.nativeEnum(AnomalySeverity),
  status: z.nativeEnum(AnomalyStatus).default(AnomalyStatus.OPEN),
  description: z.string().min(1, 'Description is required'),
  documents: z.array(z.string()).default([]),
});

export const resolveAnomalySchema = z.object({
  status: z.enum(['RESOLVED', 'IGNORED']),
  resolutionNote: z.string().min(1, 'Resolution note is required'),
});

export const correctExtractionSchema = z.object({
  documentId: z.string().regex(/^[a-f\d]{24}$/i),
  field: z.string().trim().min(1).max(100),
  correctedValue: z.union([z.string().trim().min(1), z.number().finite(), z.boolean()]),
  reason: z.string().trim().min(5).max(1000),
});

export const reviewVerificationIssueSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

/**
 * Data Request & Questionnaire Schemas
 */
export const createDataRequestSchema = z.object({
  supplierId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid connected supplier'),
  title: z.string().trim().min(1, 'Title is required').max(160),
  description: z.string().trim().max(2000).default(''),
  deadline: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid due date').optional(),
  productId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid product').optional().or(z.literal('')),
  templateId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid questionnaire template').optional(),
  allowPartialSubmission: z.boolean().default(false),
  requestedItems: z.array(z.object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_-]{1,99}$/i).optional(),
    label: z.string().trim().min(1, 'Requirement name is required').max(160),
    description: z.string().trim().max(1000).optional(),
    responseType: z.nativeEnum(DataRequestResponseType),
    category: z.nativeEnum(QuestionnaireCategory).default(QuestionnaireCategory.GENERAL_SUSTAINABILITY),
    required: z.boolean().default(true),
    requiresEvidence: z.boolean().default(false),
    acceptedDocumentTypes: z.array(z.nativeEnum(DocumentType)).max(20).optional(),
    unit: z.string().trim().max(40).optional(),
    options: z.array(z.string().trim().min(1).max(160)).max(40).optional(),
    conditions: z.array(z.object({
      questionKey: z.string().trim().min(2).max(100),
      operator: z.enum(['EQUALS', 'NOT_EQUALS']).default('EQUALS'),
      value: z.union([z.string(), z.number().finite(), z.boolean()]),
    })).max(10).optional(),
    order: z.number().int().min(0).optional(),
    metadata: z.record(z.unknown()).optional(),
  })).min(1, 'Add at least one requirement').max(40),
});

export const updateDataRequestSchema = createDataRequestSchema.omit({ supplierId: true }).partial();

export const saveDataRequestItemResponseSchema = z.object({
  value: z.union([z.string(), z.number().finite(), z.boolean(), z.array(z.string())]),
  unit: z.string().trim().max(40).optional(),
});

export const requestClarificationSchema = z.object({
  message: z.string().trim().min(1, 'Clarification message is required').max(2000),
  itemIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).optional(),
});

export const submitQuestionResponseSchema = z.object({
  dataRequestId: z.string().min(1, 'Data request ID is required'),
  question: z.string().min(1, 'Question text is required'),
  field: z.string().min(1, 'Target field is required'),
  answer: z.string().min(1, 'Answer is required'),
  unit: z.string().optional(),
  evidenceDocumentId: z.string().optional(),
});

/**
 * Certificate Schemas
 */
export const createCertificateSchema = z.object({
  supplierId: z.string().min(1, 'Supplier ID is required'),
  type: z.string().min(1, 'Certificate type is required'),
  certificateNumber: z.string().min(1, 'Certificate number is required'),
  issuingBody: z.string().min(1, 'Issuing body is required'),
  issueDate: z.string().or(z.date()),
  expiryDate: z.string().or(z.date()),
  scope: z.string().optional(),
  documentId: z.string().optional(),
  status: z.nativeEnum(CertificateStatus).default(CertificateStatus.VALID),
});

/**
 * Carbon Calculation & Factor Schemas
 */
export const createCarbonFactorSchema = z.object({
  name: z.string().min(1, 'Factor name is required'),
  category: z.string().min(1, 'Category is required'),
  value: z.number().positive('Factor value must be positive'),
  unit: z.string().min(1, 'Factor unit is required'),
  region: z.string().min(1, 'Region is required'),
  year: z.number().int().min(2000).max(2100),
  source: z.string().min(1, 'Source is required (e.g., DEFRA)'),
  methodology: z.string().min(1, 'Methodology is required'),
  version: z.string().default('1.0'),
});

export const calculateCarbonSchema = z.object({
  purchaseId: z.string().min(1, 'Purchase ID is required'),
  claimId: z.string().optional(),
  carbonFactorId: z.string().optional(),
  customFactor: z.number().optional(),
});

export const compareCarbonSchema = z.object({
  leftProductId: z.string().min(1, 'Left product is required').optional(),
  rightProductId: z.string().min(1, 'Right product is required').optional(),
  leftSupplierId: z.string().optional(),
  rightSupplierId: z.string().optional(),
  quantity: z.number().nonnegative().optional(),
});

export const procurementScenarioSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid product'),
  quantity: z.number().finite().positive('Quantity must be greater than 0'),
});

export const createProcurementDecisionSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid product'),
  quantity: z.number().finite().positive('Quantity must be greater than 0'),
  selectedSupplierId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  selectedProductId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  decisionReason: z.string().trim().max(3000).optional(),
});

export const updateProcurementDecisionSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  quantity: z.number().finite().positive().optional(),
  selectedSupplierId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  selectedProductId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  decisionReason: z.string().trim().max(3000).optional(),
  status: z.enum([ProcurementDecisionStatus.DRAFT, ProcurementDecisionStatus.UNDER_REVIEW, ProcurementDecisionStatus.CANCELLED]).optional(),
});

export const finalizeProcurementDecisionSchema = z.object({
  selectedSupplierId: z.string().regex(/^[a-f\d]{24}$/i),
  selectedProductId: z.string().regex(/^[a-f\d]{24}$/i),
  decisionReason: z.string().trim().max(3000).optional(),
});

/**
 * Evidence Pack Schemas
 */
export const createEvidencePackSchema = z.object({
  supplierId: z.string().min(1, 'Supplier ID is required'),
  title: z.string().min(1, 'Title is required'),
  claims: z.array(z.string()).default([]),
  documents: z.array(z.string()).default([]),
  carbonCalculations: z.array(z.string()).default([]),
  verificationRuns: z.array(z.string()).default([]),
  format: z.enum(['PDF', 'ZIP', 'JSON']).default('PDF'),
});

// Infer schema types
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type CreateClaimInput = z.infer<typeof createClaimSchema>;
export type CreateDataRequestInput = z.infer<typeof createDataRequestSchema>;
