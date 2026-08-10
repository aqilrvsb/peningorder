import React, { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  Plug, ShoppingBag, Store, CreditCard, Sparkles, Copy, Check, ArrowLeft, ExternalLink,
} from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type Channel = {
  key: string;
  name: string;
  platformParam: string; // '' for woocommerce
  tagline: string;
  icon: React.ReactNode;
  steps: string[];
  note?: string;
};

const CHANNELS: Channel[] = [
  {
    key: 'woocommerce',
    name: 'WooCommerce',
    platformParam: '',
    tagline: 'Sync orders from your WooCommerce store automatically.',
    icon: <ShoppingBag className="w-6 h-6" />,
    steps: [
      'In WordPress admin, go to WooCommerce → Settings → Advanced → Webhooks.',
      'Click “Add webhook”. Name it “PeningOrder”.',
      'Set Status = Active, Topic = “Order updated”.',
      'Paste the Delivery URL below and Save.',
      'Orders with status “processing” (paid) will appear in PeningOrder automatically.',
    ],
  },
  {
    key: 'shoppego',
    name: 'Shoppego',
    platformParam: 'shoppego',
    tagline: 'Connect your Shoppego storefront and receive orders instantly.',
    icon: <Store className="w-6 h-6" />,
    steps: [
      'In your Shoppego dashboard, open Settings → Webhooks / Integrations.',
      'Add a new order webhook.',
      'Paste the Delivery URL below and enable it.',
      'New Shoppego checkouts will flow into PeningOrder as pending orders.',
    ],
  },
  {
    key: 'onpay',
    name: 'OnPay',
    platformParam: 'onpay',
    tagline: 'Auto-create orders from your OnPay order form.',
    icon: <CreditCard className="w-6 h-6" />,
    steps: [
      'Log in to your OnPay account and open Webhook settings.',
      'Paste the Webhook URL below.',
      'Tick “Rekod jualan dibuat (apabila tempahan diterima)” to create every order immediately,',
      'or tick “Rekod jualan disahkan” to only create confirmed/paid orders.',
      'Save. New OnPay sales will appear in PeningOrder.',
    ],
    note: 'COD is detected automatically from the payment method.',
  },
  {
    key: 'convertly',
    name: 'Convertly',
    platformParam: 'convertly',
    tagline: 'Sync orders from your Convertly salespages.',
    icon: <Sparkles className="w-6 h-6" />,
    steps: [
      'In Convertly, open your salespage → Integrations / Webhooks.',
      'Add a new order webhook (or paste your connect URL).',
      'Paste the Delivery URL below and save.',
      'Every Convertly order will be pushed into PeningOrder.',
    ],
    note: 'Your connect code is your PeningOrder ID shown in the URL.',
  },
];

const Integration: React.FC = () => {
  const { profile } = useAuth();
  const idstaff = profile?.idstaff || '';
  const [selected, setSelected] = useState<Channel | null>(null);
  const [copied, setCopied] = useState(false);

  const buildUrl = (c: Channel) =>
    `${SUPABASE_URL}/functions/v1/woocommerce-webhook?marketer_id=${encodeURIComponent(idstaff)}${c.platformParam ? `&platform=${c.platformParam}` : ''}`;

  const url = useMemo(() => (selected ? buildUrl(selected) : ''), [selected, idstaff]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: 'Copied', description: 'Webhook URL copied to clipboard.' });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy manually.', variant: 'destructive' });
    }
  };

  if (!idstaff) {
    return <div className="p-6 text-muted-foreground">Loading your account…</div>;
  }

  // Detail view
  if (selected) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <button onClick={() => setSelected(null)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to integrations
        </button>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">{selected.icon}</span>
          <div>
            <h1 className="text-2xl font-bold">{selected.name}</h1>
            <p className="text-muted-foreground text-sm">{selected.tagline}</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-semibold">Your Delivery / Webhook URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-muted px-3 py-2.5 text-xs">{url}</code>
              <Button size="sm" onClick={copy} variant="outline">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Unique to your account — anyone with this URL can create orders under you. Keep it private.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-semibold mb-3">Setup steps</p>
            <ol className="space-y-2.5">
              {selected.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>
                  <span className="text-foreground/90">{s}</span>
                </li>
              ))}
            </ol>
            {selected.note && <p className="mt-4 rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary">💡 {selected.note}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Grid view
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Plug className="w-6 h-6" /></span>
        <div>
          <h1 className="text-2xl font-bold">Integration</h1>
          <p className="text-muted-foreground text-sm">Connect your platforms and tools to receive orders in PeningOrder.</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Channels</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <button key={c.key} onClick={() => { setSelected(c); setCopied(false); }}
              className="group text-left rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-md">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{c.icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold text-foreground">{c.name}</h3>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{c.tagline}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Integration;
