import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
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
  steel: '500000000000000000000001',
  plastic: '500000000000000000000002',
};

const store = vi.hoisted(() => ({
  organizations: [] as any[],
  suppliers: [] as any[],
  relationships: [] as any[],
  products: [] as any[],
  categories: [] as any[],
  nextId: 10,
}));

function matches(document: any, filter: Record<string, any>): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((condition: Record<string, any>) => matches(document, condition));
    const actual = document[key]?.toString();
    if (expected && typeof expected === 'object' && '$in' in expected) {
      return expected.$in.some((value: any) => value.toString() === actual);
    }
    if (expected && typeof expected === 'object' && '$ne' in expected) return actual !== expected.$ne.toString();
    if (expected && typeof expected === 'object' && '$exists' in expected) return (actual !== undefined) === expected.$exists;
    if (expected && typeof expected === 'object' && '$regex' in expected) {
      return new RegExp(expected.$regex, expected.$options).test(String(document[key] || ''));
    }
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
    findOne: vi.fn(async (filter: Record<string, any>) => store.suppliers.find((item) => matches(item, filter)) ?? null),
    findById: vi.fn(async (id: string) => store.suppliers.find((item) => item._id === id) ?? null),
  },
}));

vi.mock('../src/models/SupplierRelationship', () => ({
  SupplierRelationshipModel: {
    find: vi.fn(async (filter: Record<string, any>) => store.relationships.filter((item) => matches(item, filter))),
    findOne: vi.fn(async (filter: Record<string, any>) => store.relationships.find((item) => matches(item, filter)) ?? null),
  },
}));

vi.mock('../src/models/ProductCategory', () => ({
  ProductCategoryModel: {
    findOneAndUpdate: vi.fn(async (filter: Record<string, any>, update: Record<string, any>) => {
      let category = store.categories.find((item) => matches(item, filter));
      if (!category) {
        category = { ...update.$setOnInsert, _id: filter._id || `5000000000000000000000${++store.nextId}` };
        store.categories.push(category);
      }
      return category;
    }),
    find: vi.fn((filter: Record<string, any>) => ({
      sort: async () => store.categories.filter((item) => matches(item, filter)),
    })),
    findOne: vi.fn(async (filter: Record<string, any>) => store.categories.find((item) => matches(item, filter)) ?? null),
    findById: vi.fn(async (id: string) => store.categories.find((item) => item._id === id) ?? null),
  },
}));

