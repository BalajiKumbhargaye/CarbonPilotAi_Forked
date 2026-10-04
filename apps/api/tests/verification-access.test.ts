import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { ENV } from '../src/config/env';

const ids = {
  buyerA: '111111111111111111111111',
  buyerB: '222222222222222222222222',
  supplierOrg: '333333333333333333333333',
  supplierUserOrg: '444444444444444444444444',
  supplierId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  claimId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  documentId: 'cccccccccccccccccccccccc',
};

const state = vi.hoisted(() => ({
  relationship: null as null | Record<string, unknown>,
  document: null as null | Record<string, unknown>,
}));

vi.mock('../src/config/database', () => ({ isDatabaseConnected: () => true }));
vi.mock('../src/models/Claim', () => ({
  ClaimModel: {
    findById: vi.fn(async (id: string) => id === ids.claimId ? { _id: ids.claimId, supplierId: ids.supplierId } : null),
  },
}));
vi.mock('../src/models/Supplier', () => ({
  SupplierModel: {
    findById: vi.fn(async (id: string) => id === ids.supplierId ? { _id: ids.supplierId, organizationId: ids.supplierOrg } : null),
  },
}));
vi.mock('../src/models/SupplierRelationship', () => ({
  SupplierRelationshipModel: {
    findOne: vi.fn(async (query: Record<string, unknown>) =>
      query.customerOrganizationId === ids.buyerA ? state.relationship : null
    ),
  },
}));
vi.mock('../src/models/VerificationRun', () => ({
  VerificationRunModel: {
    find: vi.fn(() => ({ sort: async () => [] })),
  },
}));
vi.mock('../src/models/Document', () => ({
  DocumentModel: {
    findById: vi.fn(async (id: string) => id === ids.documentId ? state.document : null),
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
});