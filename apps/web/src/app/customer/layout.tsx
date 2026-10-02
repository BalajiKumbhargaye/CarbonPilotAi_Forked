'use client';

import React from 'react';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export default function CustomerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute allowedTypes={['CUSTOMER']}>
      <CustomerLayout>{children}</CustomerLayout>
    </ProtectedRoute>
  );
}
