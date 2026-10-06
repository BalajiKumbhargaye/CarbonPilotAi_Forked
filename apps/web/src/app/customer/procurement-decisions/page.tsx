'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, GitCompare, Inbox, Save } from 'lucide-react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { Select } from '@/components/ui/Select';
import { getProducts, type ProductItem } from '@/lib/products';
import {
  defaultDecisionPriorities,
  downloadDecisionEvidence,
  type DecisionPriorities,
  type PriorityLevel,
} from '@/lib/procurement-decisions';
import {
  compareDecisionScenario,
  createProcurementDecision,
  finalizeProcurementDecision,
  getProcurementDecisions,
  updateProcurementDecision,
  type DecisionScenario,
  type ProcurementDecisionRecord,
} from '@/lib/procurement-decisions';

const priorityLabels: Record<keyof DecisionPriorities, string> = {
  price: 'Price',
  carbon: 'Carbon emissions',
  evidenceQuality: 'Evidence quality',
  verificationStatus: 'Verification status',
  dataCompleteness: 'Data completeness',
  sustainabilityEvidence: 'Sustainability certificates',
  procurementReliability: 'Completed purchase history',
};

const emptyStatus = 'Not available';

function formatNumber(value?: number, maximumFractionDigits = 2) {
  return value === undefined || !Number.isFinite(value)
    ? 'Not available'
    : new Intl.NumberFormat('en-IN', { maximumFractionDigits }).format(value);
}

