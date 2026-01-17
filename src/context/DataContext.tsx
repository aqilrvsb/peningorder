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
  seo: string;
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

  // Check if current user is marketer (should only see their own data)
  const isMarketer = profile?.role === 'marketer';
  const userIdStaff = profile?.idstaff;

  // Map customer_purchases table to CustomerOrder interface
  const mapOrder = (d: any): CustomerOrder => ({
    id: d.id,
    noTempahan: d.id_sale || d.id?.substring(0, 8) || '', // Use id_sale as order number
    idSale: d.id_sale || '',
    marketerIdStaff: d.marketer_id_staff || '',
    marketerName: d.marketer_name || '',
    noPhone: d.no_phone || '',
    alamat: d.alamat || '',
    poskod: d.poskod || '',
    bandar: d.bandar || '',
    negeri: d.negeri || '',
    sku: d.sku || '',
    produk: d.produk || '',
    kuantiti: d.quantity || 1, // customer_purchases uses 'quantity' not 'kuantiti'
    hargaJualanProduk: parseFloat(d.harga_jualan_produk) || 0,
    hargaJualanSebenar: parseFloat(d.total_price) || 0, // customer_purchases uses 'total_price'
    kosPos: parseFloat(d.kos_pos) || 0,
    kosProduk: parseFloat(d.kos_produk) || 0,
    profit: parseFloat(d.profit) || 0,
    hargaJualanAgen: parseFloat(d.harga_jualan_agen) || 0,
    tarikhTempahan: d.date_order || '', // customer_purchases uses 'date_order' (date type)
    kurier: d.kurier || '',
    noTracking: d.no_tracking || '',
    statusParcel: d.delivery_status || 'Pending', // Use delivery_status
    notaStaff: d.nota_staff || '',
    beratParcel: 0, // Not in customer_purchases
    createdAt: d.created_at,
    deliveryStatus: d.delivery_status || 'Pending',
    dateOrder: d.date_order || '',
    dateProcessed: d.date_processed || '',
    dateReturn: d.date_return || '',
    jenisPlatform: d.jenis_platform || '',
    jenisCustomer: d.jenis_customer || '',
    jenisClosing: d.jenis_closing || '',
    caraBayaran: d.cara_bayaran || '',
    tarikhBayaran: d.tarikh_bayaran || '',
    jenisBayaran: d.jenis_bayaran || '',
    bank: d.bank || '',
    receiptImageUrl: d.receipt_image_url || '',
    waybillUrl: d.waybill_url || '',
    seo: d.seo || '',
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
      // Build queries - filter by marketer's idstaff if user is a marketer
      let ordersQuery = queryTable('customer_purchases').select('*').order('created_at', { ascending: false });
      let prospectsQuery = queryTable('prospects').select('*').order('created_at', { ascending: false });

      // Marketers only see their own data
      if (isMarketer && userIdStaff) {
        ordersQuery = ordersQuery.eq('marketer_id_staff', userIdStaff);
        prospectsQuery = prospectsQuery.eq('marketer_id_staff', userIdStaff);
      }

      const [ordersRes, prospectsRes] = await Promise.all([ordersQuery, prospectsQuery]);
      setOrders((ordersRes.data || []).map(mapOrder));
      setProspects((prospectsRes.data || []).map(mapProspect));
    } catch (e) { console.error('Error:', e); }
    setIsLoading(false);
  };

  useEffect(() => { refreshData(); }, [isAuthenticated, isMarketer, userIdStaff]);

  const addOrder = async (order: Omit<CustomerOrder, 'id' | 'createdAt'>) => {
    const { error } = await queryTable('customer_purchases').insert({
      id_sale: order.idSale, marketer_id: user?.id, marketer_id_staff: order.marketerIdStaff,
      marketer_name: order.marketerName, no_phone: order.noPhone, alamat: order.alamat,
      poskod: order.poskod, bandar: order.bandar, negeri: order.negeri, sku: order.sku,
      produk: order.produk, quantity: order.kuantiti, harga_jualan_produk: order.hargaJualanProduk,
      total_price: order.hargaJualanSebenar, kos_pos: order.kosPos, kos_produk: order.kosProduk,
      profit: order.profit, harga_jualan_agen: order.hargaJualanAgen,
      kurier: order.kurier, no_tracking: order.noTracking,
      nota_staff: order.notaStaff,
      delivery_status: order.deliveryStatus, date_order: order.dateOrder,
      jenis_platform: order.jenisPlatform, jenis_customer: order.jenisCustomer, jenis_closing: order.jenisClosing, cara_bayaran: order.caraBayaran,
      tarikh_bayaran: order.tarikhBayaran || null, jenis_bayaran: order.jenisBayaran || null,
      bank: order.bank || null, receipt_image_url: order.receiptImageUrl || null, waybill_url: order.waybillUrl || null,
    });
    if (error) { toast({ title: 'Error', description: 'Failed to create order.', variant: 'destructive' }); throw error; }
    await refreshData();
  };

  const updateOrder = async (id: string, data: Partial<CustomerOrder>) => {
    const upd: any = {};
    if (data.statusParcel !== undefined) upd.delivery_status = data.statusParcel;
    if (data.noTracking !== undefined) upd.no_tracking = data.noTracking;
    if (data.deliveryStatus !== undefined) upd.delivery_status = data.deliveryStatus;
    if (data.dateProcessed !== undefined) upd.date_processed = data.dateProcessed;
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
    // For marketers, auto-set marketer_id_staff to their own idstaff
    const marketerIdStaff = isMarketer ? userIdStaff : (prospect.marketerIdStaff || null);

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