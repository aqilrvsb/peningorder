export type UserRole = 'marketer' | 'admin' | 'bod' | 'logistic' | 'account';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

export interface CustomerOrder {
  id: string;
  noTempahan: string;
  marketerIdStaff: string;
  marketerName: string;
  noPhone: string;
  alamat: string;
  poskod: string;
  bandar: string;
  negeri: string;
  sku: string;
  produk: string;
  kuantiti: number;
  hargaJualanProduk: number;
  hargaJualanSebenar: number;
  kosPos: number;
  kosProduk: number;
  profit: number;
  hargaJualanAgen: number;
  tarikhTempahan: string;
  kurier: string;
  noTracking: string;
  statusParcel: 'Pending' | 'Processing' | 'Shipped' | 'Success' | 'Failed';
  notaStaff: string;
  beratParcel: number;
  createdAt: string;
  createdBy: string;
}

export interface Prospect {
  id: string;
  namaProspek: string;
  noTelefon: string;
  niche: string;
  jenisProspek: string;
  tarikhPhoneNumber: string;
  adminIdStaff: string;
  adminClaimedAt: string;
  marketerIdStaff: string;
  statusClosed: string;
  priceClosed: number;
  countOrder: number;
  profile: string;
  createdAt: string;
  createdBy: string;
}

export const USERS: User[] = [
  { id: '1', username: 'MR-001', name: 'Marketer User', role: 'marketer' },
  { id: '2', username: 'AD-001', name: 'Admin User', role: 'admin' },
  { id: '3', username: 'BOD', name: 'Board of Directors', role: 'bod' },
  { id: '4', username: 'LOGHQ', name: 'Logistic HQ', role: 'logistic' },
  { id: '5', username: 'ACCHQ', name: 'Account HQ', role: 'account' },
];

export const NEGERI_OPTIONS = [
  'JOHOR', 'KEDAH', 'KELANTAN', 'MELAKA', 'NEGERI SEMBILAN',
  'PAHANG', 'PERAK', 'PERLIS', 'PULAU PINANG', 'SABAH',
  'SARAWAK', 'SELANGOR', 'TERENGGANU', 'KUALA LUMPUR', 'LABUAN', 'PUTRAJAYA'
];

export const KURIER_OPTIONS = [
  'COD NINJAVAN', 'POSLAJU', 'J&T EXPRESS', 'DHL', 'GDEX', 'SKYNET', 'ABX EXPRESS'
];

export const STATUS_OPTIONS: CustomerOrder['statusParcel'][] = [
  'Pending', 'Processing', 'Shipped', 'Success', 'Failed'
];

export const NICHE_OPTIONS = [
  'Health & Beauty', 'Fashion', 'Electronics', 'Home & Living', 'Food & Beverage', 'Others'
];

export const JENIS_PROSPEK_OPTIONS = [
  'Hot Lead', 'Warm Lead', 'Cold Lead', 'Qualified Lead', 'Unqualified Lead'
];

export const JENIS_CLOSING_OPTIONS = [
  'Manual', 'Wa Bot', 'Website', 'Call'
];

// Additional closing options for Shopee/Tiktok platforms
export const JENIS_CLOSING_MARKETPLACE_OPTIONS = [
  'Manual', 'Wa Bot', 'Website', 'Call', 'Live', 'Shop'
];
