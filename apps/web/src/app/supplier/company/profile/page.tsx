'use client';

import { useEffect, useState } from 'react';
import { Building2, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { Textarea } from '@/components/ui/Textarea';
import { getSupplierProfile, updateSupplierProfile, type SupplierProfile } from '@/lib/suppliers';

export default function SupplierCompanyProfilePage() {
  const [profile, setProfile] = useState<SupplierProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getSupplierProfile().then((result) => {
      if (active) setProfile(result);
    }).catch(() => {
      if (active) setError('Unable to load company profile. Please try again.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [retryCount]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = await updateSupplierProfile({
        name: String(form.get('name') || ''),
        legalName: String(form.get('legalName') || ''),
        industry: String(form.get('industry') || ''),
        country: String(form.get('country') || ''),
        city: String(form.get('city') || ''),
        contactPerson: String(form.get('contactPerson') || ''),
        contactEmail: String(form.get('contactEmail') || ''),
        contactPhone: String(form.get('contactPhone') || ''),
        website: String(form.get('website') || ''),
        description: String(form.get('description') || ''),
      });
      setProfile(updated);
      setNotice('Company profile updated successfully.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update company profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState message="Loading company profile..." />;
  if (!profile) {
    return <div className="space-y-4 py-10 text-center"><p role="alert" className="text-sm text-rose-700">{error}</p><Button variant="outline" size="sm" onClick={() => setRetryCount((value) => value + 1)}>Try again</Button></div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <header className="flex items-start gap-3 border-b border-slate-200 pb-5 dark:border-slate-800">
        <div className="rounded-md bg-teal-50 p-2 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300"><Building2 className="h-5 w-5" /></div>
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Company Profile</h1><p className="mt-1 text-sm text-slate-500">Maintain your supplier organization information.</p></div>
      </header>
      {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      <Card>
        <CardHeader><CardTitle>Business details</CardTitle><CardDescription>These details are associated with your supplier organization.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="name" label="Company name" defaultValue={profile.name} required minLength={2} />
              <Input name="legalName" label="Legal name" defaultValue={profile.legalName || ''} />
              <Input name="industry" label="Industry" defaultValue={profile.industry || ''} required />
              <Input name="country" label="Country" defaultValue={profile.country || ''} />
              <Input name="city" label="City" defaultValue={profile.city || ''} />
              <Input name="contactPerson" label="Contact person" defaultValue={profile.contactPerson || ''} />
              <Input name="contactEmail" label="Contact email" type="email" defaultValue={profile.contactEmail || ''} />
              <Input name="contactPhone" label="Contact phone" type="tel" defaultValue={profile.contactPhone || ''} />
              <Input name="website" label="Website" type="url" defaultValue={profile.website || ''} />
            </div>
            <Textarea name="description" label="Company description" defaultValue={profile.description || ''} rows={4} />
            <div className="flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800">
              <Button type="submit" isLoading={saving}><Save className="h-4 w-4" /> Save profile</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
