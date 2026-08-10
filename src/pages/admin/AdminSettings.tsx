import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2, CreditCard, KeyRound, ShieldCheck, MessageCircle, Smartphone } from 'lucide-react';

const AdminSettings: React.FC = () => {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === 'superadmin';

  const [loading, setLoading] = useState(true);
  // CHIP
  const [chipApiKey, setChipApiKey] = useState('');
  const [chipBrandId, setChipBrandId] = useState('');
  const [chipKeySaved, setChipKeySaved] = useState(false);
  const [savingChip, setSavingChip] = useState(false);
  // WhatsApp device (Whacenter)
  const [waInstance, setWaInstance] = useState('');
  const [waInstanceSaved, setWaInstanceSaved] = useState('');
  const [waApiKey, setWaApiKey] = useState('');
  const [savingWa, setSavingWa] = useState(false);

  useEffect(() => {
    if (!isSuperadmin) return;
    (async () => {
      const [chipRes, deviceRes] = await Promise.all([
        supabase.from('platform_secrets').select('value').eq('key', 'chip').maybeSingle(),
        supabase.from('admin_device').select('instance, api_key').eq('active', true).limit(1).maybeSingle(),
      ]);
      const chip = (chipRes.data?.value ?? {}) as { api_key?: string; brand_id?: string };
      setChipBrandId(chip.brand_id || '');
      setChipKeySaved(!!chip.api_key);
      const inst = (deviceRes.data as any)?.instance || '';
      setWaInstance(inst);
      setWaInstanceSaved(inst);
      setWaApiKey((deviceRes.data as any)?.api_key || '');
      setLoading(false);
    })();
  }, [isSuperadmin]);

  const saveChip = async () => {
    setSavingChip(true);
    try {
      const value: Record<string, string> = { brand_id: chipBrandId.trim() };
      if (chipApiKey.trim()) value.api_key = chipApiKey.trim();
      else {
        const { data } = await supabase.from('platform_secrets').select('value').eq('key', 'chip').maybeSingle();
        value.api_key = ((data?.value ?? {}) as any).api_key || '';
      }
      const { error } = await supabase.from('platform_secrets')
        .upsert({ key: 'chip', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      setChipKeySaved(!!value.api_key);
      setChipApiKey('');
      toast({ title: 'Saved', description: 'CHIP configuration updated. Payments use it immediately.' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSavingChip(false);
    }
  };

  const saveWaDevice = async () => {
    const inst = waInstance.trim();
    if (!inst) { toast({ title: 'Instance required', description: 'Paste your Whacenter device instance ID.', variant: 'destructive' }); return; }
    setSavingWa(true);
    try {
      const apiKey = waApiKey.trim();
      // Single active-device model: deactivate all, then upsert this one active.
      await supabase.from('admin_device').update({ active: false }).neq('instance', inst);
      const { data: existing } = await supabase.from('admin_device').select('id').eq('instance', inst).maybeSingle();
      if (existing) {
        await supabase.from('admin_device').update({ active: true, api_key: apiKey, updated_at: new Date().toISOString() }).eq('instance', inst);
      } else {
        await supabase.from('admin_device').insert({ instance: inst, api_key: apiKey, label: 'admin', active: true });
      }
      setWaInstanceSaved(inst);
      toast({ title: 'Saved', description: 'WhatsApp sending device updated.' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSavingWa(false);
    }
  };

  if (!isSuperadmin) return <div className="p-6 text-muted-foreground">Not authorized.</div>;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldCheck className="w-7 h-7 text-primary" /> Settings</h1>
        <p className="text-muted-foreground mt-2">Platform configuration — payment gateway &amp; WhatsApp notifications.</p>
      </div>

      {/* CHIP */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><CreditCard className="w-5 h-5 text-primary" /> CHIP Payment Gateway</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="chip_key" className="flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> Secret API Key</Label>
            <Input id="chip_key" type="password" autoComplete="off" value={chipApiKey}
              onChange={(e) => setChipApiKey(e.target.value)}
              placeholder={chipKeySaved ? '•••••••• (saved — leave blank to keep)' : 'Paste CHIP secret key'} />
            <p className="text-xs text-muted-foreground">
              {chipKeySaved ? 'A key is stored. Type a new one only to replace it.' : 'No key stored yet — payments are disabled until set.'}
              {' '}Stored encrypted; never exposed to clients.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="chip_brand">Brand ID</Label>
            <Input id="chip_brand" value={chipBrandId} onChange={(e) => setChipBrandId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </div>
          <Button onClick={saveChip} disabled={savingChip}>
            {savingChip && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save CHIP config
          </Button>
        </CardContent>
      </Card>

      {/* WhatsApp device (Whacenter) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><MessageCircle className="w-5 h-5 text-green-600" /> WhatsApp Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The connected WhatsApp device (Whacenter) that sends client login credentials and admin alerts.
            Admin alerts go to the WhatsApp number set in each superadmin's <span className="font-medium">Profile</span>.
          </p>
          <div className="space-y-2">
            <Label htmlFor="wa_apikey" className="flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> Whacenter API Key</Label>
            <Input id="wa_apikey" value={waApiKey} onChange={(e) => setWaApiKey(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            <p className="text-xs text-muted-foreground">Required — messages are silently dropped by Whacenter without it.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa_instance" className="flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" /> Device Instance ID</Label>
            <Input id="wa_instance" value={waInstance} onChange={(e) => setWaInstance(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            <p className="text-xs text-muted-foreground">
              {waInstanceSaved
                ? <>Active device: <span className="font-mono">{waInstanceSaved}</span></>
                : 'No device linked yet — WhatsApp notifications are disabled until set.'}
            </p>
          </div>
          <Button onClick={saveWaDevice} disabled={savingWa}>
            {savingWa && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save WhatsApp device
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSettings;
