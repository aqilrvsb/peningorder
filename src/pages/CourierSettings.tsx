import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Loader2, Truck, Info } from 'lucide-react';
import { NEGERI_OPTIONS } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
}

const emptyConfig: ParcelDailyConfig = {
  merchant_id: '',
  token: '',
  environment: 'sandbox',
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
  is_next_day_remittance: true,
  is_notify: 'SMS',
};

const FormLabel: React.FC<{ required?: boolean; children: React.ReactNode }> = ({ required, children }) => (
  <label className="block text-sm font-medium text-foreground mb-1.5">
    {children}
    {required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
);

const CourierSettings: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ParcelDailyConfig>(emptyConfig);

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
        setFormData({ ...emptyConfig, ...data });
      } else if (user) {
        // Pre-fill sender fields from profile if available
        setFormData((f) => ({
          ...f,
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
        environment: formData.environment,
        webhook_secret: formData.webhook_secret?.trim() || null,
        sender_name: formData.sender_name.trim(),
        sender_phone: formData.sender_phone.trim(),
        sender_email: formData.sender_email.trim(),
        sender_line1: formData.sender_line1.trim(),
        sender_line2: formData.sender_line2?.trim() || null,
        sender_city: formData.sender_city.trim(),
        sender_postcode: formData.sender_postcode.trim(),
        sender_state: formData.sender_state.trim(),
        sender_country: 'Malaysia',
        sender_country_code: formData.sender_country_code || '+60',
        is_next_day_remittance: formData.is_next_day_remittance,
        is_notify: formData.is_notify,
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
      toast({ title: 'Saved!', description: 'Parcel Daily settings updated.' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const setField = <K extends keyof ParcelDailyConfig>(key: K, value: ParcelDailyConfig[K]) =>
    setFormData((f) => ({ ...f, [key]: value }));

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
          <p className="text-sm text-muted-foreground">Your Parcel Daily credentials & pickup address</p>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-900 dark:text-blue-100">
          <p className="font-medium">Every order (Ninjavan, Poslaju, JNT, DHL) uses Parcel Daily as the middleware.</p>
          <p className="mt-1">
            Get your credentials at{' '}
            <a
              href="https://partner.parceldaily.com"
              target="_blank"
              rel="noreferrer"
              className="underline font-medium"
            >
              partner.parceldaily.com
            </a>{' '}
            (or sandbox for testing).
          </p>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border p-6 space-y-6">
        <div>
          <h2 className="font-semibold text-lg mb-4">API Credentials</h2>
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
            <div>
              <FormLabel required>Environment</FormLabel>
              <Select
                value={formData.environment}
                onValueChange={(v) => setField('environment', v as 'sandbox' | 'production')}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (testing)</SelectItem>
                  <SelectItem value="production">Production (live)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FormLabel>Webhook Secret</FormLabel>
              <Input
                value={formData.webhook_secret || ''}
                onChange={(e) => setField('webhook_secret', e.target.value)}
                placeholder="Optional — for signed webhook verification"
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
              <FormLabel required>Phone (without country code)</FormLabel>
              <Input
                value={formData.sender_phone}
                onChange={(e) => setField('sender_phone', e.target.value)}
                placeholder="146674397"
              />
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
            <div>
              <FormLabel>Country Code</FormLabel>
              <Input
                value={formData.sender_country_code}
                onChange={(e) => setField('sender_country_code', e.target.value)}
                placeholder="+60"
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
              <FormLabel>Customer Notification</FormLabel>
              <Select
                value={formData.is_notify}
                onValueChange={(v) => setField('is_notify', v as 'SMS' | 'WhatsApp' | 'None')}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SMS">SMS (+RM 0.20/order)</SelectItem>
                  <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                  <SelectItem value="None">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
    </div>
  );
};

export default CourierSettings;
