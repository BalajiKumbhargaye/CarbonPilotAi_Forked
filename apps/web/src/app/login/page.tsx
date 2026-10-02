'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { apiLogin, setStoredSession } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('elena.vance@apexmobility.example.com');
  const [password, setPassword] = useState('CarbonPilot2026!');
  const [isLoading, setIsLoading] = useState(false);
  const [roleSelection, setRoleSelection] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await apiLogin({ email, password });
      setStoredSession({
        token: response.token,
        user: response.user,
      });

      const destination = response.user.organization.type === 'CUSTOMER' ? '/customer/dashboard' : '/supplier/dashboard';
      router.push(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in to your organization"
      subtitle="Access your sustainability intelligence workspace"
    >
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="rounded-lg bg-slate-100 p-1 dark:bg-slate-800 flex text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setRoleSelection('CUSTOMER');
              setEmail('elena.vance@apexmobility.example.com');
            }}
            className={`flex-1 py-1.5 rounded-md transition-all ${
              roleSelection === 'CUSTOMER'
                ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-400'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Buyer (Customer)
          </button>
          <button
            type="button"
            onClick={() => {
              setRoleSelection('SUPPLIER');
              setEmail('suresh@titansteel.example.com');
            }}
            className={`flex-1 py-1.5 rounded-md transition-all ${
              roleSelection === 'SUPPLIER'
                ? 'bg-white text-teal-700 shadow-sm dark:bg-slate-900 dark:text-teal-400'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Vendor (Supplier)
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </div>
        )}

        <Input
          label="Corporate Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <div>
          <div className="flex items-center justify-between pb-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <Button type="submit" isLoading={isLoading} className="w-full">
          Sign In as {roleSelection === 'CUSTOMER' ? 'Customer' : 'Supplier'}
        </Button>

        <p className="text-center text-xs text-slate-500">
          New to CarbonPilot?{' '}
          <Link href="/register" className="font-semibold text-emerald-600 hover:underline">
            Register organization
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
