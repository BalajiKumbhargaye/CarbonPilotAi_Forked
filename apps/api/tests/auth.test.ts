import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { ENV, resolveJwtExpirySeconds, resolveJwtSecret } from '../src/config/env';
import { procurementService } from '../src/modules/procurement';
import { facilityService } from '../src/modules/facilities';
import { getPortalDestination, logout } from '../../web/src/lib/auth';

vi.mock('../src/config/database', () => ({
  isDatabaseConnected: () => true,
}));

const store = vi.hoisted(() => ({
  users: [] as any[],
  organizations: [] as any[],
  memberships: [] as any[],
  suppliers: [] as any[],
  relationships: [] as any[],
  nextId: 0,
}));

vi.mock('../src/models/User', () => ({
  UserModel: {
    findOne: vi.fn(async ({ email }: { email: string }) =>
      store.users.find((user) => user.email === email) ?? null
    ),
    create: vi.fn(async (values: Record<string, unknown>) => {
      if (store.users.some((user) => user.email === values.email)) {
        throw Object.assign(new Error('duplicate key'), { code: 11000 });
      }
      const user = { ...values, _id: `user-${++store.nextId}` };
      store.users.push(user);
      return user;
    }),
    findById: vi.fn(async (id: string) => store.users.find((user) => user._id === id) ?? null),
    deleteOne: vi.fn(async ({ _id }: { _id: string }) => {
      store.users = store.users.filter((user) => user._id !== _id);
    }),
  },
}));

vi.mock('../src/models/Organization', () => ({
  OrganizationModel: {
    create: vi.fn(async (values: Record<string, unknown>) => {
      const organization = { ...values, _id: `organization-${++store.nextId}` };
      store.organizations.push(organization);
      return organization;
    }),
    findOne: vi.fn(async () => null),
    findById: vi.fn(async (id: string) =>
      store.organizations.find((organization) => organization._id === id) ?? null
    ),
    deleteOne: vi.fn(async ({ _id }: { _id: string }) => {
      store.organizations = store.organizations.filter((organization) => organization._id !== _id);
    }),
  },
}));

vi.mock('../src/models/OrganizationMember', () => ({
  OrganizationMemberModel: {
    create: vi.fn(async (values: Record<string, unknown>) => {
      const membership = { ...values, _id: `membership-${++store.nextId}` };
      store.memberships.push(membership);
      return membership;
    }),
    findOne: vi.fn(async ({ userId }: { userId: string }) =>
      store.memberships.find((membership) => membership.userId === userId) ?? null
    ),
    deleteOne: vi.fn(async ({ userId }: { userId: string }) => {
      store.memberships = store.memberships.filter((membership) => membership.userId !== userId);
    }),
  },
}));

vi.mock('../src/models/Supplier', () => ({
  SupplierModel: {
    create: vi.fn(async (values: Record<string, unknown>) => {
      const supplier = { ...values, _id: `supplier-${++store.nextId}` };
      store.suppliers.push(supplier);
      return supplier;
    }),
    findOne: vi.fn(async () => null),
    findByIdAndUpdate: vi.fn(async () => null),
    deleteOne: vi.fn(async ({ organizationId }: { organizationId: string }) => {
      store.suppliers = store.suppliers.filter((supplier) => supplier.organizationId !== organizationId);
    }),
  },
}));

vi.mock('../src/models/SupplierRelationship', () => ({
  SupplierRelationshipModel: {
    updateMany: vi.fn(async () => ({ modifiedCount: 0 })),
  },
}));

const buyerRegistration = {
  name: 'Buyer User',
  email: 'buyer@example.com',
  password: 'buyer-password-123',
  organizationName: 'Buyer Company',
  organizationType: 'CUSTOMER',
  role: 'CUSTOMER_ADMIN',
};

