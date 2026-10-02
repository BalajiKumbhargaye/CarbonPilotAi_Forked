'use client';

import React from 'react';
import { SupplierLayout } from '@/components/layouts/SupplierLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export default function SupplierPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute allowedTypes={['SUPPLIER']}>
      <SupplierLayout>{children}</SupplierLayout>
    </ProtectedRoute>
  );
}
