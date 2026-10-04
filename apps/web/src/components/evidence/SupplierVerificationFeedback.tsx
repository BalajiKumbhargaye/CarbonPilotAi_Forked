'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ShieldAlert } from 'lucide-react';
import { IAnomaly, IClaim } from '@carbonpilot/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getVerificationClaims, getVerificationIssues } from '@/lib/evidence';

export function SupplierVerificationFeedback() {
  const [claims, setClaims] = useState<IClaim[]>([]);
  const [issues, setIssues] = useState<IAnomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getVerificationClaims(), getVerificationIssues()])
      .then(([claimItems, issueItems]) => {
        setClaims(claimItems);
        setIssues(issueItems);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load verification feedback.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Card className="text-sm text-slate-500">Loading verification feedback…</Card>;
  if (error) return <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>;

  return (
    <div className="space-y-4">
      {issues.length === 0 ? (
        <Card className="text-sm text-slate-600">There are no open verification issues for your submissions.</Card>
      ) : issues.map((issue) => {
        const claim = claims.find((item) => item._id === issue.claimId);
        return (
          <Card key={issue._id} className="space-y-3 p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase text-amber-800">{issue.status.replaceAll('_', ' ')}</p>
                <h2 className="mt-1 font-semibold text-slate-950">{issue.description}</h2>
                {claim && <p className="mt-2 text-sm text-slate-600">Your submitted claim: {claim.claimText || `${claim.type}: ${claim.value} ${claim.unit}`}</p>}
                <p className="mt-2 text-sm text-slate-700">Recommended next step: {issue.recommendedAction || 'Review the request and provide supporting information.'}</p>
              </div>
            </div>
            {claim?.dataRequestId ? (
              <Link href={`/supplier/data-requests/${claim.dataRequestId}`}>
                <Button size="sm" variant="outline"><ArrowUpRight className="h-4 w-4" /> Respond in Data Request</Button>
              </Link>
            ) : (
              <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">
                This claim is not linked to a Data Request. Contact the buyer to route clarification through the supplier request workflow.
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}