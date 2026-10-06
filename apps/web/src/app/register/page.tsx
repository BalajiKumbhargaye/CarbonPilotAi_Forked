'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { apiRegister, getPortalDestination, setStoredSession } from '@/lib/auth';

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    organizationName: '',
    organizationType: 'CUSTOMER',
    role: 'CUSTOMER_ADMIN',
    industry: 'Manufacturing',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await apiRegister({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        organizationName: formData.organizationName,
        organizationType: formData.organizationType as 'CUSTOMER' | 'SUPPLIER',
        role: formData.role as 'CUSTOMER_ADMIN' | 'SUPPLIER_ADMIN',
        industry: formData.industry,
      });

      const destination = getPortalDestination(response.user.role, response.user.organization.type);
      if (!destination) {
        throw new Error('Your account role does not match its organization. Please contact your administrator.');
      }

      setStoredSession({
        token: response.token,
        user: response.user,
      });

      router.push(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create your account.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your CarbonPilot account"
      subtitle="Register an organization to start collaborating on verified ESG claims"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </div>
        )}

        <Input
          label="Full Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g. Jane Doe"
          required
        />
        <Input
          label="Work Email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="jane@company.com"
          required
        />
        <Input
          label="Organization Name"
          value={formData.organizationName}
          onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
          placeholder="e.g. Precision Motors Inc"
          required
        />
        <Select
          label="Organization Type"
          value={formData.organizationType}
          onChange={(e) =>
            setFormData({
              ...formData,
              organizationType: e.target.value,
              role: e.target.value === 'CUSTOMER' ? 'CUSTOMER_ADMIN' : 'SUPPLIER_ADMIN',
            })
          }
          options={[
            { label: 'Customer / Buyer (e.g. OEM, Brand, Enterprise)', value: 'CUSTOMER' },
            { label: 'Supplier / Vendor (e.g. Parts, Materials, Chemicals)', value: 'SUPPLIER' },
          ]}
        />
        <Input
          label="Password (min 8 chars)"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          required
        />
        <Button type="submit" isLoading={isLoading} className="w-full mt-2">
          Create Account
        </Button>
        <p className="text-center text-xs text-slate-500">
          Already registered?{' '}
          <Link href="/login" className="font-semibold text-emerald-600 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
