import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { put } from '@vercel/blob';
import {
  Ticket, Plus, Search, Loader2, Send, ImagePlus, X, MessageCircle, Clock,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

const STATUS_BADGE: Record<string, string> = {
  Pending: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Closed: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const uploadImage = async (file: File): Promise<string> => {
  const token = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('Image storage not configured');
  const clean = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
  const blob = await put(`tickets/${Date.now()}-${clean}`, file, { access: 'public', token });
  return blob.url;
};

const Tickets: React.FC = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // ---------- ticket list ----------
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // ---------- create dialog ----------
  const [createOpen, setCreateOpen] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [orderResults, setOrderResults] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const searchOrders = async () => {
    const q = orderSearch.trim();
    if (!q) return;
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('customer_purchases')
        .select('id, id_sale, tracking_number, name_customer, kurier, total_sale, date_order, delivery_status')
        .or(`id_sale.ilike.%${q}%,tracking_number.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      setOrderResults(data || []);
      if (!data?.length) toast({ title: 'Tiada order dijumpai', description: 'Cuba nombor order (ON-...) atau tracking number.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast({ title: 'Gambar terlalu besar', description: 'Maksimum 5MB.', variant: 'destructive' });
      return;
    }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const resetCreate = () => {
    setOrderSearch(''); setOrderResults([]); setSelectedOrder(null);
    setMessage(''); setImageFile(null); setImagePreview('');
  };

  const submitTicket = async () => {
    if (!selectedOrder) {
      toast({ title: 'Pilih order', description: 'Cari dan pilih order untuk aduan ini.', variant: 'destructive' });
      return;
    }
    if (!message.trim()) {
      toast({ title: 'Isi aduan', description: 'Sila terangkan masalah anda.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      let imageUrl: string | null = null;
      if (imageFile) imageUrl = await uploadImage(imageFile);

      const { error } = await supabase.from('tickets').insert({
        order_id: selectedOrder.id,
        id_sale: selectedOrder.id_sale,
        tracking_number: selectedOrder.tracking_number,
        message: message.trim(),
        image_url: imageUrl,
      });
      if (error) throw error;

      toast({ title: 'Ticket dibuka', description: 'Kami akan semak aduan anda secepat mungkin.' });
      setCreateOpen(false);
      resetCreate();
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    } catch (err: any) {
      toast({ title: 'Gagal buka ticket', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- detail / thread ----------
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const { data: replies = [], isLoading: repliesLoading } = useQuery({
    queryKey: ['ticket-replies', activeTicket?.id],
    enabled: !!activeTicket?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ticket_replies')
        .select('*')
        .eq('ticket_id', activeTicket.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const [replyText, setReplyText] = useState('');
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [replying, setReplying] = useState(false);

  const submitReply = async () => {
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      let imageUrl: string | null = null;
      if (replyImage) imageUrl = await uploadImage(replyImage);
      const { error } = await supabase.from('ticket_replies').insert({
        ticket_id: activeTicket.id,
        message: replyText.trim(),
        image_url: imageUrl,
      });
      if (error) throw error;
      setReplyText('');
      setReplyImage(null);
      queryClient.invalidateQueries({ queryKey: ['ticket-replies', activeTicket.id] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    } catch (err: any) {
      toast({ title: 'Gagal hantar reply', description: err.message, variant: 'destructive' });
    } finally {
      setReplying(false);
    }
  };

  const openTicket = async (t: any) => {
    // Refresh the single ticket so the status is current before deciding if reply is allowed
    const { data } = await supabase.from('tickets').select('*').eq('id', t.id).maybeSingle();
    setActiveTicket(data || t);
  };

  const isClosed = activeTicket?.status === 'Closed';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Ticket className="w-7 h-7 text-primary" /> Open Ticket
          </h1>
          <p className="text-muted-foreground mt-2">Buat aduan untuk order anda — kami akan balas di sini</p>
        </div>
        <Button onClick={() => { resetCreate(); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> New Ticket
        </Button>
      </div>

      {/* Ticket history */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Ticket className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Tiada ticket lagi. Klik "New Ticket" untuk buat aduan.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left">Ticket No</th>
                  <th className="p-3 text-left">Order</th>
                  <th className="p-3 text-left">Tracking</th>
                  <th className="p-3 text-left">Aduan</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Last Update</th>
                  <th className="p-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t: any) => (
                  <tr key={t.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3 font-mono font-semibold">{t.ticket_no}</td>
                    <td className="p-3">{t.id_sale || '-'}</td>
                    <td className="p-3 font-mono text-xs">{t.tracking_number || '-'}</td>
                    <td className="p-3 max-w-xs"><span className="line-clamp-2">{t.message}</span></td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[t.status] || STATUS_BADGE.Pending}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(t.updated_at).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3">
                      <Button size="sm" variant="outline" onClick={() => openTicket(t)}>
                        <MessageCircle className="w-3.5 h-3.5 mr-1" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create ticket dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreate(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Ticket</DialogTitle>
            <DialogDescription>Cari order anda, kemudian terangkan masalah.</DialogDescription>
          </DialogHeader>

          {/* Order search */}
          {!selectedOrder ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Order no (ON-...) atau tracking number"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchOrders()}
                    className="pl-9"
                  />
                </div>
                <Button onClick={searchOrders} disabled={searching}>
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cari'}
                </Button>
              </div>
              {orderResults.length > 0 && (
                <div className="border border-border rounded-lg divide-y divide-border max-h-56 overflow-y-auto">
                  {orderResults.map((o) => (
                    <button
                      key={o.id}
                      className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                      onClick={() => setSelectedOrder(o)}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-sm">{o.id_sale || o.tracking_number}</span>
                        <span className="text-xs text-muted-foreground">{o.date_order}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {o.name_customer} · {o.kurier} · RM {Number(o.total_sale || 0).toFixed(2)} · {o.delivery_status}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-sm">{selectedOrder.id_sale}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedOrder.name_customer} · {selectedOrder.kurier} · Tracking: {selectedOrder.tracking_number || '-'}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelectedOrder(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <Textarea
                placeholder="Terangkan masalah anda..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
              />

              <div>
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                  <ImagePlus className="w-4 h-4" />
                  {imageFile ? imageFile.name : 'Upload gambar (optional, max 5MB)'}
                  <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
                </label>
                {imagePreview && (
                  <img src={imagePreview} alt="preview" className="mt-2 max-h-32 rounded-lg border border-border" />
                )}
              </div>

              <Button className="w-full" onClick={submitTicket} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Hantar Aduan
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Ticket thread dialog */}
      <Dialog open={!!activeTicket} onOpenChange={(o) => { if (!o) setActiveTicket(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeTicket?.ticket_no}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[activeTicket?.status] || ''}`}>
                {activeTicket?.status}
              </span>
            </DialogTitle>
            <DialogDescription>
              Order {activeTicket?.id_sale || '-'} · Tracking {activeTicket?.tracking_number || '-'}
            </DialogDescription>
          </DialogHeader>

          {/* Thread */}
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {/* Original complaint */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="text-xs font-semibold text-primary mb-1">Anda</p>
              <p className="text-sm whitespace-pre-wrap">{activeTicket?.message}</p>
              {activeTicket?.image_url && (
                <a href={activeTicket.image_url} target="_blank" rel="noreferrer">
                  <img src={activeTicket.image_url} alt="attachment" className="mt-2 max-h-40 rounded-lg border border-border" />
                </a>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                {activeTicket && new Date(activeTicket.created_at).toLocaleString('en-MY')}
              </p>
            </div>

            {repliesLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : (
              replies.map((r: any) => (
                <div
                  key={r.id}
                  className={`rounded-lg p-3 border ${
                    r.sender === 'admin'
                      ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
                      : 'bg-primary/5 border-primary/20'
                  }`}
                >
                  <p className={`text-xs font-semibold mb-1 ${r.sender === 'admin' ? 'text-blue-600' : 'text-primary'}`}>
                    {r.sender === 'admin' ? 'Support Team' : 'Anda'}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                  {r.image_url && (
                    <a href={r.image_url} target="_blank" rel="noreferrer">
                      <img src={r.image_url} alt="attachment" className="mt-2 max-h-40 rounded-lg border border-border" />
                    </a>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(r.created_at).toLocaleString('en-MY')}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Reply box (hidden when Closed) */}
          {isClosed ? (
            <div className="bg-muted/50 rounded-lg p-3 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" /> Ticket ini telah ditutup. Buka ticket baru jika masih ada masalah.
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                placeholder="Balas di sini..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={2}
              />
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  <ImagePlus className="w-4 h-4" />
                  {replyImage ? replyImage.name : 'Gambar'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setReplyImage(e.target.files?.[0] || null)}
                  />
                </label>
                <Button size="sm" onClick={submitReply} disabled={replying || !replyText.trim()}>
                  {replying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                  Hantar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tickets;
