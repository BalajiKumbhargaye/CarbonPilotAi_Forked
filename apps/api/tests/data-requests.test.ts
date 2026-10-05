import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { ENV } from '../src/config/env';
import { DataRequestResponseType, DataRequestStatus } from '@carbonpilot/shared';
import { dataRequestsService } from '../src/modules/data-requests';
import { questionnaireTemplatesService } from '../src/modules/questionnaires/templates';

const ids = {
  buyerA: '111111111111111111111111',
  buyerB: '222222222222222222222222',
  buyerUser: '333333333333333333333333',
  supplierOrgA: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  supplierOrgB: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  supplierA: 'cccccccccccccccccccccccc',
  supplierB: 'dddddddddddddddddddddddd',
  productA: 'eeeeeeeeeeeeeeeeeeeeeeee',
  productB: 'ffffffffffffffffffffffff',
  requestA: '999999999999999999999999',
  itemText: '888888888888888888888888',
  itemDoc: '777777777777777777777777',
  itemNumber: '666666666666666666666666',
};

const state = vi.hoisted(() => ({
  requests: [] as any[],
  responses: [] as any[],
  suppliers: [] as any[],
  organizations: [] as any[],
  relationships: [] as any[],
  products: [] as any[],
  templates: [] as any[],
  documents: [] as any[],
  notifications: [] as any[],
  claims: [] as any[],
  evidenceLinks: [] as any[],
  extractions: [] as any[],
  verificationRuns: [] as any[],
  auditLogs: [] as any[],
  members: [] as any[],
  nextId: 0,
}));

function stringId(value: any) {
  return value?.toString?.() ?? String(value);
}

function queryMatches(record: any, query: Record<string, any>) {
  return Object.entries(query).every(([key, expected]) => {
    const actual = stringId(record[key]);
    if (expected && typeof expected === 'object' && '$ne' in expected) return actual !== stringId(expected.$ne);
    if (expected && typeof expected === 'object' && '$nin' in expected) {
      return !expected.$nin.some((value: any) => actual === stringId(value));
    }
    if (expected && typeof expected === 'object' && '$in' in expected) {
      return expected.$in.some((value: any) => actual === stringId(value));
    }
    return actual === stringId(expected);
  });
}

