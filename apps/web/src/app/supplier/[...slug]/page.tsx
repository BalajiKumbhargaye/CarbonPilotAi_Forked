'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { PortalPage } from '@/components/ui/PortalPage';
import { EvidenceDocumentsWorkspace } from '@/components/evidence/EvidenceDocumentsWorkspace';
import { SupplierVerificationFeedback } from '@/components/evidence/SupplierVerificationFeedback';

const sectionTitles: Record<string, string> = {
  'company/profile': 'Company Profile',
  facilities: 'Facilities',
  products: 'Products',
  customers: 'Customers',
  'customer-requests': 'Customer Requests',
  'data-requests': 'Data Requests',
  questionnaires: 'Questionnaires',
  'carbon-data': 'Carbon Data',
  documents: 'Documents',
  certificates: 'Certificates',
  evidence: 'Evidence',
  'verification-issues': 'Verification Issues',
  'evidence-packs': 'Evidence Packs',
  notifications: 'Notifications',
  settings: 'Settings',
};

function toTitle(value: string) {
  return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export default function SupplierDynamicPage() {
  const params = useParams<{ slug?: string[] }>();
  const slug = params.slug ? params.slug.join('/') : 'dashboard';
  if (slug === 'verification-issues') {
    return (
      <PortalPage title="Verification Feedback" subtitle="Review persisted buyer-raised evidence issues linked to your Data Requests.">
        <SupplierVerificationFeedback />
      </PortalPage>
    );
  }
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
