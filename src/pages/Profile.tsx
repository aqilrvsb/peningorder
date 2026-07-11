import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  UserCircle, Lock, Phone, Loader2, Eye, EyeOff, Smartphone,
  RefreshCw, QrCode, Wifi, WifiOff, Plus, LogOut, Pencil, Check, X
} from 'lucide-react';
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
          .select('whatsapp_number')
          .eq('id', profile.id)
          .single();
        if (data) {
          setWhatsappNumber(data.whatsapp_number || '');
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

  const loadDevice = async () => {
    if (!profile?.id) return;
    setIsLoadingDevice(true);
    try {
      const { data, error } = await (supabase as any)
        .from('device_setting')
        .select('*')
        .eq('user_id', profile.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading device:', error);
      }

      let deviceData = data || null;

      // If device exists with instance, check status from Whacenter API
      if (deviceData && deviceData.instance) {
        try {
          const statusUrl = `${WHACENTER_PROXY_URL}?endpoint=statusDevice&device_id=${encodeURIComponent(deviceData.instance)}`;
          const statusResponse = await fetch(statusUrl);
          const statusResult = await statusResponse.json();

          console.log('Device status from Whacenter:', statusResult);

          // Determine status from API response
          // Whacenter returns: { status: true/false, data: { status: "CONNECTED"/"DISCONNECTED" } }
          let newStatus = 'disconnected';
          const apiStatus = statusResult.data?.status?.toLowerCase();
          if (apiStatus === 'connect' || apiStatus === 'connected') {
            newStatus = 'connected';
          }

          // Update database if status changed
          if (newStatus !== deviceData.status_wa) {
            await (supabase as any)
              .from('device_setting')
              .update({
                status_wa: newStatus,
                updated_at: new Date().toISOString()
              })
              .eq('id', deviceData.id);

            deviceData = { ...deviceData, status_wa: newStatus };
            console.log(`Device status updated to: ${newStatus}`);
          }
        } catch (statusErr) {
          console.error('Error checking device status:', statusErr);
        }
      }

      setDevice(deviceData);
      if (deviceData) {
        setDeviceForm({
          phoneNumber: deviceData.phone_number || '',
        });
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setIsLoadingDevice(false);
    }
  };

  const handleCreateDevice = async () => {
    if (!profile?.id) return;

    if (!deviceForm.phoneNumber || !deviceForm.phoneNumber.startsWith('6')) {
      toast({
        title: 'Error',
        description: 'No. telefon mesti bermula dengan 6.',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingDevice(true);
    try {
      const idDevice = `DFR_${profile.idstaff}`;

      // Step 1: Create device in Whacenter via proxy
      const addDeviceUrl = `${WHACENTER_PROXY_URL}?endpoint=addDevice&name=${encodeURIComponent(idDevice)}&number=${encodeURIComponent(deviceForm.phoneNumber)}`;
      const addResponse = await fetch(addDeviceUrl);
      const addResult = await addResponse.json();

      console.log('Add device result:', addResult);

      if (!addResult.success && !addResult.status) {
        throw new Error(addResult.message || addResult.error || 'Gagal menambah device ke Whacenter');
      }

      const instanceId = addResult.data?.device?.device_id || addResult.data?.device_id || addResult.device_id;

      if (!instanceId) {
        throw new Error('Device ID tidak diterima dari Whacenter');
      }

      // Step 2: Save to database with instance ID
      const { data: newDevice, error } = await (supabase as any)
        .from('device_setting')
        .insert({
          user_id: profile.id,
          provider: 'whacenter',
          id_device: idDevice,
          phone_number: deviceForm.phoneNumber,
          instance: instanceId,
          device_id: instanceId,
          status_wa: 'disconnected',
        })
        .select()
        .single();

      if (error) throw error;

      setDevice(newDevice);
      toast({
        title: 'Berjaya',
        description: 'Device berjaya dicipta. Klik "Scan QR" untuk sambung WhatsApp.',
      });
    } catch (error: any) {
      console.error('Create device error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal mencipta device.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingDevice(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!device || !device.instance) {
      toast({
        title: 'Error',
        description: 'Device belum digenerate.',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm('Adakah anda pasti mahu refresh device? Device akan dipadam dan dicipta semula.')) return;

    setIsCheckingStatus(true);
    try {
      // Step 1: Delete device from Whacenter
      console.log('Deleting device from Whacenter:', device.instance);
      const deleteUrl = `${WHACENTER_PROXY_URL}?endpoint=deleteDevice&device_id=${encodeURIComponent(device.instance)}`;
      await fetch(deleteUrl);

      // Step 2: Create new device in Whacenter
      const idDevice = device.id_device || `DFR_${profile?.idstaff}`;
      const phoneNumber = device.phone_number || '';

      console.log('Creating new device:', idDevice);
      const addDeviceUrl = `${WHACENTER_PROXY_URL}?endpoint=addDevice&name=${encodeURIComponent(idDevice)}&number=${encodeURIComponent(phoneNumber)}`;
      const addResponse = await fetch(addDeviceUrl);
      const addResult = await addResponse.json();

      console.log('Add device result:', addResult);

      if (!addResult.success && !addResult.status) {
        throw new Error(addResult.message || addResult.error || 'Gagal menambah device ke Whacenter');
      }

      const newInstanceId = addResult.data?.device?.device_id || addResult.data?.device_id || addResult.device_id;

      if (!newInstanceId) {
        throw new Error('Device ID tidak diterima dari Whacenter');
      }

      // Step 3: Update database with new instance ID
      await (supabase as any)
        .from('device_setting')
        .update({
          instance: newInstanceId,
          device_id: newInstanceId,
          status_wa: 'disconnected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', device.id);

      await loadDevice();

      toast({
        title: 'Berjaya',
        description: 'Device berjaya di-refresh. Klik "Scan QR" untuk sambung WhatsApp.',
      });
    } catch (error: any) {
      console.error('Refresh status error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal refresh device.',
        variant: 'destructive',
      });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleScanQR = async () => {
    if (!device || !device.instance) {
      toast({
        title: 'Error',
        description: 'Device belum digenerate.',
        variant: 'destructive',
      });
      return;
    }

    setIsCheckingStatus(true);
    setQrCode(null);
    setShowQrModal(true); // Show modal immediately with loading state

    try {
      // Use proxy endpoint for QR
      const qrUrl = `${WHACENTER_PROXY_URL}?endpoint=qr&device_id=${encodeURIComponent(device.instance)}`;
      const response = await fetch(qrUrl);
      const result = await response.json();

      console.log('QR result:', result);

      // Handle base64 image from proxy
      if (result.success && result.data?.image) {
        setQrCode(`data:image/png;base64,${result.data.image}`);
      } else if (result.data?.qr || result.qr) {
        setQrCode(result.data?.qr || result.qr);
      } else if (result.data?.status === 'connect' || result.data?.status === 'connected') {
        setShowQrModal(false);
        toast({
          title: 'Connected',
          description: 'WhatsApp sudah disambung!',
        });
        // Update status
        await (supabase as any)
          .from('device_setting')
          .update({ status_wa: 'connected', updated_at: new Date().toISOString() })
          .eq('id', device.id);
        await loadDevice();
      } else {
        setShowQrModal(false);
        toast({
          title: 'Info',
          description: result.message || 'QR code tidak tersedia. Cuba refresh status.',
        });
      }
    } catch (error: any) {
      console.error('Get QR error:', error);
      setShowQrModal(false);
      toast({
        title: 'Error',
        description: error.message || 'Gagal mendapatkan QR code.',
        variant: 'destructive',
      });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleLogoutDevice = async () => {
    if (!device || !device.instance) {
      toast({
        title: 'Error',
        description: 'Device belum digenerate.',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm('Adakah anda pasti mahu logout device ini?')) return;

    setIsCheckingStatus(true);
    try {
      // Logout from Whacenter
      const logoutUrl = `${WHACENTER_PROXY_URL}?endpoint=logoutDevice&device_id=${encodeURIComponent(device.instance)}`;
      const response = await fetch(logoutUrl);
      const result = await response.json();

      console.log('Logout result:', result);

      // Update status in database to disconnected
      await (supabase as any)
        .from('device_setting')
        .update({
          status_wa: 'disconnected',
          updated_at: new Date().toISOString()
        })
        .eq('id', device.id);

      // Reload device to refresh status
      await loadDevice();

      toast({
        title: 'Berjaya',
        description: 'Device berjaya logout. Klik "Scan QR" untuk sambung semula.',
      });
    } catch (error: any) {
      console.error('Logout device error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal logout device.',
        variant: 'destructive',
      });
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

    if (passwordForm.newPassword.length < 4) {
      toast({
        title: 'Error',
        description: 'Kata laluan baru mesti sekurang-kurangnya 4 aksara.',
        variant: 'destructive',
      });
      return;
    }

    setIsChangingPassword(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ password_hash: passwordForm.newPassword.toUpperCase() })
        .eq('id', profile?.id);

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
    if (!device?.instance) {
      toast({
        title: 'Error',
        description: 'No WhatsApp device instance configured. Please scan QR first.',
        variant: 'destructive',
      });
      return;
    }
    if (device.status_wa !== 'connected') {
      toast({
        title: 'Error',
        description: 'Device is not connected. Please scan QR to connect.',
        variant: 'destructive',
      });
      return;
    }
    if (!testPhone.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a phone number.',
        variant: 'destructive',
      });
      return;
    }

    setIsSendingTest(true);
    try {
      const normalizedPhone = normalizeTestPhone(testPhone);
      const message = `Test message from DFR EMPIRE System\n\nID Staff: ${profile?.idstaff || '-'}\nName: ${profile?.fullName || '-'}\nDevice: ${device.id_device || '-'}\n\nIf you receive this, your WhatsApp device is working correctly! ✅`;

      // Use proxy to avoid CORS
      const apiUrl = `${WHACENTER_PROXY_URL}?endpoint=send&device_id=${encodeURIComponent(device.instance)}&number=${encodeURIComponent(normalizedPhone)}&message=${encodeURIComponent(message)}`;
      const response = await fetch(apiUrl, { method: 'GET' });
      const data = await response.json();

      const success = data.status === true || data.success === true;
      if (success) {
        toast({
          title: 'Success ✅',
          description: `Test message sent to ${normalizedPhone}. Check WhatsApp.`,
        });
      } else {
        toast({
          title: 'Failed ❌',
          description: data.message || 'WhatsApp sending failed. Device may not be working.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send test message',
        variant: 'destructive',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary">Profile</h1>
        <p className="text-muted-foreground">
          Urus maklumat akaun anda
        </p>
      </div>

      {/* User Info Card */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <UserCircle className="w-10 h-10 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            {isEditingName ? (
              <div className="flex items-center gap-2 mb-1">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Nama anda"
                  className="h-9 max-w-xs"
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
                <h2 className="text-xl font-semibold text-foreground truncate">{displayName || 'Set your name'}</h2>
                <button
                  onClick={() => { setNameInput(displayName); setIsEditingName(true); }}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="Edit name"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}
            <p className="text-muted-foreground">ID Staff: {profile?.idstaff}</p>
          </div>
        </div>
      </div>

      {/* WhatsApp Device — every tenant (used for customer notifications) */}
      {true && (
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">WhatsApp Device</h3>
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
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !device ? (
            // Create Device Form
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Masukkan nombor telefon WhatsApp anda untuk mencipta device.
              </p>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  No. Telefon WhatsApp *
                </label>
                <Input
                  type="text"
                  placeholder="60123456789"
                  value={deviceForm.phoneNumber}
                  onChange={(e) => setDeviceForm({ ...deviceForm, phoneNumber: e.target.value })}
                  className="bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Format: 60123456789 (bermula dengan 6)
                </p>
              </div>
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
                  <p className="text-xs text-muted-foreground">ID Device</p>
                  <p className="text-sm font-medium text-foreground">{device.id_device || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">No. Telefon</p>
                  <p className="text-sm font-medium text-foreground">{device.phone_number || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Instance ID</p>
                  <p className="text-sm font-medium text-foreground font-mono">{device.instance || 'Belum generate'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Provider</p>
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
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={handleLogoutDevice}
                  disabled={isCheckingStatus || !device.instance}
                  title="Logout Device"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Change Password Card */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Tukar Kata Laluan</h3>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Kata Laluan Baru
              </label>
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
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Sahkan Kata Laluan Baru
              </label>
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
        </div>

        {/* Update WhatsApp Card */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Phone className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-foreground">No. WhatsApp</h3>
          </div>

          <form onSubmit={handleWhatsAppUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                No. WhatsApp (bermula dengan 6)
              </label>
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
        </div>
      </div>

      {/* QR Code Modal */}
      <Dialog open={showQrModal} onOpenChange={setShowQrModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Scan QR Code
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center py-4">
            {qrCode ? (
              <>
                <img src={qrCode} alt="QR Code" className="w-64 h-64 border rounded-lg" />
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  Buka WhatsApp &gt; Linked Devices &gt; Link a Device
                  <br />
                  Kemudian scan QR code ini.
                </p>
              </>
            ) : (
              <div className="flex items-center justify-center w-64 h-64 bg-muted rounded-lg">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
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
