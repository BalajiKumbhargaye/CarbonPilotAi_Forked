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
  PurchaseStatus,
} from '@carbonpilot/shared';

/**
 * Authentication Schemas
 */
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  organizationName: z.string().min(2, 'Organization name is required'),
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
  status: z.enum(['ACTIVE', 'PENDING', 'TERMINATED']).optional(),
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
  organizationId: z.string().min(1, 'Organization ID is required'),
  industry: z.string().min(1, 'Industry is required'),
});

export const updateSupplierSchema = z.object({
  industry: z.string().optional(),
  verificationStatus: z.string().optional(),
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
  supplierId: z.string().min(1, 'Supplier ID is required'),
  name: z.string().min(1, 'Product name is required'),
  productCode: z.string().min(1, 'Product code is required'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().optional(),
  productionFacilityIds: z.array(z.string()).default([]),
  carbonData: productCarbonDataSchema.optional(),
});

export const updateProductSchema = createProductSchema.partial();

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
  supplierOrganizationId: z.string().min(1, 'Supplier organization is required'),
  productId: z.string().min(1, 'Product ID is required'),
  purchaseOrderId: z.string().optional(),
  invoiceId: z.string().optional(),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unit: z.string().min(1, 'Unit is required'),
  purchaseDate: z.string().or(z.date()),
  status: z.nativeEnum(PurchaseStatus).default(PurchaseStatus.PENDING),
});

export const updatePurchaseSchema = createPurchaseSchema.partial();

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

/**
 * Document Schemas
 */
export const uploadDocumentMetadataSchema = z.object({
  supplierId: z.string().optional(),
  type: z.nativeEnum(DocumentType),
  reportingPeriod: z.string().optional(),
});

/**
 * Claim Schemas
 */
export const createClaimSchema = z.object({
  supplierId: z.string().min(1, 'Supplier ID is required'),
  productId: z.string().optional(),
  facilityId: z.string().optional(),
  type: z.string().min(1, 'Claim type is required'),
  value: z.union([z.string(), z.number()]),
  unit: z.string().min(1, 'Unit is required'),
  methodology: z.string().min(1, 'Methodology is required'),
  reportingPeriod: z.string().min(1, 'Reporting period is required'),
  boundary: z.string().min(1, 'Boundary is required'),
  status: z.nativeEnum(ClaimStatus).default(ClaimStatus.PENDING),
  confidence: z.number().min(0).max(1).default(1.0),
});

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

/**
 * Data Request & Questionnaire Schemas
 */
export const createDataRequestSchema = z.object({
  supplierOrganizationId: z.string().min(1, 'Supplier organization is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  deadline: z.string().or(z.date()),
  status: z.nativeEnum(DataRequestStatus).default(DataRequestStatus.SENT),
  requiredFields: z.array(z.string()).min(1, 'At least one required field is specified'),
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
  carbonFactorId: z.string().optional(),
  customFactor: z.number().optional(),
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
