import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { ENV } from '../src/config/env';

const store = vi.hoisted(() => ({
  organizations: [] as any[],
  suppliers: [] as any[],
  relationships: [] as any[],
  products: [] as any[],
  users: [] as any[],
  memberships: [] as any[],
  nextId: 0,
}));

vi.mock('../src/models/Organization', () => {
  const makeOrganization = (values: Record<string, any>) => ({
    ...values,
    _id: values._id || `organization-${++store.nextId}`,
    toObject() {
      const { toObject: _toObject, ...data } = this;
      return data;
    },
  });
  const matches = (document: any, filter: Record<string, any>) => Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((condition: Record<string, any>) => matches(document, condition));
    const actual = document[key]?.toString();
    if (expected && typeof expected === 'object' && '$in' in expected) {
      return expected.$in.some((value: any) => value.toString() === actual);
    }
    if (expected && typeof expected === 'object' && '$regex' in expected) {
      return new RegExp(expected.$regex, expected.$options).test(String(document[key] || ''));
    }
    return actual === expected?.toString();
  });
  return {
    OrganizationModel: {
      create: vi.fn(async (values: Record<string, any>) => {
        const organization = makeOrganization(values);
        store.organizations.push(organization);
        return organization;
      }),
      find: vi.fn(async (filter: Record<string, any>) => store.organizations.filter((item) => matches(item, filter))),
      findOne: vi.fn(async (filter: Record<string, any>) => store.organizations.find((item) => matches(item, filter)) ?? null),
      findById: vi.fn(async (id: string) => store.organizations.find((item) => item._id.toString() === id.toString()) ?? null),
      findByIdAndUpdate: vi.fn(async (id: string, values: Record<string, any>) => {
        const organization = store.organizations.find((item) => item._id.toString() === id.toString());
        if (!organization) return null;
        Object.assign(organization, values);
        return organization;
      }),
      findOneAndUpdate: vi.fn(async (filter: Record<string, any>, values: Record<string, any>) => {
        const organization = store.organizations.find((item) => matches(item, filter));
        if (!organization) return null;
        Object.assign(organization, values);
        return organization;
      }),
      deleteOne: vi.fn(async ({ _id }: { _id: string }) => {
        store.organizations = store.organizations.filter((item) => item._id !== _id);
      }),
    },
  };
});

vi.mock('../src/models/Supplier', () => {
  const matches = (document: any, filter: Record<string, any>) => Object.entries(filter).every(([key, expected]) => {
    const actual = document[key]?.toString();
    if (expected && typeof expected === 'object' && '$in' in expected) {
      return expected.$in.some((value: any) => value.toString() === actual);
    }
    return actual === expected?.toString();
  });
  return {
    SupplierModel: {
      create: vi.fn(async (values: Record<string, any>) => {
        const supplier = { ...values, _id: `supplier-${++store.nextId}`, createdAt: new Date().toISOString() };
        store.suppliers.push(supplier);
        return supplier;
      }),
      find: vi.fn(async (filter: Record<string, any>) => store.suppliers.filter((item) => matches(item, filter))),
      findOne: vi.fn(async (filter: Record<string, any>) => store.suppliers.find((item) => matches(item, filter)) ?? null),
      findById: vi.fn(async (id: string) => store.suppliers.find((item) => item._id.toString() === id.toString()) ?? null),
      findByIdAndUpdate: vi.fn(async (id: string, values: Record<string, any>) => {
        const supplier = store.suppliers.find((item) => item._id.toString() === id.toString());
        if (!supplier) return null;
        Object.assign(supplier, values);
        return supplier;
      }),
      deleteOne: vi.fn(async ({ _id }: { _id: string }) => {
        store.suppliers = store.suppliers.filter((item) => item._id !== _id);
      }),
    },
  };
});

