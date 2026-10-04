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
  compareDecisionScenario,
  createProcurementDecision,
  finalizeProcurementDecision,
  getProcurementDecisions,
  updateProcurementDecision,
  type DecisionScenario,
  type ProcurementDecisionRecord,
} from '@/lib/procurement-decisions';

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
  const [quantity, setQuantity] = useState('1000');
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
        if (items.length) setProductId(items[0]._id);
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
      compareDecisionScenario(productId, Number(quantity))
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
  }, [productId, quantity]);

  const choice = () => selected ? {
    selectedSupplierId: selected.supplierId,
    selectedProductId: selected.productId,
    decisionReason: reason.trim() || undefined,
  } : { decisionReason: reason.trim() || undefined };

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

  if (loading) return <LoadingState message="Loading procurement decision workspace..." />;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Procurement', href: '/customer/purchases' }, { label: 'Decision Support' }]} />
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Carbon-aware procurement decision support</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">Compare recorded prices, supported carbon data, and evidence context. CarbonPilot provides analysis only; your team makes the procurement decision.</p>
      </header>

      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-[minmax(0,1fr)_220px]">
        <Select
          label="Product / material"
          value={productId}
          onChange={(event) => { setProductId(event.target.value); setDecisionId(''); setSelectedOption(''); }}
          options={products.map((product) => ({
            value: product._id,
            label: `${product.name}${product.productCode ? ` (${product.productCode})` : ''} — ${product.supplier?.name || 'Supplier'}`,
          }))}
        />
        <Input
          label="Scenario quantity"
          type="number"
          min="0.000001"
          step="any"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        {scenario && <p className="text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
          Scenario: {formatNumber(scenario.quantity)} {scenario.unit} of {scenario.product.name}. Values refresh as the quantity changes.
        </p>}
      </section>

      {comparing && <LoadingState message="Comparing available supplier data..." />}
      {scenario && !comparing && scenario.options.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No active connected supplier products with compatible product information were found.</p>
      )}
      {scenario && !comparing && scenario.options.length > 0 && <>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3">Supplier / product</th>
                <th className="px-4 py-3">Last recorded price</th>
                <th className="px-4 py-3">Scenario cost</th>
                <th className="px-4 py-3">Carbon intensity</th>
                <th className="px-4 py-3">Estimated emissions</th>
                <th className="px-4 py-3">Evidence / corroboration</th>
                <th className="px-4 py-3">Data completeness</th>
                <th className="px-4 py-3">Select</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {scenario.options.map((option) => {
                const optionKey = `${option.supplierId}:${option.productId}`;
                return <tr key={optionKey} className={selectedOption === optionKey ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''}>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{option.supplierName}</p>
                    <p className="text-xs text-slate-500">{option.productName} · {option.productUnit}</p>
                    <p className="mt-1 text-xs text-emerald-700">Product compatibility confirmed</p>
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    {formatMoney(option.pricePerUnit, option.currency)} / {option.priceUnit}
                    {option.lastRecordedPriceDate && <span className="mt-1 block text-xs text-slate-500">Historical purchase price · {new Date(option.lastRecordedPriceDate).toLocaleDateString()}</span>}
                  </td>
                  <td className="px-4 py-4 font-medium text-slate-900 dark:text-slate-100">{formatMoney(option.totalCost, option.currency)}</td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    {option.carbonIntensity === undefined ? 'Not available' : `${formatNumber(option.carbonIntensity, 4)} ${option.carbonIntensityUnit}`}
                    {option.reportingPeriod && <span className="mt-1 block text-xs text-slate-500">{option.reportingPeriod} · {option.lifecycleBoundary || 'Boundary unavailable'}</span>}
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{option.estimatedEmissions === undefined ? 'Not available' : `${formatNumber(option.estimatedEmissions)} ${option.emissionsUnit}`}</td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    {statusLabel(option.evidenceStatus)}<span className="mt-1 block text-xs text-slate-500">Corroboration: {statusLabel(option.corroborationStatus)}</span>
                    {option.warnings.map((warning) => <span key={warning} className="mt-1 block max-w-64 text-xs text-amber-800 dark:text-amber-300">{warning}</span>)}
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{option.dataCompleteness.available}/{option.dataCompleteness.total} factors</td>
                  <td className="px-4 py-4"><input aria-label={`Select ${option.supplierName}`} type="radio" name="decision-option" checked={selectedOption === optionKey} onChange={() => setSelectedOption(optionKey)} /></td>
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
              <Button size="sm" variant="outline" disabled={!scenario || saving} isLoading={saving} onClick={saveDraft}><Save className="h-4 w-4" />Save draft</Button>
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
              </div>
              {decision.status === 'DRAFT' || decision.status === 'UNDER_REVIEW'
                ? <Button size="sm" variant="outline" onClick={() => {
                  setDecisionId(decision._id);
                  setProductId(typeof decision.productId === 'string' ? decision.productId : decision.productId._id);
                  setQuantity(String(decision.quantity));
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
