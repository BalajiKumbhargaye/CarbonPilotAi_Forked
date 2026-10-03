import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { ENV } from '../src/config/env';

vi.mock('../src/config/database', () => ({ isDatabaseConnected: () => true }));

const ids = {
  buyerA: '100000000000000000000001',
  buyerB: '100000000000000000000002',
  supplierOrgA: '200000000000000000000001',
  supplierOrgB: '200000000000000000000002',
  supplierA: '300000000000000000000001',
  supplierB: '300000000000000000000002',
  productA: '400000000000000000000001',
  productB: '400000000000000000000002',
  purchaseB: '600000000000000000000001',
};

const store = vi.hoisted(() => ({
  organizations: [] as any[],
  suppliers: [] as any[],
  relationships: [] as any[],
  products: [] as any[],
  purchases: [] as any[],
  nextId: 0,
}));

function matches(document: any, filter: Record<string, any>): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((condition: Record<string, any>) => matches(document, condition));
    const actual = document[key]?.toString();
    if (expected && typeof expected === 'object' && '$in' in expected) return expected.$in.some((value: any) => value.toString() === actual);
    if (expected && typeof expected === 'object' && '$regex' in expected) return new RegExp(expected.$regex, expected.$options).test(String(document[key] || ''));
    if (expected && typeof expected === 'object' && '$gte' in expected) return new Date(document[key]).getTime() >= expected.$gte.getTime();
    if (expected && typeof expected === 'object' && '$lte' in expected) return new Date(document[key]).getTime() <= expected.$lte.getTime();
    return actual === expected?.toString();
  });
}

vi.mock('../src/models/Organization', () => ({
  OrganizationModel: {
    find: vi.fn(async (filter: Record<string, any>) => store.organizations.filter((item) => matches(item, filter))),
    findById: vi.fn(async (id: string) => store.organizations.find((item) => item._id === id) ?? null),
  },
}));

vi.mock('../src/models/Supplier', () => ({
  SupplierModel: {
    find: vi.fn(async (filter: Record<string, any>) => store.suppliers.filter((item) => matches(item, filter))),
    findById: vi.fn(async (id: string) => store.suppliers.find((item) => item._id === id) ?? null),
  },
}));

vi.mock('../src/models/SupplierRelationship', () => ({
  SupplierRelationshipModel: {
    find: vi.fn(async (filter: Record<string, any>) => store.relationships.filter((item) => matches(item, filter))),
    findOne: vi.fn(async (filter: Record<string, any>) => store.relationships.find((item) => matches(item, filter)) ?? null),
  },
}));

vi.mock('../src/models/Product', () => ({
  ProductModel: {
    find: vi.fn(async (filter: Record<string, any>) => store.products.filter((item) => matches(item, filter))),
    findById: vi.fn(async (id: string) => store.products.find((item) => item._id === id) ?? null),
  },
}));

vi.mock('../src/models/Purchase', () => ({
  PurchaseModel: {
    find: vi.fn((filter: Record<string, any>) => {
      const records = store.purchases.filter((item) => matches(item, filter));
      return {
        sort: async () => records.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()),
        then: (resolve: (value: any[]) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(records).then(resolve, reject),
      };
    }),
    findOne: vi.fn(async (filter: Record<string, any>) => store.purchases.find((item) => matches(item, filter)) ?? null),
    create: vi.fn(async (values: Record<string, any>) => {
      if (values.referenceNumber && store.purchases.some((item) =>
        item.customerOrganizationId === values.customerOrganizationId && item.referenceNumber === values.referenceNumber
      )) {
        throw Object.assign(new Error('duplicate key'), { code: 11000 });
      }
      const record = {
        ...values,
        _id: `6000000000000000000000${++store.nextId}`,
        createdAt: new Date().toISOString(),
        unitPrice: typeof values.unitPrice === 'string' ? mongoose.Types.Decimal128.fromString(values.unitPrice) : values.unitPrice,
        totalAmount: typeof values.totalAmount === 'string' ? mongoose.Types.Decimal128.fromString(values.totalAmount) : values.totalAmount,
      };
      store.purchases.push(record);
      return record;
    }),
    findOneAndUpdate: vi.fn(async (filter: Record<string, any>, update: Record<string, any>) => {
      const record = store.purchases.find((item) => matches(item, filter));
      if (!record) return null;
      Object.assign(record, update.$set);
      return record;
    }),
  },
}));

let server: Server;
let apiUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = createApp().listen(0, '127.0.0.1', resolve); });
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