vi.mock('../src/models/SupplierRelationship', () => {
  const matches = (document: any, filter: Record<string, any>) => Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((condition: Record<string, any>) => matches(document, condition));
    const actual = document[key]?.toString();
    if (expected && typeof expected === 'object' && '$ne' in expected) return actual !== expected.$ne.toString();
    return actual === expected?.toString();
  });
  return {
    SupplierRelationshipModel: {
      create: vi.fn(async (values: Record<string, any>) => {
        if (store.relationships.some((item) => item.customerOrganizationId === values.customerOrganizationId && item.supplierOrganizationId === values.supplierOrganizationId)) {
          throw Object.assign(new Error('duplicate key'), { code: 11000 });
        }
        const relationship = { ...values, _id: `relationship-${++store.nextId}`, createdAt: new Date().toISOString() };
        store.relationships.push(relationship);
        return relationship;
      }),
      find: vi.fn(async (filter: Record<string, any>) => store.relationships.filter((item) => matches(item, filter))),
      findOne: vi.fn(async (filter: Record<string, any>) => store.relationships.find((item) => matches(item, filter)) ?? null),
      findOneAndUpdate: vi.fn(async (filter: Record<string, any>, values: Record<string, any>) => {
        const relationship = store.relationships.find((item) => matches(item, filter));
        if (!relationship) return null;
        Object.assign(relationship, values);
        return relationship;
      }),
      updateMany: vi.fn(async (filter: Record<string, any>, values: Record<string, any>) => {
        const matchesToUpdate = store.relationships.filter((item) => matches(item, filter));
        matchesToUpdate.forEach((item) => Object.assign(item, values));
        return { modifiedCount: matchesToUpdate.length };
      }),
      findByIdAndUpdate: vi.fn(async (id: string, values: Record<string, any>) => {
        const relationship = store.relationships.find((item) => item._id === id);
        if (!relationship) return null;
        Object.assign(relationship, values);
        return relationship;
      }),
    },
  };
});

vi.mock('../src/models/Product', () => ({
  ProductModel: {
    find: vi.fn(async ({ supplierId }: { supplierId: string }) => store.products.filter((product) => product.supplierId === supplierId)),
    countDocuments: vi.fn(async ({ supplierId }: { supplierId: string }) => store.products.filter((product) => product.supplierId === supplierId).length),
  },
}));

vi.mock('../src/models/User', () => ({
  UserModel: {
    findOne: vi.fn(async ({ email }: { email: string }) => store.users.find((user) => user.email === email) ?? null),
    create: vi.fn(async (values: Record<string, any>) => {
      const user = { ...values, _id: `user-${++store.nextId}` };
      store.users.push(user);
      return user;
    }),
    deleteOne: vi.fn(async ({ _id }: { _id: string }) => {
      store.users = store.users.filter((user) => user._id !== _id);
    }),
  },
}));

vi.mock('../src/models/OrganizationMember', () => ({
  OrganizationMemberModel: {
    create: vi.fn(async (values: Record<string, any>) => {
      const membership = { ...values, _id: `membership-${++store.nextId}` };
      store.memberships.push(membership);
      return membership;
    }),
    deleteOne: vi.fn(async () => undefined),
  },
}));

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
  store.organizations.splice(0);
  store.suppliers.splice(0);
  store.relationships.splice(0);
  store.products.splice(0);
  store.users.splice(0);
  store.memberships.splice(0);
  store.nextId = 0;
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

async function request(path: string, authToken: string, options: RequestInit = {}) {
  return fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...options.headers,
    },
  });
}

const supplierInput = {
  companyName: 'GreenForge Industries',
  legalName: 'GreenForge Industries Pvt Ltd',
  industry: 'Steel Manufacturing',
  country: 'India',
  city: 'Pune',
  contactPerson: 'Asha Rao',
  contactEmail: 'asha@greenforge.example',
  contactPhone: '+91 1234567890',
  website: 'https://greenforge.example',
  category: 'Metals',
  notes: 'Primary steel supplier',
};

async function addSupplier(authToken: string, input = supplierInput) {
  return request('/api/suppliers', authToken, { method: 'POST', body: JSON.stringify(input) });
}

