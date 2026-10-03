import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { ENV } from '../src/config/env';
import { DocumentStatus, DocumentType } from '@carbonpilot/shared';
import { procurementDocumentsService } from '../src/modules/procurement-documents';

const ids = {
  buyerA: '111111111111111111111111',
  buyerB: '222222222222222222222222',
  userA: '333333333333333333333333',
  supplierA: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  supplierOrgA: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  supplierB: 'cccccccccccccccccccccccc',
  supplierOrgB: 'dddddddddddddddddddddddd',
  productA: 'eeeeeeeeeeeeeeeeeeeeeeee',
  productB: 'ffffffffffffffffffffffff',
  document: '999999999999999999999999',
};

const state = vi.hoisted(() => ({
  documents: [] as any[],
  suppliers: [] as any[],
  organizations: [] as any[],
  relationships: [] as any[],
  products: [] as any[],
  invoices: [] as any[],
  purchaseOrders: [] as any[],
  purchases: [] as any[],
  storedFiles: [] as any[],
  nextId: 0,
}));

function keyEquals(value: unknown, expected: unknown) {
  if (expected && typeof expected === 'object' && '$regex' in expected) {
    return new RegExp(String((expected as any).$regex), String((expected as any).$options || '')).test(String(value));
  }
  return String(value) === String(expected);
}

function matches(record: any, query: Record<string, unknown>) {
  return Object.entries(query).every(([key, value]) => key === '_id' || key === 'supplierId'
    ? keyEquals(record[key], value)
    : keyEquals(record[key], value));
}

function makeDocument(values: Record<string, any>) {
  const document: any = {
    ...values,
    _id: values._id || ids.document,
    save: vi.fn(async () => {
      const index = state.documents.findIndex((item) => item._id.toString() === document._id.toString());
      if (index >= 0) state.documents[index] = document;
      else state.documents.push(document);
      return document;
    }),
    toObject: () => ({ ...document, save: undefined, toObject: undefined }),
  };
  return document;
}