beforeEach(() => {
  store.organizations.splice(0);
  store.suppliers.splice(0);
  store.relationships.splice(0);
  store.products.splice(0);
  store.purchases.splice(0);
  store.nextId = 10;
  store.organizations.push(
    { _id: ids.supplierOrgA, type: 'SUPPLIER', name: 'GreenForge Industries' },
    { _id: ids.supplierOrgB, type: 'SUPPLIER', name: 'PolyTech Materials' },
  );
  store.suppliers.push(
    { _id: ids.supplierA, organizationId: ids.supplierOrgA },
    { _id: ids.supplierB, organizationId: ids.supplierOrgB },
  );
  store.relationships.push({ customerOrganizationId: ids.buyerA, supplierOrganizationId: ids.supplierOrgA, status: 'ACTIVE' });
  store.products.push(
    { _id: ids.productA, supplierId: ids.supplierA, name: 'Automotive Steel Sheet', productCode: 'GS-AS-001', category: 'Steel', unit: 'kg', status: 'ACTIVE' },
    { _id: ids.productB, supplierId: ids.supplierB, name: 'Plastic Housing', productCode: 'PT-PL-001', category: 'Plastic', unit: 'piece', status: 'ACTIVE' },
  );
});

afterEach(() => vi.restoreAllMocks());

function token(organizationId: string) {
  return jwt.sign({ userId: `user-${organizationId}`, organizationId, organizationType: 'CUSTOMER', role: 'CUSTOMER_ADMIN', email: `${organizationId}@example.com` }, ENV.JWT_SECRET, { expiresIn: '10m' });
}