describe('supplier directory and profile APIs', () => {
  it('creates a separate supplier organization and buyer relationship, then lists database data', async () => {
    const response = await addSupplier(token('buyer-a', 'CUSTOMER'));
    const result = await response.json();
    const list = await request('/api/suppliers?search=steel', token('buyer-a', 'CUSTOMER'));
    const suppliers = await list.json();

    expect(response.status).toBe(201);
    expect(store.organizations[0]).toMatchObject({ name: supplierInput.companyName, type: 'SUPPLIER' });
    expect(store.relationships[0]).toMatchObject({ customerOrganizationId: 'buyer-a', status: 'PENDING' });
    expect(result.data.productsCount).toBe(0);
    expect(list.status).toBe(200);
    expect(suppliers.data).toHaveLength(1);
    expect(suppliers.data[0].companyName).toBe(supplierInput.companyName);
  });

  it('prevents duplicate supplier relationships for the same buyer', async () => {
    const buyerToken = token('buyer-a', 'CUSTOMER');
    expect((await addSupplier(buyerToken)).status).toBe(201);
    expect((await addSupplier(buyerToken)).status).toBe(409);
    expect(store.organizations).toHaveLength(1);
    expect(store.relationships).toHaveLength(1);
  });

  it('allows a second buyer to connect to the same independent supplier organization', async () => {
    expect((await addSupplier(token('buyer-a', 'CUSTOMER'))).status).toBe(201);
    expect((await addSupplier(token('buyer-b', 'CUSTOMER'))).status).toBe(201);
    expect(store.organizations).toHaveLength(1);
    expect(store.relationships).toHaveLength(2);
  });

  it('lets the invited supplier register into the existing organization and activates the relationship', async () => {
    const buyerToken = token('buyer-a', 'CUSTOMER');
    const created = await (await addSupplier(buyerToken)).json();
    const organizationId = created.data.organizationId as string;
    const registration = await fetch(`${apiUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: supplierInput.contactPerson,
        email: supplierInput.contactEmail,
        password: 'supplier-password-123',
        organizationName: 'Supplier name from registration',
        organizationType: 'SUPPLIER',
        role: 'SUPPLIER_ADMIN',
      }),
    });
    const result = await registration.json();
    const supplierSessionToken = result.data.token as string;
    const profile = await (await request('/api/suppliers/profile', supplierSessionToken)).json();
    const directory = await (await request('/api/suppliers', buyerToken)).json();

    expect(registration.status).toBe(201);
    expect(store.organizations).toHaveLength(1);
    expect(result.data.user.organization.id).toBe(organizationId);
    expect(profile.data.name).toBe(supplierInput.companyName);
    expect(store.relationships[0].status).toBe('ACTIVE');
    expect(directory.data[0].status).toBe('ACTIVE');
  });

  it('updates supplier details and relationship status for the owning buyer', async () => {
    const buyerToken = token('buyer-a', 'CUSTOMER');
    const created = await (await addSupplier(buyerToken)).json();
    const supplierId = created.data._id as string;
    const edit = await request(`/api/suppliers/${supplierId}`, buyerToken, {
      method: 'PATCH',
      body: JSON.stringify({ companyName: 'GreenForge Metals', city: 'Mumbai', category: 'Steel' }),
    });
    const status = await request(`/api/suppliers/${supplierId}/status`, buyerToken, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
    const refreshed = await (await request(`/api/suppliers/${supplierId}`, buyerToken)).json();

    expect(edit.status).toBe(200);
    expect(status.status).toBe(200);
    expect(refreshed.data.companyName).toBe('GreenForge Metals');
    expect(refreshed.data.city).toBe('Mumbai');
    expect(refreshed.data.status).toBe('INACTIVE');
  });

  it('does not expose or update a supplier not connected to the requesting buyer', async () => {
    const created = await (await addSupplier(token('buyer-a', 'CUSTOMER'))).json();
    const supplierId = created.data._id as string;
    const buyerB = token('buyer-b', 'CUSTOMER');
    const details = await request(`/api/suppliers/${supplierId}`, buyerB);
    const update = await request(`/api/suppliers/${supplierId}`, buyerB, {
      method: 'PATCH',
      body: JSON.stringify({ companyName: 'Unauthorized Change' }),
    });
    const list = await (await request('/api/suppliers', buyerB)).json();

    expect(details.status).toBe(404);
    expect(update.status).toBe(404);
    expect(list.data).toHaveLength(0);
    expect(store.organizations[0].name).toBe(supplierInput.companyName);
  });

  it('lets a supplier read and update only its organization profile', async () => {
    const organization = {
      _id: 'supplier-org-a',
      name: 'Supplier Company',
      type: 'SUPPLIER',
      industry: 'Manufacturing',
      contactEmail: 'supplier@example.com',
      toObject() { const { toObject: _toObject, ...data } = this; return data; },
    };
    store.organizations.push(organization);
    store.suppliers.push({ _id: 'supplier-a', organizationId: organization._id, industry: organization.industry, status: 'ACTIVE' });
    const supplierToken = token('supplier-org-a', 'SUPPLIER');

    const profile = await request('/api/suppliers/profile', supplierToken);
    const update = await request('/api/suppliers/profile', supplierToken, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Supplier Company Updated', city: 'Pune', description: 'Precision components' }),
    });
    const refreshed = await (await request('/api/suppliers/profile', supplierToken)).json();

    expect(profile.status).toBe(200);
    expect(update.status).toBe(200);
    expect(refreshed.data.name).toBe('Supplier Company Updated');
    expect(refreshed.data.city).toBe('Pune');
    expect(refreshed.data.description).toBe('Precision components');
  });

  it('blocks suppliers from buyer management APIs and rejects cross-organization profile IDs', async () => {
    const supplierToken = token('supplier-org-a', 'SUPPLIER');
    const list = await request('/api/suppliers', supplierToken);
    const arbitraryProfile = await request('/api/suppliers/supplier-org-b/profile', supplierToken, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Another Company' }),
    });

    expect(list.status).toBe(403);
    expect(arbitraryProfile.status).toBe(403);
  });
});
