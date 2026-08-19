import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Loader2, Truck, Info, ExternalLink, Calculator, KeyRound, ChevronDown, ChevronUp, Radio, Bell, Copy, Check, Webhook, Banknote } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { NEGERI_OPTIONS } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const PARCELDAILY_SIGNUP_URL = 'https://partner.parceldaily.com/auth/sign-up?accountManagerId=Ryrr36KL3y';
// Register this in the ParcelDaily portal (Tracking + Checkout webhooks) so order
// status, waybill, weight & COD updates flow back into PeningOrder automatically.
const PARCELDAILY_WEBHOOK_URL = 'https://ybtswwzunvuqildqscxk.supabase.co/functions/v1/parceldaily-webhook';

// Unified ParcelDaily "Status Groups" (statusGroup), same set across Ninjavan /
// DHL / PosLaju / J&T — taken verbatim from ParcelDaily's OpenAPI spec.
// The key IS the exact statusGroup string the Tracking webhook sends.
// Each has two independent toggles: TRACK (apply to the order) and NOTIFY (WhatsApp the customer).
const TRACKING_STATUSES: { key: string; label: string }[] = [
  { key: 'Waiting Pickup', label: 'Waiting Pickup' },
  { key: 'Shipment Data Received', label: 'Shipment Data Received' },
  { key: 'Picked up', label: 'Picked Up' },
  { key: 'In transit', label: 'In Transit' },
  { key: 'Processing', label: 'Processing' },
  { key: 'On Delivery', label: 'On Delivery' },
  { key: 'Delivered', label: 'Delivered' },
  { key: 'Self Collect', label: 'Self Collect' },
  { key: 'Problematic Processing', label: 'Problematic Processing' },
  { key: 'Custom matter', label: 'Custom Matter' },
  { key: 'Return in transit', label: 'Return In Transit' },
  { key: 'Returned', label: 'Returned' },
  { key: 'Cancel Requested by User', label: 'Cancel Requested by User' },
  { key: 'Cancelled by User', label: 'Cancelled by User' },
  { key: 'Cancelled', label: 'Cancelled' },
  { key: 'Refunded', label: 'Refunded' },
  { key: 'Closed', label: 'Closed' },
  // NOTE: "COD amount remitted" and "Weight Update" are intentionally NOT here —
  // they are seller-facing (money received / postage cost), always tracked, and
  // notify the CLIENT via the admin device, not the customer.
];
type TrackPref = { track: boolean; notify: boolean; template?: string };

// SOP for obtaining the Merchant ID + Token Key from the ParcelDaily portal.
const GET_KEY_STEPS = [
  {
    text: 'On the ParcelDaily partner portal, go to the Integrations page and click the “External API Details” button.',
    img: 'https://parceldaily.com/wp-content/uploads/image-1.webp',
  },
  {
    text: 'Copy the generated Merchant ID and Token Key, then paste them into the fields above.',
    img: 'https://parceldaily.com/wp-content/uploads/image-1-3.webp',
  },
];

interface ParcelDailyConfig {
  id?: string;
  merchant_id: string;
  token: string;
  environment: 'sandbox' | 'production';
  webhook_secret?: string;
  sender_name: string;
  sender_phone: string;
  sender_email: string;
  sender_line1: string;
  sender_line2?: string;
  sender_city: string;
  sender_postcode: string;
  sender_state: string;
  sender_country_code: string;
  is_next_day_remittance: boolean;
  is_notify: 'SMS' | 'WhatsApp' | 'None';
  default_courier: '' | 'poslaju' | 'ninjavan' | 'jnt' | 'dhl';
  allowed_couriers: string[]; // couriers offered at order key-in. [] = all.
}

// Couriers a client can offer at order key-in (must match OrderForm's list).
const COURIER_OPTIONS = ['Poslaju', 'Ninjavan', 'JNT', 'DHL', 'SPX'];

const emptyConfig: ParcelDailyConfig = {
  merchant_id: '',
  token: '',
  environment: 'production',
  webhook_secret: '',
  sender_name: '',
  sender_phone: '',
  sender_email: '',
  sender_line1: '',
  sender_line2: '',
  sender_city: '',
  sender_postcode: '',
  sender_state: '',
  sender_country_code: '+60',
  is_next_day_remittance: false,
  is_notify: 'None',
  default_courier: '',
  allowed_couriers: [],
};

