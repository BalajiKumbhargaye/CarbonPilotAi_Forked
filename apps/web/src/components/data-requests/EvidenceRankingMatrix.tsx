'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { DataRequestDocumentLink, DataRequestRecord } from '@/lib/data-requests';

interface EvidenceCell {
  score: number;
  status: string;
  reasons: string[];
  documents: DataRequestDocumentLink[];
  rank?: number;
}

interface RankedRequest {
  request: DataRequestRecord;
  supplierName: string;
  cells: Map<string, EvidenceCell>;
}

interface RankingGroup {
  id: string;
  label: string;
  inferredLegacyGroup: boolean;
  documentTypes: string[];
  rows: RankedRequest[];
}

function prettyLabel(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function itemDocumentTypes(request: DataRequestRecord, item: DataRequestRecord['requestedItems'][number]) {
  if (item.acceptedDocumentTypes?.length) return item.acceptedDocumentTypes;
  const documents = item.response?.evidenceDocuments || [];
  const actualTypes = Array.from(new Set(documents.map((document) => document.documentType).filter((type): type is string => !!type)));
  if (actualTypes.length) return actualTypes;
  return ['OTHER'];
}

function scoreEvidence(documents: DataRequestDocumentLink[]): EvidenceCell {
  const activeDocuments = documents.filter((document) => !document.replacedByDocumentId);
  if (!activeDocuments.length) {
    return {
      score: 0,
      status: 'Not submitted',
      reasons: ['No document has been submitted for this requirement.'],
      documents: [],
    };
  }

  let bestScore = 0;
  let bestStatus = 'Document submitted';
  let bestReasons: string[] = [];

  for (const document of activeDocuments) {
    let score = 20;
    const reasons = [`Document submitted: ${document.filename}.`];
    let status = 'Document submitted';

    if (document.extraction?.status === 'EXTRACTED' || document.status === 'EXTRACTED' || document.status === 'IMPORTED') {
      score += 15;
      reasons.push(`Text extraction completed${document.extraction?.pageCount ? ` across ${document.extraction.pageCount} page(s)` : ''}.`);
    } else if (document.extraction?.status === 'NEEDS_REVIEW' || document.status === 'NEEDS_REVIEW') {
      score += 5;
      reasons.push('The extracted document needs review.');
    } else if (document.status === 'FAILED' || document.extraction?.status === 'FAILED') {
      reasons.push('Document processing failed.');
    } else {
      reasons.push('Document is uploaded; extraction is still pending.');
    }

    const supplierClaims = (document.claims || []).filter((claim) => claim.supplierDeclared);
    if (supplierClaims.length) {
      score += 10;
      reasons.push(`Supplier-declared claim: ${supplierClaims.map((claim) => `${prettyLabel(claim.type)} ${claim.value}${claim.unit ? ` ${claim.unit}` : ''}`).join('; ')}.`);
      const comparisonChecks = supplierClaims.flatMap((claim) =>
        (claim.verification?.checks || []).filter((check) =>
          ['QUANTITY_MATCH', 'CROSS_DOCUMENT_CONSISTENCY'].includes(check.checkType)
        )
      );
      const passed = comparisonChecks.filter((check) => check.result === 'PASS');
      const failed = comparisonChecks.filter((check) => check.result === 'FAIL');
      const unknown = comparisonChecks.filter((check) => check.result === 'UNKNOWN');

      if (failed.length) {
        score -= Math.min(60, failed.length * 30);
        status = 'Claim inconsistent with evidence';
      } else if (passed.length) {
        score += Math.min(45, passed.length * 25);
        status = 'Claim-evidence comparison passed';
      } else {
        status = 'Claim comparison unavailable';
      }
      for (const check of comparisonChecks) reasons.push(check.explanation);
      if (!comparisonChecks.length) reasons.push('No direct claim-to-evidence comparison is available yet; this is not treated as a match.');
      else if (unknown.length && !passed.length && !failed.length) reasons.push('Available comparison checks are inconclusive.');
      if (supplierClaims.some((claim) => claim.evidence?.page || claim.sourceReference?.page)) {
        score += 5;
        reasons.push('The linked claim includes a document page citation.');
      }
    } else {
      reasons.push('No supplier-declared claim is linked to this document; consistency cannot be ranked yet.');
    }
    const boundedScore = Math.max(0, Math.min(100, score));
    if (boundedScore > bestScore) {
      bestScore = boundedScore;
      bestStatus = status;
      bestReasons = reasons;
    }
  }

  return {
    score: bestScore,
    status: bestStatus,
    reasons: bestReasons,
    documents: activeDocuments,
  };
}

function buildGroups(requests: DataRequestRecord[]): RankingGroup[] {
  const grouped = new Map<string, DataRequestRecord[]>();
  for (const request of requests) {
    if (request.status === 'DRAFT' || request.status === 'CANCELLED') continue;
    const documentItems = request.requestedItems.filter((item) => item.responseType === 'DOCUMENT' || item.requiresEvidence);
    if (!documentItems.length) continue;
    const documentSignature = Array.from(new Set(documentItems.flatMap((item) => itemDocumentTypes(request, item))))
      .sort((left, right) => left.localeCompare(right))
      .join(',');
    const createdAt = request.createdAt ? new Date(request.createdAt).getTime() : Number.NaN;
    const isLegacyBatchCandidate = request.title.toLowerCase().endsWith('supporting documents') && Number.isFinite(createdAt);
    const fallbackKey = isLegacyBatchCandidate
      ? `legacy:${documentSignature}:${Math.floor(createdAt / (5 * 60 * 1000))}:${request.description}:${request.deadline || ''}`
      : `product:${(request.product?.name || 'unassigned').trim().toLowerCase()}`;
    const groupId = request.requestGroupId || fallbackKey;
    grouped.set(groupId, [...(grouped.get(groupId) || []), request]);
  }

  return Array.from(grouped, ([id, groupRequests]) => {
    const documentTypes = Array.from(new Set(groupRequests.flatMap((request) =>
      request.requestedItems
        .filter((item) => item.responseType === 'DOCUMENT' || item.requiresEvidence)
        .flatMap((item) => itemDocumentTypes(request, item))
    ))).sort((left, right) => left.localeCompare(right));

    const rows: RankedRequest[] = groupRequests.map((request) => {
      const cells = new Map<string, EvidenceCell>();
      for (const documentType of documentTypes) {
        const matchingItems = request.requestedItems.filter((item) =>
          (item.responseType === 'DOCUMENT' || item.requiresEvidence)
          && itemDocumentTypes(request, item).includes(documentType)
        );
        if (!matchingItems.length) {
          cells.set(documentType, {
            score: 0,
            status: 'Not requested',
            reasons: ['This document type was not included in this supplier request.'],
            documents: [],
          });
          continue;
        }
        const documents = matchingItems.flatMap((item) => {
          if (item.responseType !== 'DOCUMENT' && !item.requiresEvidence) return [];
          return item.response?.evidenceDocuments || [];
        }).filter((document) => !document.documentType || document.documentType === documentType);
        cells.set(documentType, scoreEvidence(documents));
      }
      return {
        request,
        supplierName: request.supplierOrganization?.name || 'Supplier',
        cells,
      };
    });

    const typesForRanking = documentTypes;
    for (const documentType of typesForRanking) {
      const ranked = rows.filter((row) => row.cells.get(documentType)?.status !== 'Not requested').sort((left, right) => {
        const scoreDifference = (right.cells.get(documentType)?.score || 0) - (left.cells.get(documentType)?.score || 0);
        return scoreDifference || left.supplierName.localeCompare(right.supplierName);
      });
      ranked.forEach((row, index) => {
        const cell = row.cells.get(documentType);
        if (cell) cell.rank = index + 1;
      });
    }

    const inferredLegacyGroup = id.startsWith('legacy:');
    const label = inferredLegacyGroup
      ? `Earlier supplier requests${groupRequests[0]?.createdAt ? ` · ${new Date(groupRequests[0].createdAt).toLocaleString()}` : ''}`
      : groupRequests[0]?.product?.name || 'Product evidence requests';
    return { id, label, inferredLegacyGroup, documentTypes, rows };
  }).filter((group) => group.documentTypes.length > 0);
}

export function EvidenceRankingMatrix({ requests }: { requests: DataRequestRecord[] }) {
  const groups = buildGroups(requests);
  if (!groups.length) return null;

  return <section className="space-y-4" aria-labelledby="evidence-ranking-title">
    <div>
      <h2 id="evidence-ranking-title" className="text-base font-semibold text-slate-900">Supplier ranking by requested document</h2>
      <p className="mt-1 text-sm text-slate-500">Each document column is ranked independently. Supplier-declared claims score on actual quantity/cross-document verification checks; missing comparisons are shown as unavailable, not as matches.</p>
    </div>
    {groups.map((group) => <Card key={group.id}>
      <CardHeader>
        <CardTitle>{group.label}</CardTitle>
        {group.inferredLegacyGroup && <p className="text-xs text-amber-700">This group is inferred for older requests without a batch ID, based on matching document types, message, due date, and creation time. Confirm the listed products are comparable.</p>}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="whitespace-nowrap px-4 py-3">Supplier</th>
                {group.documentTypes.map((documentType) => <th key={documentType} className="min-w-64 px-4 py-3">{prettyLabel(documentType)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {group.rows.map(({ request, supplierName, cells }) => <tr key={request._id} className="align-top">
                <th scope="row" className="whitespace-nowrap px-4 py-4 text-left font-semibold text-slate-900">
                  {supplierName}
                  <span className="mt-1 block text-xs font-normal text-slate-500">{request.product?.name || 'Product not specified'}</span>
                </th>
                {group.documentTypes.map((documentType) => {
                  const cell = cells.get(documentType);
                  if (!cell) return <td key={documentType} className="px-4 py-4 text-slate-400">Not requested</td>;
                  return <td key={documentType} className="px-4 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">Rank #{cell.rank}</span>
                      <span className="text-xs tabular-nums text-slate-500">{cell.score}/100</span>
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-700">{cell.status}</p>
                    <ul className="mt-1 space-y-1 text-xs text-slate-500">
                      {cell.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                    {cell.documents.length > 0 && <div className="mt-2 space-y-1">
                      {cell.documents.map((document) => {
                        const citedPages = Array.from(new Set((document.claims || [])
                          .map((claim) => claim.evidence?.page || claim.sourceReference?.page)
                          .filter((page): page is number => typeof page === 'number')));
                        return <Link key={document._id} href={`/customer/data-requests/${request._id}`} className="block text-xs font-medium text-emerald-800 underline hover:text-emerald-900">
                          Inspect {document.filename}{citedPages.length ? ` · page ${citedPages.join(', ')}` : ''}
                        </Link>;
                      })}
                    </div>}
                  </td>;
                })}
              </tr>)}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>)}
  </section>;
}
