import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentStatus } from '@carbonpilot/shared';
import { extractionService } from '../src/modules/extraction';

const state = vi.hoisted(() => ({
  document: null as any,
  extractionCreate: vi.fn(),
  storageRead: vi.fn(),
  extractor: vi.fn(),
}));

vi.mock('../src/models/Document', () => ({
  DocumentModel: {
    findById: vi.fn(async () => state.document),
  },
}));
vi.mock('../src/models/DocumentExtraction', () => ({
  DocumentExtractionModel: {
    findOne: vi.fn(),
    create: vi.fn(async (values: any) => {
      state.extractionCreate(values);
      return { ...values, _id: 'extraction-1' };
    }),
  },
}));
vi.mock('../src/services/abstractions/IStorageService', () => ({
  privateDocumentStorage: {
    readFile: vi.fn(async (storageKey: string) => state.storageRead(storageKey)),
  },
}));
vi.mock('../src/services/ocr/document-extractor', () => ({
  extractDocumentTextFromBuffer: vi.fn(async (...args: any[]) => state.extractor(...args)),
}));
vi.mock('../src/models/AuditLog', () => ({
  AuditLogModel: { create: vi.fn(async (values: any) => values) },
}));
vi.mock('../src/models/Supplier', () => ({ SupplierModel: { findById: vi.fn() } }));
vi.mock('../src/models/SupplierRelationship', () => ({ SupplierRelationshipModel: { findOne: vi.fn() } }));
vi.mock('../src/models/DataRequest', () => ({ DataRequestModel: { findOne: vi.fn() } }));

describe('document extraction pipeline', () => {
  beforeEach(() => {
    state.extractionCreate.mockClear();
    state.storageRead.mockReset();
    state.extractor.mockReset();

    state.document = {
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      organizationId: '111111111111111111111111',
      filename: 'supplier-report.pdf',
      mimeType: 'application/pdf',
      status: DocumentStatus.UPLOADED,
      save: vi.fn(async () => undefined),
      fileUrl: '/api/documents/aaaaaaaaaaaaaaaaaaaaaaaa/file',
    };
  });

  it('marks the document as failed when no readable content is available', async () => {
    state.storageRead.mockResolvedValue(null);

    await expect(extractionService.runExtraction(state.document._id, {
      userId: '222222222222222222222222',
      organizationId: '111111111111111111111111',
      organizationType: 'SUPPLIER',
      role: 'SUPPLIER_ADMIN',
      email: 'supplier@example.test',
    })).rejects.toMatchObject({ statusCode: 422, code: 'EXTRACTION_FAILED' });

    expect(state.document.status).toBe(DocumentStatus.FAILED);
    expect(state.document.processingError).toContain('No readable document content was found on disk');
    expect(state.document.save).toHaveBeenCalledTimes(2);
  });

  it('stores extracted OCR text and marks the document as extracted when text is available', async () => {
    state.storageRead.mockResolvedValue(Buffer.from('%PDF-1.4'));
    state.extractor.mockResolvedValue({
      method: 'OCR',
      text: 'Supplier Name: GreenSteel\nProduct Carbon Footprint: 0.98 kgCO2e/kg',
      pages: [{ pageNumber: 1, text: 'Supplier Name: GreenSteel', method: 'OCR' }],
      language: 'eng',
      fields: [{ field: 'DOCUMENT_TEXT', value: 'Supplier Name: GreenSteel Product Carbon Footprint: 0.98 kgCO2e/kg', page: 1, extractionStatus: 'EXTRACTED' }],
    });

    const extraction = await extractionService.runExtraction(state.document._id, {
      userId: '222222222222222222222222',
      organizationId: '111111111111111111111111',
      organizationType: 'SUPPLIER',
      role: 'SUPPLIER_ADMIN',
      email: 'supplier@example.test',
    });

    expect(extraction.method).toBe('OCR');
    expect(extraction.fields[0].value).toContain('Product Carbon Footprint');
    expect(state.document.status).toBe(DocumentStatus.EXTRACTED);
    expect(state.document.save).toHaveBeenCalledTimes(2);
    expect(state.extractionCreate).toHaveBeenCalledWith(expect.objectContaining({ method: 'OCR' }));
  });
});