function queryResult<T>(value: T) {
  const query: any = {
    sort: () => query,
    select: () => query,
    then: (resolve: (value: T) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
}

function makeRequest(values: Record<string, any>) {
  const request: any = {
    ...values,
    _id: values._id || ids.requestA,
    requestedItems: (values.requestedItems || []).map((item: any) => ({
      ...item,
      _id: item._id || `item-${++state.nextId}`,
      toObject() { return { ...this, toObject: undefined }; },
    })),
    foundFields: values.foundFields || [],
    missingFields: values.missingFields || [],
    save: vi.fn(async () => request),
    toObject() { return { ...request, save: undefined, toObject: undefined }; },
  };
  return request;
}

vi.mock('../src/config/database', () => ({ isDatabaseConnected: () => true }));
vi.mock('../src/services/abstractions/IStorageService', () => ({
  LocalStorageService: vi.fn().mockImplementation(() => ({
    uploadFile: vi.fn(async (file: any) => ({ storageKey: `generic-${state.documents.length}`, fileUrl: '', fileSize: file.size, mimeType: file.mimetype })),
    readFile: vi.fn(async () => Buffer.from('test')),
    deleteFile: vi.fn(async () => true),
    getFileUrl: vi.fn(async () => ''),
  })),
  privateDocumentStorage: {
    uploadFile: vi.fn(async (file: any) => ({ storageKey: `data-${state.documents.length}`, fileUrl: '', fileSize: file.size, mimeType: file.mimetype })),
    readFile: vi.fn(async () => Buffer.from('%PDF-test')),
    deleteFile: vi.fn(async () => true),
  },
  isSupportedProcurementFile: vi.fn((file: any) => file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-'),
}));
vi.mock('../src/models/DataRequest', () => ({
  DataRequestModel: {
    create: vi.fn(async (values: any) => {
      const request = makeRequest(values);
      state.requests.push(request);
      return request;
    }),
    find: vi.fn((query: any) => queryResult(state.requests.filter((request) => queryMatches(request, query)))),
    findOne: vi.fn((query: any) => queryResult(state.requests.find((request) => queryMatches(request, query)) || null)),
  },
}));
vi.mock('../src/models/QuestionResponse', () => ({
  QuestionResponseModel: {
    exists: vi.fn(async (query: any) => state.responses.find((response) => queryMatches(response, query)) || null),
    find: vi.fn((query: any) => queryResult(state.responses.filter((response) => queryMatches(response, query)))),
    findOneAndUpdate: vi.fn((query: any, update: any) => {
      let response = state.responses.find((item) => queryMatches(item, query));
      if (!response) {
        response = { ...update.$setOnInsert, _id: `response-${++state.nextId}` };
        state.responses.push(response);
      }
      Object.assign(response, update.$set || {});
      for (const [key, value] of Object.entries(update.$addToSet || {})) {
        response[key] = response[key] || [];
        if (!response[key].some((item: any) => stringId(item) === stringId(value))) response[key].push(value);
      }
      return queryResult(response);
    }),
    updateMany: vi.fn(async (query: any, update: any) => {
      state.responses.filter((response) => queryMatches(response, query)).forEach((response) => Object.assign(response, update.$set));
      return { modifiedCount: 0 };
    }),
  },
}));
vi.mock('../src/models/QuestionnaireTemplate', () => ({
  QuestionnaireTemplateModel: {
    findOne: vi.fn(async (query: any) => state.templates.find((template) => queryMatches(template, query)) || null),
    find: vi.fn((query: any) => queryResult(state.templates.filter((template) => queryMatches(template, query)))),
    findOneAndUpdate: vi.fn(async (query: any, update: any) => {
      let template = state.templates.find((candidate) => queryMatches(candidate, query));
      if (!template && update.$setOnInsert) {
        template = { ...update.$setOnInsert, _id: String(++state.nextId).padStart(24, '0') };
        state.templates.push(template);
      }
      return template;
    }),
  },
}));
vi.mock('../src/models/Supplier', () => ({
  SupplierModel: {
    findById: vi.fn(async (id: string) => state.suppliers.find((supplier) => supplier._id === stringId(id)) || null),
    findOne: vi.fn(async (query: any) => state.suppliers.find((supplier) => queryMatches(supplier, query)) || null),
    find: vi.fn(async (query: any) => state.suppliers.filter((supplier) => query.organizationId.$in.some((id: any) => stringId(id) === supplier.organizationId))),
  },
}));
vi.mock('../src/models/Organization', () => ({
  OrganizationModel: {
    findById: vi.fn(async (id: string) => state.organizations.find((organization) => organization._id === stringId(id)) || null),
    findOne: vi.fn(async (query: any) => state.organizations.find((organization) => queryMatches(organization, query)) || null),
    find: vi.fn(async () => state.organizations),
  },
}));
vi.mock('../src/models/SupplierRelationship', () => ({
  SupplierRelationshipModel: {
    findOne: vi.fn(async (query: any) => state.relationships.find((relationship) => queryMatches(relationship, query)) || null),
    find: vi.fn(async (query: any) => state.relationships.filter((relationship) => queryMatches(relationship, query))),
  },
}));
vi.mock('../src/models/Product', () => ({
  ProductModel: {
    findById: vi.fn(async (id: string) => state.products.find((product) => product._id === stringId(id)) || null),
    findOne: vi.fn(async (query: any) => state.products.find((product) => queryMatches(product, query)) || null),
    find: vi.fn((query: any) => queryResult(state.products.filter((product) => queryMatches(product, query)))),
  },
}));
vi.mock('../src/models/Document', () => ({
  DocumentModel: {
    create: vi.fn(async (values: any) => {
      const document = { ...values, _id: String(++state.nextId).padStart(24, '0'), uploadedAt: new Date(), save: vi.fn(async () => document) };
      state.documents.push(document);
      return document;
    }),
    findById: vi.fn(async (id: any) => state.documents.find((document) => stringId(document._id) === stringId(id)) || null),
    deleteOne: vi.fn(async ({ _id }: any) => { state.documents = state.documents.filter((document) => document._id !== _id); }),
    find: vi.fn((query: any) => queryResult(state.documents.filter((document) => queryMatches(document, query)))),
    findOne: vi.fn((query: any) => queryResult(state.documents.find((document) => queryMatches(document, query)) || null)),
  },
}));
vi.mock('../src/models/OrganizationMember', () => ({
  OrganizationMemberModel: {
    find: vi.fn(async (query: any) => state.members.filter((member) => queryMatches(member, query))),
    findOne: vi.fn(async (query: any) => state.members.find((member) => queryMatches(member, query)) || null),
  },
}));
vi.mock('../src/models/Notification', () => ({
  NotificationModel: { insertMany: vi.fn(async (items: any[]) => { state.notifications.push(...items); }) },
}));
vi.mock('../src/models/Claim', () => ({
  ClaimModel: {
    findOne: vi.fn(async (query: any) => state.claims.find((claim) => Object.entries(query).every(([key, expected]) => {
      const actual = key.split('.').reduce((value: any, part) => value?.[part], claim);
      return stringId(actual) === stringId(expected);
    })) || null),
    create: vi.fn(async (values: any) => {
      const claim = { ...values, _id: `claim-${++state.nextId}` };
      state.claims.push(claim);
      return claim;
    }),
    findById: vi.fn(async (id: any) => state.claims.find((claim) => stringId(claim._id) === stringId(id)) || null),
  },
}));
vi.mock('../src/models/ClaimEvidenceLink', () => ({
  ClaimEvidenceLinkModel: {
    create: vi.fn(async (values: any) => {
      const link = { ...values, _id: `evidence-${++state.nextId}` };
      state.evidenceLinks.push(link);
      return link;
    }),
    findOne: vi.fn(async (query: any) => state.evidenceLinks.find((link) => queryMatches(link, query)) || null),
    find: vi.fn((query: any) => queryResult(state.evidenceLinks.filter((link) => queryMatches(link, query)))),
  },
}));
vi.mock('../src/models/DocumentExtraction', () => ({
  DocumentExtractionModel: {
    findOne: vi.fn((query: any) => {
      const extraction = state.extractions.find((item) => queryMatches(item, query)) || null;
      return { ...queryResult(extraction), sort: () => queryResult(extraction) };
    }),
    create: vi.fn(async (values: any) => {
      const extraction = { ...values, _id: `extraction-${++state.nextId}` };
      state.extractions.push(extraction);
      return extraction;
    }),
  },
}));
vi.mock('../src/models/VerificationRun', () => ({
  VerificationRunModel: {
    find: vi.fn((query: any) => queryResult(state.verificationRuns.filter((run) => queryMatches(run, query)))),
  },
}));
vi.mock('../src/models/User', () => ({
  UserModel: { findById: vi.fn(async () => ({ email: 'buyer-a@example.test' })) },
}));
vi.mock('../src/models/AuditLog', () => ({
  AuditLogModel: {
    create: vi.fn(async (values: any) => {
      state.auditLogs.push(values);
      return values;
    }),
  },
}));

const baseRequest = {
  _id: ids.requestA,
  customerOrganizationId: ids.buyerA,
  supplierOrganizationId: ids.supplierOrgA,
  createdBy: ids.buyerUser,
  title: 'Steel sustainability data - 2026',
  description: 'Provide current product information.',
  status: DataRequestStatus.SENT,
  requestedItems: [
    { _id: ids.itemText, label: 'Methodology', responseType: DataRequestResponseType.TEXT, required: true },
    { _id: ids.itemDoc, label: 'EPD', responseType: DataRequestResponseType.DOCUMENT, required: false },
  ],
  allowPartialSubmission: false,
};

const buyerA = { userId: ids.buyerUser, organizationId: ids.buyerA, organizationType: 'CUSTOMER', role: 'CUSTOMER_ADMIN', email: 'buyer-a@example.test' } as any;
const buyerB = { ...buyerA, organizationId: ids.buyerB };
const supplierUserA = { userId: '444444444444444444444444', organizationId: ids.supplierOrgA, organizationType: 'SUPPLIER', role: 'SUPPLIER_ADMIN', email: 'supplier-a@example.test' } as any;
const supplierUserB = { ...supplierUserA, organizationId: ids.supplierOrgB };

function resetState() {
  state.requests = [];
  state.responses = [];
  state.suppliers = [
    { _id: ids.supplierA, organizationId: ids.supplierOrgA, status: 'ACTIVE' },
    { _id: ids.supplierB, organizationId: ids.supplierOrgB, status: 'ACTIVE' },
  ];
  state.organizations = [
    { _id: ids.buyerA, name: 'Buyer A', type: 'CUSTOMER' },
    { _id: ids.buyerB, name: 'Buyer B', type: 'CUSTOMER' },
    { _id: ids.supplierOrgA, name: 'Supplier A', type: 'SUPPLIER' },
    { _id: ids.supplierOrgB, name: 'Supplier B', type: 'SUPPLIER' },
  ];
  state.relationships = [{ customerOrganizationId: ids.buyerA, supplierOrganizationId: ids.supplierOrgA, status: 'ACTIVE' }];
  state.products = [
    { _id: ids.productA, supplierId: ids.supplierA, name: 'Steel Sheet', category: 'Steel', status: 'ACTIVE' },
    { _id: ids.productB, supplierId: ids.supplierB, name: 'Other Product', category: 'Other', status: 'ACTIVE' },
  ];
  state.suppliers[0].industry = 'Metals';
  state.documents = [];
  state.templates = [];
  state.notifications = [];
  state.claims = [];
  state.evidenceLinks = [];
  state.extractions = [];
  state.verificationRuns = [];
  state.auditLogs = [];
  state.members = [
    { organizationId: ids.supplierOrgA, userId: '555555555555555555555555', status: 'ACTIVE' },
    { organizationId: ids.buyerA, userId: ids.buyerUser, status: 'ACTIVE' },
  ];
  state.nextId = 0;
}

describe('buyer-to-supplier data requests', () => {
  let server: Server;
  let apiUrl: string;
  const tokenFor = (user: any) => jwt.sign(user, ENV.JWT_SECRET);

  beforeAll(async () => {
    await new Promise<void>((resolve) => { server = createApp().listen(0, '127.0.0.1', resolve); });
    apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(resetState);

  it('creates a buyer-owned draft, validates supplier/product links, and sends an in-app notification', async () => {
    await expect(dataRequestsService.create({
      supplierId: ids.supplierB,
      title: 'Test',
      requestedItems: [{ label: 'PCF', responseType: 'DOCUMENT', required: true }],
    }, buyerA)).rejects.toMatchObject({ statusCode: 403 });
    await expect(dataRequestsService.create({
      supplierId: ids.supplierA,
      productId: ids.productB,
      title: 'Test',
      requestedItems: [{ label: 'PCF', responseType: 'DOCUMENT', required: true }],
    }, buyerA)).rejects.toMatchObject({ code: 'INVALID_PRODUCT' });

    const request = await dataRequestsService.create({
      supplierId: ids.supplierA,
      productId: ids.productA,
      title: 'Steel sustainability data - 2026',
      description: '',
      requestedItems: [{ label: 'PCF report', responseType: 'DOCUMENT', required: true }],
    }, buyerA);
    expect(request).toMatchObject({ status: 'DRAFT', createdBy: ids.buyerUser, productId: ids.productA });

    const sent = await dataRequestsService.send(ids.requestA, buyerA);
    expect(sent.status).toBe('SENT');
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({ organizationId: ids.supplierOrgA, title: 'New data request' });
  });

  it('creates one request with multiple document requirements and a questionnaire question', async () => {
    const request = await dataRequestsService.create({
      supplierId: ids.supplierA,
      title: 'Sustainability evidence collection',
      requestedItems: [
        {
          key: 'pcf',
          label: 'Product Carbon Footprint',
          responseType: 'DOCUMENT',
          required: true,
          acceptedDocumentTypes: ['PCF_REPORT'],
        },
        {
          key: 'epd',
          label: 'Environmental Product Declaration',
          responseType: 'DOCUMENT',
          required: true,
          acceptedDocumentTypes: ['EPD'],
        },
        {
          key: 'renewable_energy',
          label: 'Renewable electricity share',
          responseType: 'DECIMAL',
          required: false,
          unit: '%',
        },
      ],
    }, buyerA);

    expect(request.requestedItems).toHaveLength(3);
    expect(request.requestedItems[0]).toMatchObject({
      label: 'Product Carbon Footprint',
      acceptedDocumentTypes: ['PCF_REPORT'],
    });
    expect(request.requestedItems[1]).toMatchObject({
      label: 'Environmental Product Declaration',
      acceptedDocumentTypes: ['EPD'],
    });
    expect(request.requestedItems[2]).toMatchObject({
      label: 'Renewable electricity share',
      responseType: 'DECIMAL',
      required: false,
    });
  });

  it('prevents buyers and suppliers from reading another organization request over HTTP', async () => {
    state.requests.push(makeRequest(baseRequest));
    const buyerResponse = await fetch(`${apiUrl}/api/data-requests/${ids.requestA}`, {
      headers: { Authorization: `Bearer ${tokenFor(buyerB)}` },
    });
    const otherSupplierResponse = await fetch(`${apiUrl}/api/data-requests/${ids.requestA}`, {
      headers: { Authorization: `Bearer ${tokenFor(supplierUserB)}` },
    });
    const intendedSupplierResponse = await fetch(`${apiUrl}/api/data-requests/${ids.requestA}`, {
      headers: { Authorization: `Bearer ${tokenFor(supplierUserA)}` },
    });
    expect(buyerResponse.status).toBe(404);
    expect(otherSupplierResponse.status).toBe(404);
    expect(intendedSupplierResponse.status).toBe(200);
  });

  it('saves structured drafts, allows missing optional items, and submits completed required items', async () => {
    state.requests.push(makeRequest(baseRequest));
    await dataRequestsService.saveResponse(ids.requestA, ids.itemText, { value: 'Mass balance' }, supplierUserA);
    const inProgress = state.requests[0];
    expect(inProgress.status).toBe('IN_PROGRESS');
    const submitted = await dataRequestsService.submit(ids.requestA, supplierUserA);
    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.completion).toMatchObject({
      completed: 1,
      total: 2,
      required: { completed: 1, total: 1 },
      optional: { completed: 0, total: 1 },
      missingRequiredItems: [],
    });
    expect(state.responses[0]).toMatchObject({ value: 'Mass balance', status: 'SUBMITTED' });
    expect(state.notifications.at(-1)).toMatchObject({ organizationId: ids.buyerA, title: 'Supplier submitted a data request' });
  });

  it('returns persisted required and optional progress in the supplier request list', async () => {
    state.requests.push(makeRequest({
      ...baseRequest,
      requestedItems: [
        { _id: ids.itemDoc, key: 'epd', label: 'EPD', responseType: 'DOCUMENT', required: true },
        { _id: ids.itemNumber, key: 'renewable', label: 'Renewable certificate', responseType: 'DOCUMENT', required: false },
      ],
    }));
    state.responses.push({
      _id: 'persisted-document-response',
      dataRequestId: ids.requestA,
      supplierId: ids.supplierA,
      requestedItemId: ids.itemDoc,
      value: 'Document attached',
      evidenceDocumentIds: ['doc-persisted'],
    });
    state.documents.push({
      _id: 'doc-persisted',
      organizationId: ids.supplierOrgA,
      supplierId: ids.supplierA,
      dataRequestId: ids.requestA,
      requestedItemId: ids.itemDoc,
      filename: 'epd.pdf',
      type: 'EPD',
      status: 'EXTRACTED',
    });

    const [listed] = await dataRequestsService.list(supplierUserA);

    expect(listed.completion).toMatchObject({
      required: { completed: 1, total: 1 },
      optional: { completed: 0, total: 1 },
      missingRequiredItems: [],
    });
  });

  it('identifies questionnaire PCF claims with provenance and linked request evidence', async () => {
    state.requests.push(makeRequest({
      ...baseRequest,
      productId: ids.productA,
      requestedItems: [{
        _id: ids.itemNumber,
        key: 'product_carbon_footprint',
        label: 'Product carbon footprint',
        responseType: DataRequestResponseType.DECIMAL,
        required: true,
        requiresEvidence: true,
        unit: 'tCO2e/tonne',
      }],
    }));
    await dataRequestsService.uploadResponseDocument(ids.requestA, ids.itemNumber, {
      originalname: 'pcf-test.pdf', mimetype: 'application/pdf', size: 9, buffer: Buffer.from('%PDF-test'),
    } as Express.Multer.File, supplierUserA);
    await dataRequestsService.saveResponse(ids.requestA, ids.itemNumber, { value: 1.42, unit: 'tCO2e/tonne' }, supplierUserA);

    await dataRequestsService.submit(ids.requestA, supplierUserA);

    expect(state.claims).toHaveLength(1);
    expect(state.claims[0]).toMatchObject({
      supplierId: ids.supplierA,
      buyerOrganizationId: ids.buyerA,
      productId: ids.productA,
      dataRequestId: ids.requestA,
      type: 'PCF_VALUE',
      value: 1.42,
      unit: 'tCO2e/tonne',
      status: 'PENDING',
      normalizedData: { originalValue: 1.42, normalizedValue: 1.42, normalizedUnit: 'kgCO2e/kg' },
    });
    expect(state.claims[0].sourceReference.questionResponseId).toBe(state.responses[0]._id);
    expect(state.evidenceLinks).toHaveLength(1);
    expect(state.evidenceLinks[0]).toMatchObject({
      claimId: state.claims[0]._id,
      documentId: state.documents[0]._id,
      relationshipType: 'QUESTIONNAIRE_SUPPORT',
    });
    expect(state.auditLogs.some((entry) => entry.action === 'CLAIM_CREATED')).toBe(true);
  });

  it('blocks incomplete required and evidence-required items unless partial submission is allowed', async () => {
    state.requests.push(makeRequest({
      ...baseRequest,
      allowPartialSubmission: false,
      requestedItems: [{ _id: ids.itemNumber, label: 'Recycled content', responseType: 'NUMBER', required: true, requiresEvidence: true, unit: '%' }],
    }));
    await dataRequestsService.saveResponse(ids.requestA, ids.itemNumber, { value: 65, unit: '%' }, supplierUserA);
    await expect(dataRequestsService.submit(ids.requestA, supplierUserA)).rejects.toMatchObject({ code: 'REQUIRED_RESPONSES_MISSING' });

    state.requests[0].allowPartialSubmission = true;
    const partial = await dataRequestsService.submit(ids.requestA, supplierUserA);
    expect(partial.status).toBe('IN_PROGRESS');
    expect(partial.completion.missingRequiredItems).toEqual([{ _id: ids.itemNumber, label: 'Recycled content' }]);
  });

  it('shows renewable follow-ups only after yes and excludes them after no', async () => {
    state.requests.push(makeRequest({
      ...baseRequest,
      requestedItems: [
        { _id: ids.itemText, key: 'renewable_use', label: 'Do you use renewable electricity?', responseType: 'YES_NO', required: true, order: 0 },
        { _id: ids.itemNumber, key: 'renewable_share', label: 'Renewable electricity share', responseType: 'DECIMAL', required: true, unit: '%', order: 1, conditions: [{ questionKey: 'renewable_use', operator: 'EQUALS', value: 'YES' }] },
      ],
    }));

    const initial = await dataRequestsService.getById(ids.requestA, supplierUserA);
    expect(initial.requestedItems.find((item: any) => item.key === 'renewable_share').visible).toBe(false);
    expect(initial.completion.total).toBe(1);

    await dataRequestsService.saveResponse(ids.requestA, ids.itemText, { value: 'NO' }, supplierUserA);
    const noRenewables = await dataRequestsService.getById(ids.requestA, supplierUserA);
    expect(noRenewables.requestedItems.find((item: any) => item.key === 'renewable_share').visible).toBe(false);
    expect(noRenewables.completion.missingRequiredItems).toHaveLength(0);
    await expect(dataRequestsService.saveResponse(ids.requestA, ids.itemNumber, { value: 40 }, supplierUserA))
      .rejects.toMatchObject({ code: 'QUESTION_NOT_ACTIVE' });
    expect((await dataRequestsService.submit(ids.requestA, supplierUserA)).status).toBe('SUBMITTED');

    const yesRequest = makeRequest({
      ...baseRequest,
      _id: '555555555555555555555555',
      status: DataRequestStatus.SENT,
      requestedItems: [
        { _id: ids.itemText, key: 'renewable_use', label: 'Do you use renewable electricity?', responseType: 'YES_NO', required: true, order: 0 },
        { _id: ids.itemNumber, key: 'renewable_share', label: 'Renewable electricity share', responseType: 'DECIMAL', required: true, unit: '%', order: 1, conditions: [{ questionKey: 'renewable_use', operator: 'EQUALS', value: 'YES' }] },
      ],
    });
    state.requests.push(yesRequest);
    await dataRequestsService.saveResponse(yesRequest._id, ids.itemText, { value: 'YES' }, supplierUserA);
    const yesRenewables = await dataRequestsService.getById(yesRequest._id, supplierUserA);
    expect(yesRenewables.requestedItems.find((item: any) => item.key === 'renewable_share').visible).toBe(true);
    expect(yesRenewables.completion.missingRequiredItems.map((item: any) => item.label)).toContain('Renewable electricity share');
  });

  it('stores typed boolean and multi-select answers and rejects unconfigured options', async () => {
    state.requests.push(makeRequest({
      ...baseRequest,
      requestedItems: [
        { _id: ids.itemText, key: 'recycled_material', label: 'Contains recycled material?', responseType: 'BOOLEAN', required: true, order: 0 },
        { _id: ids.itemNumber, key: 'material_types', label: 'Material types', responseType: 'MULTI_SELECT', required: true, options: ['Steel', 'Aluminium', 'Plastic'], order: 1 },
      ],
    }));
    await dataRequestsService.saveResponse(ids.requestA, ids.itemText, { value: 'true' }, supplierUserA);
    await dataRequestsService.saveResponse(ids.requestA, ids.itemNumber, { value: ['Steel', 'Aluminium'] }, supplierUserA);
    expect(state.responses[0].value).toBe(true);
    expect(state.responses[1].value).toEqual(['Steel', 'Aluminium']);
    await expect(dataRequestsService.saveResponse(ids.requestA, ids.itemNumber, { value: ['Glass'] }, supplierUserA))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('seeds reusable questionnaire templates in Mongo and filters them by the authorized product context', async () => {
    const allTemplates = await questionnaireTemplatesService.list();
    expect(allTemplates.map((template: any) => template.name)).toContain('Steel Supplier');
    expect(allTemplates.map((template: any) => template.name)).toContain('Packaging Supplier');
    const steelTemplates = await questionnaireTemplatesService.list(ids.productA, buyerA);
    expect(steelTemplates.map((template: any) => template.name)).toContain('Steel Supplier');
    expect(steelTemplates.map((template: any) => template.name)).not.toContain('Packaging Supplier');
    const steelTemplate = state.templates.find((template) => template.name === 'Steel Supplier');
    expect(steelTemplate.questions.find((question: any) => question.key === 'renewable_percentage').conditions).toEqual([
      { questionKey: 'renewable_electricity', operator: 'EQUALS', value: 'YES' },
    ]);

    const created = await dataRequestsService.create({
      supplierId: ids.supplierA,
      productId: ids.productA,
      templateId: steelTemplate._id,
      title: 'Steel data collection',
      requestedItems: steelTemplate.questions,
    }, buyerA);
    expect(created.templateId).toBe(steelTemplate._id);
    expect(created.requestedItems.length).toBeGreaterThan(10);

    const buyerToken = tokenFor(buyerA);
    const matchingResponse = await fetch(`${apiUrl}/api/questionnaires/templates?productId=${ids.productA}`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    expect(matchingResponse.status).toBe(200);
    const matching = await matchingResponse.json();
    expect(matching.data.some((template: any) => template.name === 'Steel Supplier')).toBe(true);

    const foreignResponse = await fetch(`${apiUrl}/api/questionnaires/templates?productId=${ids.productB}`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    expect(foreignResponse.status).toBe(403);
  });

  it('exposes previous submitted answers only to the supplier that owns them', async () => {
    const current = makeRequest({
      ...baseRequest,
      requestedItems: [{ _id: ids.itemNumber, key: 'recycled_content', label: 'Recycled content', responseType: 'DECIMAL', category: 'MATERIAL', required: true, order: 0 }],
    });
    state.requests.push(current);
    state.responses.push({
      _id: 'response-history',
      dataRequestId: '444444444444444444444444',
      supplierId: ids.supplierA,
      requestedItemId: '333333333333333333333333',
      field: 'recycled_content',
      value: 65,
      unit: '%',
      status: 'SUBMITTED',
    });

    const supplierView = await dataRequestsService.getById(ids.requestA, supplierUserA);
    expect(supplierView.requestedItems[0].previouslySubmitted).toMatchObject({ value: 65, unit: '%' });
    const buyerView = await dataRequestsService.getById(ids.requestA, buyerA);
    expect(buyerView.requestedItems[0].previouslySubmitted).toBeUndefined();
  });

  it('stores request evidence with request and item associations and then accepts completion', async () => {
    state.requests.push(makeRequest({
      ...baseRequest,
      requestedItems: [{ _id: ids.itemDoc, label: 'EPD', responseType: 'DOCUMENT', required: true }],
    }));
    const upload = await dataRequestsService.uploadResponseDocument(ids.requestA, ids.itemDoc, {
      originalname: 'epd.pdf', mimetype: 'application/pdf', size: 9, buffer: Buffer.from('%PDF-test'),
    } as Express.Multer.File, supplierUserA);
    expect(state.documents[0]).toMatchObject({
      organizationId: ids.supplierOrgA,
      supplierId: ids.supplierA,
      dataRequestId: ids.requestA,
      requestedItemId: ids.itemDoc,
    });
    expect(upload.filename).toBe('epd.pdf');
    const submitted = await dataRequestsService.submit(ids.requestA, supplierUserA);
    expect(submitted.status).toBe('SUBMITTED');
    const completed = await dataRequestsService.complete(ids.requestA, buyerA);
    expect(completed.status).toBe('COMPLETED');
  });

  it('links multiple uploaded documents to their separate requirements in one request', async () => {
    state.requests.push(makeRequest({
      ...baseRequest,
      requestedItems: [
        { _id: ids.itemDoc, key: 'epd', label: 'EPD', responseType: 'DOCUMENT', required: true, acceptedDocumentTypes: ['EPD'] },
        { _id: ids.itemNumber, key: 'energy', label: 'Electricity Consumption Report', responseType: 'DOCUMENT', required: true, acceptedDocumentTypes: ['ENERGY_REPORT'] },
      ],
    }));

    const epd = await dataRequestsService.uploadResponseDocument(ids.requestA, ids.itemDoc, {
      originalname: 'epd.pdf', mimetype: 'application/pdf', size: 9, buffer: Buffer.from('%PDF-one'),
    } as Express.Multer.File, supplierUserA);
    const energy = await dataRequestsService.uploadResponseDocument(ids.requestA, ids.itemNumber, {
      originalname: 'energy.pdf', mimetype: 'application/pdf', size: 9, buffer: Buffer.from('%PDF-two'),
    } as Express.Multer.File, supplierUserA);

    expect(state.documents).toHaveLength(2);
    expect(state.documents.find((document) => document._id === epd._id)).toMatchObject({
      requestedItemId: ids.itemDoc,
      dataRequestId: ids.requestA,
      type: 'EPD',
    });
    expect(state.documents.find((document) => document._id === energy._id)).toMatchObject({
      requestedItemId: ids.itemNumber,
      dataRequestId: ids.requestA,
      type: 'ENERGY_REPORT',
    });
  });

  it('supports multiple documents for one requirement and rejects duplicate file content', async () => {
    state.requests.push(makeRequest({
      ...baseRequest,
      requestedItems: [{ _id: ids.itemDoc, label: 'Energy Consumption Evidence', responseType: 'DOCUMENT', required: true }],
    }));
    const firstBuffer = Buffer.from('%PDF-energy-march');
    const first = await dataRequestsService.uploadResponseDocument(ids.requestA, ids.itemDoc, {
      originalname: 'march.pdf', mimetype: 'application/pdf', size: firstBuffer.length, buffer: firstBuffer,
    } as Express.Multer.File, supplierUserA);
    const secondBuffer = Buffer.from('%PDF-energy-april');
    const second = await dataRequestsService.uploadResponseDocument(ids.requestA, ids.itemDoc, {
      originalname: 'april.pdf', mimetype: 'application/pdf', size: secondBuffer.length, buffer: secondBuffer,
    } as Express.Multer.File, supplierUserA);

    expect(state.documents).toHaveLength(2);
    expect(state.documents.map((document) => document.requestedItemId)).toEqual([ids.itemDoc, ids.itemDoc]);
    expect(state.responses[0].evidenceDocumentIds).toEqual([first._id, second._id]);
    await expect(dataRequestsService.uploadResponseDocument(ids.requestA, ids.itemDoc, {
      originalname: 'duplicate.pdf', mimetype: 'application/pdf', size: firstBuffer.length, buffer: firstBuffer,
    } as Express.Multer.File, supplierUserA)).rejects.toMatchObject({ code: 'DUPLICATE_DOCUMENT' });
    expect(state.documents).toHaveLength(2);
  });

  it('replaces a document without deleting historical request evidence', async () => {
    state.requests.push(makeRequest({
      ...baseRequest,
      requestedItems: [{ _id: ids.itemDoc, label: 'ISO Certificate', responseType: 'DOCUMENT', required: true }],
    }));
    const previous = await dataRequestsService.uploadResponseDocument(ids.requestA, ids.itemDoc, {
      originalname: 'iso-v1.pdf', mimetype: 'application/pdf', size: 9, buffer: Buffer.from('%PDF-v1'),
    } as Express.Multer.File, supplierUserA);
    const replacement = await dataRequestsService.uploadResponseDocument(ids.requestA, ids.itemDoc, {
      originalname: 'iso-v2.pdf', mimetype: 'application/pdf', size: 9, buffer: Buffer.from('%PDF-v2'),
    } as Express.Multer.File, supplierUserA, previous._id);

    expect(state.documents).toHaveLength(2);
    expect(state.documents.find((document) => document._id === previous._id)).toMatchObject({
      status: 'ARCHIVED',
      replacedByDocumentId: replacement._id,
    });
    expect(state.documents.find((document) => document._id === replacement._id)).toMatchObject({
      replacesDocumentId: previous._id,
      requestedItemId: ids.itemDoc,
    });
    expect(state.responses[0].evidenceDocumentIds).toEqual([previous._id, replacement._id]);
  });

  it('reuses previously uploaded evidence through a new request-scoped document link', async () => {
    state.requests.push(makeRequest({
      ...baseRequest,
      requestedItems: [{ _id: ids.itemDoc, key: 'epd', label: 'EPD', responseType: 'DOCUMENT', required: true, order: 0 }],
    }));
    state.documents.push({
      _id: '555555555555555555555555',
      organizationId: ids.supplierOrgA,
      supplierId: ids.supplierA,
      filename: 'prior-epd.pdf',
      type: 'OTHER',
      mimeType: 'application/pdf',
      fileSize: 100,
      storageKey: 'existing-private-key',
    });

    const reused = await dataRequestsService.reuseExistingDocument(ids.requestA, ids.itemDoc, '555555555555555555555555', supplierUserA);
    const linkedDocument = state.documents.find((document) => document._id === reused._id);
    expect(linkedDocument).toMatchObject({
      dataRequestId: ids.requestA,
      requestedItemId: ids.itemDoc,
      storageKey: 'existing-private-key',
    });
    expect(state.documents).toHaveLength(2);
  });

  it('rejects invalid uploads and prevents another supplier from attaching files', async () => {
    state.requests.push(makeRequest(baseRequest));
    await expect(dataRequestsService.uploadResponseDocument(ids.requestA, ids.itemDoc, {
      originalname: 'fake.pdf', mimetype: 'application/pdf', size: 4, buffer: Buffer.from('nope'),
    } as Express.Multer.File, supplierUserA)).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
    await expect(dataRequestsService.uploadResponseDocument(ids.requestA, ids.itemDoc, {
      originalname: 'real.pdf', mimetype: 'application/pdf', size: 9, buffer: Buffer.from('%PDF-test'),
    } as Express.Multer.File, supplierUserB)).rejects.toMatchObject({ statusCode: 404 });
    expect(state.documents).toHaveLength(0);
  });

  it('serves request evidence only to the buyer and supplier on that request', async () => {
    state.requests.push(makeRequest(baseRequest));
    state.documents.push({
      _id: '555555555555555555555555',
      dataRequestId: ids.requestA,
      requestedItemId: ids.itemDoc,
      organizationId: ids.supplierOrgA,
      filename: 'epd.pdf',
      mimeType: 'application/pdf',
      storageKey: 'private-epd.pdf',
    });
    const buyerDownload = await dataRequestsService.readEvidenceDocument(ids.requestA, '555555555555555555555555', buyerA);
    expect(buyerDownload).toMatchObject({ filename: 'epd.pdf', mimeType: 'application/pdf' });
    const supplierDownload = await dataRequestsService.readEvidenceDocument(ids.requestA, '555555555555555555555555', supplierUserA);
    expect(supplierDownload.filename).toBe('epd.pdf');
    await expect(dataRequestsService.readEvidenceDocument(ids.requestA, '555555555555555555555555', buyerB))
      .rejects.toMatchObject({ statusCode: 404 });
    await expect(dataRequestsService.readEvidenceDocument(ids.requestA, '555555555555555555555555', supplierUserB))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('reopens submitted requests for clarification and locks completed submissions', async () => {
    const request = makeRequest({ ...baseRequest, status: DataRequestStatus.SUBMITTED });
    state.requests.push(request);
    const reopened = await dataRequestsService.requestClarification(ids.requestA, {
      message: 'Please provide the calculation methodology.',
      itemIds: [ids.itemText],
    }, buyerA);
    expect(reopened.status).toBe('NEEDS_CLARIFICATION');
    expect(state.notifications.at(-1)).toMatchObject({ organizationId: ids.supplierOrgA, type: 'WARNING' });

    await dataRequestsService.saveResponse(ids.requestA, ids.itemText, { value: 'Updated method' }, supplierUserA);
    expect(request.status).toBe('IN_PROGRESS');
    const resubmitted = await dataRequestsService.submit(ids.requestA, supplierUserA);
    expect(resubmitted.status).toBe('SUBMITTED');
    await dataRequestsService.complete(ids.requestA, buyerA);
    await expect(dataRequestsService.requestClarification(ids.requestA, { message: 'Again' }, buyerA))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('rejects unauthenticated direct API access', async () => {
    const response = await fetch(`${apiUrl}/api/data-requests`);
    expect(response.status).toBe(401);
  });
});