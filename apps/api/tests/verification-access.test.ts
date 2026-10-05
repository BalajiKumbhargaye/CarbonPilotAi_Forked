import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { ENV } from '../src/config/env';
import { claimService } from '../src/modules/claims';
import { documentService } from '../src/modules/documents';
import { verificationService } from '../src/modules/verification';

const ids = {
  buyerA: '111111111111111111111111',
  buyerB: '222222222222222222222222',
  supplierOrg: '333333333333333333333333',
  supplierUserOrg: '444444444444444444444444',
  supplierId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  claimId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  documentId: 'cccccccccccccccccccccccc',
  requestA: 'dddddddddddddddddddddddd',
  requestB: 'eeeeeeeeeeeeeeeeeeeeeeee',
};

const state = vi.hoisted(() => ({
  relationship: null as null | Record<string, unknown>,
  claim: null as null | Record<string, unknown>,
  document: null as null | Record<string, unknown>,
  requests: [] as Array<Record<string, unknown>>,
  documentFilter: null as null | Record<string, unknown>,
  claimFilter: null as null | Record<string, unknown>,
  accessibleClaims: [] as Array<{ _id: string }>,
  issueFilter: null as null | Record<string, unknown>,
}));

vi.mock('../src/config/database', () => ({ isDatabaseConnected: () => true }));
vi.mock('../src/models/Claim', () => ({
  ClaimModel: {
    findById: vi.fn(async (id: string) => id === ids.claimId
      ? state.claim || { _id: ids.claimId, supplierId: ids.supplierId }
      : null),
    find: vi.fn((filter: Record<string, unknown>) => {
      state.claimFilter = filter;
      const query = {
        populate: vi.fn(() => query),
        select: vi.fn(async () => state.accessibleClaims),
        sort: vi.fn(async () => []),
      };
      return query;
    }),
  },
}));
vi.mock('../src/models/Supplier', () => ({
  SupplierModel: {
    findById: vi.fn(async (id: string) => id === ids.supplierId ? { _id: ids.supplierId, organizationId: ids.supplierOrg } : null),
    find: vi.fn(async ({ organizationId }: { organizationId: { $in: string[] } }) =>
      organizationId.$in.includes(ids.supplierOrg)
        ? [{ _id: ids.supplierId, organizationId: ids.supplierOrg }]
        : []
    ),
  },
}));
vi.mock('../src/models/SupplierRelationship', () => ({
  SupplierRelationshipModel: {
    findOne: vi.fn(async (query: Record<string, unknown>) =>
      query.customerOrganizationId === ids.buyerA ? state.relationship : null
    ),
    find: vi.fn(async ({ customerOrganizationId }: { customerOrganizationId: string }) =>
      customerOrganizationId === ids.buyerA
      && state.relationship?.status === 'ACTIVE'
      && (state.relationship.sharedDataPermissions as { carbon?: boolean } | undefined)?.carbon === true
        ? [state.relationship]
        : []
    ),
  },
}));
vi.mock('../src/models/DataRequest', () => ({
  DataRequestModel: {
    findOne: vi.fn(async (query: Record<string, string>) => state.requests.find((request) =>
      request._id === query._id
      && request.customerOrganizationId === query.customerOrganizationId
      && request.supplierOrganizationId === query.supplierOrganizationId
    ) || null),
    find: vi.fn(async (query: Record<string, string>) =>
      state.requests.filter((request) => request.customerOrganizationId === query.customerOrganizationId)
    ),
  },
}));
vi.mock('../src/models/VerificationRun', () => ({
  VerificationRunModel: {
    find: vi.fn(() => ({ sort: async () => [] })),
  },
}));
vi.mock('../src/models/Anomaly', () => ({
  AnomalyModel: {
    find: vi.fn((filter: Record<string, unknown>) => {
      state.issueFilter = filter;
      return { sort: async () => [] };
    }),
  },
}));
vi.mock('../src/models/Document', () => ({
  DocumentModel: {
    findById: vi.fn(async (id: string) => id === ids.documentId ? state.document : null),
    find: vi.fn((filter: Record<string, unknown>) => {
      state.documentFilter = filter;
      return { sort: async () => [] };
    }),
  },
}));

