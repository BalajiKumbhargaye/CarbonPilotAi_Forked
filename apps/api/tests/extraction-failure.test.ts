import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentStatus } from '@carbonpilot/shared';
import { extractionService } from '../src/modules/extraction';

const state = vi.hoisted(() => ({ document: null as any }));

vi.mock('../src/models/Document', () => ({
  DocumentModel: {
    findById: vi.fn(async () => state.document),
  },
}));
vi.mock('../src/models/DocumentExtraction', () => ({
  DocumentExtractionModel: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('../src/models/AuditLog', () => ({
  AuditLogModel: { create: vi.fn(async (values: any) => values) },
}));
vi.mock('../src/models/Supplier', () => ({ SupplierModel: { findById: vi.fn() } }));
vi.mock('../src/models/SupplierRelationship', () => ({ SupplierRelationshipModel: { findOne: vi.fn() } }));
vi.mock('../src/models/DataRequest', () => ({ DataRequestModel: { findOne: vi.fn() } }));

describe('document extraction without a configured parser', () => {
  beforeEach(() => {
    state.document = {
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      organizationId: '111111111111111111111111',
      status: DocumentStatus.UPLOADED,
      save: vi.fn(async () => undefined),
    };
  });

  it('records FAILED and does not persist fabricated fields', async () => {
    await expect(extractionService.runExtraction(state.document._id, {
      userId: '222222222222222222222222',
      organizationId: '111111111111111111111111',
      organizationType: 'SUPPLIER',
      role: 'SUPPLIER_ADMIN',
      email: 'supplier@example.test',
    })).rejects.toMatchObject({ statusCode: 503, code: 'EXTRACTION_UNAVAILABLE' });

    expect(state.document.status).toBe(DocumentStatus.FAILED);
    expect(state.document.processingError).toContain('no document text or OCR provider');
    expect(state.document.save).toHaveBeenCalledTimes(2);
  });
});