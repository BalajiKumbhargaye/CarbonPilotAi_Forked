import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import { loginSchema, registerSchema, createProductSchema } from '@carbonpilot/validation';
import { UserRole, OrganizationType, ClaimStatus } from '@carbonpilot/shared';

describe('CarbonPilot Technical Foundation Tests', () => {
  it('should initialize express app with all middleware', () => {
    const app = createApp();
    expect(app).toBeDefined();
  });

  it('should validate registration schemas strictly', () => {
    const validData = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      organizationName: 'Acme Corp',
      organizationType: OrganizationType.CUSTOMER,
      role: UserRole.CUSTOMER_ADMIN,
    };
    const result = registerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject invalid emails in auth schemas', () => {
    const invalidData = {
      email: 'invalid-email',
      password: '123',
    };
    const result = loginSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should validate product schema with carbon data', () => {
    const product = {
      supplierId: 'supp-123',
      name: 'Low Carbon Aluminum',
      productCode: 'AL-LC-10',
      category: 'Metals',
      carbonData: {
        pcf: 4.2,
        unit: 'kgCO2e/kg',
        methodology: 'ISO 14067',
        reportingPeriod: '2024',
        boundary: 'Cradle-to-Gate',
      },
    };
    const result = createProductSchema.safeParse(product);
    expect(result.success).toBe(true);
  });

  it('should ensure claim statuses conform to enterprise taxonomy', () => {
    expect(ClaimStatus.SUPPORTED).toBe('SUPPORTED');
    expect(ClaimStatus.PARTIALLY_SUPPORTED).toBe('PARTIALLY_SUPPORTED');
    expect(ClaimStatus.UNSUPPORTED).toBe('UNSUPPORTED');
    expect(ClaimStatus.PENDING).toBe('PENDING');
  });
});