async function request(path: string, bearer: string, options: RequestInit = {}) {
  return fetch(`${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, ...options.headers } });
}

const purchaseInput = {
  supplierId: ids.supplierA,
  productId: ids.productA,
  quantity: '500',
  unit: 'kg',
  unitPrice: '72000',
  currency: 'inr',
  purchaseDate: '2026-10-03',
  referenceNumber: 'PO-2026-001',
  notes: 'Quarterly steel order',
};

describe('buyer procurement management', () => {
  it('creates purchases with backend-calculated totals and displays persisted data', async () => {
    const buyer = token(ids.buyerA);
    const createdResponse = await request('/api/procurement/purchases', buyer, { method: 'POST', body: JSON.stringify(purchaseInput) });
    const created = await createdResponse.json();
    const list = await (await request('/api/procurement/purchases?search=GreenForge', buyer)).json();
    const referenceSearch = await (await request('/api/procurement/purchases?search=PO-2026-001', buyer)).json();

    expect(createdResponse.status).toBe(201);
    expect(created.data.totalAmount).toBe('36000000.00');
    expect(created.data.currency).toBe('INR');
    expect(created.data.status).toBe('CONFIRMED');
    expect(created.data.supplierOrganization.name).toBe('GreenForge Industries');
    expect(list.data).toHaveLength(1);
    expect(list.data[0].referenceNumber).toBe('PO-2026-001');
    expect(referenceSearch.data).toHaveLength(1);
  });

  it('rounds decimal totals using decimal-safe arithmetic', async () => {
    const response = await request('/api/procurement/purchases', token(ids.buyerA), {
      method: 'POST', body: JSON.stringify({ ...purchaseInput, quantity: '0.1', unitPrice: '0.1', referenceNumber: 'PO-DECIMAL' }),
    });
    expect((await response.json()).data.totalAmount).toBe('0.01');
  });

  it('rejects unrelated suppliers, mismatched products, and incompatible units', async () => {
    const buyer = token(ids.buyerA);
    const unrelatedSupplier = await request('/api/procurement/purchases', buyer, {
      method: 'POST', body: JSON.stringify({ ...purchaseInput, supplierId: ids.supplierB, productId: ids.productB }),
    });
    const mismatchedProduct = await request('/api/procurement/purchases', buyer, {
      method: 'POST', body: JSON.stringify({ ...purchaseInput, productId: ids.productB }),
    });
    const mismatchedUnit = await request('/api/procurement/purchases', buyer, {
      method: 'POST', body: JSON.stringify({ ...purchaseInput, unit: 'ton' }),
    });

    expect(unrelatedSupplier.status).toBe(403);
    expect(mismatchedProduct.status).toBe(400);
    expect(mismatchedUnit.status).toBe(400);
  });

  it('isolates list and detail reads by buyer organization', async () => {
    store.purchases.push({
      _id: ids.purchaseB,
      customerOrganizationId: ids.buyerB,
      supplierId: ids.supplierB,
      supplierOrganizationId: ids.supplierOrgB,
      productId: ids.productB,
      quantity: 1,
      unit: 'piece',
      unitPrice: mongoose.Types.Decimal128.fromString('10.00'),
      totalAmount: mongoose.Types.Decimal128.fromString('10.00'),
      currency: 'USD',
      purchaseDate: new Date('2026-10-02'),
      status: 'CONFIRMED',
    });
    const buyer = token(ids.buyerA);
    const list = await (await request('/api/procurement/purchases', buyer)).json();
    const detail = await request(`/api/procurement/purchases/${ids.purchaseB}`, buyer);

    expect(list.data).toHaveLength(0);
    expect(detail.status).toBe(404);
  });

  it('filters purchase lists and returns real grouped totals', async () => {
    const buyer = token(ids.buyerA);
    await request('/api/procurement/purchases', buyer, { method: 'POST', body: JSON.stringify(purchaseInput) });
    await request('/api/procurement/purchases', buyer, {
      method: 'POST',
      body: JSON.stringify({ ...purchaseInput, quantity: '2', unitPrice: '3', currency: 'USD', referenceNumber: 'PO-USD-001' }),
    });
    const productFiltered = await (await request(`/api/procurement/purchases?productId=${ids.productA}&status=CONFIRMED`, buyer)).json();
    const supplierAndDateFiltered = await (await request(`/api/procurement/purchases?supplierId=${ids.supplierA}&startDate=2026-10-03&endDate=2026-10-03`, buyer)).json();
    const summary = await (await request('/api/procurement/purchases/summary', buyer)).json();

    expect(productFiltered.data).toHaveLength(2);
    expect(supplierAndDateFiltered.data).toHaveLength(2);
    expect(summary.data.totalPurchases).toBe(2);
    expect(summary.data.activeSuppliers).toBe(1);
    expect(summary.data.totalPurchaseValueByCurrency).toEqual([
      { currency: 'INR', amount: '36000000.00' },
      { currency: 'USD', amount: '6.00' },
    ]);
    expect(summary.data.totalQuantityByUnit).toEqual([{ unit: 'kg', quantity: '502' }]);
  });

  it('updates commercial fields and retains cancelled purchases for history', async () => {
    const buyer = token(ids.buyerA);
    const created = await (await request('/api/procurement/purchases', buyer, { method: 'POST', body: JSON.stringify(purchaseInput) })).json();
    const id = created.data._id;
    const updated = await request(`/api/procurement/purchases/${id}`, buyer, {
      method: 'PATCH', body: JSON.stringify({ quantity: '250', unitPrice: '72000', referenceNumber: 'PO-UPDATED', notes: 'Revised' }),
    });
    const cancelled = await request(`/api/procurement/purchases/${id}/status`, buyer, {
      method: 'PATCH', body: JSON.stringify({ status: 'CANCELLED' }),
    });
    const history = await (await request(`/api/procurement/purchases/${id}`, buyer)).json();
    const summary = await (await request('/api/procurement/purchases/summary', buyer)).json();

    expect(updated.status).toBe(200);
    expect(cancelled.status).toBe(200);
    expect(history.data.totalAmount).toBe('18000000.00');
    expect(history.data.status).toBe('CANCELLED');
    expect(summary.data.totalPurchases).toBe(0);
    expect(store.purchases).toHaveLength(1);
  });

  it('rejects invalid units, malformed IDs, and duplicate reference numbers', async () => {
    const buyer = token(ids.buyerA);
    const first = await request('/api/procurement/purchases', buyer, {
      method: 'POST', body: JSON.stringify(purchaseInput),
    });
    const duplicate = await request('/api/procurement/purchases', buyer, {
      method: 'POST', body: JSON.stringify(purchaseInput),
    });
    const invalidUnit = await request('/api/procurement/purchases', buyer, {
      method: 'POST', body: JSON.stringify({ ...purchaseInput, unit: 'ton', referenceNumber: 'PO-BAD-UNIT' }),
    });
    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(409);
    const invalidSupplier = await request('/api/procurement/purchases', buyer, {
      method: 'POST', body: JSON.stringify({ ...purchaseInput, supplierId: 'invalid' }),
    });
    expect(invalidUnit.status).toBe(400);
    expect(invalidSupplier.status).toBe(400);
  });
});