vi.mock('../src/config/database', () => ({ isDatabaseConnected: () => true }));
vi.mock('../src/services/abstractions/IStorageService', () => ({
  LocalStorageService: vi.fn().mockImplementation(() => ({
    uploadFile: vi.fn(async (file: any) => {
      const stored = { fileUrl: '', storageKey: `test-${++state.nextId}`, fileSize: file.size, mimeType: file.mimetype };
      state.storedFiles.push(stored);
      return stored;
    }),
    readFile: vi.fn(async () => Buffer.from('%PDF-test')),
    deleteFile: vi.fn(async () => true),
    getFileUrl: vi.fn(async () => ''),
  })),
  privateDocumentStorage: {
    uploadFile: vi.fn(async (file: any) => {
      const stored = { fileUrl: '', storageKey: `test-${++state.nextId}`, fileSize: file.size, mimeType: file.mimetype };
      state.storedFiles.push(stored);
      return stored;
    }),
    readFile: vi.fn(async () => Buffer.from('%PDF-test')),
    deleteFile: vi.fn(async () => true),
    getFileUrl: vi.fn(async () => ''),
  },
  isSupportedProcurementFile: vi.fn((file: any) => {
    const extension = file.originalname.toLowerCase().split('.').pop();
    return extension === 'pdf' && file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-';
  }),
}));
vi.mock('../src/models/Document', () => ({
  DocumentModel: {
    create: vi.fn(async (values: any) => {
      const document = makeDocument(values);
      state.documents.push(document);
      return document;
    }),
    find: vi.fn(() => ({ sort: async () => state.documents })),
    findOne: vi.fn((query: any) => {
      const document = state.documents.find((item) => matches(item, query)) || null;
      return {
        select: async () => document,
        then: (resolve: (value: any) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(document).then(resolve, reject),
      };
    }),
  },
}));
vi.mock('../src/models/Supplier', () => ({
  SupplierModel: {
    findById: vi.fn(async (id: string) => state.suppliers.find((supplier) => supplier._id === String(id)) || null),
    find: vi.fn(async (query: any) => state.suppliers.filter((supplier) => query.organizationId.$in.some((id: string) => id.toString() === supplier.organizationId))),
  },
}));
vi.mock('../src/models/Organization', () => ({
  OrganizationModel: {
    findById: vi.fn(async (id: string) => state.organizations.find((org) => org._id === String(id)) || null),
    findOne: vi.fn(async (query: any) => state.organizations.find((org) => org._id === String(query._id) && (!query.type || org.type === query.type)) || null),
    find: vi.fn(async () => state.organizations),
  },
}));
vi.mock('../src/models/SupplierRelationship', () => ({
  SupplierRelationshipModel: {
    findOne: vi.fn(async (query: any) => state.relationships.find((relationship) =>
      relationship.customerOrganizationId === String(query.customerOrganizationId)
      && relationship.supplierOrganizationId === String(query.supplierOrganizationId)
      && relationship.status === query.status
    ) || null),
    find: vi.fn(async (query: any) => state.relationships.filter((relationship) => relationship.customerOrganizationId === String(query.customerOrganizationId))),
  },
}));
vi.mock('../src/models/Product', () => ({
  ProductModel: {
    findById: vi.fn(async (id: string) => state.products.find((product) => product._id === String(id)) || null),
    findOne: vi.fn(async (query: any) => state.products.find((product) => matches(product, query)) || null),
  },
}));
vi.mock('../src/models/Invoice', () => ({
  InvoiceModel: {
    findOne: vi.fn(async (query: any) => state.invoices.find((invoice) => matches(invoice, query)) || null),
    create: vi.fn(async (values: any) => {
      const invoice = { ...values, _id: `invoice-${++state.nextId}` };
      state.invoices.push(invoice);
      return invoice;
    }),
    deleteOne: vi.fn(async ({ _id }: any) => { state.invoices = state.invoices.filter((invoice) => invoice._id !== _id); }),
  },
}));
vi.mock('../src/models/PurchaseOrder', () => ({
  PurchaseOrderModel: {
    findOne: vi.fn(async (query: any) => state.purchaseOrders.find((order) => matches(order, query)) || null),
    create: vi.fn(async (values: any) => {
      const order = { ...values, _id: `po-${++state.nextId}` };
      state.purchaseOrders.push(order);
      return order;
    }),
    deleteOne: vi.fn(async ({ _id }: any) => { state.purchaseOrders = state.purchaseOrders.filter((order) => order._id !== _id); }),
  },
}));
vi.mock('../src/models/Purchase', () => ({
  PurchaseModel: {
    findOne: vi.fn(async (query: any) => state.purchases.find((purchase) => matches(purchase, query)) || null),
    deleteOne: vi.fn(async ({ _id }: any) => { state.purchases = state.purchases.filter((purchase) => purchase._id !== _id); }),
  },
}));
vi.mock('../src/modules/procurement/purchases.service', () => ({
  purchasesService: {
    create: vi.fn(async (values: any) => {
      const purchase = { ...values, _id: `purchase-${++state.nextId}` };
      state.purchases.push(purchase);
      return purchase;
    }),
  },
}));

const supplier = {
  _id: ids.supplierA,
  organizationId: ids.supplierOrgA,
};
const product = {
  _id: ids.productA,
  supplierId: ids.supplierA,
  name: 'Steel Sheet',
  productCode: 'ST-01',
  unit: 'kg',
  status: 'ACTIVE',
};
const review = {
  supplierId: ids.supplierA,
  productId: ids.productA,
  documentNumber: 'INV-1024',
  documentDate: '2026-09-15',
  quantity: '1000',
  unit: 'kg',
  unitPrice: '72',
  totalAmount: '72000',
  currency: 'INR',
  purchaseOrderNumber: 'PO-551',
};

function resetState() {
  state.documents = [];
  state.suppliers = [supplier, { _id: ids.supplierB, organizationId: ids.supplierOrgB }];
  state.organizations = [
    { _id: ids.supplierOrgA, name: 'GreenForge Industries', type: 'SUPPLIER' },
    { _id: ids.supplierOrgB, name: 'Other Supplier', type: 'SUPPLIER' },
  ];
  state.relationships = [{ customerOrganizationId: ids.buyerA, supplierOrganizationId: ids.supplierOrgA, status: 'ACTIVE' }];
  state.products = [product, { ...product, _id: ids.productB, supplierId: ids.supplierB }];
  state.invoices = [];
  state.purchaseOrders = [{
    _id: '888888888888888888888888',
    customerOrganizationId: ids.buyerA,
    supplierOrganizationId: ids.supplierOrgA,
    orderNumber: 'PO-551',
  }];
  state.purchases = [];
  state.storedFiles = [];
  state.nextId = 0;
}

describe('procurement document ingestion', () => {
  let server: Server;
  let apiUrl: string;
  let token: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = createApp().listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    apiUrl = `http://127.0.0.1:${address.port}`;
    token = jwt.sign({
      userId: ids.userA,
      organizationId: ids.buyerA,
      organizationType: 'CUSTOMER',
      role: 'CUSTOMER_ADMIN',
      email: 'buyer@example.test',
    }, ENV.JWT_SECRET);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(resetState);

  it('accepts a valid PDF and records its buyer, supplier, type, and uploader', async () => {
    const uploaded = await procurementDocumentsService.uploadDocument({
      file: {
        originalname: 'invoice-1024.pdf',
        mimetype: 'application/pdf',
        size: 9,
        buffer: Buffer.from('%PDF-test'),
      } as Express.Multer.File,
      customerOrganizationId: ids.buyerA,
      userId: ids.userA,
      supplierId: ids.supplierA,
      type: DocumentType.INVOICE,
    });

    expect(uploaded.status).toBe(DocumentStatus.UPLOADED);
    expect(state.documents[0]).toMatchObject({
      organizationId: ids.buyerA,
      supplierId: ids.supplierA,
      uploadedBy: ids.userA,
      type: DocumentType.INVOICE,
    });
    expect(state.storedFiles).toHaveLength(1);
    expect(uploaded).not.toHaveProperty('storageKey');
  });

  it('rejects unsupported signatures and suppliers outside the buyer network', async () => {
    await expect(procurementDocumentsService.uploadDocument({
      file: {
        originalname: 'invoice.pdf', mimetype: 'application/pdf', size: 3, buffer: Buffer.from('bad'),
      } as Express.Multer.File,
      customerOrganizationId: ids.buyerA,
      userId: ids.userA,
      supplierId: ids.supplierA,
      type: DocumentType.INVOICE,
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });

    await expect(procurementDocumentsService.uploadDocument({
      file: {
        originalname: 'large.pdf', mimetype: 'application/pdf', size: 26 * 1024 * 1024, buffer: Buffer.from('%PDF-test'),
      } as Express.Multer.File,
      customerOrganizationId: ids.buyerA,
      userId: ids.userA,
      supplierId: ids.supplierA,
      type: DocumentType.INVOICE,
    })).rejects.toMatchObject({ statusCode: 413 });

    await expect(procurementDocumentsService.uploadDocument({
      file: {
        originalname: 'invoice.pdf', mimetype: 'application/pdf', size: 9, buffer: Buffer.from('%PDF-test'),
      } as Express.Multer.File,
      customerOrganizationId: ids.buyerA,
      userId: ids.userA,
      supplierId: ids.supplierB,
      type: DocumentType.INVOICE,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(state.storedFiles).toHaveLength(0);
  });

  it('does not claim extraction succeeded when the mock provider cannot extract', async () => {
    const document = makeDocument({
      organizationId: ids.buyerA,
      supplierId: ids.supplierA,
      type: DocumentType.INVOICE,
      filename: 'invoice.pdf',
      status: DocumentStatus.UPLOADED,
    });
    state.documents.push(document);

    const processed = await procurementDocumentsService.process(ids.document, ids.buyerA);

    expect(processed.status).toBe(DocumentStatus.FAILED);
    expect(processed.processingError).toBe('Document extraction service unavailable');
  });

  it('rejects a product owned by another supplier and a unit that differs from the catalog', async () => {
    const document = makeDocument({ organizationId: ids.buyerA, supplierId: ids.supplierA, type: DocumentType.INVOICE });
    state.documents.push(document);

    await expect(procurementDocumentsService.saveReview(ids.document, ids.buyerA, ids.userA, {
      ...review,
      productId: ids.productB,
    } as any)).rejects.toMatchObject({ code: 'PRODUCT_SUPPLIER_MISMATCH' });
    await expect(procurementDocumentsService.saveReview(ids.document, ids.buyerA, ids.userA, {
      ...review,
      unit: 'tonne',
    } as any)).rejects.toMatchObject({ code: 'UNIT_MISMATCH' });
    await expect(procurementDocumentsService.saveReview(ids.document, ids.buyerA, ids.userA, {
      ...review,
      supplierId: 'not-an-id',
    } as any)).rejects.toMatchObject({ code: 'INVALID_REVIEW' });
    await expect(procurementDocumentsService.saveReview(ids.document, ids.buyerA, ids.userA, {} as any))
      .rejects.toMatchObject({ code: 'INVALID_REVIEW' });
  });

  it('requires explicit review and imports an invoice as linked invoice and purchase records', async () => {
    const document = makeDocument({
      organizationId: ids.buyerA,
      supplierId: ids.supplierA,
      type: DocumentType.INVOICE,
      status: DocumentStatus.FAILED,
    });
    state.documents.push(document);

    await expect(procurementDocumentsService.importDocument(ids.document, ids.buyerA, ids.userA))
      .rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });

    const saved = await procurementDocumentsService.saveReview(ids.document, ids.buyerA, ids.userA, review as any);
    expect(saved.status).toBe(DocumentStatus.NEEDS_REVIEW);
    expect(saved.reviewData.source).toBe('MANUAL');

    const imported = await procurementDocumentsService.importDocument(ids.document, ids.buyerA, ids.userA);
    expect(imported.document.status).toBe(DocumentStatus.IMPORTED);
    expect(imported.purchase).toMatchObject({ referenceNumber: 'INV-1024', purchaseOrderId: '888888888888888888888888' });
    expect(imported.warning).toBeNull();
    expect(state.invoices[0]).toMatchObject({ invoiceNumber: 'INV-1024', extractionStatus: 'FAILED' });
  });

  it('blocks likely duplicate invoice imports', async () => {
    const document = makeDocument({
      organizationId: ids.buyerA,
      supplierId: ids.supplierA,
      type: DocumentType.INVOICE,
      status: DocumentStatus.NEEDS_REVIEW,
      reviewData: review,
    });
    state.documents.push(document);
    state.invoices.push({ customerOrganizationId: ids.buyerA, supplierOrganizationId: ids.supplierOrgA, invoiceNumber: 'INV-1024' });

    await expect(procurementDocumentsService.importDocument(ids.document, ids.buyerA, ids.userA))
      .rejects.toMatchObject({ code: 'POSSIBLE_DUPLICATE' });
    expect(state.purchases).toHaveLength(0);
  });

  it('creates a separate PO record and warns when an invoice references an unknown PO', async () => {
    const poDocument = makeDocument({
      _id: '777777777777777777777777',
      organizationId: ids.buyerA,
      supplierId: ids.supplierA,
      type: DocumentType.PURCHASE_ORDER,
      status: DocumentStatus.NEEDS_REVIEW,
      reviewData: { ...review, documentNumber: 'PO-552', expectedDeliveryDate: '2026-10-20' },
    });
    state.documents.push(poDocument);
    const importedPO = await procurementDocumentsService.importDocument(poDocument._id, ids.buyerA, ids.userA);
    expect(importedPO.purchaseOrder).toMatchObject({ orderNumber: 'PO-552', expectedDeliveryDate: new Date('2026-10-20') });
    expect(importedPO.purchase).toBeNull();

    const invoiceDocument = makeDocument({
      _id: '666666666666666666666666',
      organizationId: ids.buyerA,
      supplierId: ids.supplierA,
      type: DocumentType.INVOICE,
      status: DocumentStatus.NEEDS_REVIEW,
      reviewData: { ...review, documentNumber: 'INV-1025', purchaseOrderNumber: 'PO-NOT-FOUND' },
    });
    state.documents.push(invoiceDocument);
    const importedInvoice = await procurementDocumentsService.importDocument(invoiceDocument._id, ids.buyerA, ids.userA);
    expect(importedInvoice.warning).toBe('PO reference found, but matching PO was not found.');
    expect(importedInvoice.purchaseOrder).toBeNull();
  });

  it('rejects cross-organization document access and cross-supplier products over the API', async () => {
    const foreignDocument = makeDocument({
      _id: ids.document,
      organizationId: ids.buyerB,
      supplierId: ids.supplierA,
      type: DocumentType.INVOICE,
    });
    state.documents.push(foreignDocument);

    const foreignRead = await fetch(`${apiUrl}/api/procurement-documents/${ids.document}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(foreignRead.status).toBe(404);
    const foreignFile = await fetch(`${apiUrl}/api/procurement-documents/${ids.document}/file`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(foreignFile.status).toBe(404);

    const ownDocument = makeDocument({
      _id: '555555555555555555555555',
      organizationId: ids.buyerA,
      supplierId: ids.supplierA,
      type: DocumentType.INVOICE,
      status: DocumentStatus.FAILED,
    });
    state.documents.push(ownDocument);
    const invalidProduct = await fetch(`${apiUrl}/api/procurement-documents/${ownDocument._id}/review`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...review, productId: ids.productB }),
    });
    expect(invalidProduct.status).toBe(400);
  });
});