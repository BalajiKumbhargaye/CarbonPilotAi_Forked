'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@/components/ui/LoadingState';
import { apiCurrentUser, clearStoredSession, getPortalDestination, getStoredSession, type OrganizationType } from '@/lib/auth';

export function ProtectedRoute({
  children,
  allowedTypes,
}: {
  children: React.ReactNode;
  allowedTypes: OrganizationType[];
}) {
  const router = useRouter();
  const allowedType = allowedTypes[0];
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
        const role = response.membership?.role || session.user.role;
        const organizationType = response.organization?.type || session.user.organization.type;
        const portalDestination = getPortalDestination(role, organizationType);

        if (!portalDestination) {
          clearStoredSession();
          router.replace('/login');
          return;
        }

        if (organizationType !== allowedType) {
          router.replace(portalDestination);
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
  }, [allowedType, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <LoadingState message="Checking your session..." />
      </div>
    );
  }

  return <>{children}</>;
}
