'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { PortalPage } from '@/components/ui/PortalPage';
import { EvidenceDocumentsWorkspace } from '@/components/evidence/EvidenceDocumentsWorkspace';
import { VerificationDashboard } from '@/components/evidence/VerificationDashboard';

const sectionTitles: Record<string, string> = {
  questionnaires: 'Questionnaires',
  documents: 'Documents',
  'evidence-center': 'Evidence Center',
  anomalies: 'Anomalies',
  'carbon/overview': 'Carbon Overview',
  'carbon/scope-3': 'Scope 3',
  'carbon/calculations': 'Calculations',
  reports: 'Reports',
  'evidence-packs': 'Evidence Packs',
  notifications: 'Notifications',
  settings: 'Settings',
};

function toTitle(value: string) {
  return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export default function CustomerDynamicPage() {
  const params = useParams<{ slug?: string[] }>();
  const slug = params.slug ? params.slug.join('/') : 'dashboard';
  if (slug === 'evidence-center') {
    return (
      <PortalPage
        title="Supplier Claim Verification"
        subtitle="Review persisted evidence, rule results, issues, and corroboration status for connected suppliers."
      >
        <VerificationDashboard />
      </PortalPage>
    );
  }
  if (slug === 'documents') {
    return (
      <PortalPage title="Documents" subtitle="Review organization documents and their persisted processing state.">
        <EvidenceDocumentsWorkspace mode="buyer" />
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
        <Link href="/customer/dashboard" className="mt-4 inline-block text-sm font-semibold text-emerald-800 hover:underline">
          Return to overview
        </Link>
      </Card>
    </PortalPage>
  );
}