vi.mock('../src/models/Product', () => ({
  ProductModel: {
    find: vi.fn((filter: Record<string, any>) => ({
      sort: async () => store.products.filter((item) => matches(item, filter)),
    })),
    findOne: vi.fn(async (filter: Record<string, any>) => store.products.find((item) => matches(item, filter)) ?? null),
    findById: vi.fn(async (id: string) => store.products.find((item) => item._id === id) ?? null),
    create: vi.fn(async (values: Record<string, any>) => {
      const product = { ...values, _id: `4000000000000000000000${++store.nextId}`, createdAt: new Date().toISOString() };
      store.products.push(product);
      return product;
    }),
    findByIdAndUpdate: vi.fn(async (id: string, values: Record<string, any>) => {
      const product = store.products.find((item) => item._id === id);
      if (!product) return null;
      Object.assign(product, values);
      return product;
    }),
    distinct: vi.fn(async (field: string, filter: Record<string, any>) => {
      const legacy = store.products.filter((product) => matches(product, filter)).map((product) => product[field]);
      return [...new Set(legacy)];
    }),
    updateMany: vi.fn(async (filter: Record<string, any>, update: Record<string, any>) => {
      const products = store.products.filter((product) => matches(product, filter));
      products.forEach((product) => Object.assign(product, update.$set));
      return { modifiedCount: products.length };
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
  store.categories.splice(0);
  store.nextId = 10;
  store.organizations.push(
    { _id: ids.supplierOrgA, type: 'SUPPLIER', name: 'GreenForge Industries' },
    { _id: ids.supplierOrgB, type: 'SUPPLIER', name: 'PolyTech Materials' }
  );
  store.suppliers.push(
    { _id: ids.supplierA, organizationId: ids.supplierOrgA },
    { _id: ids.supplierB, organizationId: ids.supplierOrgB }
  );
  store.relationships.push({ customerOrganizationId: ids.buyerA, supplierOrganizationId: ids.supplierOrgA, status: 'ACTIVE' });
  store.categories.push(
    { _id: ids.steel, name: 'Steel', slug: 'steel', isActive: true },
    { _id: ids.plastic, name: 'Plastic', slug: 'plastic', isActive: true }
  );
  store.products.push(
    { _id: ids.productA, supplierId: ids.supplierA, name: 'Automotive Steel Sheet', productCode: 'GS-AS-001', category: 'Steel', categoryId: ids.steel, unit: 'kg', status: 'ACTIVE' },
    { _id: ids.productB, supplierId: ids.supplierB, name: 'Plastic Housing', productCode: 'PT-PL-001', category: 'Plastic', categoryId: ids.plastic, unit: 'piece', status: 'ACTIVE' }
  );
});

afterEach(() => vi.restoreAllMocks());

function token(organizationId: string, organizationType: 'CUSTOMER' | 'SUPPLIER') {
  return jwt.sign({
    userId: `user-${organizationId}`,
    organizationId,
    organizationType,
    role: organizationType === 'CUSTOMER' ? 'CUSTOMER_ADMIN' : 'SUPPLIER_ADMIN',
    email: `${organizationId}@example.com`,
  }, ENV.JWT_SECRET, { expiresIn: '10m' });
}

async function request(path: string, bearer: string, options: RequestInit = {}) {
  return fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, ...options.headers },
  });
}

const newProduct = {
  supplierId: ids.supplierA,
  name: 'Structural Steel Coil',
  productCode: 'GF-ST-002',
  categoryId: ids.steel,
  unit: 'ton',
  description: 'Hot rolled structural steel',
};

describe('product directory and authorization', () => {
  it('shows active products from unconnected CarbonPilot suppliers in the buyer catalog', async () => {
    const buyer = token(ids.buyerB, 'CUSTOMER');
    store.products[1] = {
      ...store.products[1],
      name: 'Automotive Steel Sheet',
      productCode: 'PT-AS-001',
      category: 'Steel',
      categoryId: ids.steel,
      unit: 'kg',
      sellingPrice: 12,
      currency: 'USD',
    };

    const search = await (await request('/api/products?search=Automotive%20Steel', buyer)).json();
    const supplierFilter = await (await request(`/api/products?catalog=true&supplierId=${ids.supplierB}`, buyer)).json();
    const detail = await request(`/api/products/${ids.productB}`, buyer);

    expect(search.data.map((product: any) => product.supplier._id)).toEqual([ids.supplierA, ids.supplierB]);
    expect(supplierFilter.data.map((product: any) => product._id)).toEqual([ids.productB]);
    expect(search.data[1].sellingPrice).toBeUndefined();
    expect(search.data[1].currency).toBeUndefined();
    expect(detail.status).toBe(200);
    const detailData = (await detail.json()).data;
    expect(detailData.supplier.name).toBe('PolyTech Materials');
    expect(detailData.sellingPrice).toBeUndefined();
  });

  it('limits buyer list/search/filter results to connected suppliers', async () => {
    const buyer = token(ids.buyerA, 'CUSTOMER');
    const list = await (await request('/api/products', buyer)).json();
    const nameSearch = await (await request('/api/products?search=Automotive', buyer)).json();
    const supplierSearch = await (await request('/api/products?search=GreenForge', buyer)).json();
    const filtered = await (await request(`/api/products?supplierId=${ids.supplierA}&categoryId=${ids.steel}&status=ACTIVE`, buyer)).json();

    expect(list.data.map((product: any) => product._id)).toEqual([ids.productA]);
    expect(nameSearch.data).toHaveLength(1);
    expect(supplierSearch.data).toHaveLength(1);
    expect(filtered.data).toHaveLength(1);
  });

  it('allows buyer reads of active catalog product details but blocks unconnected supplier filters outside catalog mode', async () => {
    const buyer = token(ids.buyerB, 'CUSTOMER');
    const list = await request('/api/products', buyer);
    const detail = await request(`/api/products/${ids.productA}`, buyer);
    const filtered = await request(`/api/products?supplierId=${ids.supplierA}`, buyer);

    expect((await list.json()).data).toHaveLength(0);
    expect(detail.status).toBe(200);
    expect(filtered.status).toBe(403);
  });

  it('allows an authorized buyer to create and update a product and its status', async () => {
    const buyer = token(ids.buyerA, 'CUSTOMER');
    const createdResponse = await request('/api/products', buyer, { method: 'POST', body: JSON.stringify(newProduct) });
    const created = await createdResponse.json();
    const productId = created.data._id;
    const updatedResponse = await request(`/api/products/${productId}`, buyer, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Structural Steel Coil Updated', unit: 'kg', status: 'INACTIVE' }),
    });
    const refreshed = await (await request(`/api/products/${productId}`, buyer)).json();

    expect(createdResponse.status).toBe(201);
    expect(created.data.category).toBe('Steel');
    expect(created.data.status).toBe('ACTIVE');
    expect(created.data.sellingPrice).toBeUndefined();
    expect(updatedResponse.status).toBe(200);
    expect(refreshed.data.name).toBe('Structural Steel Coil Updated');
    expect(refreshed.data.unit).toBe('kg');
    expect(refreshed.data.status).toBe('INACTIVE');

    const priceUpdate = await request(`/api/products/${productId}`, buyer, {
      method: 'PATCH',
      body: JSON.stringify({ sellingPrice: 1, currency: 'USD' }),
    });
    expect(priceUpdate.status).toBe(403);
    expect(store.products.find((product) => product._id === productId).sellingPrice).toBeUndefined();
  });

  it('rejects adding a product for an unrelated or nonexistent supplier', async () => {
    const buyer = token(ids.buyerA, 'CUSTOMER');
    const unrelated = await request('/api/products', buyer, {
      method: 'POST', body: JSON.stringify({ ...newProduct, supplierId: ids.supplierB }),
    });

    const missing = await request('/api/products', buyer, {
      method: 'POST', body: JSON.stringify({ ...newProduct, supplierId: '600000000000000000000001' }),
    });
    const invalid = await request('/api/products', buyer, {
      method: 'POST', body: JSON.stringify({ ...newProduct, supplierId: 'not-an-id' }),
    });

    expect(unrelated.status).toBe(403);
    expect(missing.status).toBe(404);
    expect(invalid.status).toBe(400);
  });

  it('prevents buyers from assigning supplier prices when creating products', async () => {
    const buyer = token(ids.buyerA, 'CUSTOMER');
    const response = await request('/api/products', buyer, {
      method: 'POST',
      body: JSON.stringify({ ...newProduct, sellingPrice: 100, currency: 'USD' }),
    });

    expect(response.status).toBe(403);
  });

  it('forces supplier product creation to the authenticated supplier and blocks cross-supplier edits', async () => {
    const supplier = token(ids.supplierOrgA, 'SUPPLIER');
    const createdResponse = await request('/api/products', supplier, {
      method: 'POST', body: JSON.stringify({ ...newProduct, supplierId: ids.supplierB, sellingPrice: 125.5, currency: 'inr' }),
    });
    const created = await createdResponse.json();
    const otherProduct = await request(`/api/products/${ids.productB}`, supplier);
    const otherUpdate = await request(`/api/products/${ids.productB}`, supplier, {
      method: 'PATCH', body: JSON.stringify({ name: 'Unauthorized edit' }),
    });
    const supplierProducts = await (await request('/api/products', supplier)).json();
    const priceUpdate = await request(`/api/products/${created.data._id}`, supplier, {
      method: 'PATCH', body: JSON.stringify({ sellingPrice: 130, currency: 'USD' }),
    });
    const refreshed = await (await request(`/api/products/${created.data._id}`, supplier)).json();

    expect(createdResponse.status).toBe(201);
    expect(created.data.supplier._id).toBe(ids.supplierA);
    expect(created.data.sellingPrice).toBe(125.5);
    expect(created.data.currency).toBe('INR');
    expect(priceUpdate.status).toBe(200);
    expect(refreshed.data.sellingPrice).toBe(130);
    expect(refreshed.data.currency).toBe('USD');
    expect(otherProduct.status).toBe(403);
    expect(otherUpdate.status).toBe(403);
    expect(supplierProducts.data.every((product: any) => product.supplier._id === ids.supplierA)).toBe(true);
  });

  it('requires supplier prices and rejects unsupported product units', async () => {
    const supplier = token(ids.supplierOrgA, 'SUPPLIER');
    const missingPrice = await request('/api/products', supplier, {
      method: 'POST', body: JSON.stringify(newProduct),
    });
    const unsupportedUnit = await request('/api/products', supplier, {
      method: 'POST', body: JSON.stringify({ ...newProduct, unit: 'truck', sellingPrice: 10, currency: 'USD' }),
    });
    const excessivePrecision = await request('/api/products', supplier, {
      method: 'POST', body: JSON.stringify({ ...newProduct, sellingPrice: '1.123456789', currency: 'USD' }),
    });

    expect(missingPrice.status).toBe(400);
    expect(unsupportedUnit.status).toBe(400);
    expect(excessivePrecision.status).toBe(400);
  });

  it('validates missing categories and handles invalid/nonexistent product IDs', async () => {
    const buyer = token(ids.buyerA, 'CUSTOMER');
    const missingCategory = await request('/api/products', buyer, {
      method: 'POST', body: JSON.stringify({ ...newProduct, categoryId: undefined }),
    });
    const invalidId = await request('/api/products/not-an-id', buyer);
    const missingId = await request('/api/products/600000000000000000000001', buyer);

    expect(missingCategory.status).toBe(400);
    expect(invalidId.status).toBe(404);
    expect(missingId.status).toBe(404);
  });

  it('serves reusable categories from the database and allows custom categories', async () => {
    const buyer = token(ids.buyerA, 'CUSTOMER');
    const defaults = await (await request('/api/products/categories', buyer)).json();
    const created = await request('/api/products/categories', buyer, {
      method: 'POST', body: JSON.stringify({ name: 'Composite Materials' }),
    });
    const custom = await (await request('/api/products/categories', buyer)).json();

    expect(defaults.data.some((category: any) => category.name === 'Steel')).toBe(true);
    expect(created.status).toBe(201);
    expect(custom.data.some((category: any) => category.name === 'Composite Materials')).toBe(true);
  });

  it('backfills legacy text-only product categories for structured filtering', async () => {
    store.products.push({ _id: '400000000000000000000003', supplierId: ids.supplierA, name: 'Old steel product', category: 'Steel', unit: 'unit', status: 'ACTIVE' });
    const buyer = token(ids.buyerA, 'CUSTOMER');
    const categories = await request('/api/products/categories', buyer);
    const steelCategory = (await categories.json()).data.find((category: any) => category.name === 'Steel');
    const filtered = await (await request(`/api/products?categoryId=${steelCategory._id}`, buyer)).json();

    expect(store.products.find((product) => product.name === 'Old steel product').categoryId).toBe(ids.steel);
    expect(filtered.data.some((product: any) => product.name === 'Old steel product')).toBe(true);
  });
});
