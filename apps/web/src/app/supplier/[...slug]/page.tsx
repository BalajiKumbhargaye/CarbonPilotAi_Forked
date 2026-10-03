'use client';

import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { PortalPage } from '@/components/ui/PortalPage';
import { EvidenceDocumentsWorkspace } from '@/components/evidence/EvidenceDocumentsWorkspace';

const sectionMap: Record<string, { title: string; subtitle: string; stats: Array<{ label: string; value: string }> }> = {
  'company/profile': {
    title: 'Company Profile',
    subtitle: 'Company profile details and verification metadata are ready for expansion.',
    stats: [{ label: 'Verification', value: 'Active' }, { label: 'Facilities', value: '3' }, { label: 'Status', value: 'Ready' }],
  },
  facilities: {
    title: 'Facilities',
    subtitle: 'Facility master data scaffolding is ready for site and capacity management.',
    stats: [{ label: 'Sites', value: '3' }, { label: 'Capacity', value: '18k' }, { label: 'Risk', value: 'Low' }],
  },
  products: {
    title: 'Products',
    subtitle: 'Product catalog and carbon data hookups are in the placeholder stage.',
    stats: [{ label: 'Products', value: '42' }, { label: 'PCF linked', value: '19' }, { label: 'Coverage', value: '78%' }],
  },
  customers: {
    title: 'Customers',
    subtitle: 'Customer relationship tracking remains as a navigation-ready foundation shell.',
    stats: [{ label: 'Active', value: '14' }, { label: 'Requests', value: '6' }, { label: 'Retention', value: '94%' }],
  },
  'customer-requests': {
    title: 'Customer Requests',
    subtitle: 'Requests and follow-up actions are staged for future request management logic.',
    stats: [{ label: 'Open', value: '4' }, { label: 'Due today', value: '2' }, { label: 'Response rate', value: '91%' }],
  },
  'data-requests': {
    title: 'Data Requests',
    subtitle: 'This section is prepared for supplier data response workflows and audits.',
    stats: [{ label: 'Due this week', value: '5' }, { label: 'Submitted', value: '7' }, { label: 'Pending', value: '3' }],
  },
  questionnaires: {
    title: 'Questionnaires',
    subtitle: 'Questionnaire forms and response review flows are scaffolded for later work.',
    stats: [{ label: 'Templates', value: '6' }, { label: 'Open', value: '2' }, { label: 'Closed', value: '14' }],
  },
  'carbon-data': {
    title: 'Carbon Data',
    subtitle: 'Supplier carbon intensity and performance data cards are staged here.',
    stats: [{ label: 'Emission factor', value: '1.42' }, { label: 'Intensity', value: '0.84' }, { label: 'Trend', value: '+2.1%' }],
  },
  documents: {
    title: 'Documents',
    subtitle: 'Document management is available as a shell for uploads and metadata review.',
    stats: [{ label: 'Uploaded', value: '327' }, { label: 'Processing', value: '4' }, { label: 'Verified', value: '281' }],
  },
  certificates: {
    title: 'Certificates',
    subtitle: 'Verified certificates and expirations are structured as a placeholder module.',
    stats: [{ label: 'Valid', value: '12' }, { label: 'Expiring', value: '3' }, { label: 'Expired', value: '1' }],
  },
  evidence: {
    title: 'Evidence',
    subtitle: 'Evidence pack references and supporting documents are queued for workflow integration.',
    stats: [{ label: 'Evidence links', value: '24' }, { label: 'Pending', value: '6' }, { label: 'Validated', value: '18' }],
  },
  'verification-issues': {
    title: 'Verification Issues',
    subtitle: 'Issue triage and remediation flows are included to support later verification logic.',
    stats: [{ label: 'Open', value: '3' }, { label: 'High risk', value: '1' }, { label: 'Resolved', value: '5' }],
  },
  'evidence-packs': {
    title: 'Evidence Packs',
    subtitle: 'Supplier evidence packs are prepared and staged for audit distribution.',
    stats: [{ label: 'Draft', value: '2' }, { label: 'Ready', value: '4' }, { label: 'Sent', value: '8' }],
  },
  notifications: {
    title: 'Notifications',
    subtitle: 'Operational notifications are ready for future supplier task automations.',
    stats: [{ label: 'Unread', value: '7' }, { label: 'Assigned', value: '3' }, { label: 'High priority', value: '2' }],
  },
  settings: {
    title: 'Settings',
    subtitle: 'Platform controls and preferences are reserved for the supplier configuration layer.',
    stats: [{ label: 'Roles', value: '6' }, { label: 'Policies', value: '3' }, { label: 'Access', value: 'Managed' }],
  },
};

function toTitle(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function SupplierDynamicPage() {
  const params = useParams<{ slug?: string[] }>();
  const slug = params.slug ? params.slug.join('/') : 'dashboard';
  if (slug === 'documents' || slug === 'evidence') {
    return (
      <PortalPage
        title={slug === 'documents' ? 'Documents' : 'Evidence'}
        subtitle="Upload supplier evidence, review extraction results, and run claim verification."
      >
        <EvidenceDocumentsWorkspace />
      </PortalPage>
    );
  }

  const content = sectionMap[slug] ?? {
    title: toTitle(slug || 'Dashboard'),
    subtitle: 'This supplier area is part of the CarbonPilot foundation and is intentionally limited to a navigable shell.',
    stats: [{ label: 'Status', value: 'Scaffolded' }, { label: 'Priority', value: 'Next' }, { label: 'Implementation', value: 'Planned' }],
  };

  return (
    <PortalPage title={content.title} subtitle={content.subtitle} stats={content.stats}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Supplier workflow shell</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li>• Supplier portal layout and navigation are active.</li>
            <li>• Auth checks keep the supplier workspace protected.</li>
            <li>• Real operational modules are intentionally deferred.</li>
          </ul>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Planned follow-through</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li>• Add attribute-specific forms and tables for each module.</li>
            <li>• Stitch each screen to the review, verification, and reporting APIs.</li>
            <li>• Expand supplier analytics only after the groundwork is stable.</li>
          </ul>
        </Card>
      </div>
    </PortalPage>
  );
}
