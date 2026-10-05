'use client';

import Link from 'next/link';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Password recovery"
    >
      <div className="space-y-4">
        <Alert variant="warning" title="Unavailable in this demo">
          Password reset is not available in this demo. Contact your organization administrator for account recovery.
        </Alert>
        <Link href="/login">
          <Button variant="outline" className="w-full">Back to Login</Button>
        </Link>
      </div>
    </AuthLayout>
  );
}
