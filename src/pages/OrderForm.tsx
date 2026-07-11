import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from '@/hooks/use-toast';
import { NEGERI_OPTIONS } from '@/types';
import { ArrowLeft, Save, Loader2, CalendarIcon, Upload, Search } from 'lucide-react';
import { format } from 'date-fns';
import { cn, getMalaysiaDate, getMalaysiaYesterday } from '@/lib/utils';
import { put } from '@vercel/blob';

const PLATFORM_OPTIONS = ['Facebook', 'Threads', 'Tiktok', 'Database', 'Google'];
const JENIS_CLOSING_OPTIONS = ['Manual', 'Wa Bot', 'Website', 'Call'];
const JENIS_CLOSING_MARKETPLACE_OPTIONS = ['Manual', 'Wa Bot', 'Website', 'Call', 'Live'];
const CARA_BAYARAN_OPTIONS = ['CASH', 'COD'];
const DELIVERY_METHOD_OPTIONS = ['Poslaju', 'Ninjavan', 'JNT', 'DHL', 'Self Pickup', 'Kurier Tiktok'];
const JENIS_BAYARAN_OPTIONS = ['Online Transfer', 'Credit Card', 'CDM', 'CASH', 'Billplz'];
const BANK_OPTIONS = [
  'Maybank',
  'CIMB Bank',
  'Public Bank',
  'RHB Bank',
  'Hong Leong Bank',
  'AmBank',
  'Bank Islam',
  'Bank Rakyat',
  'Affin Bank',
  'Alliance Bank',
  'OCBC Bank',
  'HSBC Bank',
  'Standard Chartered',
  'UOB Bank',
  'BSN',
];