function token(organizationId: string, organizationType: 'CUSTOMER' | 'SUPPLIER') {
  return jwt.sign({
    userId: '555555555555555555555555',
    organizationId,
    organizationType,
    role: organizationType === 'CUSTOMER' ? 'CUSTOMER_ADMIN' : 'SUPPLIER_ADMIN',
    email: 'test@example.test',
  }, ENV.JWT_SECRET);
}

describe('verification API organization isolation', () => {
  let server: Server;
  let apiUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = createApp().listen(0, '127.0.0.1', resolve);
    });
    apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    state.relationship = {
      customerOrganizationId: ids.buyerA,
      supplierOrganizationId: ids.supplierOrg,
      status: 'ACTIVE',
      sharedDataPermissions: { carbon: true, documents: true },
    };
    state.document = {
      _id: ids.documentId,
      organizationId: ids.supplierOrg,
      supplierId: ids.supplierId,
      filename: 'supplier-evidence.pdf',
    };
    state.claim = { _id: ids.claimId, supplierId: ids.supplierId };
    state.requests = [{
      _id: ids.requestA,
      customerOrganizationId: ids.buyerA,
      supplierOrganizationId: ids.supplierOrg,
    }, {
      _id: ids.requestB,
      customerOrganizationId: ids.buyerB,
      supplierOrganizationId: ids.supplierOrg,
    }];
    state.claimFilter = null;
    state.accessibleClaims = [{ _id: ids.claimId }];
    state.issueFilter = null;
  });

  async function getHistory(organizationId: string, organizationType: 'CUSTOMER' | 'SUPPLIER') {
    return fetch(`${apiUrl}/api/verifications/claim/${ids.claimId}`, {
      headers: { Authorization: `Bearer ${token(organizationId, organizationType)}` },
    });
  }

  it('allows the connected buyer organization to read verification history', async () => {
    const response = await getHistory(ids.buyerA, 'CUSTOMER');
    expect(response.status).toBe(200);
  });

  it('rejects another buyer organization changing the claim ID', async () => {
    const response = await getHistory(ids.buyerB, 'CUSTOMER');
    expect(response.status).toBe(404);
  });

  it('does not let a connected buyer read another buyer request-scoped claim', async () => {
    state.claim = {
      _id: ids.claimId,
      supplierId: ids.supplierId,
      buyerOrganizationId: ids.buyerB,
      dataRequestId: ids.requestB,
    };
    const response = await getHistory(ids.buyerA, 'CUSTOMER');
    expect(response.status).toBe(404);
  });

  it('rejects a different supplier organization reading the claim history', async () => {
    const response = await getHistory(ids.supplierUserOrg, 'SUPPLIER');
    expect(response.status).toBe(404);
  });

  it('prevents suppliers from creating or changing buyer verification outcomes', async () => {
    const response = await fetch(`${apiUrl}/api/verifications/run/${ids.claimId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token(ids.supplierOrg, 'SUPPLIER')}` },
    });
    expect(response.status).toBe(403);
  });

  it('allows only the connected buyer or owning supplier to read a document by ID', async () => {
    const connectedBuyer = await fetch(`${apiUrl}/api/documents/${ids.documentId}`, {
      headers: { Authorization: `Bearer ${token(ids.buyerA, 'CUSTOMER')}` },
    });
    const unrelatedBuyer = await fetch(`${apiUrl}/api/documents/${ids.documentId}`, {
      headers: { Authorization: `Bearer ${token(ids.buyerB, 'CUSTOMER')}` },
    });
    const unrelatedSupplier = await fetch(`${apiUrl}/api/documents/${ids.documentId}`, {
      headers: { Authorization: `Bearer ${token(ids.supplierUserOrg, 'SUPPLIER')}` },
    });
    expect(connectedBuyer.status).toBe(200);
    expect(unrelatedBuyer.status).toBe(404);
    expect(unrelatedSupplier.status).toBe(404);
  });

  it('does not let a connected buyer read another buyer request-scoped document', async () => {
    state.document = {
      ...state.document,
      dataRequestId: ids.requestB,
    };
    await expect(documentService.getById(ids.documentId, {
      userId: '555555555555555555555555',
      organizationId: ids.buyerA,
      organizationType: 'CUSTOMER',
      role: 'CUSTOMER_ADMIN',
      email: 'buyer@example.test',
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('allows the buyer that owns a request to read its request-scoped document', async () => {
    state.document = {
      ...state.document,
      dataRequestId: ids.requestA,
    };
    await expect(documentService.getById(ids.documentId, {
      userId: '555555555555555555555555',
      organizationId: ids.buyerA,
      organizationType: 'CUSTOMER',
      role: 'CUSTOMER_ADMIN',
      email: 'buyer@example.test',
    })).resolves.toBe(state.document);
  });

  it('limits buyer document listings to shared unscoped documents and their own requests', async () => {
    await documentService.getDocuments({
      userId: '555555555555555555555555',
      organizationId: ids.buyerA,
      organizationType: 'CUSTOMER',
      role: 'CUSTOMER_ADMIN',
      email: 'buyer@example.test',
    });
    const filter = state.documentFilter as { $or: Array<Record<string, unknown>> };
    expect(filter.$or).toHaveLength(3);
    expect(filter.$or[1]).toMatchObject({
      supplierId: { $in: [ids.supplierId] },
    });
    expect(filter.$or[1].$or).toEqual([
      { dataRequestId: { $exists: false } },
      { dataRequestId: null },
    ]);
    expect(filter.$or[2]).toMatchObject({
      supplierId: { $in: [ids.supplierId] },
      dataRequestId: { $in: [ids.requestA] },
    });
    expect(JSON.stringify(filter)).not.toContain(ids.requestB);
  });

  it('scopes claim and verification claim lists to this buyer’s requests and shared unscoped claims', async () => {
    const user = {
      userId: '555555555555555555555555',
      organizationId: ids.buyerA,
      organizationType: 'CUSTOMER' as const,
      role: 'CUSTOMER_ADMIN',
      email: 'buyer@example.test',
    };

    await claimService.getAll(user);
    const claimListFilter = state.claimFilter as Record<string, unknown>;
    expect(JSON.stringify(claimListFilter)).toContain(ids.requestA);
    expect(JSON.stringify(claimListFilter)).not.toContain(ids.requestB);
    expect(JSON.stringify(claimListFilter)).toContain(ids.buyerA);

    await verificationService.getClaims(user);
    const verificationListFilter = state.claimFilter as Record<string, unknown>;
    expect(JSON.stringify(verificationListFilter)).toContain(ids.requestA);
    expect(JSON.stringify(verificationListFilter)).not.toContain(ids.requestB);
    expect(JSON.stringify(verificationListFilter)).toContain(ids.buyerA);
  });

  it('does not show unscoped supplier claims when access comes only from a Data Request', async () => {
    state.relationship = null;
    await claimService.getAll({
      userId: '555555555555555555555555',
      organizationId: ids.buyerA,
      organizationType: 'CUSTOMER',
      role: 'CUSTOMER_ADMIN',
      email: 'buyer@example.test',
    });

    const filter = state.claimFilter as { $or: Array<Record<string, unknown>> };
    expect(filter.$or).toHaveLength(1);
    expect(filter.$or[0]).toMatchObject({
      dataRequestId: { $in: [ids.requestA] },
    });
    expect(JSON.stringify(filter)).not.toContain(ids.requestB);
  });

  it('limits buyer verification issues to issues attached to accessible claims', async () => {
    await verificationService.getIssues({
      userId: '555555555555555555555555',
      organizationId: ids.buyerA,
      organizationType: 'CUSTOMER',
      role: 'CUSTOMER_ADMIN',
      email: 'buyer@example.test',
    });

    expect(state.issueFilter).toEqual({
      $or: [
        { claimId: { $in: [ids.claimId] } },
        { buyerOrganizationId: ids.buyerA },
      ],
    });
  });
});