import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Ticket, Loader2, Send, MessageCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const STATUS_BADGE: Record<string, string> = {
  Pending: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Closed: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const AdminTickets: React.FC = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');

  const isSuperadmin = profile?.role === 'superadmin';

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tickets'],
    enabled: isSuperadmin,
    queryFn: async () => {
      const [ticketsRes, profilesRes] = await Promise.all([
        supabase.from('tickets').select('*').order('updated_at', { ascending: false }),
        supabase.from('profiles').select('id, email, idstaff, whatsapp'),
      ]);
      if (ticketsRes.error) throw ticketsRes.error;
      const emailMap: Record<string, any> = {};
      (profilesRes.data || []).forEach((p: any) => { emailMap[p.id] = p; });
      return { tickets: ticketsRes.data || [], emailMap };
    },
  });

  // ---- thread ----
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const { data: replies = [] } = useQuery({
    queryKey: ['admin-ticket-replies', activeTicket?.id],
    enabled: !!activeTicket?.id,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('ticket_replies')
        .select('*')
        .eq('ticket_id', activeTicket.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return rows || [];
    },
  });

  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['admin-ticket-replies', activeTicket?.id] });
  };

  const sendReply = async () => {
    if (!replyText.trim() || !activeTicket) return;
    setReplying(true);
    try {
      const { error } = await supabase.from('ticket_replies').insert({
        ticket_id: activeTicket.id,
        owner_user_id: activeTicket.owner_user_id,
        sender: 'admin',
        message: replyText.trim(),
      });
      if (error) throw error;
      // Replying moves a Pending ticket to Processing automatically
      if (activeTicket.status === 'Pending') {
        await supabase.from('tickets').update({ status: 'Processing' }).eq('id', activeTicket.id);
        setActiveTicket({ ...activeTicket, status: 'Processing' });
      }
      setReplyText('');
      refresh();
    } catch (err: any) {
      toast({ title: 'Reply failed', description: err.message, variant: 'destructive' });
    } finally {
      setReplying(false);
    }
  };

  const setTicketStatus = async (status: string) => {
    if (!activeTicket) return;
    const { error } = await supabase.from('tickets').update({ status }).eq('id', activeTicket.id);
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
      return;
    }
    setActiveTicket({ ...activeTicket, status });
    toast({ title: `Ticket ${activeTicket.ticket_no} → ${status}` });
    refresh();
  };

  if (!isSuperadmin) return <div className="p-6 text-muted-foreground">Not authorized.</div>;

  const tickets = (data?.tickets || []).filter((t: any) => statusFilter === 'all' || t.status === statusFilter);
  const countBy = (s: string) => (data?.tickets || []).filter((t: any) => t.status === s).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Ticket className="w-7 h-7 text-primary" /> Tickets
        </h1>
        <p className="text-muted-foreground mt-2">All client complaints — reply and update status</p>
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-xl">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Pending</p>
          <p className="text-2xl font-bold text-orange-600">{countBy('Pending')}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Processing</p>
          <p className="text-2xl font-bold text-blue-600">{countBy('Processing')}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Closed</p>
          <p className="text-2xl font-bold">{countBy('Closed')}</p>
        </CardContent></Card>
      </div>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="Pending">Pending</SelectItem>
          <SelectItem value="Processing">Processing</SelectItem>
          <SelectItem value="Closed">Closed</SelectItem>
        </SelectContent>
      </Select>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left">Ticket No</th>
                  <th className="p-3 text-left">Client</th>
                  <th className="p-3 text-left">Order</th>
                  <th className="p-3 text-left">Aduan</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Last Update</th>
                  <th className="p-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t: any) => {
                  const client = data?.emailMap[t.owner_user_id];
                  return (
                    <tr key={t.id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-3 font-mono font-semibold">{t.ticket_no}</td>
                      <td className="p-3">
                        <p className="font-medium">{client?.email || '-'}</p>
                        <p className="text-xs text-muted-foreground font-mono">{client?.idstaff || ''}</p>
                      </td>
                      <td className="p-3">
                        <p>{t.id_sale || '-'}</p>
                        <p className="text-xs text-muted-foreground font-mono">{t.tracking_number || ''}</p>
                      </td>
                      <td className="p-3 max-w-xs"><span className="line-clamp-2">{t.message}</span></td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[t.status] || ''}`}>{t.status}</span>
                      </td>
                      <td className="p-3 text-xs whitespace-nowrap">{new Date(t.updated_at).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-3">
                        <Button size="sm" variant="outline" onClick={() => setActiveTicket(t)}>
                          <MessageCircle className="w-3.5 h-3.5 mr-1" /> Open
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {tickets.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No tickets</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Thread dialog */}
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
              {data?.emailMap[activeTicket?.owner_user_id]?.email} · Order {activeTicket?.id_sale || '-'} · Tracking {activeTicket?.tracking_number || '-'}
            </DialogDescription>
          </DialogHeader>

          {/* Status control */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Select value={activeTicket?.status || 'Pending'} onValueChange={setTicketStatus}>
              <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Processing">Processing</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="text-xs font-semibold text-primary mb-1">Client</p>
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
            {replies.map((r: any) => (
              <div
                key={r.id}
                className={`rounded-lg p-3 border ${r.sender === 'admin'
                  ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
                  : 'bg-primary/5 border-primary/20'}`}
              >
                <p className={`text-xs font-semibold mb-1 ${r.sender === 'admin' ? 'text-blue-600' : 'text-primary'}`}>
                  {r.sender === 'admin' ? 'You (Support)' : 'Client'}
                </p>
                <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                {r.image_url && (
                  <a href={r.image_url} target="_blank" rel="noreferrer">
                    <img src={r.image_url} alt="attachment" className="mt-2 max-h-40 rounded-lg border border-border" />
                  </a>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">{new Date(r.created_at).toLocaleString('en-MY')}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Textarea placeholder="Reply as Support Team..." value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={2} />
            <div className="flex justify-end">
              <Button size="sm" onClick={sendReply} disabled={replying || !replyText.trim()}>
                {replying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                Reply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTickets;