const supplierRegistration = {
  name: 'Supplier User',
  email: 'supplier@example.com',
  password: 'supplier-password-123',
  organizationName: 'Supplier Company',
  organizationType: 'SUPPLIER',
  role: 'SUPPLIER_ADMIN',
};

let server: Server;
let apiUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  apiUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

beforeEach(() => {
  store.users.splice(0);
  store.organizations.splice(0);
  store.memberships.splice(0);
  store.suppliers.splice(0);
  store.relationships.splice(0);
  store.nextId = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function request(path: string, options: RequestInit = {}) {
  return fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
}

async function registerAndLogin(payload: typeof buyerRegistration | typeof supplierRegistration) {
  const registration = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  expect(registration.status).toBe(201);
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: payload.email, password: payload.password }),
  });
  expect(login.status).toBe(200);
  const result = await login.json();
  return result.data.token as string;
}

describe('authentication and role authorization', () => {
  it('requires a unique long JWT secret in production', () => {
    expect(() => resolveJwtSecret('production')).toThrow(/JWT_SECRET/);
    expect(() => resolveJwtSecret('production', 'too-short')).toThrow(/JWT_SECRET/);
    expect(() => resolveJwtSecret('production', 'a-secure-production-secret-at-least-32-characters')).not.toThrow();
    expect(resolveJwtSecret('development')).toBeTruthy();
  });

  it('uses a validated configured JWT expiry duration', () => {
    expect(resolveJwtExpirySeconds('7d')).toBe(604800);
    expect(resolveJwtExpirySeconds('15m')).toBe(900);
    expect(() => resolveJwtExpirySeconds('forever')).toThrow(/JWT_EXPIRES_IN/);
  });

  it('allows CORS only from the configured application origin', async () => {
    const allowedOrigin = await request('/api/health', { headers: { Origin: ENV.APP_URL } });
    const rejectedOrigin = await request('/api/health', { headers: { Origin: 'https://untrusted.example' } });

    expect(allowedOrigin.headers.get('access-control-allow-origin')).toBe(ENV.APP_URL);
    expect(rejectedOrigin.headers.get('access-control-allow-origin')).toBe(ENV.APP_URL);
    expect(allowedOrigin.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('registers a buyer with a hashed password and owner membership', async () => {
    const response = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(buyerRegistration),
    });
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(store.users[0].passwordHash).not.toBe(buyerRegistration.password);
    expect(store.organizations).toHaveLength(1);
    expect(store.memberships[0]).toMatchObject({ role: 'CUSTOMER_ADMIN', status: 'ACTIVE' });
    expect(result.data.user.organization.type).toBe('CUSTOMER');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('registers a supplier with its organization and owner membership', async () => {
    const response = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(supplierRegistration),
    });
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(store.users[0].passwordHash).not.toBe(supplierRegistration.password);
    expect(store.memberships[0].role).toBe('SUPPLIER_ADMIN');
    expect(result.data.user.organization.type).toBe('SUPPLIER');
  });

  it('rejects invalid email, missing required fields, and mismatched registration roles', async () => {
    const invalidEmail = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ ...buyerRegistration, email: 'not-an-email' }),
    });
    const missingFields = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: buyerRegistration.email, organizationType: 'CUSTOMER' }),
    });
    const mismatchedRole = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ ...buyerRegistration, role: 'SUPPLIER_ADMIN' }),
    });

    expect(invalidEmail.status).toBe(400);
    expect(missingFields.status).toBe(400);
    expect(mismatchedRole.status).toBe(400);
    expect(store.organizations).toHaveLength(0);
  });

  it('logs buyers in and issues a bearer token', async () => {
    const token = await registerAndLogin(buyerRegistration);
    expect(token.split('.')).toHaveLength(3);
  });

  it('logs suppliers in and issues a bearer token', async () => {
    const token = await registerAndLogin(supplierRegistration);
    expect(token.split('.')).toHaveLength(3);
  });

  it('routes users by their authenticated role and organization type', () => {
    expect(getPortalDestination('CUSTOMER_ADMIN', 'CUSTOMER')).toBe('/customer/dashboard');
    expect(getPortalDestination('SUPPLIER_ADMIN', 'SUPPLIER')).toBe('/supplier/dashboard');
    expect(getPortalDestination('SUPPLIER_ADMIN', 'CUSTOMER')).toBeNull();
    expect(getPortalDestination('UNKNOWN_ROLE', 'CUSTOMER')).toBeNull();
  });

  it('rejects login when the database role and organization type do not match', async () => {
    await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(supplierRegistration),
    });
    store.memberships[0].role = 'CUSTOMER_ADMIN';

    const response = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: supplierRegistration.email, password: supplierRegistration.password }),
    });
    const result = await response.json();

    expect(response.status).toBe(403);
    expect(result.error.code).toBe('ROLE_ORGANIZATION_MISMATCH');
  });

  it('rejects an incorrect password without revealing account details', async () => {
    await registerAndLogin(buyerRegistration);
    const response = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: buyerRegistration.email, password: 'wrong-password' }),
    });
    const result = await response.json();

    expect(response.status).toBe(401);
    expect(result.error.message).toBe('Invalid email or password');
  });

  it('rejects duplicate email registration without creating another organization', async () => {
    await registerAndLogin(buyerRegistration);
    const response = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ ...buyerRegistration, organizationName: 'Duplicate Company' }),
    });

    expect(response.status).toBe(409);
    expect(store.organizations).toHaveLength(1);
  });

  it('clears the session and redirects to login on logout', () => {
    const removeItem = vi.fn();
    const redirect = vi.fn();
    vi.stubGlobal('window', { localStorage: { removeItem } });

    logout(redirect);

    expect(removeItem).toHaveBeenCalledWith('carbonpilot_session');
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('allows a buyer to access the buyer procurement API', async () => {
    vi.spyOn(procurementService, 'getInvoices').mockReturnValue([] as never);
    const token = await registerAndLogin(buyerRegistration);
    const response = await request('/api/procurement/invoices', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
  });

  it('allows a supplier to access the supplier facilities API', async () => {
    vi.spyOn(facilityService, 'getAll').mockReturnValue([] as never);
    const token = await registerAndLogin(supplierRegistration);
    const response = await request('/api/facilities', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
  });

  it('denies a supplier access to the buyer procurement API', async () => {
    const token = await registerAndLogin(supplierRegistration);
    const response = await request('/api/procurement/purchases', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
  });

  it('denies a buyer access to the supplier facilities API', async () => {
    const token = await registerAndLogin(buyerRegistration);
    const response = await request('/api/facilities', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
  });

  it('rejects an unauthenticated request to a protected API', async () => {
    const response = await request('/api/procurement/purchases');
    expect(response.status).toBe(401);
  });

  it('rejects invalid and expired tokens on protected APIs', async () => {
    const invalidResponse = await request('/api/procurement/purchases', {
      headers: { Authorization: 'Bearer invalid.token.value' },
    });
    const expiredToken = jwt.sign({ userId: 'expired-user' }, ENV.JWT_SECRET, { expiresIn: -1 });
    const expiredResponse = await request('/api/procurement/purchases', {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    expect(invalidResponse.status).toBe(401);
    expect(expiredResponse.status).toBe(401);
  });

  it('does not report success for unavailable password reset operations', async () => {
    const forgot = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'buyer@example.com' }),
    });
    const reset = await request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'unused-token', newPassword: 'new-password-123' }),
    });
    const forgotBody = await forgot.json();
    const resetBody = await reset.json();

    expect(forgot.status).toBe(501);
    expect(forgotBody.error.code).toBe('PASSWORD_RESET_UNAVAILABLE');
    expect(reset.status).toBe(501);
    expect(resetBody.error.code).toBe('PASSWORD_RESET_UNAVAILABLE');
  });
});