const FormLabel: React.FC<{ required?: boolean; children: React.ReactNode }> = ({ required, children }) => (
  <label className="block text-sm font-medium text-foreground mb-1.5">
    {children}
    {required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
);

const OrderForm: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { addOrder, updateOrder, orders, refreshData } = useData();
  // Fetch logistic bundles (active only) - this is the main bundle source for Marketer orders
  const { data: logisticBundles = [], isLoading: bundlesLoading, refetch: refetchLogisticBundles } = useQuery({
    queryKey: ['logistic-bundles-for-order'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('logistic_bundles')
        .select(`
          id,
          name,
          sku,
          description,
          base_cost,
          kos_postage_sm,
          kos_postage_ss,
          postage_cod,
          weight,
          price_online_np,
          price_online_ep,
          price_online_ec,
          is_active
        `)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Map logistic bundles to the format expected by the order form
  const activeBundles = logisticBundles.map((lb: any) => {
    return {
      id: lb.id,
      name: lb.name,
      sku: lb.sku || '', // Bundle SKU for NinjaVan delivery instructions
      units: 1, // Default to 1 unit per bundle
      // Cost fields for order calculation
      baseCost: Number(lb.base_cost) || 0,
      hqCost: Number(lb.hq_cost) || 0,
      kosPostageSm: Number(lb.kos_postage_sm) || 0,
      kosPostageSs: Number(lb.kos_postage_ss) || 0,
      postageCod: Number(lb.postage_cod) || 0,
      weight: Number(lb.weight) || 0.5,
      // Single price set for all platforms (using price_online_* as the standard)
      priceNormalNp: Number(lb.price_online_np) || 0,
      priceNormalEp: Number(lb.price_online_ep) || 0,
      priceNormalEc: Number(lb.price_online_ec) || 0,
      productName: lb.name,
    };
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tarikhBayaran, setTarikhBayaran] = useState<Date>();
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string>('');
  // Determined customer type (NP/EP/EC) based on lead lookup
  const [determinedCustomerType, setDeterminedCustomerType] = useState<'NP' | 'EP' | 'EC' | ''>('');
  const [isCheckingLead, setIsCheckingLead] = useState(false);
  // Store lead info for count_order increment
  const [leadInfo, setLeadInfo] = useState<{ id?: string; isNewLead?: boolean; countOrder?: number } | null>(null);

  // Edit mode state
  const editOrder = location.state?.editOrder;
  const isEditMode = !!editOrder;

  // Admin lead order data (from Admin Leads page)
  const [adminLeadData, setAdminLeadData] = useState<{
    prospectId: string;
    namaProspek: string;
    noTelefon: string;
    niche: string;
    adminIdStaff: string;
    marketerLeadIdStaff: string;
  } | null>(null);
  const isAdminLeadOrder = !!adminLeadData;

  const [formData, setFormData] = useState({
    namaPelanggan: '',
    noPhone: '',
    jenisPlatform: '',
    jenisClosing: '',
    jenisCustomer: '',
    poskod: '',
    daerah: '',
    negeri: '',
    alamat: '',
    produk: '',
    quantity: 1,
    hargaJualan: 0,
    caraBayaran: '',
    deliveryMethod: 'Poslaju',
    jenisBayaran: '',
    pilihBank: '',
    nota: '',
    trackingNumber: '',
  });
  const [waybillFile, setWaybillFile] = useState<File | null>(null);
  const [waybillFileName, setWaybillFileName] = useState<string>('');

  // Populate form if editing
  useEffect(() => {
    if (editOrder) {
      // Keep the original customer type (NP/EP/EC)
      const originalType = editOrder.jenisCustomer || '';
      if (originalType === 'NP' || originalType === 'EP' || originalType === 'EC') {
        setDeterminedCustomerType(originalType as 'NP' | 'EP' | 'EC');
      }

      setFormData({
        namaPelanggan: editOrder.marketerName || '',
        noPhone: editOrder.noPhone || '',
        jenisPlatform: editOrder.jenisPlatform || '',
        jenisClosing: editOrder.jenisClosing || '',
        jenisCustomer: originalType, // Keep as NP/EP/EC
        poskod: editOrder.poskod || '',
        daerah: editOrder.bandar || '',
        negeri: editOrder.negeri || '',
        alamat: editOrder.alamat || '',
        produk: editOrder.produk || '',
        quantity: 1, // Always 1 for edit mode
        hargaJualan: editOrder.hargaJualanSebenar || 0,
        caraBayaran: editOrder.caraBayaran || '',
        deliveryMethod: editOrder.kurier === 'PICKUP' ? 'Self Pickup' : (editOrder.kurier?.includes('Ninjavan') ? 'Ninjavan' : 'Poslaju'),
        jenisBayaran: editOrder.jenisBayaran || '',
        pilihBank: editOrder.bank || '',
        nota: editOrder.notaStaff || '',
        trackingNumber: editOrder.noTracking || '',
      });
      // Set tarikh bayaran if exists
      if (editOrder.tarikhBayaran) {
        setTarikhBayaran(new Date(editOrder.tarikhBayaran));
      }
    }
  }, [editOrder]);

  // Refresh logistic bundles when component mounts to ensure fresh data
  useEffect(() => {
    refetchLogisticBundles();
  }, []);

  // Check for admin lead order data from sessionStorage
  useEffect(() => {
    const adminLeadOrderData = sessionStorage.getItem('adminLeadOrder');
    if (adminLeadOrderData) {
      try {
        const data = JSON.parse(adminLeadOrderData);
        setAdminLeadData(data);
        // Pre-fill form with lead data
        setFormData(prev => ({
          ...prev,
          namaPelanggan: data.namaProspek || '',
          noPhone: data.noTelefon || '',
        }));
        // Clear the sessionStorage after reading
        sessionStorage.removeItem('adminLeadOrder');
      } catch (e) {
        console.error('Error parsing admin lead order data:', e);
      }
    }
  }, []);

  // Clear customer type when phone number changes
  useEffect(() => {
    if (!isEditMode) {
      setDeterminedCustomerType('');
      setLeadInfo(null);
      setFormData(prev => ({ ...prev, jenisCustomer: '' }));
    }
  }, [formData.noPhone]);

  const generateOrderNumber = () => {
    // Generate unique order number using timestamp + random suffix
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ORD${timestamp}${randomSuffix}`;
  };

  const generateSaleId = async (): Promise<string> => {
    // Call database function to get next sale ID
    const { data, error } = await (supabase as any).rpc('generate_sale_id');
    if (error) {
      console.error('Error generating sale ID:', error);
      // Fallback: generate based on timestamp
      const ts = Date.now().toString().slice(-5);
      return `DF${ts}`;
    }
    return data as string;
  };

  // Check lead by phone number and determine NP/EP/EC
  // Logic:
  // - NP: Lead exists with tarikh_phone_number = today (same date)
  // - EP: Lead exists with different date OR no lead exists (auto-create with yesterday's date)
  // - EC: Lead exists and already has jenis_prospek = 'NP' or 'EP' (existing customer who already bought before)
  const checkLeadAndDetermineType = async (phoneNumber: string): Promise<{ type: 'NP' | 'EP' | 'EC'; leadId?: string; isNewLead?: boolean; countOrder?: number }> => {
    const marketerIdStaff = profile?.username || '';
    const today = getMalaysiaDate();

    // Search for existing lead by phone number for this marketer
    const { data: existingLead } = await (supabase as any)
      .from('prospects')
      .select('id, tarikh_phone_number, jenis_prospek, count_order')
      .eq('marketer_id_staff', marketerIdStaff)
      .eq('no_telefon', phoneNumber)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingLead) {
      // Lead exists - check if it already has NP, EP, or EC set (meaning they already ordered before)
      const existingType = existingLead.jenis_prospek?.toUpperCase();
      const currentCountOrder = existingLead.count_order || 0;

      if (existingType === 'EC') {
        // Already EC - stay as EC (Existing Customer)
        return { type: 'EC', leadId: existingLead.id, countOrder: currentCountOrder };
      }

      if (existingType === 'NP' || existingType === 'EP') {
        // This customer already bought before, so they become EC (Existing Customer)
        return { type: 'EC', leadId: existingLead.id, countOrder: currentCountOrder };
      }

      // No existing type yet - determine based on date logic
      if (existingLead.tarikh_phone_number === today) {
        // Same date = NP (New Prospect)
        return { type: 'NP', leadId: existingLead.id, countOrder: currentCountOrder };
      } else {
        // Different date = EP (Existing Prospect)
        return { type: 'EP', leadId: existingLead.id, countOrder: currentCountOrder };
      }
    } else {
      // Lead doesn't exist - set as EP and will auto-create with yesterday's date
      return { type: 'EP', isNewLead: true, countOrder: 0 };
    }
  };

  // Handle Check button click
  const handleCheckCustomerType = async () => {
    if (!formData.noPhone || !formData.noPhone.startsWith('6') || formData.noPhone.length < 10) {
      toast({
        title: 'Error',
        description: 'Sila masukkan no. telefon yang sah (bermula dengan 6).',
        variant: 'destructive',
      });
      return;
    }

    setIsCheckingLead(true);
    try {
      const result = await checkLeadAndDetermineType(formData.noPhone);
      setDeterminedCustomerType(result.type);
      setLeadInfo({
        id: result.leadId,
        isNewLead: result.isNewLead,
        countOrder: result.countOrder,
      });

      // Update form with customer type
      setFormData(prev => ({ ...prev, jenisCustomer: result.type }));

      // Update price based on determined type
      if (formData.produk) {
        const newPrice = getMinimumPrice(formData.produk, formData.jenisPlatform, result.type);
        setFormData(prev => ({ ...prev, hargaJualan: newPrice }));
      }

      // Show appropriate message
      let description = '';
      if (result.type === 'NP') {
        description = 'Lead ditemui - Tarikh sama hari ini (New Prospect)';
      } else if (result.type === 'EP') {
        description = result.isNewLead
          ? 'Lead tidak ditemui - akan dicipta automatik (Existing Prospect)'
          : 'Lead ditemui - Tarikh berbeza (Existing Prospect)';
      } else if (result.type === 'EC') {
        description = `Lead telah membeli sebelum ini (Existing Customer) - Order ke-${(result.countOrder || 0) + 1}`;
      }

      toast({
        title: `Jenis Customer: ${result.type}`,
        description,
      });
    } catch (err) {
      console.error('Error checking lead:', err);
      toast({
        title: 'Error',
        description: 'Gagal menyemak lead. Sila cuba lagi.',
        variant: 'destructive',
      });
    } finally {
      setIsCheckingLead(false);
    }
  };

  // Auto-create lead with yesterday's date
  // productName should be the main product name, not bundle name
  const autoCreateLead = async (phoneNumber: string, customerName: string, bundleName: string): Promise<string | null> => {
    const marketerIdStaff = profile?.username || '';

    // Get main product name from bundle
    const selectedBundle = activeBundles.find(b => b.name === bundleName);
    const mainProductName = selectedBundle?.productName || bundleName;

    // Calculate yesterday's date
    const yesterdayDate = getMalaysiaYesterday();

    const { data, error } = await (supabase as any)
      .from('prospects')
      .insert({
        nama_prospek: customerName.toUpperCase(),
        no_telefon: phoneNumber,
        niche: mainProductName, // Use main product name, not bundle name
        jenis_prospek: 'EP', // Auto-determined as EP since lead didn't exist
        tarikh_phone_number: yesterdayDate,
        marketer_id_staff: marketerIdStaff,
        admin_id_staff: '',
        status_closed: '',
        price_closed: 0,
        count_order: 0,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error auto-creating lead:', error);
      return null;
    }
    return data?.id || null;
  };

  // Get minimum price based on customer type and selected bundle
  // All platforms now use the same price (priceNormal* which maps to price_online_*)
  const getMinimumPrice = (bundleName: string, platform: string, customerType: string): number => {
    const bundle = activeBundles.find(b => b.name === bundleName);
    if (!bundle) return 0;

    // Use the customer type directly (NP/EP/EC)
    const effectiveType = customerType || determinedCustomerType || 'NP';

    // All platforms now use the same price (no platform differentiation)
    if (effectiveType === 'NP') return bundle.priceNormalNp;
    if (effectiveType === 'EP') return bundle.priceNormalEp;
    if (effectiveType === 'EC') return bundle.priceNormalEc;
    return bundle.priceNormalNp; // Default to NP
  };

  // Check if state is Sabah/Sarawak (East Malaysia)
  const isEastMalaysia = (state: string): boolean => {
    const eastStates = ['SABAH', 'SARAWAK', 'LABUAN'];
    return eastStates.includes(state.toUpperCase());
  };

  // Calculate postage cost for COD orders
  // COD orders: add postage (SM or SS) + COD fee
  // CASH orders: no postage added to selling price
  const getPostageCost = (bundleName: string, negeri: string, caraBayaran: string): { postage: number; codFee: number; total: number } => {
    if (caraBayaran !== 'COD') {
      return { postage: 0, codFee: 0, total: 0 };
    }

    const bundle = activeBundles.find(b => b.name === bundleName);
    if (!bundle) return { postage: 0, codFee: 0, total: 0 };

    const isEast = isEastMalaysia(negeri);
    const postage = isEast ? bundle.kosPostageSs : bundle.kosPostageSm;
    const codFee = bundle.postageCod || 0;

    return {
      postage,
      codFee,
      total: postage + codFee
    };
  };

  // Get effective customer type for price calculation (multiply by quantity)
  const minPricePerUnit = getMinimumPrice(formData.produk, formData.jenisPlatform, formData.jenisCustomer);
  const postageCostInfo = getPostageCost(formData.produk, formData.negeri, formData.caraBayaran);
  const currentMinPrice = (minPricePerUnit * (formData.quantity || 1)) + postageCostInfo.total;
  const isPriceBelowMinimum = formData.hargaJualan > 0 && formData.hargaJualan < currentMinPrice;

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => {
      // Auto uppercase for text fields (except dropdowns)
      let processedValue = value;
      if (typeof value === 'string' && !['jenisPlatform', 'jenisClosing', 'jenisCustomer', 'caraBayaran', 'jenisBayaran', 'pilihBank', 'produk', 'negeri', 'deliveryMethod'].includes(field)) {
        processedValue = value.toUpperCase();
      }

      const newData = { ...prev, [field]: processedValue };

      // Auto-populate poskod, daerah, negeri from alamat field
      if (field === 'alamat' && typeof processedValue === 'string') {
        const addressText = processedValue;

        // Find 5-digit poskod in the address
        const poskodMatch = addressText.match(/\b(\d{5})\b/);
        if (poskodMatch) {
          newData.poskod = poskodMatch[1];

          // Get text after poskod to extract daerah and negeri
          const poskodIndex = addressText.indexOf(poskodMatch[1]);
          const afterPoskod = addressText.substring(poskodIndex + 5).trim();

          // Split by comma to get daerah (city) and negeri (state)
          // Format expected: "..., 12345 DAERAH, NEGERI" or "..., 12345, DAERAH, NEGERI"
          const parts = afterPoskod.split(',').map(p => p.trim()).filter(p => p.length > 0);

          if (parts.length >= 2) {
            // Last part is negeri, second to last is daerah
            newData.daerah = parts[parts.length - 2];
            const potentialNegeri = parts[parts.length - 1];
            // Check if it matches known negeri options
            const matchedNegeri = NEGERI_OPTIONS.find(n =>
              n.toUpperCase() === potentialNegeri.toUpperCase() ||
              potentialNegeri.toUpperCase().includes(n.toUpperCase())
            );
            if (matchedNegeri) {
              newData.negeri = matchedNegeri;
            }
          } else if (parts.length === 1) {
            // Only one part after poskod - could be daerah
            newData.daerah = parts[0];
          }
        }
      }

      // Auto-populate price when product, platform, customer type, quantity, negeri, or caraBayaran changes (only for new orders)
      // For COD: price = (minPrice * quantity) + postage + COD fee
      // For CASH: price = minPrice * quantity (no postage added)
      if ((field === 'produk' || field === 'jenisPlatform' || field === 'jenisCustomer' || field === 'quantity' || field === 'negeri' || field === 'caraBayaran') && !isEditMode) {
        const bundleName = field === 'produk' ? value as string : prev.produk;
        const platform = field === 'jenisPlatform' ? value as string : prev.jenisPlatform;
        const customerType = field === 'jenisCustomer' ? value as string : prev.jenisCustomer;
        const quantity = field === 'quantity' ? Number(value) : prev.quantity;
        const negeri = field === 'negeri' ? value as string : prev.negeri;
        const caraBayaran = field === 'caraBayaran' ? value as string : prev.caraBayaran;

        if (bundleName && customerType) {
          const minPricePerUnit = getMinimumPrice(bundleName, platform, customerType);
          const postageInfo = getPostageCost(bundleName, negeri, caraBayaran);

          // Auto-populate: price = (minPrice * quantity) + postage (if COD)
          if (field === 'produk' || field === 'jenisCustomer' || field === 'quantity' || field === 'negeri' || field === 'caraBayaran' || prev.hargaJualan === 0) {
            newData.hargaJualan = (minPricePerUnit * (quantity || 1)) + postageInfo.total;
          }
        }
      }

      return newData;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleWaybillChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: 'Error',
          description: 'Sila muat naik fail PDF sahaja.',
          variant: 'destructive',
        });
        return;
      }
      setWaybillFile(file);
      setWaybillFileName(file.name);
    }
  };

  const cancelCourierOrder = async (trackingNumber: string) => {
    try {
      const { data: cancelResult, error: cancelError } = await supabase.functions.invoke('parceldaily-cancel', {
        body: { trackingNumber }
      });

      if (cancelError) {
        console.error('Parcel Daily cancel error:', cancelError);
        return false;
      } else if (cancelResult?.error) {
        console.error('Parcel Daily cancel API error:', cancelResult.error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Cancel API call failed:', err);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation - phone and jenisCustomer optional for Tiktok/Shopee
    const requiredBase = !formData.namaPelanggan || !formData.poskod || !formData.daerah || !formData.negeri || !formData.alamat || !formData.produk || !formData.jenisClosing || !formData.caraBayaran;
    const requiresPhone = !isTiktokShopee && !formData.noPhone;
    const requiresCustomerType = !isTiktokShopee && !formData.jenisCustomer;

    if (requiredBase || requiresPhone || requiresCustomerType) {
      toast({
        title: 'Error',
        description: 'Sila lengkapkan semua medan yang diperlukan.',
        variant: 'destructive',
      });
      return;
    }

    // Validate tracking number for marketplace couriers
    if (isMarketplaceCourier && !formData.trackingNumber) {
      toast({
        title: 'Error',
        description: 'Sila masukkan No. Tracking.',
        variant: 'destructive',
      });
      return;
    }

    // Validate that customer type is NP/EP/EC (must click Check button first) - skip for Tiktok/Shopee
    if (!isTiktokShopee && !['NP', 'EP', 'EC'].includes(formData.jenisCustomer) && !isEditMode) {
      toast({
        title: 'Error',
        description: 'Sila klik butang "Semak" untuk menyemak jenis customer.',
        variant: 'destructive',
      });
      return;
    }

    // Validate payment details for CASH - skip for marketplace couriers (no Butiran Bayaran)
    if (formData.caraBayaran === 'CASH' && !isMarketplaceCourier) {
      // Always require Jenis Bayaran
      if (!formData.jenisBayaran) {
        toast({
          title: 'Error',
          description: 'Sila pilih Jenis Bayaran.',
          variant: 'destructive',
        });
        return;
      }
      // Skip other validations if Billplz is selected
      if (formData.jenisBayaran !== 'Billplz') {
        if (!tarikhBayaran) {
          toast({
            title: 'Error',
            description: 'Sila pilih Tarikh Bayaran.',
            variant: 'destructive',
          });
          return;
        }
        if (!formData.pilihBank) {
          toast({
            title: 'Error',
            description: 'Sila pilih Bank.',
            variant: 'destructive',
          });
          return;
        }
        if (!receiptFile && !isEditMode) {
          toast({
            title: 'Error',
            description: 'Sila muat naik Resit Bayaran.',
            variant: 'destructive',
          });
          return;
        }
      }
    }

    // Validate minimum price - skip for Tiktok/Shopee (no customer type)
    if (!isTiktokShopee) {
      const minPrice = getMinimumPrice(formData.produk, formData.jenisPlatform, formData.jenisCustomer);
      if (formData.hargaJualan < minPrice) {
        toast({
          title: 'Error',
          description: `Harga jualan minimum untuk ${formData.jenisCustomer} (${formData.jenisPlatform || 'produk ini'}) adalah RM${minPrice.toFixed(2)}.`,
          variant: 'destructive',
        });
        return;
      }
    }

    // Validate phone starts with 6 - skip for Tiktok/Shopee
    if (!isTiktokShopee && !formData.noPhone.toString().startsWith('6')) {
      toast({
        title: 'Error',
        description: 'No. Telefon mesti bermula dengan 6.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    const now = new Date();
    const tarikhTempahan = now.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    // Set kurier based on delivery method and cara bayaran (peningorder routes all through Parcel Daily)
    let kurier = '';
    const isPickup = formData.deliveryMethod === 'Self Pickup';
    const dmLower = (formData.deliveryMethod || '').toLowerCase();
    const PD_COURIER_MAP: Record<string, { code: 'ninjavan' | 'poslaju' | 'jnt' | 'dhl'; label: string }> = {
      ninjavan: { code: 'ninjavan', label: 'Ninjavan' },
      poslaju: { code: 'poslaju', label: 'Poslaju' },
      jnt: { code: 'jnt', label: 'JNT' },
      'jnt express': { code: 'jnt', label: 'JNT' },
      dhl: { code: 'dhl', label: 'DHL' },
    };
    const pdMapped = PD_COURIER_MAP[dmLower];
    const isParcelDaily = !!pdMapped;
    const isNinjavan = pdMapped?.code === 'ninjavan';
    const isPoslaju = pdMapped?.code === 'poslaju';

    if (isMarketplaceCourier) {
      kurier = formData.deliveryMethod; // 'Kurier Tiktok' or 'Kurier Shopee'
    } else if (isPickup) {
      kurier = 'PICKUP';
    } else if (pdMapped) {
      kurier = `${pdMapped.label} ${formData.caraBayaran === 'COD' ? 'COD' : 'CASH'}`;
    } else {
      // Unknown delivery method — fallback to Poslaju via Parcel Daily
      kurier = formData.caraBayaran === 'COD' ? 'Poslaju COD' : 'Poslaju CASH';
    }
    
    // Set date_order to today's date (Malaysia timezone)
    const dateOrder = getMalaysiaDate();

    try {
      let orderNumber = isEditMode ? editOrder.noTempahan : generateOrderNumber();
      let idSale = isEditMode ? editOrder.idSale : '';
      let trackingNumber = '';
      let pdShippingPrice: number | null = null; // real cost from PD quote

      // Generate new sale ID for new orders (all platforms now use NinjaVan)
      if (!isEditMode) {
        idSale = await generateSaleId();
        console.log('Generated Sale ID:', idSale);
      }

      // Handle edit mode
      if (isEditMode) {
        const wasKurierOrder = editOrder.kurier !== 'PICKUP';
        const isNowKurierOrder = !isPickup;

        // If it was a PD courier order, cancel the old shipment first (refunds credit)
        const PD_COURIERS = ['Ninjavan', 'Poslaju', 'JNT', 'DHL'];
        const wasPdOrder = PD_COURIERS.some((c) => editOrder.kurier?.includes(c));
        if (wasKurierOrder && wasPdOrder && editOrder.noTracking) {
          console.log('Cancelling old shipment:', editOrder.noTracking);
          const cancelled = await cancelCourierOrder(editOrder.noTracking);
          if (cancelled) {
            toast({
              title: 'Info',
              description: 'Shipment lama telah dibatalkan.',
            });
          }
        }

        let editWaybillPdfUrl = ''; // For Poslaju PDF link in edit mode

        if (isNowKurierOrder) {
          // Generate new sale ID for edit mode
          idSale = await generateSaleId();
          console.log('Generated new Sale ID for edit:', idSale);

          // Get selected bundle for SKU
          const editSelectedBundle = activeBundles.find(b => b.name === formData.produk);

          const orderBody = {
            orderId: orderNumber,
            idSale: idSale,
            customerName: formData.namaPelanggan,
            phone: formData.noPhone,
            address: formData.alamat,
            postcode: formData.poskod,
            city: formData.daerah,
            state: formData.negeri,
            price: formData.hargaJualan,
            caraBayaran: formData.caraBayaran,
            produk: formData.produk,
            productSku: editSelectedBundle?.sku || formData.produk,
            quantity: 1,
            weight: editSelectedBundle?.weight || 0.5,
            marketerIdStaff: profile?.username || '',
          };

          try {
            // Route via Parcel Daily (unified middleware for ninjavan / poslaju / jnt / dhl)
            const kurierName = pdMapped?.label || 'Kurier';
            const { data: kurierResult, error: kurierError } = await supabase.functions.invoke('parceldaily-order', {
              body: {
                ...orderBody,
                courier: pdMapped?.code || 'poslaju',
                paymentMethod: formData.caraBayaran,
                customerName: formData.namaPelanggan,
                productName: formData.produk,
              }
            });

            if (kurierError) {
              console.error(`Parcel Daily (${kurierName}) API error:`, kurierError);
              toast({
                title: 'Amaran',
                description: `Order dikemaskini tetapi gagal hantar ke ${kurierName}.`,
                variant: 'destructive',
              });
            } else if (kurierResult?.error) {
              console.error(`Parcel Daily (${kurierName}) error:`, kurierResult.error);
              toast({
                title: 'Amaran',
                description: kurierResult.error,
                variant: 'destructive',
              });
            } else if (kurierResult?.orderId) {
              // Parcel Daily returns orderId immediately; real tracking arrives via webhook.
              trackingNumber = kurierResult.trackingNumber || kurierResult.orderId;
              if (kurierResult?.pdfLink) editWaybillPdfUrl = kurierResult.pdfLink;
              if (kurierResult?.shippingPrice != null) pdShippingPrice = Number(kurierResult.shippingPrice);
              toast({
                title: `${kurierName} Berjaya`,
                description: `Order ID: ${kurierResult.orderId}. Tracking akan tiba melalui webhook.`,
              });
            }
          } catch (kurierErr) {
            console.error('Kurier call failed:', kurierErr);
          }
        }

        // Helper function to delete from Vercel Blob
        const deleteFromBlob = async (url: string) => {
          try {
            const response = await fetch('/api/delete-blob', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url }),
            });
            if (!response.ok) {
              console.error('Failed to delete from Blob:', url);
            }
          } catch (err) {
            console.error('Blob delete error:', err);
          }
        };

        // Helper function to upload to Vercel Blob (client-side)
        const uploadToVercelBlob = async (file: File, folder: string): Promise<string> => {
          const token = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;
          if (!token) {
            throw new Error('Blob storage token not configured');
          }
          const timestamp = Date.now();
          const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
          const filename = `${folder}/${timestamp}-${cleanFileName}`;
          const blob = await put(filename, file, { access: 'public', token });
          return blob.url;
        };

        // Handle receipt image upload/replacement for edit mode
        let newReceiptUrl = editOrder.receiptImageUrl || '';
        if (receiptFile && showPaymentDetails) {
          // Delete old receipt if exists
          if (editOrder.receiptImageUrl) {
            await deleteFromBlob(editOrder.receiptImageUrl);
          }
          try {
            newReceiptUrl = await uploadToVercelBlob(receiptFile, 'receipts');
          } catch (uploadError) {
            console.error('Receipt upload error:', uploadError);
            toast({
              title: 'Amaran',
              description: 'Gagal memuat naik resit baru.',
              variant: 'destructive',
            });
          }
        }

        // Waybill URL - use Poslaju PDF link if available
        let newWaybillUrl = editWaybillPdfUrl || '';

        // Use quantity from form (always 1 for edit mode)
        const editQuantity = formData.quantity || 1;

        // Get selected bundle ID for product update
        const selectedEditBundle = activeBundles.find(b => b.name === formData.produk);
        const editBundleId = selectedEditBundle?.id || null;

        // Determine final customer type to save for edit mode
        const editFinalCustomerType = formData.jenisCustomer === 'Prospect' ? determinedCustomerType : formData.jenisCustomer;

        // Update existing order in database - using new schema field names
        // IMPORTANT: Include delivery_status: 'Pending' because cancelling old NinjaVan tracking
        // triggers a webhook that sets status to 'Return'. We need to reset it back to Pending.
        const { error: updateError } = await supabase
          .from('customer_purchases')
          .update({
            name_customer: formData.namaPelanggan, // NEW: name_customer
            phone_customer: formData.noPhone, // NEW: phone_customer
            address_customer: formData.alamat, // NEW: address_customer
            postcode_customer: formData.poskod, // NEW: postcode_customer
            city_customer: formData.daerah, // NEW: city_customer
            state_customer: formData.negeri, // NEW: state_customer
            unit: editQuantity, // Always 1 for edit mode
            total_sale: formData.hargaJualan, // NEW: total_sale
            kurier,
            tracking_number: trackingNumber,
            delivery_status: 'Pending', // Keep as Pending after edit (webhook may set to Return due to cancel)
            jenis_platform: formData.jenisPlatform,
            jenis_customer: editFinalCustomerType,
            jenis_closing: formData.jenisClosing,
            type_payment: formData.caraBayaran, // NEW: type_payment
            nota_staff: formData.nota,
            date_payment: showPaymentDetails && tarikhBayaran ? format(tarikhBayaran, 'yyyy-MM-dd') : null, // NEW: date_payment
            bank_payment: showPaymentDetails ? formData.pilihBank : null, // NEW: bank_payment
            receipt_payment_url: newReceiptUrl || null, // NEW: receipt_payment_url
            waybill_url: newWaybillUrl || null,
            bundle_id: editBundleId, // Save selected product/bundle
            // Real shipping cost from the fresh PD quote (only when a new shipment was created)
            ...(pdShippingPrice != null && { cost_postage: pdShippingPrice }),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editOrder.id);

        if (updateError) {
          throw updateError;
        }

        await refreshData();

        toast({
          title: 'Order Dikemaskini',
          description: 'Tempahan pelanggan telah berjaya dikemaskini.',
        });
      } else {
        // New order flow
        // Get selected bundle for SKU (needed for kurier API)
        const selectedBundle = activeBundles.find(b => b.name === formData.produk);

        // For marketplace couriers: use tracking from form input, skip API
        if (isMarketplaceCourier) {
          trackingNumber = formData.trackingNumber;
        }

        // Call kurier API (Ninjavan or Poslaju) - skip for Self Pickup and marketplace couriers
        const shouldCallKurier = !isPickup && !isMarketplaceCourier;
        let waybillPdfUrl = ''; // For Poslaju PDF link

        if (shouldCallKurier) {
          const orderBody = {
            orderId: orderNumber,
            idSale: idSale,
            customerName: formData.namaPelanggan,
            phone: formData.noPhone,
            address: formData.alamat,
            postcode: formData.poskod,
            city: formData.daerah,
            state: formData.negeri,
            price: formData.hargaJualan,
            caraBayaran: formData.caraBayaran,
            produk: formData.produk,
            productSku: selectedBundle?.sku || formData.produk,
            quantity: 1,
            weight: selectedBundle?.weight || 0.5,
            marketerIdStaff: profile?.username || '',
          };

          try {
            const kurierName = pdMapped?.label || 'Kurier';
            const { data: kurierResult, error: kurierError } = await supabase.functions.invoke('parceldaily-order', {
              body: {
                ...orderBody,
                courier: pdMapped?.code || 'poslaju',
                paymentMethod: formData.caraBayaran,
                customerName: formData.namaPelanggan,
                productName: formData.produk,
              }
            });

            if (kurierError) {
              console.error(`Parcel Daily (${kurierName}) API error:`, kurierError);
              toast({
                title: 'Amaran',
                description: `Order disimpan tetapi gagal hantar ke ${kurierName}. Sila hubungi logistik.`,
                variant: 'destructive',
              });
            } else if (kurierResult?.error) {
              console.error(`Parcel Daily (${kurierName}) error:`, kurierResult.error);
              toast({
                title: 'Amaran',
                description: kurierResult.error,
                variant: 'destructive',
              });
            } else if (kurierResult?.orderId) {
              trackingNumber = kurierResult.trackingNumber || kurierResult.orderId;
              if (kurierResult?.pdfLink) waybillPdfUrl = kurierResult.pdfLink;
              // Real shipping cost from PD quote — overrides bundle estimate below
              if (kurierResult?.shippingPrice != null) pdShippingPrice = Number(kurierResult.shippingPrice);
              toast({
                title: `${kurierName} Berjaya`,
                description: `Order ID: ${kurierResult.orderId}. Tracking akan tiba melalui webhook.`,
              });
            }
          } catch (kurierErr) {
            console.error('Kurier call failed:', kurierErr);
            // Continue to save order even if kurier fails
          }
        }

        // Helper function to upload to Vercel Blob (client-side)
        const uploadToVercelBlob = async (file: File, folder: string): Promise<string> => {
          const token = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;
          if (!token) {
            throw new Error('Blob storage token not configured');
          }

          // Create clean filename
          const timestamp = Date.now();
          const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
          const filename = `${folder}/${timestamp}-${cleanFileName}`;

          const blob = await put(filename, file, {
            access: 'public',
            token,
          });

          return blob.url;
        };

        // Upload receipt image if provided
        let receiptUrl = '';
        if (receiptFile && showPaymentDetails) {
          try {
            receiptUrl = await uploadToVercelBlob(receiptFile, 'receipts');
          } catch (uploadError) {
            console.error('Receipt upload error:', uploadError);
            toast({
              title: 'Amaran',
              description: 'Gagal memuat naik resit. Order tetap disimpan.',
              variant: 'destructive',
            });
          }
        }

        // Waybill URL - use Poslaju PDF link if available
        let waybillUrl = waybillPdfUrl || '';

        // Get units from selected bundle (selectedBundle already defined above)
        const bundleUnits = selectedBundle?.units || 1;

        // Calculate costs from bundle
        const costBaseproduct = selectedBundle?.baseCost || 0;
        const costHq = selectedBundle?.hqCost || 0;
        // Determine postage based on state: Sabah/Sarawak use SS, others use SM
        const isSabahSarawak = formData.negeri === 'SABAH' || formData.negeri === 'SARAWAK';
        const basePostage = isSabahSarawak
          ? (selectedBundle?.kosPostageSs || 0)
          : (selectedBundle?.kosPostageSm || 0);
        // Add COD fee if payment method is COD
        const codFee = formData.caraBayaran === 'COD' ? (selectedBundle?.postageCod || 0) : 0;
        // Prefer the REAL shipping cost from the Parcel Daily quote over the bundle estimate
        const costPostage = pdShippingPrice ?? (basePostage + codFee);

        // Customer type is already NP/EP/EC from the Check button
        const finalCustomerType = formData.jenisCustomer;

        // For admin lead orders, insert directly using new schema field names
        if (isAdminLeadOrder && adminLeadData) {
          const { error: insertError } = await (supabase as any)
            .from('customer_purchases')
            .insert({
              id_sale: idSale,
              marketer_id_staff: profile?.username || '',
              name_customer: formData.namaPelanggan, // NEW: name_customer
              phone_customer: formData.noPhone, // NEW: phone_customer
              address_customer: formData.alamat, // NEW: address_customer
              postcode_customer: formData.poskod, // NEW: postcode_customer
              city_customer: formData.daerah, // NEW: city_customer
              state_customer: formData.negeri, // NEW: state_customer
              unit: bundleUnits, // NEW: unit
              total_sale: formData.hargaJualan, // NEW: total_sale
              cost_postage: costPostage, // Calculated from bundle
              cost_baseproduct: costBaseproduct, // From bundle base_cost
              cost_hq: costHq, // From bundle hq_cost
              kurier,
              tracking_number: trackingNumber,
              delivery_status: isMarketplaceCourier ? 'Shipped' : 'Pending',
              date_order: dateOrder,
              date_processed: isMarketplaceCourier ? dateOrder : null,
              jenis_platform: formData.jenisPlatform,
              jenis_customer: finalCustomerType,
              jenis_closing: formData.jenisClosing,
              type_payment: formData.caraBayaran, // NEW: type_payment
              nota_staff: formData.nota,
              date_payment: showPaymentDetails && tarikhBayaran ? format(tarikhBayaran, 'yyyy-MM-dd') : null, // NEW: date_payment
              bank_payment: showPaymentDetails ? formData.pilihBank : null, // NEW: bank_payment
              receipt_payment_url: receiptUrl || null, // NEW: receipt_payment_url
              waybill_url: waybillUrl || null,
              bundle_id: selectedBundle?.id || null, // NEW: bundle_id
              seo: formData.caraBayaran === 'CASH' ? 'Successful Delivery' : null, // Auto-collection for CASH
            });

          if (insertError) throw insertError;
        } else {
          // Regular marketer order
          await addOrder({
            noTempahan: orderNumber,
            idSale: idSale,
            marketerIdStaff: profile?.username || '',
            marketerName: formData.namaPelanggan,
            noPhone: formData.noPhone,
            alamat: formData.alamat,
            poskod: formData.poskod,
            bandar: formData.daerah,
            negeri: formData.negeri,
            sku: formData.produk,
            produk: formData.produk,
            kuantiti: bundleUnits,
            hargaJualanProduk: formData.hargaJualan,
            hargaJualanSebenar: formData.hargaJualan,
            kosPos: costPostage,
            kosProduk: costBaseproduct,
            kosHq: costHq,
            profit: formData.hargaJualan - costPostage - costBaseproduct,
            hargaJualanAgen: 0,
            tarikhTempahan,
            kurier,
            noTracking: trackingNumber,
            statusParcel: isMarketplaceCourier ? 'Shipped' : 'Pending',
            deliveryStatus: isMarketplaceCourier ? 'Shipped' : 'Pending',
            dateOrder,
            dateProcessed: isMarketplaceCourier ? dateOrder : '',
            jenisPlatform: formData.jenisPlatform,
            jenisCustomer: finalCustomerType,
            jenisClosing: formData.jenisClosing,
            caraBayaran: formData.caraBayaran,
            notaStaff: formData.nota,
            beratParcel: 0,
            tarikhBayaran: showPaymentDetails && tarikhBayaran ? format(tarikhBayaran, 'yyyy-MM-dd') : '',
            jenisBayaran: showPaymentDetails ? formData.jenisBayaran : '',
            bank: showPaymentDetails ? formData.pilihBank : '',
            receiptImageUrl: receiptUrl,
            waybillUrl: waybillUrl,
            seo: formData.caraBayaran === 'CASH' ? 'Successful Delivery' : '', // Auto-collection for CASH
            bundleId: selectedBundle?.id || '',
          });
        }

        // Send WhatsApp notification to customer - skip for marketplace couriers
        if (!isMarketplaceCourier) try {
          // Format full address
          const fullAddress = [
            formData.alamat,
            formData.daerah,
            formData.poskod,
            formData.negeri
          ].filter(Boolean).join(', ');

          const notificationResponse = await fetch('/api/send-order-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order: {
                id_sale: idSale,
                customer_name: formData.namaPelanggan,
                phone_customer: formData.noPhone,
                address_full: fullAddress,
                product_name: formData.produk,
                bundle_name: selectedBundle?.name || formData.produk,
                bundle_sku: selectedBundle?.sku || '', // Add bundle SKU for product breakdown
                total_price: formData.hargaJualan,
                payment_method: formData.caraBayaran,
                kurier: kurier, // Include kurier for CARA BAYARAN display
                tracking_number: trackingNumber,
              },
              marketer_id: profile?.id,
            }),
          });
          const notificationResult = await notificationResponse.json();
          if (notificationResult.whatsapp_sent) {
            console.log('WhatsApp notification sent to customer');
          }
        } catch (notifyErr) {
          console.error('Failed to send notification:', notifyErr);
        }

        // Handle lead update/creation and count_order increment - skip if no phone (Tiktok/Shopee)
        if (formData.noPhone) try {
          if (isAdminLeadOrder && adminLeadData?.prospectId) {
            // Admin lead order - update the prospect directly
            // First get current count_order
            const { data: currentProspect } = await (supabase as any)
              .from('prospects')
              .select('count_order')
              .eq('id', adminLeadData.prospectId)
              .single();

            const currentCountOrder = currentProspect?.count_order || 0;

            await (supabase as any)
              .from('prospects')
              .update({
                jenis_prospek: finalCustomerType,
                status_closed: 'closed',
                price_closed: formData.hargaJualan,
                count_order: currentCountOrder + 1,
                updated_at: new Date().toISOString(),
              })
              .eq('id', adminLeadData.prospectId);
          } else if (leadInfo?.isNewLead) {
            // Create new lead with yesterday's date (for EP cases where lead doesn't exist)
            const newLeadId = await autoCreateLead(formData.noPhone, formData.namaPelanggan, formData.produk);

            if (newLeadId) {
              // Update the newly created lead - set type, mark as closed, and set count_order to 1
              await (supabase as any)
                .from('prospects')
                .update({
                  jenis_prospek: finalCustomerType, // EP
                  status_closed: 'closed',
                  price_closed: formData.hargaJualan,
                  count_order: 1,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', newLeadId);
            }
          } else if (leadInfo?.id) {
            // Existing lead - update type, mark as closed, and increment count_order
            const currentCountOrder = leadInfo.countOrder || 0;

            await (supabase as any)
              .from('prospects')
              .update({
                jenis_prospek: finalCustomerType, // NP, EP, or EC
                status_closed: 'closed',
                price_closed: formData.hargaJualan,
                count_order: currentCountOrder + 1,
                updated_at: new Date().toISOString(),
              })
              .eq('id', leadInfo.id);
          }
        } catch (err) {
          console.error('Error updating/creating prospect:', err);
        }

        toast({
          title: 'Order Berjaya',
          description: 'Tempahan pelanggan telah berjaya disimpan.',
        });

        // Refresh data for admin orders
        if (isAdminLeadOrder) {
          await refreshData();
        }
      }

      // Navigate back to appropriate page
      if (isAdminLeadOrder) {
        navigate('/dashboard/admin/leads');
      } else {
        navigate('/dashboard/orders');
      }
    } catch (error) {
      console.error('Error creating/updating order:', error);
      toast({
        title: 'Error',
        description: 'Gagal menyimpan tempahan. Sila cuba lagi.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isTiktokShopee = formData.jenisPlatform === 'Tiktok';
  const isMarketplaceCourier = formData.deliveryMethod === 'Kurier Tiktok';
  const isPickupUI = formData.deliveryMethod === 'Self Pickup';
  const showPaymentDetails = (formData.caraBayaran === 'CASH' || isPickupUI) && !isMarketplaceCourier;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(isAdminLeadOrder ? '/dashboard/admin/leads' : '/dashboard/orders')}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isEditMode ? 'Edit Tempahan' : 'Tempahan Baru'}
          </h1>
          <p className="text-muted-foreground">
            {isEditMode ? 'Kemaskini butiran tempahan' : 'Isi butiran untuk membuat tempahan baru'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer & Order Information */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Nama Pelanggan */}
            <div>
              <FormLabel required>Nama Pelanggan</FormLabel>
              <Input
                placeholder="Masukkan nama pelanggan"
                value={formData.namaPelanggan}
                onChange={(e) => handleChange('namaPelanggan', e.target.value)}
                className="bg-background"
              />
            </div>

            {/* No. Telefon */}
            <div>
              <FormLabel required={!isTiktokShopee}>No. Telefon (digit start with 6)</FormLabel>
              <Input
                type="number"
                placeholder="60123456789"
                value={formData.noPhone}
                onChange={(e) => handleChange('noPhone', e.target.value)}
                className="bg-background"
              />
            </div>

            {/* Jenis Platform */}
            <div>
              <FormLabel required>Jenis Platform</FormLabel>
              <Select
                value={formData.jenisPlatform}
                onValueChange={(value) => handleChange('jenisPlatform', value)}
                disabled={isEditMode && profile?.role === 'marketer'}
              >
                <SelectTrigger className={cn("bg-background", isEditMode && profile?.role === 'marketer' && "opacity-60 cursor-not-allowed")}>
                  <SelectValue placeholder="Pilih Platform" />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Jenis Closing */}
            <div>
              <FormLabel required>Jenis Closing</FormLabel>
              <Select
                value={formData.jenisClosing}
                onValueChange={(value) => handleChange('jenisClosing', value)}
                disabled={isEditMode && profile?.role === 'marketer'}
              >
                <SelectTrigger className={cn("bg-background", isEditMode && profile?.role === 'marketer' && "opacity-60 cursor-not-allowed")}>
                  <SelectValue placeholder="Pilih Jenis Closing" />
                </SelectTrigger>
                <SelectContent>
                  {(formData.jenisPlatform === 'Tiktok'
                    ? JENIS_CLOSING_MARKETPLACE_OPTIONS
                    : JENIS_CLOSING_OPTIONS
                  ).map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Jenis Customer */}
            <div>
              <FormLabel required={!isTiktokShopee}>Jenis Customer</FormLabel>
              <div className="flex gap-2">
                <Select
                  value={formData.jenisCustomer}
                  onValueChange={(value) => handleChange('jenisCustomer', value)}
                >
                  <SelectTrigger className={cn(
                    "flex-1",
                    formData.jenisCustomer === 'NP' && "text-green-600 font-medium",
                    formData.jenisCustomer === 'EP' && "text-purple-600 font-medium",
                    formData.jenisCustomer === 'EC' && "text-amber-600 font-medium"
                  )}>
                    <SelectValue placeholder="Pilih atau klik Semak" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NP" className="text-green-600">New Prospect (NP)</SelectItem>
                    <SelectItem value="EP" className="text-purple-600">Existing Prospect (EP)</SelectItem>
                    <SelectItem value="EC" className="text-amber-600">Existing Customer (EC)</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCheckCustomerType}
                  disabled={isCheckingLead || isEditMode || !formData.noPhone || formData.noPhone.length < 10}
                  className="shrink-0"
                >
                  {isCheckingLead ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-1" />
                      Semak
                    </>
                  )}
                </Button>
              </div>
              {leadInfo && formData.jenisCustomer && (
                <p className="text-xs text-muted-foreground mt-1">
                  {leadInfo.isNewLead
                    ? 'Lead baru akan dicipta automatik'
                    : `Order ke-${(leadInfo.countOrder || 0) + 1} untuk lead ini`
                  }
                </p>
              )}
            </div>

            {/* Poskod */}
            <div>
              <FormLabel required>Poskod</FormLabel>
              <Input
                type="number"
                placeholder="Masukkan poskod"
                value={formData.poskod}
                onChange={(e) => handleChange('poskod', e.target.value)}
                className="bg-background"
              />
            </div>

            {/* Daerah */}
            <div>
              <FormLabel required>Daerah</FormLabel>
              <Input
                placeholder="Masukkan daerah"
                value={formData.daerah}
                onChange={(e) => handleChange('daerah', e.target.value)}
                className="bg-background"
              />
            </div>

            {/* Negeri */}
            <div>
              <FormLabel required>Negeri</FormLabel>
              <Select
                value={formData.negeri}
                onValueChange={(value) => handleChange('negeri', value)}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Pilih Negeri" />
                </SelectTrigger>
                <SelectContent>
                  {NEGERI_OPTIONS.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Alamat */}
            <div className="lg:col-span-4">
              <FormLabel required>Alamat</FormLabel>
              <Textarea
                placeholder="Masukkan alamat penuh"
                value={formData.alamat}
                onChange={(e) => handleChange('alamat', e.target.value)}
                className="bg-background resize-none"
                rows={3}
              />
            </div>

            {/* Produk */}
            <div>
              <FormLabel required>Produk</FormLabel>
              <Select
                value={formData.produk}
                onValueChange={(value) => handleChange('produk', value)}
                disabled={bundlesLoading}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={bundlesLoading ? "Loading..." : "Pilih Produk"} />
                </SelectTrigger>
                <SelectContent>
                  {bundlesLoading ? (
                    <SelectItem value="loading" disabled>Loading bundles...</SelectItem>
                  ) : activeBundles.length === 0 ? (
                    <SelectItem value="empty" disabled>No active bundles available</SelectItem>
                  ) : (
                    activeBundles.map((bundle) => (
                      <SelectItem key={bundle.id} value={bundle.name}>
                        {bundle.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Harga Jualan */}
            <div>
              <FormLabel required>Harga Jualan (RM)</FormLabel>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.hargaJualan || ''}
                onChange={(e) => handleChange('hargaJualan', parseFloat(e.target.value) || 0)}
                className={cn("bg-background", isPriceBelowMinimum && "border-red-500 focus-visible:ring-red-500")}
              />
              {currentMinPrice > 0 && (
                <p className={cn("text-xs mt-1", isPriceBelowMinimum ? "text-red-500" : "text-muted-foreground")}>
                  Harga minimum: RM{currentMinPrice.toFixed(2)}
                  {isPriceBelowMinimum && " - Harga terlalu rendah!"}
                </p>
              )}
              {/* Show postage breakdown for COD orders */}
              {formData.caraBayaran === 'COD' && postageCostInfo.total > 0 && (
                <div className="text-xs mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
                  <p className="font-medium text-amber-700 dark:text-amber-400">Kos Postage (COD):</p>
                  <p className="text-amber-600 dark:text-amber-500">
                    Postage {isEastMalaysia(formData.negeri) ? 'SS' : 'SM'}: RM{postageCostInfo.postage.toFixed(2)}
                  </p>
                  <p className="text-amber-600 dark:text-amber-500">
                    COD Fee: RM{postageCostInfo.codFee.toFixed(2)}
                  </p>
                  <p className="font-medium text-amber-700 dark:text-amber-400 border-t border-amber-200 dark:border-amber-700 pt-1 mt-1">
                    Total Postage: RM{postageCostInfo.total.toFixed(2)}
                  </p>
                </div>
              )}
            </div>

            {/* Cara Bayaran */}
            <div>
              <FormLabel required>Cara Bayaran</FormLabel>
              <Select
                value={formData.caraBayaran}
                onValueChange={(value) => handleChange('caraBayaran', value)}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Pilih Cara Bayaran" />
                </SelectTrigger>
                <SelectContent>
                  {CARA_BAYARAN_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Delivery Method */}
            <div>
              <FormLabel required>Delivery Method</FormLabel>
              <Select
                value={formData.deliveryMethod}
                onValueChange={(value) => handleChange('deliveryMethod', value)}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Pilih Delivery Method" />
                </SelectTrigger>
                <SelectContent>
                  {DELIVERY_METHOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tracking Number - Only for Kurier Tiktok/Shopee */}
            {isMarketplaceCourier && (
              <div>
                <FormLabel required>No. Tracking</FormLabel>
                <Input
                  placeholder="Masukkan tracking number"
                  value={formData.trackingNumber}
                  onChange={(e) => handleChange('trackingNumber', e.target.value)}
                  className="bg-background"
                />
              </div>
            )}

            {/* Nota - Always visible */}
            <div className="lg:col-span-2">
              <FormLabel>Nota</FormLabel>
              <Textarea
                placeholder="Masukkan nota tambahan (optional)"
                value={formData.nota}
                onChange={(e) => handleChange('nota', e.target.value)}
                className="bg-background resize-none"
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Payment Details - Only show if CASH is selected */}
        {showPaymentDetails && (
          <div className="bg-card border border-border rounded-lg p-6 border-l-4 border-l-emerald-500">
            <h3 className="text-lg font-semibold text-foreground mb-4">Butiran Bayaran</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Jenis Bayaran - First */}
              <div>
                <FormLabel required>Jenis Bayaran</FormLabel>
                <Select
                  value={formData.jenisBayaran}
                  onValueChange={(value) => handleChange('jenisBayaran', value)}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Pilih Jenis Bayaran" />
                  </SelectTrigger>
                  <SelectContent>
                    {JENIS_BAYARAN_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tarikh Bayaran - Only show if NOT Billplz */}
              {formData.jenisBayaran !== 'Billplz' && (
                <div>
                  <FormLabel required>Tarikh Bayaran</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal bg-background",
                          !tarikhBayaran && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {tarikhBayaran ? format(tarikhBayaran, "dd/MM/yyyy") : "Pilih tarikh"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={tarikhBayaran}
                        onSelect={setTarikhBayaran}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Pilih Bank - Only show if NOT Billplz */}
              {formData.jenisBayaran !== 'Billplz' && (
                <div>
                  <FormLabel required>Pilih Bank</FormLabel>
                  <Select
                    value={formData.pilihBank}
                    onValueChange={(value) => handleChange('pilihBank', value)}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Pilih Bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {BANK_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Resit Bayaran - Only show if NOT Billplz */}
              {formData.jenisBayaran !== 'Billplz' && (
                <div>
                  <FormLabel required>Resit Bayaran</FormLabel>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      id="receipt-upload"
                    />
                    <label
                      htmlFor="receipt-upload"
                      className="flex items-center justify-center gap-2 w-full px-4 py-2 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors bg-background"
                    >
                      <Upload className="w-4 h-4" />
                      <span className="text-sm text-muted-foreground">
                        {receiptFile ? receiptFile.name : (isEditMode ? 'Resit sudah dimuat naik' : 'Upload Resit')}
                      </span>
                    </label>
                    {receiptPreview && (
                      <img
                        src={receiptPreview}
                        alt="Receipt preview"
                        className="mt-2 w-full h-32 object-cover rounded-lg border border-border"
                      />
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(isAdminLeadOrder ? '/dashboard/admin/leads' : '/dashboard/orders')}
          >
            Batal
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-primary hover:bg-primary/90"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isEditMode ? 'Mengemaskini...' : 'Menyimpan...'}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {isEditMode ? 'Kemaskini' : 'Submit'}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default OrderForm;
