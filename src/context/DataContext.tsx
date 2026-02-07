import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { toast } from '@/hooks/use-toast';

// Roles that can see all data (not filtered by their own idstaff)
const ADMIN_ROLES = ['admin', 'bod', 'logistic', 'account'];

interface CustomerOrder {
  id: string; noTempahan: string; idSale: string; marketerIdStaff: string; marketerName: string; noPhone: string;
  alamat: string; poskod: string; bandar: string; negeri: string; sku: string; produk: string;
  kuantiti: number; hargaJualanProduk: number; hargaJualanSebenar: number; kosPos: number;
  kosProduk: number; profit: number; hargaJualanAgen: number; tarikhTempahan: string;
  kurier: string; noTracking: string; statusParcel: string;
  notaStaff: string; beratParcel: number; createdAt: string;
  deliveryStatus: string; dateOrder: string; dateProcessed: string; dateReturn: string;
  jenisPlatform: string; jenisCustomer: string; jenisClosing: string; caraBayaran: string;
  tarikhBayaran: string; jenisBayaran: string; bank: string; receiptImageUrl: string; waybillUrl: string;
  seo: string; seos: string; bundleId: string;
}

interface Prospect {
  id: string; namaProspek: string; noTelefon: string; niche: string; jenisProspek: string;
  tarikhPhoneNumber: string; adminIdStaff: string; marketerIdStaff: string; createdAt: string;
  statusClosed: string; priceClosed: number; countOrder: number; profile: string;
}

