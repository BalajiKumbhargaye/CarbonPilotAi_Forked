'use client';

import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { PortalPage } from '@/components/ui/PortalPage';
import { EvidenceDocumentsWorkspace } from '@/components/evidence/EvidenceDocumentsWorkspace';

const sectionMap: Record<string, { title: string; subtitle: string; stats: Array<{ label: string; value: string }> }> = {
  questionnaires: {
    title: 'Questionnaires',
    subtitle: 'Supplier data capture and review workflows are scaffolded for future forms.',
    stats: [{ label: 'Status', value: 'Scaffolded' }, { label: 'Workflow', value: '3 steps' }, { label: 'Priority', value: 'High' }],
  },
  documents: {
    title: 'Documents',
    subtitle: 'Document intake and review infrastructure is prepared for evidence uploads.',
    stats: [{ label: 'Storage', value: 'Ready' }, { label: 'Types', value: 'PCF / EPD' }, { label: 'Review', value: 'Queued' }],
  },
  'evidence-center': {
    title: 'Evidence Center',
    subtitle: 'Evidence collections and claim attachments are in the foundation phase.',
    stats: [{ label: 'Linked claims', value: '0' }, { label: 'Pending review', value: '12' }, { label: 'Coverage', value: '82%' }],
  },
  anomalies: {
    title: 'Anomalies',
    subtitle: 'Mismatch detection workflows are designed but not yet trained with business rules.',
    stats: [{ label: 'Open issues', value: '8' }, { label: 'Risk status', value: 'Moderate' }, { label: 'Escalations', value: '2' }],
  },
  'carbon/overview': {
    title: 'Carbon Overview',
    subtitle: 'This page is reserved for portfolio emissions summary and reporting rollups.',
    stats: [{ label: 'Scope 1', value: '18.4k' }, { label: 'Scope 2', value: '12.1k' }, { label: 'Scope 3', value: '48.7k' }],
  },
  'carbon/scope-3': {
    title: 'Scope 3',
    subtitle: 'Supplier-driven emissions analyses are in the configuration phase.',
    stats: [{ label: 'Suppliers', value: '47' }, { label: 'Coverage', value: '76%' }, { label: 'Primary risk', value: 'Logistics' }],
  },
  'carbon/calculations': {
    title: 'Calculations',
    subtitle: 'Calculation logic and methodology templates are prepared for later implementation.',
    stats: [{ label: 'Models', value: '4' }, { label: 'Method', value: 'GWP' }, { label: 'Status', value: 'WIP' }],
  },
  reports: {
    title: 'Reports',
    subtitle: 'Executive reporting pages are staged as navigation-ready placeholders.',
    stats: [{ label: 'Saved views', value: '6' }, { label: 'Recent run', value: 'Today' }, { label: 'Format', value: 'PDF / CSV' }],
  },
  'evidence-packs': {
    title: 'Evidence Packs',
    subtitle: 'Collated verification outputs are prepared for audit-ready packaging.',
    stats: [{ label: 'Draft packs', value: '2' }, { label: 'Ready', value: '5' }, { label: 'Pending', value: '3' }],
  },
  notifications: {
    title: 'Notifications',
    subtitle: 'Notifications and task reminders are scaffolded for later workflow automation.',
    stats: [{ label: 'Unread', value: '9' }, { label: 'Escalated', value: '2' }, { label: 'Follow-ups', value: '6' }],
  },
  settings: {
    title: 'Settings',
    subtitle: 'Organization controls and policy preferences are placed here for configuration work.',
    stats: [{ label: 'SAML', value: 'Off' }, { label: 'Integrations', value: '3' }, { label: 'Compliance', value: 'Ready' }],
  },
};

function toTitle(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function CustomerDynamicPage() {
  const params = useParams<{ slug?: string[] }>();
  const slug = params.slug ? params.slug.join('/') : 'dashboard';
  if (slug === 'documents' || slug === 'evidence-center') {
    return (
      <PortalPage
        title={slug === 'documents' ? 'Documents' : 'Evidence Center'}
        subtitle="Review uploaded evidence, extract available fields, and run claim verification."
      >
        <EvidenceDocumentsWorkspace />
      </PortalPage>
    );
  }

  const content = sectionMap[slug] ?? {
    title: toTitle(slug || 'Dashboard'),
    subtitle: 'This section is part of the CarbonPilot foundation and is ready for future feature wiring.',
    stats: [{ label: 'Status', value: 'Scaffolded' }, { label: 'Priority', value: 'Next' }, { label: 'Implementation', value: 'Planned' }],
  };

  return (
    <PortalPage title={content.title} subtitle={content.subtitle} stats={content.stats}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Foundation scope</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li>• Portal route and layout shell are active.</li>
            <li>• Auth guard is enforced for this portal.</li>
            <li>• Placeholder pages are in place for future workflow modules.</li>
          </ul>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Planned next steps</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li>• Connect each section to domain APIs.</li>
            <li>• Add data tables, filters, and forms for real operations.</li>
            <li>• Implement any business intelligence features only after the foundation is complete.</li>
          </ul>
        </Card>
      </div>
    </PortalPage>
  );
}
