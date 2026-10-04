import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { ENV } from '../src/config/env';

vi.mock('../src/config/database', () => ({ isDatabaseConnected: () => true }));

const state = vi.hoisted(() => ({
  filters: [] as Array<Record<string, unknown>>,
}));

vi.mock('../src/models/ProcurementDecision', () => ({
  ProcurementDecisionModel: {
    find: vi.fn((filter: Record<string, unknown>) => {
      state.filters.push(filter);
      const query = {
        populate: () => query,
        sort: () => query,
        then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve([] as unknown[]).then(resolve, reject),
      };
      return query;
    }),
  },
}));

const buyerA = '100000000000000000000001';
const buyerB = '100000000000000000000002';

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
  state.filters.splice(0);
});

function token(organizationId: string, organizationType: 'CUSTOMER' | 'SUPPLIER') {
  return jwt.sign({
    userId: `user-${organizationId}`,
    organizationId,
    organizationType,
    role: organizationType === 'CUSTOMER' ? 'CUSTOMER_ADMIN' : 'SUPPLIER_ADMIN',
    email: `${organizationId}@example.test`,
  }, ENV.JWT_SECRET, { expiresIn: '10m' });
}

async function request(bearer: string) {
  return fetch(`${apiUrl}/api/procurement-decisions`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
}

describe('procurement decision access control', () => {
  it('scopes the buyer decision list to the authenticated organization', async () => {
    const response = await request(token(buyerA, 'CUSTOMER'));

    expect(response.status).toBe(200);
    expect(state.filters).toEqual([{ organizationId: buyerA }]);
  });

  it('does not expose buyer decisions to suppliers', async () => {
    const response = await request(token('200000000000000000000001', 'SUPPLIER'));

    expect(response.status).toBe(403);
    expect(state.filters).toEqual([]);
  });

  it('keeps the decision query isolated when another buyer requests the list', async () => {
    const response = await request(token(buyerB, 'CUSTOMER'));

    expect(response.status).toBe(200);
    expect(state.filters).toEqual([{ organizationId: buyerB }]);
  });
});