const FormLabel: React.FC<{ required?: boolean; children: React.ReactNode }> = ({ required, children }) => (
  <label className="block text-sm font-medium text-foreground mb-1.5">
    {children}
    {required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
);

const CourierSettings: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ParcelDailyConfig>(emptyConfig);

  // Tracking Webhook — per-status Track / Notify toggles (default both ON).
  const [showTracking, setShowTracking] = useState(false);
  const [trackPrefs, setTrackPrefs] = useState<Record<string, TrackPref>>({});
  // Default: track everything, but only notify on "Delivered" (preserves the
  // no-spam default) — clients opt into notifying more statuses.
  const prefFor = (key: string): TrackPref => trackPrefs[key] ?? { track: true, notify: key === 'Delivered' };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('tracking_status_setting').select('status_key, track, notify, message_template');
      const map: Record<string, TrackPref> = {};
      (data || []).forEach((r: any) => { map[r.status_key] = { track: r.track, notify: r.notify, template: r.message_template || undefined }; });
      setTrackPrefs(map);
    })();
  }, [user]);

  const toggleTrack = async (key: string, field: keyof TrackPref, value: boolean) => {
    const next = { ...prefFor(key), [field]: value };
    setTrackPrefs((p) => ({ ...p, [key]: next }));
    const { error } = await supabase.from('tracking_status_setting').upsert({
      owner_user_id: user!.id,
      status_key: key,
      track: next.track,
      notify: next.notify,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_user_id,status_key' });
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
  };

  // Default WhatsApp text per status (shown in the editor, kept in sync with the
  // parceldaily-webhook / order-notify defaults). Uses {placeholders}.
  const defaultTemplate = (key: string): string => {
    if (key === 'Order Keyed In')
      return 'Salam {name}! 😊\n\nKami telah menerima tempahan anda.\n\nOrder ID : {order_id}\nProduk : {product}\nHarga : RM{price}\n\nTerima kasih! Kami akan proses pesanan anda secepat mungkin. 🙏';
    if (/deliver/i.test(key))
      return 'Salam {name}! ✅\n\nPesanan anda (Tracking: {tracking}) telah BERJAYA dihantar.\n\nTerima kasih kerana membeli dengan kami! 🙏';
    if (/cancel/i.test(key))
      return 'Salam {name}!\n\nPesanan anda (Tracking: {tracking}) telah DIBATALKAN.\n\nHubungi kami jika ada sebarang pertanyaan.';
    return 'Salam {name}! 📦\n\nStatus penghantaran pesanan anda (Tracking: {tracking}):\n*{status}*\n\nTerima kasih!';
  };
  // Placeholders the client can use in a template.
  const TEMPLATE_VARS: { tag: string; desc: string }[] = [
    { tag: '{name}', desc: 'Nama customer' },
    { tag: '{tracking}', desc: 'No. tracking' },
    { tag: '{product}', desc: 'Bundle / produk' },
    { tag: '{price}', desc: 'Harga (RM)' },
    { tag: '{address}', desc: 'Alamat penuh' },
    { tag: '{phone}', desc: 'No. telefon' },
    { tag: '{courier}', desc: 'Kurier' },
    { tag: '{order_id}', desc: 'ID order' },
    { tag: '{status}', desc: 'Status penghantaran' },
  ];

  const [editingTpl, setEditingTpl] = useState<string | null>(null);
  const [tplDraft, setTplDraft] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);
  const openTpl = (key: string) => { setTplDraft(prefFor(key).template ?? defaultTemplate(key)); setEditingTpl(key); };
  const saveTemplate = async (key: string) => {
    setSavingTpl(true);
    const p = prefFor(key);
    const tpl = tplDraft.trim();
    setTrackPrefs((prev) => ({ ...prev, [key]: { ...p, template: tpl || undefined } }));
    const { error } = await supabase.from('tracking_status_setting').upsert({
      owner_user_id: user!.id, status_key: key, track: p.track, notify: p.notify,
      message_template: tpl || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_user_id,status_key' });
    setSavingTpl(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Template disimpan' });
    setEditingTpl(null);
  };

  const [showRates, setShowRates] = useState(false);
  const [showCod, setShowCod] = useState(false);
  const [showGetKey, setShowGetKey] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(PARCELDAILY_WEBHOOK_URL);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 1800);
    } catch { /* clipboard blocked — user can select manually */ }
  };

  useEffect(() => {
    if (user) loadConfig();
  }, [user]);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      // RLS ensures we only get our own row
      const { data, error } = await supabase
        .from('parceldaily_config')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setConfigId(data.id);
        // Normalize state casing so the dropdown matches NEGERI_OPTIONS (uppercase)
        const normState = NEGERI_OPTIONS.find(
          (n) => n.toUpperCase() === String(data.sender_state || '').toUpperCase(),
        ) || data.sender_state || '';
        setFormData({ ...emptyConfig, ...data, sender_state: normState, default_courier: data.default_courier || '', allowed_couriers: Array.isArray(data.allowed_couriers) ? data.allowed_couriers : [] });
      } else if (user) {
        // New client: inherit the platform courier defaults (environment +
        // default courier) set by admin, and pre-fill sender from profile.
        const { data: cd } = await supabase.from('app_settings').select('value').eq('key', 'courier_defaults').maybeSingle();
        const defaults = (cd?.value ?? {}) as { default_courier?: string };
        setFormData((f) => ({
          ...f,
          default_courier: defaults.default_courier || f.default_courier,
          sender_name: user.businessName || user.fullName || '',
          sender_email: user.email || '',
        }));
      }
    } catch (err: any) {
      toast({ title: 'Load failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    // Validation
    const requiredFields: Array<[keyof ParcelDailyConfig, string]> = [
      ['merchant_id', 'Merchant ID'],
      ['token', 'API Token'],
      ['sender_name', 'Sender Name'],
      ['sender_phone', 'Sender Phone'],
      ['sender_email', 'Sender Email'],
      ['sender_line1', 'Address Line 1'],
      ['sender_city', 'City'],
      ['sender_postcode', 'Postcode'],
      ['sender_state', 'State'],
    ];
    for (const [key, label] of requiredFields) {
      if (!String(formData[key] || '').trim()) {
        toast({ title: 'Validation Error', description: `${label} is required`, variant: 'destructive' });
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload = {
        merchant_id: formData.merchant_id.trim(),
        token: formData.token.trim(),
        environment: 'production', // always live — sandbox toggle removed
        sender_name: formData.sender_name.trim(),
        sender_phone: formData.sender_phone.trim(),
        sender_email: formData.sender_email.trim(),
        sender_line1: formData.sender_line1.trim(),
        sender_line2: formData.sender_line2?.trim() || null,
        sender_city: formData.sender_city.trim(),
        sender_postcode: formData.sender_postcode.trim(),
        sender_state: formData.sender_state.trim(),
        sender_country: 'Malaysia',
        sender_country_code: '+60', // Malaysia — no separate field needed
        is_next_day_remittance: formData.is_next_day_remittance,
        is_notify: 'None', // courier SMS disabled — notifications via WhatsApp Device
        default_courier: formData.default_courier || null,
        allowed_couriers: formData.allowed_couriers.length ? formData.allowed_couriers : null, // null = all couriers offered
      };

      if (configId) {
        const { error } = await supabase.from('parceldaily_config').update(payload).eq('id', configId);
        if (error) throw error;
      } else {
        // owner_user_id auto-filled via column default = auth.uid()
        const { data, error } = await supabase.from('parceldaily_config').insert(payload).select().single();
        if (error) throw error;
        if (data) setConfigId(data.id);
      }
      // Let the courier-config gate re-check (Merchant ID + Token now saved).
      queryClient.invalidateQueries({ queryKey: ['courier-configured'] });
      toast({ title: 'Saved!', description: 'Courier settings updated.' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const setField = <K extends keyof ParcelDailyConfig>(key: K, value: ParcelDailyConfig[K]) =>
    setFormData((f) => ({ ...f, [key]: value }));

  // Toggle a courier in the "available at order key-in" list.
  const toggleCourier = (c: string) =>
    setFormData((f) => ({
      ...f,
      allowed_couriers: f.allowed_couriers.includes(c)
        ? f.allowed_couriers.filter((x) => x !== c)
        : [...f.allowed_couriers, c],
    }));

  // Sign-up CTA shows only until the client has entered a Merchant ID.
  const hasMerchantId = !!formData.merchant_id.trim();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Truck className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Courier Settings</h1>
          <p className="text-sm text-muted-foreground">Your courier API credentials & pickup address</p>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-900 dark:text-blue-100">
          <p className="font-medium">Every order ships via Ninjavan, Poslaju, JNT, or DHL.</p>
          <p className="mt-1">Enter your courier API credentials and pickup address below.</p>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border p-6 space-y-6">
        <div>
          <h2 className="font-semibold text-lg mb-4">API Credentials</h2>

          {/* Big sign-up CTA — only until they've got a Merchant ID. */}
          {!hasMerchantId && (
            <a
              href={PARCELDAILY_SIGNUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-4 text-base font-bold text-primary-foreground shadow-md transition-colors hover:bg-primary/90"
            >
              <ExternalLink className="w-5 h-5" /> Belum ada akaun? Daftar ParcelDaily Sekarang
            </a>
          )}

          <div className="mb-4 flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => setShowRates(true)}>
              <Calculator className="w-4 h-4 mr-2" /> Rate Kurier
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowCod(true)}>
              <Banknote className="w-4 h-4 mr-2" /> Rate COD
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowGetKey(true)}>
              <KeyRound className="w-4 h-4 mr-2" /> Get Key
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FormLabel required>Merchant ID</FormLabel>
              <Input
                value={formData.merchant_id}
                onChange={(e) => setField('merchant_id', e.target.value)}
                placeholder="pXh0xgBub4"
              />
            </div>
            <div>
              <FormLabel required>API Token</FormLabel>
              <Input
                type="password"
                value={formData.token}
                onChange={(e) => setField('token', e.target.value)}
                placeholder="••••••••-••••-••••-••••-••••••••••••"
              />
            </div>
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-lg mb-4">Pickup / Sender Address</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FormLabel required>Sender / Business Name</FormLabel>
              <Input
                value={formData.sender_name}
                onChange={(e) => setField('sender_name', e.target.value)}
                placeholder="Kedai Aqil"
              />
            </div>
            <div>
              <FormLabel required>No. Telefon Pickup</FormLabel>
              <Input
                value={formData.sender_phone}
                onChange={(e) => setField('sender_phone', e.target.value)}
                placeholder="60146674397"
              />
              <p className="text-xs text-muted-foreground mt-1">Boleh masuk 60xxxxxxxxx atau 0xxxxxxxxx — kami handle format automatik (Malaysia +60).</p>
            </div>
            <div>
              <FormLabel required>Email</FormLabel>
              <Input
                type="email"
                value={formData.sender_email}
                onChange={(e) => setField('sender_email', e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="md:col-span-2">
              <FormLabel required>Address Line 1</FormLabel>
              <Input
                value={formData.sender_line1}
                onChange={(e) => setField('sender_line1', e.target.value)}
                placeholder="No. 12, Jalan Sultan"
              />
            </div>
            <div className="md:col-span-2">
              <FormLabel>Address Line 2</FormLabel>
              <Input
                value={formData.sender_line2 || ''}
                onChange={(e) => setField('sender_line2', e.target.value)}
                placeholder="Kampung Padang Landak"
              />
            </div>
            <div>
              <FormLabel required>City</FormLabel>
              <Input
                value={formData.sender_city}
                onChange={(e) => setField('sender_city', e.target.value)}
                placeholder="Jerteh"
              />
            </div>
            <div>
              <FormLabel required>Postcode</FormLabel>
              <Input
                value={formData.sender_postcode}
                onChange={(e) => setField('sender_postcode', e.target.value)}
                placeholder="22000"
                maxLength={5}
              />
            </div>
            <div className="md:col-span-2">
              <FormLabel required>State</FormLabel>
              <Select
                value={formData.sender_state}
                onValueChange={(v) => setField('sender_state', v)}
              >
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {NEGERI_OPTIONS.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-lg mb-4">Preferences</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FormLabel>COD Payout Schedule</FormLabel>
              <Select
                value={String(formData.is_next_day_remittance)}
                onValueChange={(v) => setField('is_next_day_remittance', v === 'true')}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Next Day (faster)</SelectItem>
                  <SelectItem value="false">Standard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FormLabel>Default Courier (auto orders)</FormLabel>
              <Select
                value={formData.default_courier || undefined}
                onValueChange={(v) => setField('default_courier', v as ParcelDailyConfig['default_courier'])}
              >
                <SelectTrigger><SelectValue placeholder="Tiada default" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="poslaju">Poslaju</SelectItem>
                  <SelectItem value="ninjavan">Ninjavan</SelectItem>
                  <SelectItem value="jnt">JNT</SelectItem>
                  <SelectItem value="dhl">DHL</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Used for WooCommerce / Shoppego auto orders</p>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-border">
            <FormLabel>Kurier Tersedia (untuk Key-in Order)</FormLabel>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Pilih kurier yang boleh dipilih semasa key-in order. Jika tiada dipilih, semua kurier akan tersedia.
            </p>
            <div className="flex flex-wrap gap-2">
              {COURIER_OPTIONS.map((c) => {
                const active = formData.allowed_couriers.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCourier(c)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            {formData.allowed_couriers.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">Semua kurier tersedia (tiada had).</p>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border">
          <Button onClick={handleSave} disabled={isSaving} size="lg">
            {isSaving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> Save Settings</>
            )}
          </Button>
        </div>
      </div>

      {/* Tracking Webhook — per-status Track / Notify. Saved to
          tracking_status_setting and read by parceldaily-webhook getTrackPref
          (owner + statusGroup); default: Track all ON, Notify on Delivered. */}
      {(
      <div className="bg-card rounded-lg border border-border mt-6">
        <button
          type="button"
          onClick={() => setShowTracking((v) => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            <span className="font-semibold text-lg">Tracking Webhook</span>
            <span className="hidden sm:inline text-xs text-muted-foreground">Ninjavan · DHL · PosLaju · J&amp;T</span>
          </div>
          {showTracking ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
        </button>

        {showTracking && (
          <div className="px-4 pb-5">
            <p className="text-sm text-muted-foreground mb-4">
              <b>Track</b> = update status order bila webhook masuk; <b>Notify</b> = hantar WhatsApp ke pelanggan; <b>Mesej</b> = ubah ayat template. Default: Track semua ON, Notify hanya "Delivered".
            </p>
            <div className="hidden sm:grid grid-cols-[1fr_4rem_4rem_4rem] gap-x-4 items-center pb-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 justify-center"><Radio className="w-3.5 h-3.5" /> Track</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 justify-center"><Bell className="w-3.5 h-3.5" /> Notify</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">Mesej</div>
            </div>
            {[{ key: 'Order Keyed In', label: 'Selepas Key-in Order', keyin: true }, ...TRACKING_STATUSES.map((s) => ({ ...s, keyin: false }))].map((s) => {
              const p = prefFor(s.key);
              const editing = editingTpl === s.key;
              return (
                <div key={s.key} className="border-t border-border/60">
                  <div className="grid grid-cols-[1fr_4rem_4rem_4rem] gap-x-4 items-center py-2.5">
                    <div className="text-sm">
                      {s.label}
                      {s.keyin && <span className="ml-2 text-[10px] uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded">baru</span>}
                    </div>
                    <div className="flex justify-center">
                      {s.keyin ? <span className="text-xs text-muted-foreground">—</span>
                        : <Switch checked={p.track} onCheckedChange={(v) => toggleTrack(s.key, 'track', v)} />}
                    </div>
                    <div className="flex justify-center">
                      <Switch checked={p.notify} disabled={!s.keyin && !p.track} onCheckedChange={(v) => toggleTrack(s.key, 'notify', v)} />
                    </div>
                    <div className="flex justify-center">
                      <button type="button" onClick={() => (editing ? setEditingTpl(null) : openTpl(s.key))}
                        className={`text-xs font-medium hover:underline ${p.template ? 'text-primary' : 'text-muted-foreground'}`}>
                        {editing ? 'Tutup' : (p.template ? 'Edit ✎' : 'Mesej')}
                      </button>
                    </div>
                  </div>
                  {editing && (
                    <div className="pb-4">
                      <Textarea value={tplDraft} onChange={(e) => setTplDraft(e.target.value)} rows={7}
                        className="text-sm" placeholder="Taip mesej WhatsApp untuk status ini..." />
                      <div className="mt-2">
                        <p className="text-[11px] text-muted-foreground mb-1">Klik untuk masukkan variable:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {TEMPLATE_VARS.map((v) => (
                            <button key={v.tag} type="button" title={v.desc}
                              onClick={() => setTplDraft((t) => t + v.tag)}
                              className="text-[11px] font-mono bg-muted hover:bg-muted/70 border border-border rounded px-1.5 py-0.5">
                              {v.tag} <span className="text-muted-foreground">{v.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" onClick={() => saveTemplate(s.key)} disabled={savingTpl}>
                          {savingTpl ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Simpan
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setTplDraft(defaultTemplate(s.key))}>Reset ke default</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingTpl(null)}>Batal</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground mt-3">Notify hanya berfungsi bila Track ON (kecuali "Selepas Key-in"). Template kosong = guna ayat default.</p>
          </div>
        )}
      </div>
      )}

      {/* Rate Kurier modal — shows the full courier rate card image */}
      <Dialog open={showRates} onOpenChange={setShowRates}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Calculator className="w-5 h-5 text-primary" /> Rate Kurier</DialogTitle>
            <DialogDescription>Harga penghantaran ParcelDaily mengikut kurier &amp; berat.</DialogDescription>
          </DialogHeader>
          <img src="/courier-rates.png" alt="Rate Kurier ParcelDaily" className="w-full rounded-lg border border-border" />
        </DialogContent>
      </Dialog>

      {/* Rate COD modal — shows the exclusive COD charges rate card */}
      <Dialog open={showCod} onOpenChange={setShowCod}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Banknote className="w-5 h-5 text-primary" /> Rate COD — Exclusive</DialogTitle>
            <DialogDescription>Kadar COD eksklusif merentas semua kurier ParcelDaily.</DialogDescription>
          </DialogHeader>
          <img src="/cod-charges.png" alt="COD Charges — Exclusive (Sales team)" className="w-full rounded-lg border border-border" />
        </DialogContent>
      </Dialog>

      {/* Get Key SOP modal */}
      <Dialog open={showGetKey} onOpenChange={setShowGetKey}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-primary" /> Setup ParcelDaily (Key + Webhook)</DialogTitle>
            <DialogDescription>Ikut 3 langkah ini untuk sambung akaun ParcelDaily anda.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {GET_KEY_STEPS.map((s, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                  <p className="text-sm">{s.text}</p>
                </div>
                <img
                  src={s.img}
                  alt={`Step ${i + 1}`}
                  loading="lazy"
                  className="w-full rounded-lg border border-border"
                />
              </div>
            ))}

            {/* Step 3 — register the webhook so status/waybill/COD flow back automatically */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                <p className="text-sm">
                  Di portal ParcelDaily (<span className="font-medium">Integrations → Webhook</span>), tampal URL di bawah untuk kedua-dua
                  <span className="font-medium"> Tracking</span> &amp; <span className="font-medium">Checkout</span> webhook. Ini yang buatkan status penghantaran, no. tracking, waybill, berat &amp; COD masuk automatik ke PeningOrder.
                </p>
              </div>
              <div className="ml-8 flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
                <Webhook className="w-4 h-4 flex-shrink-0 text-primary" />
                <code className="flex-1 text-xs break-all">{PARCELDAILY_WEBHOOK_URL}</code>
                <Button type="button" size="sm" variant="outline" className="h-8 flex-shrink-0" onClick={copyWebhook}>
                  {copiedWebhook ? <><Check className="w-3.5 h-3.5 mr-1 text-green-600" /> Disalin</> : <><Copy className="w-3.5 h-3.5 mr-1" /> Salin</>}
                </Button>
              </div>
            </div>

            <a
              href={PARCELDAILY_SIGNUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <ExternalLink className="w-4 h-4" /> Buka portal ParcelDaily
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CourierSettings;