function formatMoney(value?: number, currency?: string) {
  if (value === undefined || !currency) return 'Not available';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${formatNumber(value)}`;
  }
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ProcurementDecisionsPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [currency, setCurrency] = useState('');
  const [priorities, setPriorities] = useState<DecisionPriorities>(defaultDecisionPriorities);
  const [compareRevision, setCompareRevision] = useState(0);
  const [scenario, setScenario] = useState<DecisionScenario | null>(null);
  const [decisions, setDecisions] = useState<ProcurementDecisionRecord[]>([]);
  const [decisionId, setDecisionId] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = useMemo(
    () => scenario?.options.find((option) => `${option.supplierId}:${option.productId}` === selectedOption),
    [scenario, selectedOption]
  );

  useEffect(() => {
    let active = true;
    Promise.all([getProducts({ status: 'ACTIVE' }), getProcurementDecisions()])
      .then(([items, decisionItems]) => {
        if (!active) return;
        setProducts(items);
        setDecisions(decisionItems);
        if (items.length) {
          setProductId(items[0]._id);
          setCurrency(items[0].currency || '');
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load procurement decision data.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!productId || !(Number(quantity) > 0)) {
      setScenario(null);
      setComparing(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setComparing(true);
      setError('');
      compareDecisionScenario(productId, Number(quantity), currency || undefined, priorities)
        .then((result) => {
          if (!active) return;
          setScenario(result);
          if (selectedOption && !result.options.some((option) => `${option.supplierId}:${option.productId}` === selectedOption)) {
            setSelectedOption('');
          }
        })
        .catch((compareError) => {
          if (active) {
            setScenario(null);
            setError(compareError instanceof Error ? compareError.message : 'Unable to compare supplier options.');
          }
        })
        .finally(() => { if (active) setComparing(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [productId, quantity, currency, priorities, compareRevision]);

  const choice = () => selected ? {
    selectedSupplierId: selected.supplierId,
    selectedProductId: selected.productId,
    decisionReason: reason.trim() || undefined,
    currency: scenario?.requestedCurrency || undefined,
    priorities: scenario?.priorities || priorities,
  } : {
    decisionReason: reason.trim() || undefined,
    currency: scenario?.requestedCurrency || undefined,
    priorities: scenario?.priorities || priorities,
  };

  const refreshDecisions = async () => setDecisions(await getProcurementDecisions());

  const saveDraft = async () => {
    if (!scenario) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        productId: scenario.product._id,
        quantity: scenario.quantity,
        ...choice(),
      };
      const record = decisionId
        ? await updateProcurementDecision(decisionId, payload)
        : await createProcurementDecision(payload);
      setDecisionId(record._id);
      setNotice('Decision draft saved. This does not create a purchase.');
      await refreshDecisions();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save decision draft.');
    } finally {
      setSaving(false);
    }
  };

  const submitForReview = async () => {
    if (!decisionId || !scenario) return;
    setSaving(true);
    setError('');
    try {
      await updateProcurementDecision(decisionId, {
        ...choice(),
        status: 'UNDER_REVIEW',
      });
      setNotice('Decision submitted for review.');
      await refreshDecisions();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to submit decision for review.');
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    if (!decisionId || !selected) {
      setError('Choose a supplier before finalizing the decision.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await finalizeProcurementDecision(decisionId, {
        selectedSupplierId: selected.supplierId,
        selectedProductId: selected.productId,
        decisionReason: reason.trim() || undefined,
      });
      setNotice('Decision recorded. No purchase or purchase order was created.');
      setDecisionId('');
      await refreshDecisions();
    } catch (finalizeError) {
      setError(finalizeError instanceof Error ? finalizeError.message : 'Unable to finalize decision.');
    } finally {
      setSaving(false);
    }
  };

  const currentDecision = decisions.find((decision) => decision._id === decisionId);
  const recommendedOption = scenario?.recommendation.recommendedSupplierId
    ? scenario.options.find((option) =>
      option.supplierId === scenario.recommendation.recommendedSupplierId
      && option.productId === scenario.recommendation.recommendedProductId
    )
    : undefined;
  const currencyOptions = Array.from(new Set([
    ...products.map((product) => product.currency).filter((value): value is string => !!value),
    ...(scenario?.options.map((option) => option.currency).filter((value): value is string => !!value) || []),
  ])).sort();

  const handleDownload = async (path: string, filename: string) => {
    try {
      await downloadDecisionEvidence(path, filename);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Unable to download source evidence.');
    }
  };

  if (loading) return <LoadingState message="Loading procurement decision workspace..." />;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Procurement', href: '/customer/purchases' }, { label: 'Decision Support' }]} />
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Carbon-aware procurement decision support</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">Compare every compatible active product from connected suppliers using current prices and supported persisted sustainability evidence. CarbonPilot recommends; your team makes the procurement decision.</p>
      </header>

      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-4 md:grid-cols-3">
          <Select
            label="Product / material"
            value={productId}
            onChange={(event) => {
              const product = products.find((item) => item._id === event.target.value);
              setProductId(event.target.value);
              setCurrency(product?.currency || '');
              setDecisionId('');
              setSelectedOption('');
            }}
            options={products.map((product) => ({
              value: product._id,
              label: `${product.name}${product.productCode ? ` (${product.productCode})` : ''} — ${product.supplier?.name || 'Supplier'}`,
            }))}
          />
          <Input
            label="Procurement quantity"
            type="number"
            min="0.000001"
            step="any"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          <label className="block space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>Procurement currency</span>
            <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              <option value="">Compare only quotes in the same currency</option>
              {currencyOptions.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <span className="block text-xs font-normal text-slate-500">No foreign-exchange conversion is performed.</span>
          </label>
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">Your procurement priorities</h2>
              <p className="text-xs text-slate-500">Neutral equal weighting is shown initially. LOW / MEDIUM / HIGH are explicit pairwise weights 1 / 2 / 3.</p>
            </div>
            <Button size="sm" variant="outline" disabled={!productId || !(Number(quantity) > 0) || comparing} onClick={() => setCompareRevision((value) => value + 1)}>Compare again</Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(priorityLabels) as Array<keyof DecisionPriorities>).map((factor) => (
              <label key={factor} className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">{priorityLabels[factor]}</span>
                <select
                  value={priorities[factor]}
                  onChange={(event) => setPriorities((current) => ({ ...current, [factor]: event.target.value as PriorityLevel }))}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="LOW">Low (1)</option>
                  <option value="MEDIUM">Medium (2)</option>
                  <option value="HIGH">High (3)</option>
                </select>
              </label>
            ))}
          </div>
        </div>
        {products.length === 0 && <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">No connected supplier products are available for comparison.</p>}
        {scenario && <p className="text-sm text-slate-600 dark:text-slate-300">
          Scenario: {formatNumber(scenario.quantity)} {scenario.unit} of {scenario.product.name}. Values use persisted data and refresh when inputs change.
        </p>}
      </section>

      {comparing && <LoadingState message="Comparing available supplier data..." />}
      {productId && !(Number(quantity) > 0) && <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">Enter a positive procurement quantity to compare connected suppliers.</p>}
      {scenario && !comparing && scenario.options.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No active connected supplier products with compatible product information were found.</p>
      )}
      {scenario && !comparing && scenario.options.length > 0 && <>
        <section className={`space-y-3 rounded-xl border p-4 ${scenario.recommendation.status === 'RECOMMENDED' ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CarbonPilot recommendation · {statusLabel(scenario.recommendation.confidence)} confidence</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {recommendedOption ? recommendedOption.supplierName : 'No recommendation'}
              </h2>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{scenario.recommendation.explanation}</p>
              {recommendedOption?.recommendationScore !== undefined && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Pairwise preference score: {formatNumber(recommendedOption.recommendationScore)} / 100 (not an environmental or supplier quality score).
              </p>}
            </div>
            {recommendedOption && <Button size="sm" variant="secondary" onClick={() => {
              setSelectedOption(`${recommendedOption.supplierId}:${recommendedOption.productId}`);
              setNotice('Recommendation selected as your proposed buyer choice. Save or finalize the decision explicitly.');
            }}>Accept recommendation</Button>}
          </div>
          {scenario.recommendation.reasons.length > 0 && <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Why this option ranked first</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
              {scenario.recommendation.reasons.map((reasonItem) => <li key={reasonItem}>{reasonItem}</li>)}
            </ul>
          </div>}
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-300">How the recommendation was calculated</summary>
            <p className="mt-2 text-slate-600 dark:text-slate-400">{scenario.recommendation.methodology}</p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(priorityLabels) as Array<keyof DecisionPriorities>).map((factor) => (
                <li key={factor}>{priorityLabels[factor]}: {scenario.priorities[factor]} (weight {scenario.priorities[factor] === 'HIGH' ? 3 : scenario.priorities[factor] === 'MEDIUM' ? 2 : 1})</li>
              ))}
            </ul>
          </details>
          {scenario.recommendation.whyNotRecommended.length > 0 && <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Why other suppliers were not recommended</h3>
            <ul className="mt-1 space-y-1 text-sm text-slate-700 dark:text-slate-300">
              {scenario.recommendation.whyNotRecommended.map((entry) => {
                const option = scenario.options.find((candidate) => candidate.supplierId === entry.supplierId && candidate.productId === entry.productId);
                return <li key={`${entry.supplierId}:${entry.productId}`}>
                  <span className="font-medium">{option?.supplierName || 'Supplier'}:</span> {entry.reasons.length ? entry.reasons.join(' ') : 'No recommendation was made from the available comparisons.'}
                </li>;
              })}
            </ul>
          </div>}
          <p className="text-xs text-slate-500">This analysis does not select a supplier, create a purchase, or authenticate supplier-submitted certificates.</p>
        </section>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[1500px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3">Supplier / product</th>
                <th className="px-4 py-3">Current quote / scenario cost</th>
                <th className="px-4 py-3">Carbon / estimated emissions</th>
                <th className="px-4 py-3">Evidence and verification</th>
                <th className="px-4 py-3">Sustainability certificates</th>
                <th className="px-4 py-3">History / freshness</th>
                <th className="px-4 py-3">Data completeness</th>
                <th className="px-4 py-3">Eligibility / buyer choice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {scenario.options.map((option) => {
                const optionKey = `${option.supplierId}:${option.productId}`;
                return <tr key={optionKey} className={selectedOption === optionKey ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''}>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{option.supplierName}</p>
                    <p className="text-xs text-slate-500">{option.productName}{option.productCode ? ` (${option.productCode})` : ''} · {option.productUnit}</p>
                    <p className="mt-1 text-xs text-emerald-700">{option.productCompatibility === 'CONFIRMED' ? 'Compatible product' : statusLabel(option.productCompatibility)}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    <p>{option.priceSource === 'CURRENT_PRODUCT_PRICE' ? `${formatMoney(option.pricePerUnit, option.currency)} / ${option.priceUnit}` : 'Current product price unavailable'}</p>
                    <p className="mt-1 font-medium">Scenario cost: {formatMoney(option.totalCost, option.currency)}</p>
                    {option.currentPriceUpdatedAt && <span className="mt-1 block text-xs text-slate-500">Product / quote record updated: {new Date(option.currentPriceUpdatedAt).toLocaleDateString()}</span>}
                    {option.lastRecordedPrice != null && <span className="mt-1 block text-xs text-slate-500">Historical purchase only: {formatMoney(option.lastRecordedPrice, option.lastRecordedPriceCurrency)} / {option.lastRecordedPriceUnit || 'unit unavailable'}{option.lastRecordedPriceDate ? ` · ${new Date(option.lastRecordedPriceDate).toLocaleDateString()}` : ''}</span>}
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    <p>{option.carbonIntensity === undefined ? emptyStatus : `${formatNumber(option.carbonIntensity, 4)} ${option.carbonIntensityUnit || ''}`}</p>
                    <p className="text-xs">{option.eligibleForCarbonCalculation ? 'Eligible under existing supported-claim rules' : `Not used for calculation · ${statusLabel(option.evidenceStatus)}`}</p>
                    <p className="mt-1 text-xs text-slate-500">Functional unit: {option.functionalUnit || emptyStatus}</p>
                    <p className="text-xs text-slate-500">Boundary: {option.lifecycleBoundary || emptyStatus} · Period: {option.reportingPeriod || emptyStatus}</p>
                    <p className="text-xs text-slate-500">Methodology: {option.methodology || emptyStatus}</p>
                    {option.carbonCalculation && <p className="mt-2 rounded bg-slate-50 p-2 text-xs dark:bg-slate-800">
                      {formatNumber(option.carbonCalculation.quantity)} {option.carbonCalculation.quantityUnit} × {formatNumber(option.carbonCalculation.intensity, 4)} {option.carbonCalculation.intensityUnit} = {formatNumber(option.carbonCalculation.emissions)} kgCO2e ({formatNumber(option.carbonCalculation.emissions / 1000, 3)} tCO2e)
                    </p>}
                    {option.sourceReference && <div className="mt-2 text-xs text-slate-500">
                      Claim source: {option.sourceReference.documentName || 'Source document'}{option.sourceReference.page ? ` · page ${option.sourceReference.page}` : ''}{option.sourceReference.extractionMethod ? ` · ${option.sourceReference.extractionMethod}` : ''}
                      {option.sourceReference.sourceText && <p className="mt-1 line-clamp-3 italic">“{option.sourceReference.sourceText}”</p>}
                    </div>}
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    <p>Claim: {statusLabel(option.evidenceStatus)}</p>
                    <p className="text-xs text-slate-500">Corroboration: {statusLabel(option.corroborationStatus)}</p>
                    <p className="mt-1">Verification: {statusLabel(option.verificationStatus)}</p>
                    {option.verification && option.verification.checks.length === 0 && <p className="mt-1 text-xs text-slate-500">No verification checks were recorded.</p>}
                    {option.verification?.checks.map((check, index) => <p key={`${check.checkType}-${index}`} className={`mt-1 text-xs ${check.result === 'PASS' ? 'text-slate-500' : 'text-amber-800 dark:text-amber-300'}`}>
                      {statusLabel(check.checkType)} — {statusLabel(check.result)}: {check.explanation}{check.sourcePage ? ` (page ${check.sourcePage})` : ''}
                    </p>)}
                    {option.verification && option.verification.issues.length === 0 && <p className="mt-1 text-xs text-slate-500">No verification issues were recorded.</p>}
                    {option.verification?.issues.map((issue, index) => <p key={`${issue.type}-${index}`} className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                      {statusLabel(issue.severity)} {statusLabel(issue.type)}: {issue.description} Action: {issue.recommendedAction}
                    </p>)}
                    {option.verification?.anomalies?.map((anomaly, index) => <p key={`${anomaly.type}-${index}`} className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                      Anomaly ({statusLabel(anomaly.severity)}, {statusLabel(anomaly.status)}): {anomaly.description}
                      {anomaly.recommendedAction ? ` Action: ${anomaly.recommendedAction}` : ''}
                      {anomaly.resolutionNote ? ` Resolution: ${anomaly.resolutionNote}` : ''}
                    </p>)}
                    {option.evidence.length > 0 ? <div className="mt-2 space-y-2">
                      <p className="text-xs font-medium">Linked claim evidence</p>
                      {option.evidence.map((evidence) => <div key={evidence.documentId} className="rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
                        <p>{evidence.documentName}{evidence.page ? ` · page ${evidence.page}` : ''} · {statusLabel(evidence.relationshipType)}</p>
                        {evidence.sourceText && <p className="mt-1 line-clamp-3 italic">“{evidence.sourceText}”</p>}
                        {evidence.downloadPath && <button type="button" className="mt-1 font-medium text-emerald-700 underline" onClick={() => void handleDownload(evidence.downloadPath!, evidence.documentName)}>Open source document</button>}
                      </div>)}
                      </div> : <p className="mt-2 text-xs text-slate-500">
                        {option.evidenceCount > 0 && !option.evidenceDocumentsShared
                          ? `${option.evidenceCount} linked evidence record(s) exist, but document access is not shared with this buyer.`
                          : 'No linked evidence record is available.'}
                      </p>}
                    {option.warnings.map((warning) => <span key={warning} className="mt-1 block max-w-64 text-xs text-amber-800 dark:text-amber-300">{warning}</span>)}
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    {option.certificates.length ? option.certificates.map((certificate) => <div key={certificate.certificateNumber} className="mb-2 rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
                      <p className="font-medium">{certificate.type} · {statusLabel(certificate.status)}</p>
                      <p>{certificate.certificateNumber} · {certificate.issuingBody}</p>
                      <p>Issued {new Date(certificate.issueDate).toLocaleDateString()} · expires {new Date(certificate.expiryDate).toLocaleDateString()}</p>
                      <p>{certificate.externallyVerified ? 'External verification recorded' : 'Supplier-submitted; not externally authenticated'}</p>
                      {certificate.downloadPath && <button type="button" className="mt-1 text-emerald-700 underline" onClick={() => void handleDownload(certificate.downloadPath!, `${certificate.type}-certificate`)}>Open certificate document</button>}
                    </div>) : <p>{option.warnings.some((warning) => warning.includes('not shared')) ? 'Not shared with this buyer' : emptyStatus}</p>}
                    <p className="text-xs text-slate-500">Supplier-submitted records are not treated as authenticated without external verification.</p>
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    <p>{option.procurementHistory.completedPurchaseCount} completed of {option.procurementHistory.purchaseCount} recorded purchases</p>
                    <p className="text-xs text-slate-500">Last purchase: {option.procurementHistory.lastPurchaseDate ? new Date(option.procurementHistory.lastPurchaseDate).toLocaleDateString() : 'No recorded purchase'}</p>
                    <p className="mt-2 text-xs text-slate-500">Price / product data: {option.currentPriceUpdatedAt ? new Date(option.currentPriceUpdatedAt).toLocaleDateString() : emptyStatus}{option.dataFreshness.productPriceIsOlderThanOneYear ? ' · older than one year' : ''}</p>
                    <p className="text-xs text-slate-500">Carbon claim: {option.dataFreshness.carbonUpdatedAt ? new Date(option.dataFreshness.carbonUpdatedAt).toLocaleDateString() : emptyStatus}{option.dataFreshness.carbonClaimIsOlderThanOneYear ? ' · older than one year' : ''}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    <p>{option.dataCompleteness.available}/{option.dataCompleteness.total} defined information fields</p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {option.dataCompleteness.fields.map((field) => <li key={field.name} className={field.available ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}>{field.available ? 'Available' : 'Missing'}: {field.name}</li>)}
                    </ul>
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    <p className="font-medium">{statusLabel(option.eligibilityStatus)}</p>
                    <p className="mt-1 text-xs">{option.recommendationScore === undefined ? 'No pairwise score' : `Pairwise score ${formatNumber(option.recommendationScore)} / 100`}</p>
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer font-medium">Factor weights / result</summary>
                      <ul className="mt-1 space-y-1">
                        {option.factorResults.map((factor) => <li key={factor.factor}>
                          {priorityLabels[factor.factor]}: {factor.priority} (×{factor.weight}) · {factor.wins} wins / {factor.ties} ties / {factor.losses} losses · contribution {formatNumber(factor.weightedContribution)} / {formatNumber(factor.maximumContribution)}
                        </li>)}
                      </ul>
                    </details>
                    {option.whyNotRecommended.map((why, index) => <p key={index} className="mt-1 text-xs text-amber-800 dark:text-amber-300">{why}</p>)}
                    <button type="button" className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => {
                      setSelectedOption(optionKey);
                      setNotice(option.supplierId === scenario.recommendation.recommendedSupplierId
                        ? 'Recommendation selected as your proposed buyer choice.'
                        : `${option.supplierName} selected as your alternative buyer choice.`);
                    }}>{option.supplierId === scenario.recommendation.recommendedSupplierId ? 'Accept recommendation' : 'Choose another supplier'}</button>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100"><GitCompare className="h-4 w-4 text-emerald-700" />Pairwise trade-offs</h2>
            {scenario.tradeOffs.length ? <div className="mt-3 space-y-3">
              {scenario.tradeOffs.map((tradeoff) => <article key={`${tradeoff.leftSupplierId}:${tradeoff.rightSupplierId}`} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                <p className="font-medium text-slate-900 dark:text-slate-100">{tradeoff.leftSupplierName} vs {tradeoff.rightSupplierName}: {statusLabel(tradeoff.comparisonStatus)}</p>
                <p className="mt-2 text-slate-700 dark:text-slate-300">Scenario cost difference: {formatMoney(tradeoff.purchaseCostDifference, tradeoff.currency)}</p>
                <p className="text-slate-700 dark:text-slate-300">Estimated emissions difference: {tradeoff.emissionsDifference === undefined ? 'Not available' : `${formatNumber(tradeoff.emissionsDifference)} kgCO2e`}</p>
                {tradeoff.emissionsDifferencePercent !== undefined && <p className="text-slate-700 dark:text-slate-300">Difference relative to the right-hand option: {formatNumber(tradeoff.emissionsDifferencePercent)}%</p>}
                {tradeoff.costPerEstimatedTonneAvoided !== undefined && <p className="mt-1 text-slate-700 dark:text-slate-300">Estimated cost per estimated tCO2e avoided: {formatMoney(tradeoff.costPerEstimatedTonneAvoided, tradeoff.currency)}</p>}
                {tradeoff.warnings.map((warning) => <p key={warning} className="mt-1 text-xs text-amber-800 dark:text-amber-300">Warning: {warning}</p>)}
              </article>)}
            </div> : <p className="mt-3 text-sm text-slate-500">At least two compatible supplier options are needed for a trade-off.</p>}
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">Record your decision</h2>
              <p className="mt-1 text-xs text-slate-500">This records human reasoning only. It does not create a purchase or purchase order.</p>
            </div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="decision-reason">Decision notes</label>
            <textarea id="decision-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={3000} className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" placeholder="Explain the factors considered by your team." />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!scenario || saving} isLoading={saving} onClick={saveDraft}><Save className="h-4 w-4" />Save decision</Button>
              {decisionId && currentDecision?.status === 'DRAFT' && <Button size="sm" variant="secondary" disabled={saving} onClick={submitForReview}>Submit for review <ArrowRight className="h-4 w-4" /></Button>}
              {decisionId && currentDecision?.status === 'UNDER_REVIEW' && <Button size="sm" disabled={!selected || saving} isLoading={saving} onClick={finalize}>Finalize human decision</Button>}
            </div>
          </section>
        </div>

        {scenario.options.some((option) => option.evidenceStatus === 'MISSING') && <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Inbox className="h-4 w-4 shrink-0" />Carbon comparison is unavailable for suppliers without supported data. <Link className="font-semibold underline" href="/customer/data-requests">Request supplier data</Link>.
        </p>}

        <p className="text-xs text-slate-500">{scenario.decisionNotice} Missing price, carbon, or availability information is not imputed.</p>
      </>}

      <section className="space-y-3">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Decision history</h2>
        {decisions.length ? <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {decisions.map((decision) => {
            const product = typeof decision.productId === 'string' ? undefined : decision.productId;
            const supplier = typeof decision.selectedSupplierId === 'string' ? undefined : decision.selectedSupplierId;
            const supplierOrganization = typeof supplier?.organizationId === 'string' ? undefined : supplier?.organizationId;
            return <article key={decision._id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">{product?.name || 'Procurement decision'} · {formatNumber(decision.quantity)} {decision.unit}</p>
                <p className="mt-1 text-xs text-slate-500">{statusLabel(decision.status)}{decision.decisionDate ? ` · decided ${new Date(decision.decisionDate).toLocaleDateString()}` : ''}</p>
                {supplierOrganization?.name && <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">Selected supplier: {supplierOrganization.name}</p>}
                {decision.decisionReason && <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">{decision.decisionReason}</p>}
                {decision.recommendationSnapshot && <p className="mt-1 text-xs text-slate-500">
                  {statusLabel(decision.recommendationSnapshot.status)} · {statusLabel(decision.recommendationSnapshot.confidence)}
                  {decision.recommendationSnapshot.recommendedSupplierId
                    ? ` · recommended ${decision.scenarioSnapshot?.find((option) => option.supplierId === decision.recommendationSnapshot?.recommendedSupplierId)?.supplierName || 'supplier'}`
                    : ''}
                </p>}
                {decision.history && <p className="mt-1 text-xs text-slate-500">
                  Audit trail: {decision.history.map((entry) => `${statusLabel(entry.action)} (${new Date(entry.changedAt).toLocaleDateString()})`).join(' · ')}
                </p>}
              </div>
              {decision.status === 'DRAFT' || decision.status === 'UNDER_REVIEW'
                ? <Button size="sm" variant="outline" onClick={() => {
                  setDecisionId(decision._id);
                  setProductId(typeof decision.productId === 'string' ? decision.productId : decision.productId._id);
                  setQuantity(String(decision.quantity));
                  setCurrency(decision.requestedCurrency || '');
                  setPriorities(decision.decisionPriorities || defaultDecisionPriorities);
                  setReason(decision.decisionReason || '');
                  const supplierId = typeof decision.selectedSupplierId === 'string' ? decision.selectedSupplierId : decision.selectedSupplierId?._id;
                  const selectedProductId = typeof decision.selectedProductId === 'string' ? decision.selectedProductId : decision.selectedProductId?._id;
                  setSelectedOption(supplierId && selectedProductId ? `${supplierId}:${selectedProductId}` : '');
                }}>Continue</Button>
                : null}
            </article>;
          })}
        </div> : <p className="text-sm text-slate-500">No procurement decisions have been recorded.</p>}
      </section>
    </div>
  );
}
