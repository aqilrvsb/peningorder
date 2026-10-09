import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import {
  UserCircle, Lock, Phone, Loader2, Eye, EyeOff, Smartphone,
  RefreshCw, QrCode, Wifi, WifiOff, Plus, LogOut, Pencil, Check, X, Info, ExternalLink, Radio, Send
} from 'lucide-react';
import { PageHeader, IconTile, TableSkeleton, MissingHint } from '@/components/common/SoftUI';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeviceSetting {
  id: string;
  device_id: string | null;
  instance: string | null;
  webhook_id: string | null;
  provider: string;
  api_key: string | null;
  id_device: string | null;
  phone_number: string | null;
  status_wa: string;
  created_at: string;
}

// Use proxy endpoint to avoid CORS issues
const WHACENTER_PROXY_URL = '/api/whacenter';

const Profile: React.FC = () => {
  const { profile } = useAuth();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isUpdatingWhatsApp, setIsUpdatingWhatsApp] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });

  const [whatsappNumber, setWhatsappNumber] = useState('');

  // Test WhatsApp message state
  const [testPhone, setTestPhone] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  // PeningBot device Instance (marketer's own device from peningbot.com).
  const [waInstance, setWaInstance] = useState('');
  const [savingInstance, setSavingInstance] = useState(false);
  const [checkingInstance, setCheckingInstance] = useState(false);
  const [instanceStatus, setInstanceStatus] = useState<{ connected: boolean; status: string } | null>(null);

  // Device state (for marketers only)
  const [device, setDevice] = useState<DeviceSetting | null>(null);
  const [isLoadingDevice, setIsLoadingDevice] = useState(false);
  const [isGeneratingDevice, setIsGeneratingDevice] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [deviceForm, setDeviceForm] = useState({
    phoneNumber: '',
  });

  const isMarketer = profile?.role === 'marketer';

  // Editable display name
  const [displayName, setDisplayName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    if (profile?.fullName !== undefined) setDisplayName(profile.fullName || '');
  }, [profile?.fullName]);

  // Save the marketer's own PeningBot instance to their profile.
  const handleSaveInstance = async () => {
    if (!profile?.id) return;
    setSavingInstance(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ whacenter_instance: waInstance.trim() || null } as any)
        .eq('id', profile.id);
      if (error) throw error;
      toast({ title: 'Berjaya', description: 'Instance WhatsApp disimpan.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Gagal simpan instance.', variant: 'destructive' });
    } finally {
      setSavingInstance(false);
    }
  };

  // Check the marketer's PeningBot device connection status.
  const handleCheckInstance = async () => {
    const instance = waInstance.trim();
    if (!instance) return;
    setCheckingInstance(true);
    setInstanceStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke('whacenter', { body: { action: 'status', instance } });
      if (error) throw error;
      setInstanceStatus({ connected: !!data?.connected, status: data?.status || 'UNKNOWN' });
    } catch (err: any) {
      toast({ title: 'Gagal semak status', description: err.message || 'Cuba lagi.', variant: 'destructive' });
    } finally {
      setCheckingInstance(false);
    }
  };

  // Send a TEST WhatsApp to any Malaysia number using the marketer's own instance.
  const handleTestSendInstance = async () => {
    const instance = waInstance.trim();
    if (!instance) { toast({ title: 'Tiada instance', description: 'Simpan instance dahulu.', variant: 'destructive' }); return; }
    if (!testPhone.trim()) { toast({ title: 'Tiada nombor', description: 'Masukkan nombor telefon untuk test.', variant: 'destructive' }); return; }
    setIsSendingTest(true);
    try {
      const msg = 'Ini mesej TEST dari PeningOrder ✅\n\nJika anda terima mesej ini, device WhatsApp anda berfungsi dengan baik.';
      const { data, error } = await supabase.functions.invoke('whacenter', {
        body: { action: 'send', instance, phone: testPhone.trim(), message: msg },
      });
      if (error) throw error;
      if (data?.success) toast({ title: 'Test dihantar', description: `Mesej test dihantar ke ${testPhone.trim()}.` });
      else toast({ title: 'Gagal hantar', description: 'Device mungkin tidak connected. Semak status device.', variant: 'destructive' });
    } catch (err: any) {
      toast({ title: 'Gagal hantar', description: err.message || 'Cuba lagi.', variant: 'destructive' });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      toast({ title: 'Nama diperlukan', description: 'Sila masukkan nama anda.', variant: 'destructive' });
      return;
    }
    if (!profile?.id) return;
    setIsSavingName(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: trimmed })
        .eq('id', profile.id);
      if (error) throw error;
      setDisplayName(trimmed);
      setIsEditingName(false);
      toast({ title: 'Berjaya', description: 'Nama telah dikemaskini.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Gagal simpan nama.', variant: 'destructive' });
    } finally {
      setIsSavingName(false);
    }
  };

  // Load profile fields (whatsapp number, group link)
  useEffect(() => {
    if (profile?.id) {
      (async () => {
        const { data } = await supabase
          .from('profiles')
          .select('whatsapp_number, whacenter_instance')
          .eq('id', profile.id)
          .single();
        if (data) {
          setWhatsappNumber(data.whatsapp_number || '');
          setWaInstance((data as any).whacenter_instance || '');
        }
      })();
    }
  }, [profile?.id]);

  // Load device for marketer
  useEffect(() => {
    // Individual mode: every tenant gets a WhatsApp device
    if (profile?.id) {
      loadDevice();
    }
  }, [profile?.id]);

  // Calls the wa-device edge function (proxies to the Railway Baileys gateway).
  const callWa = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('wa-device', { body: { action, ...extra } });
    if (error) {
      let msg = error.message || 'Gateway error';
      try { const b = await (error as any)?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* keep */ }
      throw new Error(msg);
    }
    return data as any;
  };

  const loadDevice = async () => {
    if (!profile?.id) return;
    setIsLoadingDevice(true);
    try {
      const { data } = await (supabase as any)
        .from('device_setting')
        .select('*')
        .eq('user_id', profile.id)
        .eq('provider', 'baileys')
        .maybeSingle();

      if (!data) { setDevice(null); return; }

      // Refresh live connection status from the gateway.
      let status_wa = String(data.status_wa || '').toUpperCase() === 'CONNECTED' ? 'connected' : 'disconnected';
      let phone_number = data.phone_number;
      try {
        const s = await callWa('status');
        status_wa = s?.status === 'CONNECTED' ? 'connected' : 'disconnected';
        if (s?.phone) phone_number = s.phone;
      } catch (e) { console.error('status check failed', e); }

      setDevice({ ...data, status_wa, phone_number });
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setIsLoadingDevice(false);
    }
  };

  const handleCreateDevice = async () => {
    if (!profile?.id) return;
    setIsGeneratingDevice(true);
    try {
      // Baileys pairs via QR — no phone number needed up front.
      await callWa('create');
      await loadDevice();
      toast({ title: 'Berjaya', description: 'Device dicipta. Scan QR untuk sambung WhatsApp.' });
      // Open the QR straight away for a one-tap flow.
      setTimeout(() => handleScanQR(), 300);
    } catch (error: any) {
      console.error('Create device error:', error);
      toast({ title: 'Error', description: error.message || 'Gagal mencipta device.', variant: 'destructive' });
    } finally {
      setIsGeneratingDevice(false);
    }
  };

  const handleRefreshStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const s = await callWa('status');
      const connected = s?.status === 'CONNECTED';
      await loadDevice();
      toast({
        title: connected ? 'Connected ✅' : 'Belum connect',
        description: connected ? `Nombor: ${s?.phone || ''}` : 'Sila scan QR untuk sambung.',
      });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Gagal semak status.', variant: 'destructive' });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleScanQR = async () => {
    setIsCheckingStatus(true);
    setQrCode(null);
    setShowQrModal(true);
    try {
      const r = await callWa('qr');
      if (r?.qr) {
        setQrCode(r.qr);
      } else if (r?.connected) {
        setShowQrModal(false);
        toast({ title: 'Connected', description: 'WhatsApp sudah disambung!' });
        await loadDevice();
      } else {
        toast({ title: 'Info', description: r?.message || 'QR belum sedia — cuba lagi sekejap.' });
      }
    } catch (error: any) {
      console.error('Get QR error:', error);
      setShowQrModal(false);
      toast({ title: 'Error', description: error.message || 'Gagal mendapatkan QR code.', variant: 'destructive' });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleLogoutDevice = async () => {
    if (!confirm('Adakah anda pasti mahu logout device ini?')) return;
    setIsCheckingStatus(true);
    try {
      await callWa('logout');
      await loadDevice();
      toast({ title: 'Berjaya', description: 'Device logout. Scan QR untuk sambung semula.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Gagal logout device.', variant: 'destructive' });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleDeleteDevice = async () => {
    if (!confirm('Padam device ini sepenuhnya?')) return;
    setIsCheckingStatus(true);
    try {
      await callWa('delete');
      setDevice(null);
      toast({ title: 'Berjaya', description: 'Device dipadam.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Gagal padam device.', variant: 'destructive' });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: 'Error',
        description: 'Kata laluan baru tidak sepadan.',
        variant: 'destructive',
      });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast({
        title: 'Error',
        description: 'Kata laluan baru mesti sekurang-kurangnya 6 aksara.',
        variant: 'destructive',
      });
      return;
    }

    setIsChangingPassword(true);

    try {
      // Use Supabase Auth (bcrypt-hashed) — never store plaintext passwords.
      const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });

      if (error) throw error;

      toast({
        title: 'Berjaya',
        description: 'Kata laluan telah berjaya ditukar.',
      });

      setPasswordForm({ newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      console.error('Password change error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal menukar kata laluan.',
        variant: 'destructive',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleWhatsAppUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!whatsappNumber || !whatsappNumber.startsWith('6')) {
      toast({
        title: 'Error',
        description: 'No. WhatsApp mesti bermula dengan 6 (contoh: 60123456789).',
        variant: 'destructive',
      });
      return;
    }

    setIsUpdatingWhatsApp(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ whatsapp_number: whatsappNumber })
        .eq('id', profile?.id);

      if (error) throw error;

      toast({
        title: 'Berjaya',
        description: 'No. WhatsApp telah dikemaskini.',
      });
    } catch (error: any) {
      console.error('WhatsApp update error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal mengemaskini No. WhatsApp.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingWhatsApp(false);
    }
  };


  // Normalize phone number to 60xxxxxxxxx format
  const normalizeTestPhone = (raw: string): string => {
    let phone = raw.trim().replace(/\D/g, "");
    if (phone.startsWith("0")) {
      phone = "6" + phone;
    } else if (phone.startsWith("1")) {
      phone = "60" + phone;
    }
    return phone;
  };

  const handleSendTestMessage = async () => {
    if (device?.status_wa !== 'connected') {
      toast({ title: 'Error', description: 'Device belum connect. Scan QR dulu.', variant: 'destructive' });
      return;
    }
    if (!testPhone.trim()) {
      toast({ title: 'Error', description: 'Masukkan nombor telefon.', variant: 'destructive' });
      return;
    }
    setIsSendingTest(true);
    try {
      const normalizedPhone = normalizeTestPhone(testPhone);
      const message = `Ujian dari PeningOrder\n\nID Staff: ${profile?.idstaff || '-'}\nName: ${profile?.fullName || '-'}\n\nKalau anda terima mesej ni, WhatsApp device anda berfungsi! ✅`;
      const r = await callWa('send', { number: normalizedPhone, message });
      if (r?.success) {
        toast({ title: 'Success ✅', description: `Mesej dihantar ke ${normalizedPhone}. Semak WhatsApp.` });
      } else {
        toast({ title: 'Failed ❌', description: r?.message || 'Gagal hantar. Device mungkin tak connect.', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Gagal hantar mesej ujian', variant: 'destructive' });
    } finally {
      setIsSendingTest(false);
    }
  };

  // While the QR modal is open, poll for connection and refresh the rotating
  // code, so scanning auto-closes the modal without the user clicking anything.
  useEffect(() => {
    if (!showQrModal) return;
    let stop = false;
    const poll = setInterval(async () => {
      try {
        const s = await callWa('status');
        if (stop) return;
        if (s?.status === 'CONNECTED') {
          setShowQrModal(false);
          await loadDevice();
          toast({ title: 'Connected ✅', description: `WhatsApp disambung${s?.phone ? ` (${s.phone})` : ''}!` });
        }
      } catch { /* ignore */ }
    }, 3000);
    // Baileys rotates the QR ~every 20s — pull a fresh one so it never expires.
    const refresh = setInterval(async () => {
      try { const r = await callWa('qr'); if (!stop && r?.qr) setQrCode(r.qr); } catch { /* ignore */ }
    }, 18000);
    return () => { stop = true; clearInterval(poll); clearInterval(refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQrModal]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader
        title="Profile"
        description="Urus maklumat akaun anda"
        icon={UserCircle}
        tone="brand"
      />

      {/* User Info Card */}
      <Card className="p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="bg-brand flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-sm sm:h-16 sm:w-16">
            <UserCircle className="h-8 w-8 sm:h-10 sm:w-10" />
          </div>
          <div className="flex-1 min-w-0">
            {isEditingName ? (
              <div className="flex items-center gap-2 mb-1">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Nama anda"
                  className="h-9 min-w-0 flex-1 sm:max-w-xs"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setIsEditingName(false); }}
                />
                <Button size="sm" onClick={handleSaveName} disabled={isSavingName} className="h-9">
                  {isSavingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsEditingName(false)} disabled={isSavingName} className="h-9">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground truncate sm:text-xl">{displayName || 'Set your name'}</h2>
                <button
                  onClick={() => { setNameInput(displayName); setIsEditingName(true); }}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
                  title="Edit name"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="mt-1 flex items-center gap-2">
              <span className="section-label">ID Staff</span>
              <span className="font-mono text-sm text-foreground">{profile?.idstaff}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* WhatsApp Notification — marketers set their own PeningBot device Instance
          (created/paired on peningbot.com). If set, their own orders' customer
          notifications send from their own WhatsApp; else HQ's instance is used. */}
      {isMarketer && (
        <Card className="p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <IconTile icon={Smartphone} tone="green" size="sm" />
            <h3 className="text-base font-semibold text-foreground">WhatsApp Notification</h3>
          </div>
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
            Di <span className="font-medium">peningbot.com</span>: Device Settings → Add Device → scan QR. Kemudian tekan
            {' '}<span className="font-medium">Edit</span> pada device → medan <span className="font-medium">Instance</span> → butang
            {' '}<span className="font-medium">Salin</span>, dan tampal di sini. Jangan guna medan &quot;Device ID&quot; (nama seperti IMAN01).
            {' '}Order anda akan hantar notifikasi dari WhatsApp anda sendiri. Jika kosong, device HQ digunakan.
            </p>
          </div>
          <Label className="mb-1.5 block">PeningBot Instance</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={waInstance}
              onChange={(e) => { setWaInstance(e.target.value); setInstanceStatus(null); }}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="flex-1 font-mono"
            />
            <Button onClick={handleSaveInstance} disabled={savingInstance}>
              {savingInstance ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Simpan
            </Button>
            {waInstance.trim() ? (
              <Button variant="outline" onClick={handleCheckInstance} disabled={checkingInstance}>
                {checkingInstance ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Radio className="w-4 h-4 mr-2" />} Check Status Device
              </Button>
            ) : (
              <Button variant="outline" onClick={() => window.open('https://www.peningbot.com/', '_blank')}>
                <ExternalLink className="w-4 h-4 mr-2" /> Register Whatsapp Notification
              </Button>
            )}
          </div>
          {instanceStatus && (
            <div className={`mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
              instanceStatus.connected
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              <span className={`h-2 w-2 rounded-full ${instanceStatus.connected ? 'bg-green-500' : 'bg-red-500'}`} />
              {instanceStatus.connected ? 'Device CONNECTED' : `Device ${instanceStatus.status || 'NOT CONNECTED'}`}
            </div>
          )}

          {/* Test send — send a test WhatsApp to any Malaysia number. */}
          {waInstance.trim() && (
            <div className="mt-4 pt-4 border-t border-border">
              <Label className="mb-1.5 block">Test Hantar Mesej</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="No. telefon (cth: 0123456789)"
                  className="flex-1"
                />
                <Button variant="outline" onClick={handleTestSendInstance} disabled={isSendingTest}>
                  {isSendingTest ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Test Hantar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Hantar mesej test ke mana-mana nombor Malaysia untuk sahkan device berfungsi.</p>
            </div>
          )}
        </Card>
      )}

      {/* WhatsApp Device — legacy Baileys UI; device creation now lives on peningbot.com. */}
      {false && (
        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <IconTile icon={Smartphone} tone="green" size="sm" />
              <h3 className="text-base font-semibold text-foreground">WhatsApp Device</h3>
            </div>
            {device && (
              <div className="flex items-center gap-2">
                {device.status_wa === 'connected' ? (
                  <span className="flex items-center gap-1 text-sm text-green-600">
                    <Wifi className="w-4 h-4" />
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-sm text-red-500">
                    <WifiOff className="w-4 h-4" />
                    Disconnected
                  </span>
                )}
              </div>
            )}
          </div>

          {isLoadingDevice ? (
            <TableSkeleton rows={2} cols={2} />
          ) : !device ? (
            // Create Device — Baileys pairs by scanning a QR, no phone entry.
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cipta device WhatsApp anda, kemudian scan QR untuk sambung. Device ni digunakan untuk hantar notifikasi order ke pelanggan anda.
              </p>
              <Button
                onClick={handleCreateDevice}
                disabled={isGeneratingDevice}
                className="w-full"
              >
                {isGeneratingDevice ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Mencipta...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Cipta Device
                  </>
                )}
              </Button>
            </div>
          ) : (
            // Device Info & Actions
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="section-label">ID Device</p>
                  <p className="text-sm font-medium text-foreground">{device.id_device || '-'}</p>
                </div>
                <div>
                  <p className="section-label">No. Telefon</p>
                  <p className="text-sm font-medium text-foreground">{device.phone_number || '-'}</p>
                </div>
                <div>
                  <p className="section-label">Instance ID</p>
                  <p className="text-sm font-medium text-foreground font-mono break-all">{device.instance || 'Belum generate'}</p>
                </div>
                <div>
                  <p className="section-label">Provider</p>
                  <p className="text-sm font-medium text-foreground capitalize">{device.provider}</p>
                </div>
              </div>

              {/* Send Test Message */}
              {device.status_wa === 'connected' && (
                <div className="border-t border-border pt-4 mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Phone className="w-4 h-4 text-green-600" />
                    <p className="text-sm font-semibold text-foreground">Send Test Message</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Test if your WhatsApp device is sending messages correctly.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="text"
                      placeholder="Phone (e.g., 60123456789)"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      className="bg-background flex-1"
                    />
                    <Button
                      onClick={handleSendTestMessage}
                      disabled={isSendingTest || !testPhone.trim()}
                      className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                    >
                      {isSendingTest ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Phone className="w-4 h-4 mr-2" />
                          Send Test
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {device.status_wa !== 'connected' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={handleRefreshStatus}
                      disabled={isCheckingStatus || !device.instance}
                    >
                      {isCheckingStatus ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Refresh Status
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleScanQR}
                      disabled={isCheckingStatus || !device.instance}
                    >
                      <QrCode className="w-4 h-4 mr-2" />
                      Scan QR
                    </Button>
                  </>
                )}
                {device.status_wa === 'connected' && (
                  <Button
                    variant="outline"
                    onClick={handleRefreshStatus}
                    disabled={isCheckingStatus}
                  >
                    {isCheckingStatus ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Semak Status
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleLogoutDevice}
                  disabled={isCheckingStatus || !device.instance}
                  title="Logout Device"
                >
                  <LogOut className="w-4 h-4 mr-2" /> Logout
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={handleDeleteDevice}
                  disabled={isCheckingStatus || !device.instance}
                  title="Padam Device"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Change Password Card */}
        <Card className="p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <IconTile icon={Lock} tone="indigo" size="sm" />
            <h3 className="text-base font-semibold text-foreground">Tukar Kata Laluan</h3>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <Label className="mb-1.5 block">
                Kata Laluan Baru
              </Label>
              <div className="relative">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Masukkan kata laluan baru"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className="bg-background pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block">
                Sahkan Kata Laluan Baru
              </Label>
              <div className="relative">
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Masukkan semula kata laluan baru"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  className="bg-background pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {(passwordForm.newPassword || passwordForm.confirmPassword) && (
              <MissingHint
                items={[
                  { label: 'Min 6 aksara', done: passwordForm.newPassword.length >= 6 },
                  { label: 'Kata laluan sepadan', done: passwordForm.newPassword === passwordForm.confirmPassword },
                ]}
              />
            )}

            <Button
              type="submit"
              disabled={isChangingPassword}
              className="w-full"
            >
              {isChangingPassword ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Menukar...
                </>
              ) : (
                'Tukar Kata Laluan'
              )}
            </Button>
          </form>
        </Card>

        {/* Update WhatsApp Card */}
        <Card className="p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <IconTile icon={Phone} tone="green" size="sm" />
            <h3 className="text-base font-semibold text-foreground">No. WhatsApp</h3>
          </div>

          <form onSubmit={handleWhatsAppUpdate} className="space-y-4">
            <div>
              <Label className="mb-1.5 block">
                No. WhatsApp (bermula dengan 6)
              </Label>
              <Input
                type="text"
                placeholder="60123456789"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Contoh: 60123456789
              </p>
            </div>

            <MissingHint
              items={[{ label: 'No. WhatsApp bermula dengan 6', done: !!whatsappNumber && whatsappNumber.startsWith('6') }]}
            />

            <Button
              type="submit"
              disabled={isUpdatingWhatsApp}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {isUpdatingWhatsApp ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Mengemaskini...
                </>
              ) : (
                'Kemaskini WhatsApp'
              )}
            </Button>
          </form>
        </Card>
      </div>

      {/* QR Code Modal */}
      <Dialog open={showQrModal} onOpenChange={setShowQrModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconTile icon={QrCode} tone="green" size="sm" />
              Scan QR Code
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center py-4">
            {qrCode ? (
              <>
                <img src={qrCode} alt="QR Code" className="h-64 w-64 max-w-full rounded-lg border object-contain" />
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  Buka WhatsApp &gt; Linked Devices &gt; Link a Device
                  <br />
                  Kemudian scan QR code ini.
                </p>
              </>
            ) : (
              <div className="shimmer h-64 w-64 max-w-full rounded-lg" aria-busy="true" />
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowQrModal(false)}>
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
