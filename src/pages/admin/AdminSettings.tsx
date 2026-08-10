import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Loader2, CreditCard, Truck, KeyRound, ShieldCheck } from 'lucide-react';

const COURIERS = ['poslaju', 'ninjavan', 'jnt', 'dhl'];

const AdminSettings: React.FC = () => {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === 'superadmin';

  const [loading, setLoading] = useState(true);
  // CHIP
  const [chipApiKey, setChipApiKey] = useState('');
  const [chipBrandId, setChipBrandId] = useState('');
  const [chipKeySaved, setChipKeySaved] = useState(false); // whether a key already exists
  const [savingChip, setSavingChip] = useState(false);
  // Courier defaults
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [defaultCourier, setDefaultCourier] = useState('poslaju');
  const [savingCourier, setSavingCourier] = useState(false);

  useEffect(() => {
    if (!isSuperadmin) return;
    (async () => {
      const [chipRes, courierRes] = await Promise.all([
        supabase.from('platform_secrets').select('value').eq('key', 'chip').maybeSingle(),
        supabase.from('app_settings').select('value').eq('key', 'courier_defaults').maybeSingle(),
      ]);
      const chip = (chipRes.data?.value ?? {}) as { api_key?: string; brand_id?: string };
      setChipBrandId(chip.brand_id || '');
      setChipKeySaved(!!chip.api_key);
      const cd = (courierRes.data?.value ?? {}) as { environment?: string; default_courier?: string };
      setEnvironment((cd.environment as any) === 'production' ? 'production' : 'sandbox');
      setDefaultCourier(cd.default_courier || 'poslaju');
      setLoading(false);
    })();
  }, [isSuperadmin]);

  const saveChip = async () => {
    setSavingChip(true);
    try {
      // Only overwrite the key if a new one was typed; otherwise keep the stored one.
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

  const saveCourier = async () => {
    setSavingCourier(true);
    try {
      const { error } = await supabase.from('app_settings')
        .upsert({ key: 'courier_defaults', value: { environment, default_courier: defaultCourier } }, { onConflict: 'key' });
      if (error) throw error;
      toast({ title: 'Saved', description: 'Courier defaults updated for new clients.' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSavingCourier(false);
    }
  };

  if (!isSuperadmin) return <div className="p-6 text-muted-foreground">Not authorized.</div>;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldCheck className="w-7 h-7 text-primary" /> Settings</h1>
        <p className="text-muted-foreground mt-2">Platform configuration — payment gateway &amp; courier defaults.</p>
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

      {/* Courier defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Truck className="w-5 h-5 text-primary" /> Courier Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Applied to new clients until they set their own courier config.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Default Environment</Label>
              <Select value={environment} onValueChange={(v) => setEnvironment(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (testing)</SelectItem>
                  <SelectItem value="production">Production (live)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default Courier</Label>
              <Select value={defaultCourier} onValueChange={setDefaultCourier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COURIERS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={saveCourier} disabled={savingCourier}>
            {savingCourier && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save courier defaults
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSettings;
