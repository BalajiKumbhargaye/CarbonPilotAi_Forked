'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LoadingState } from '@/components/ui/LoadingState';
import { apiCurrentUser, clearStoredSession, getStoredSession, type OrganizationType } from '@/lib/auth';

export function ProtectedRoute({
  children,
  allowedTypes,
}: {
  children: React.ReactNode;
  allowedTypes: OrganizationType[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const validate = async () => {
      const session = getStoredSession();

      if (!session?.token) {
        router.replace('/login');
        return;
      }

      try {
        const response = await apiCurrentUser();
        const currentOrgType = response?.organization?.type || response?.user?.organization?.type || session.user.organization.type;

        if (!allowedTypes.includes(currentOrgType as OrganizationType)) {
          router.replace(currentOrgType === 'CUSTOMER' ? '/customer/dashboard' : '/supplier/dashboard');
          return;
        }

        if (pathname?.startsWith('/customer') && currentOrgType !== 'CUSTOMER') {
          router.replace('/supplier/dashboard');
          return;
        }

        if (pathname?.startsWith('/supplier') && currentOrgType !== 'SUPPLIER') {
          router.replace('/customer/dashboard');
          return;
        }

        if (!cancelled) {
          setReady(true);
        }
      } catch {
        clearStoredSession();
        if (!cancelled) {
          router.replace('/login');
        }
      }
    };

    validate();

    return () => {
      cancelled = true;
    };
  }, [allowedTypes, pathname, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <LoadingState message="Checking your session..." />
      </div>
    );
  }

  return <>{children}</>;
}