interface DataContextType {
  orders: CustomerOrder[]; prospects: Prospect[]; isLoading: boolean;
  addOrder: (order: Omit<CustomerOrder, 'id' | 'createdAt'>) => Promise<void>;
  updateOrder: (id: string, order: Partial<CustomerOrder>) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  addProspect: (prospect: Omit<Prospect, 'id' | 'createdAt'>) => Promise<void>;
  updateProspect: (id: string, prospect: Partial<Prospect>) => Promise<void>;
  deleteProspect: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// Helper to query tables that aren't in types yet
const queryTable = (tableName: string) => {
  return (supabase as any).from(tableName);
};

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, profile, isAuthenticated } = useAuth();

  // Check if current user is marketer or admin (should only see their own data)
  const isMarketer = profile?.role === 'marketer';
  const isAdmin = profile?.role === 'admin';
  const shouldFilterByIdStaff = isMarketer || isAdmin;
  const userIdStaff = profile?.idstaff;

  // Map customer_purchases table to CustomerOrder interface
  // New schema field mapping:
  // name_customer, phone_customer, address_customer, city_customer, postcode_customer, state_customer
  // total_sale, unit, type_payment, date_payment, bank_payment, receipt_payment_url
  const mapOrder = (d: any): CustomerOrder => ({
    id: d.id,
    noTempahan: d.id_sale || d.id?.substring(0, 8) || '',
    idSale: d.id_sale || '',
    marketerIdStaff: d.marketer_id_staff || '',
    marketerName: d.name_customer || '', // NEW: name_customer
    noPhone: d.phone_customer || '', // NEW: phone_customer
    alamat: d.address_customer || '', // NEW: address_customer
    poskod: d.postcode_customer || '', // NEW: postcode_customer
    bandar: d.city_customer || '', // NEW: city_customer
    negeri: d.state_customer || '', // NEW: state_customer
    sku: '', // Removed - using bundle_id now
    produk: d.bundle?.name || '', // Get bundle name from joined data
    kuantiti: d.unit || 1, // NEW: unit
    hargaJualanProduk: parseFloat(d.total_sale) || 0, // NEW: total_sale
    hargaJualanSebenar: parseFloat(d.total_sale) || 0, // NEW: total_sale
    kosPos: parseFloat(d.cost_postage) || 0, // NEW: cost_postage
    kosProduk: parseFloat(d.cost_baseproduct) || 0, // NEW: cost_baseproduct
    profit: (parseFloat(d.total_sale) || 0) - (parseFloat(d.cost_postage) || 0) - (parseFloat(d.cost_baseproduct) || 0),
    hargaJualanAgen: 0,
    tarikhTempahan: d.date_order || '',
    kurier: d.kurier || '',
    noTracking: d.tracking_number || '', // Field name unchanged
    statusParcel: d.delivery_status || 'Pending',
    notaStaff: d.nota_staff || '',
    beratParcel: 0,
    createdAt: d.created_at,
    deliveryStatus: d.delivery_status || 'Pending',
    dateOrder: d.date_order || '',
    dateProcessed: d.date_processed || '',
    dateReturn: d.date_return || '',
    jenisPlatform: d.jenis_platform || '',
    jenisCustomer: d.jenis_customer || '',
    jenisClosing: d.jenis_closing || '',
    caraBayaran: d.type_payment || '', // NEW: type_payment
    tarikhBayaran: d.date_payment || '', // NEW: date_payment
    jenisBayaran: d.type_payment || '', // NEW: type_payment (same as caraBayaran)
    bank: d.bank_payment || '', // NEW: bank_payment
    receiptImageUrl: d.receipt_payment_url || '', // NEW: receipt_payment_url
    waybillUrl: d.waybill_url || '',
    seo: d.seo || '',
    seos: d.seos || '',
    bundleId: d.bundle_id || '',
  });

  const mapProspect = (d: any): Prospect => ({
    id: d.id, namaProspek: d.nama_prospek, noTelefon: d.no_telefon, niche: d.niche,
    jenisProspek: d.jenis_prospek, tarikhPhoneNumber: d.tarikh_phone_number || '',
    adminIdStaff: d.admin_id_staff || '', adminClaimedAt: d.admin_claimed_at || '',
    marketerIdStaff: d.marketer_id_staff || '',
    createdAt: d.created_at, statusClosed: d.status_closed || '', priceClosed: parseFloat(d.price_closed) || 0,
    countOrder: d.count_order || 0, profile: d.profile || '', createdBy: d.created_by || '',
  });

  const refreshData = async () => {
    if (!isAuthenticated) { setOrders([]); setProspects([]); setIsLoading(false); return; }
    setIsLoading(true);
    try {
      // Build queries - filter by idstaff if user is a marketer or admin
      // Join with logistic_bundles to get bundle name
      let ordersQuery = queryTable('customer_purchases').select('*, bundle:logistic_bundles(name)').order('created_at', { ascending: false });
      let prospectsQuery = queryTable('prospects').select('*').order('created_at', { ascending: false });

      // Marketers and admins only see their own data
      if (shouldFilterByIdStaff && userIdStaff) {
        ordersQuery = ordersQuery.eq('marketer_id_staff', userIdStaff);
        prospectsQuery = prospectsQuery.eq('marketer_id_staff', userIdStaff);
      }

      const [ordersRes, prospectsRes] = await Promise.all([ordersQuery, prospectsQuery]);
      setOrders((ordersRes.data || []).map(mapOrder));
      setProspects((prospectsRes.data || []).map(mapProspect));
    } catch (e) { console.error('Error:', e); }
    setIsLoading(false);
  };

  useEffect(() => { refreshData(); }, [isAuthenticated, shouldFilterByIdStaff, userIdStaff]);

  const addOrder = async (order: Omit<CustomerOrder, 'id' | 'createdAt'>) => {
    // New schema field mapping for insert
    // Auto-set SEO to 'Successful Delivery' for CASH orders (collection is automatic)
    const { error } = await queryTable('customer_purchases').insert({
      id_sale: order.idSale,
      marketer_id_staff: order.marketerIdStaff,
      name_customer: order.marketerName, // NEW: name_customer
      phone_customer: order.noPhone, // NEW: phone_customer
      address_customer: order.alamat, // NEW: address_customer
      postcode_customer: order.poskod, // NEW: postcode_customer
      city_customer: order.bandar, // NEW: city_customer
      state_customer: order.negeri, // NEW: state_customer
      unit: order.kuantiti, // NEW: unit
      total_sale: order.hargaJualanSebenar, // NEW: total_sale
      cost_postage: order.kosPos, // NEW: cost_postage
      cost_baseproduct: order.kosProduk, // NEW: cost_baseproduct
      kurier: order.kurier,
      tracking_number: order.noTracking,
      nota_staff: order.notaStaff,
      delivery_status: order.deliveryStatus,
      date_order: order.dateOrder,
      date_processed: order.dateProcessed || null,
      jenis_platform: order.jenisPlatform,
      jenis_customer: order.jenisCustomer,
      jenis_closing: order.jenisClosing,
      type_payment: order.caraBayaran, // NEW: type_payment
      date_payment: order.tarikhBayaran || null, // NEW: date_payment
      bank_payment: order.bank || null, // NEW: bank_payment
      receipt_payment_url: order.receiptImageUrl || null, // NEW: receipt_payment_url
      waybill_url: order.waybillUrl || null,
      bundle_id: order.bundleId || null, // NEW: bundle_id
      seos: 'Pending', // Delivery tracking status - starts as Pending
      // Note: seo is NOT set here - it's updated by ninjavan-webhook or manual receipt upload
    });
    if (error) { toast({ title: 'Error', description: 'Failed to create order.', variant: 'destructive' }); throw error; }
    await refreshData();
  };

  const updateOrder = async (id: string, data: Partial<CustomerOrder>) => {
    const upd: any = {};
    if (data.statusParcel !== undefined) upd.delivery_status = data.statusParcel;
    if (data.noTracking !== undefined) upd.tracking_number = data.noTracking;
    if (data.deliveryStatus !== undefined) upd.delivery_status = data.deliveryStatus;
    if (data.dateProcessed !== undefined) upd.date_processed = data.dateProcessed;
    if (data.dateReturn !== undefined) upd.date_return = data.dateReturn;
    if (data.receiptImageUrl !== undefined) upd.receipt_payment_url = data.receiptImageUrl;
    if (data.seo !== undefined) upd.seo = data.seo;
    upd.updated_at = new Date().toISOString();
    const { error } = await queryTable('customer_purchases').update(upd).eq('id', id);
    if (error) throw error;
    await refreshData();
  };

  const deleteOrder = async (id: string) => {
    console.log('Deleting order with ID:', id);
    const { error } = await queryTable('customer_purchases').delete().eq('id', id);
    
    if (error) {
      console.error('Delete error:', error);
      toast({ title: 'Error', description: 'Failed to delete order.', variant: 'destructive' });
      throw error;
    }
    console.log('Delete successful');
    await refreshData();
  };

  const addProspect = async (prospect: Omit<Prospect, 'id' | 'createdAt'>) => {
    // For marketers and admins, auto-set marketer_id_staff to their own idstaff
    const marketerIdStaff = shouldFilterByIdStaff ? userIdStaff : (prospect.marketerIdStaff || null);

    const { error } = await queryTable('prospects').insert({
      nama_prospek: prospect.namaProspek, no_telefon: prospect.noTelefon, niche: prospect.niche,
      jenis_prospek: prospect.jenisProspek, tarikh_phone_number: prospect.tarikhPhoneNumber || null,
      admin_id_staff: prospect.adminIdStaff || null, marketer_id_staff: marketerIdStaff,
      created_by: user?.id,
    });
    if (error) { toast({ title: 'Error', description: 'Failed to add prospect.', variant: 'destructive' }); throw error; }
    await refreshData();
  };

  const updateProspect = async (id: string, data: Partial<Prospect>) => {
    const upd: any = { updated_at: new Date().toISOString() };
    if (data.namaProspek !== undefined) upd.nama_prospek = data.namaProspek;
    if (data.noTelefon !== undefined) upd.no_telefon = data.noTelefon;
    if (data.niche !== undefined) upd.niche = data.niche;
    if (data.jenisProspek !== undefined) upd.jenis_prospek = data.jenisProspek;
    if (data.tarikhPhoneNumber !== undefined) upd.tarikh_phone_number = data.tarikhPhoneNumber || null;
    if (data.adminIdStaff !== undefined) upd.admin_id_staff = data.adminIdStaff || null;
    if (data.marketerIdStaff !== undefined) upd.marketer_id_staff = data.marketerIdStaff;
    if (data.statusClosed !== undefined) upd.status_closed = data.statusClosed;
    if (data.priceClosed !== undefined) upd.price_closed = data.priceClosed;
    const { error } = await queryTable('prospects').update(upd).eq('id', id);
    if (error) { toast({ title: 'Error', description: 'Failed to update prospect.', variant: 'destructive' }); throw error; }
    await refreshData();
  };

  const deleteProspect = async (id: string) => {
    const { error } = await queryTable('prospects').delete().eq('id', id);
    if (error) throw error;
    await refreshData();
  };

  return (
    <DataContext.Provider value={{ orders, prospects, isLoading, addOrder, updateOrder, deleteOrder, addProspect, updateProspect, deleteProspect, refreshData }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) throw new Error('useData must be used within a DataProvider');
  return context;
};