'use client';

import { notFound, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { PortalPage } from '@/components/ui/PortalPage';
import { EvidenceDocumentsWorkspace } from '@/components/evidence/EvidenceDocumentsWorkspace';

const sectionTitles: Record<string, string> = {
  'company/profile': 'Company Profile',
  products: 'Products',
  customers: 'Customers',
  'data-requests': 'Data Requests',
  documents: 'Documents',
  evidence: 'Evidence',
  notifications: 'Notifications',
  settings: 'Settings',
};

const unavailableSections = new Set([
  'facilities',
  'customer-requests',
  'questionnaires',
  'carbon-data',
  'certificates',
  'verification-issues',
  'evidence-packs',
]);

function toTitle(value: string) {
  return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export default function SupplierDynamicPage() {
  const params = useParams<{ slug?: string[] }>();
  const slug = params.slug ? params.slug.join('/') : 'dashboard';
  if (unavailableSections.has(slug)) notFound();
  if (slug === 'documents' || slug === 'evidence') {
    return (
      <PortalPage title={slug === 'documents' ? 'Documents' : 'Evidence'} subtitle="Upload supplier evidence and review persisted extraction and verification results.">
        <EvidenceDocumentsWorkspace mode="supplier" />
      </PortalPage>
    );
  }

  const title = sectionTitles[slug] ?? toTitle(slug || 'Dashboard');
  return (
    <PortalPage title={title} subtitle="This area does not currently provide persisted operational records.">
      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Not available</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          No live data or analytics are available for this section yet. No demo metrics are shown.
        </p>
        <Link href="/supplier/dashboard" className="mt-4 inline-block text-sm font-semibold text-teal-800 hover:underline">
          Return to overview
        </Link>
      </Card>
    </PortalPage>
  );
}
