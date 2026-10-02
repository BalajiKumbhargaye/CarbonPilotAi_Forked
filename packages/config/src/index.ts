import { UserRole } from '@carbonpilot/shared';

export const APP_CONFIG = {
  APP_NAME: 'CarbonPilot',
  DESCRIPTION: 'B2B Supplier Sustainability Intelligence & Evidence Verification Platform',
  DEFAULT_PORT: 4000,
  DEFAULT_WEB_PORT: 3000,
  VERSION: '0.1.0',
  JWT_DEFAULT_EXPIRES_IN: '7d',
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024, // 25MB
  SUPPORTED_MIME_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/png',
    'image/jpeg',
  ],
};

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  [UserRole.CUSTOMER_ADMIN]: [
    'org:manage',
    'users:manage',
    'suppliers:view',
    'suppliers:manage',
    'purchases:view',
    'purchases:manage',
    'evidence:view',
    'carbon:calculate',
    'reports:generate',
  ],
  [UserRole.PROCUREMENT_MANAGER]: [
    'suppliers:view',
    'suppliers:invite',
    'purchases:view',
    'purchases:manage',
    'evidence:view',
    'reports:generate',
  ],
  [UserRole.SUSTAINABILITY_MANAGER]: [
    'suppliers:view',
    'evidence:view',
    'evidence:verify',
    'carbon:calculate',
    'carbon:manage_factors',
    'reports:generate',
    'anomalies:manage',
  ],
  [UserRole.SUPPLIER_ADMIN]: [
    'org:manage',
    'users:manage',
    'products:manage',
    'facilities:manage',
    'documents:upload',
    'claims:manage',
    'questionnaires:respond',
    'evidence_packs:generate',
  ],
  [UserRole.DATA_CONTRIBUTOR]: [
    'documents:upload',
    'questionnaires:respond',
    'products:view',
    'facilities:view',
  ],
};
