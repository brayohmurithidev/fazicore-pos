import type { Branch, Category, Product, PurchaseOrder, Settings, Transaction, User } from '@/types'

export const CATEGORIES: Category[] = [
  { id: 'bev',     name: 'Beverages',       color: '#3B82F6' },
  { id: 'dairy',   name: 'Dairy',           color: '#8B5CF6' },
  { id: 'snack',   name: 'Snacks',          color: '#F59E0B' },
  { id: 'grain',   name: 'Grains & Flour',  color: '#10B981' },
  { id: 'clean',   name: 'Cleaning',        color: '#EF4444' },
  { id: 'fresh',   name: 'Fresh Produce',   color: '#84CC16' },
  { id: 'spirits', name: 'Spirits & Beer',  color: '#F97316' },
  { id: 'health',  name: 'Health & Beauty', color: '#EC4899' },
]

export const PRODUCTS: Product[] = [
  { id: 'p001', name: 'Tusker Lager 500ml',     category: 'spirits', price: 200,  cost: 140,  sku: 'TK-500',  barcode: '6001068000000', stock: 144, minStock: 24, expiryDate: '2026-12-31', unit: 'bottle', vatRate: 0.16 },
  { id: 'p002', name: 'Coca-Cola 500ml',         category: 'bev',     price: 60,   cost: 40,   sku: 'CC-500',  barcode: '5449000000996', stock: 220, minStock: 48, expiryDate: '2026-09-30', unit: 'bottle', vatRate: 0.16 },
  { id: 'p003', name: 'Brookside Milk 500ml',    category: 'dairy',   price: 65,   cost: 52,   sku: 'BK-500',  barcode: '6008100000001', stock: 80,  minStock: 30, expiryDate: '2026-04-28', unit: 'packet', vatRate: 0    },
  { id: 'p004', name: 'Unga Pembe 2kg',          category: 'grain',   price: 190,  cost: 150,  sku: 'UP-2KG',  barcode: '6001234500001', stock: 60,  minStock: 20, expiryDate: '2026-11-01', unit: 'bag',    vatRate: 0    },
  { id: 'p005', name: 'Pringles Original 134g',  category: 'snack',   price: 350,  cost: 270,  sku: 'PR-134',  barcode: '0038000845017', stock: 35,  minStock: 12, expiryDate: '2026-07-15', unit: 'tin',    vatRate: 0.16 },
  { id: 'p006', name: 'Omo Washing Powder 1kg',  category: 'clean',   price: 320,  cost: 240,  sku: 'OM-1KG',  barcode: '6001009000002', stock: 28,  minStock: 15, expiryDate: '2028-01-01', unit: 'pack',   vatRate: 0.16 },
  { id: 'p007', name: 'Tomatoes (loose)',         category: 'fresh',   price: 10,   cost: 6,    sku: 'TM-KG',   barcode: '',             stock: 15,  minStock: 5,  expiryDate: '2026-04-29', unit: '100g',   vatRate: 0    },
  { id: 'p008', name: 'Sprite 500ml',             category: 'bev',     price: 60,   cost: 40,   sku: 'SP-500',  barcode: '5449000011274', stock: 180, minStock: 48, expiryDate: '2026-09-30', unit: 'bottle', vatRate: 0.16 },
  { id: 'p009', name: 'KCC Butter 250g',          category: 'dairy',   price: 170,  cost: 130,  sku: 'KCC-250', barcode: '6001068000011', stock: 22,  minStock: 12, expiryDate: '2026-05-15', unit: 'pack',   vatRate: 0    },
  { id: 'p010', name: 'Kenchic Eggs (crate 30)',  category: 'dairy',   price: 500,  cost: 420,  sku: 'EGG-30',  barcode: '6001068000022', stock: 10,  minStock: 5,  expiryDate: '2026-05-10', unit: 'crate',  vatRate: 0    },
  { id: 'p011', name: 'Jameson Whiskey 750ml',    category: 'spirits', price: 2800, cost: 2200, sku: 'JM-750',  barcode: '5011007003101', stock: 18,  minStock: 6,  expiryDate: '2030-01-01', unit: 'bottle', vatRate: 0.16 },
  { id: 'p012', name: 'Blue Band Margarine 500g', category: 'dairy',   price: 240,  cost: 190,  sku: 'BB-500',  barcode: '6001068000033', stock: 40,  minStock: 15, expiryDate: '2026-08-01', unit: 'tub',    vatRate: 0    },
  { id: 'p013', name: 'Krest Bitter Lemon',       category: 'bev',     price: 75,   cost: 52,   sku: 'KR-300',  barcode: '5449000111234', stock: 96,  minStock: 24, expiryDate: '2026-10-01', unit: 'bottle', vatRate: 0.16 },
  { id: 'p014', name: 'White Cap Lager 500ml',    category: 'spirits', price: 200,  cost: 140,  sku: 'WC-500',  barcode: '6001068000044', stock: 7,   minStock: 24, expiryDate: '2026-12-31', unit: 'bottle', vatRate: 0.16 },
  { id: 'p015', name: 'Nivea Body Lotion 400ml',  category: 'health',  price: 480,  cost: 350,  sku: 'NV-400',  barcode: '4005900000011', stock: 20,  minStock: 8,  expiryDate: '2027-06-01', unit: 'bottle', vatRate: 0.16 },
  { id: 'p016', name: 'Royco Mchuzi Mix 200g',    category: 'grain',   price: 85,   cost: 60,   sku: 'RM-200',  barcode: '6001234500016', stock: 55,  minStock: 20, expiryDate: '2026-12-01', unit: 'pack',   vatRate: 0    },
  { id: 'p017', name: 'Avocado (each)',            category: 'fresh',   price: 30,   cost: 18,   sku: 'AV-EA',   barcode: '',             stock: 30,  minStock: 10, expiryDate: '2026-04-28', unit: 'piece',  vatRate: 0    },
  { id: 'p018', name: 'Fanta Orange 500ml',        category: 'bev',     price: 60,   cost: 40,   sku: 'FA-500',  barcode: '5449000000019', stock: 165, minStock: 48, expiryDate: '2026-09-30', unit: 'bottle', vatRate: 0.16 },
]

export const BRANCHES: Branch[] = [
  { id: 'b001', name: 'Westlands Main',   location: 'Nairobi, Westlands', phone: '+254 712 000 001', manager: 'Alice Mwangi',   status: 'active', monthSales: 284500, daysSales: 12400 },
  { id: 'b002', name: 'Kilimani Branch',  location: 'Nairobi, Kilimani',  phone: '+254 712 000 002', manager: 'Brian Otieno',   status: 'active', monthSales: 198200, daysSales: 8900  },
  { id: 'b003', name: 'Thika Road Mall',  location: 'Nairobi, Kasarani',  phone: '+254 712 000 003', manager: 'Carol Njoki',    status: 'active', monthSales: 142700, daysSales: 6200  },
  { id: 'b004', name: 'Mombasa CBD',      location: 'Mombasa, CBD',       phone: '+254 712 000 004', manager: 'David Kazungu',  status: 'active', monthSales: 117300, daysSales: 5100  },
]

export const USERS: User[] = [
  { id: 'u001', name: 'Alice Mwangi',  role: 'admin',   branch: 'b001', avatar: 'AM', pin: '1234' },
  { id: 'u002', name: 'Brian Otieno',  role: 'manager', branch: 'b002', avatar: 'BO', pin: '2345' },
  { id: 'u003', name: 'Carol Njoki',   role: 'cashier', branch: 'b001', avatar: 'CN', pin: '3456' },
  { id: 'u004', name: 'David Kazungu', role: 'cashier', branch: 'b001', avatar: 'DK', pin: '4567' },
  { id: 'u005', name: 'Eve Kamau',     role: 'stock',   branch: 'b001', avatar: 'EK', pin: '5678' },
]

export const RECENT_TRANSACTIONS: Transaction[] = [
  { id: 'T10045', items: 4, total: 850,  payment: 'mpesa',  cashier: 'Carol Njoki',   time: '11:42 AM', branch: 'b001' },
  { id: 'T10044', items: 2, total: 130,  payment: 'cash',   cashier: 'Carol Njoki',   time: '11:30 AM', branch: 'b001' },
  { id: 'T10043', items: 7, total: 3200, payment: 'split',  cashier: 'David Kazungu', time: '11:18 AM', branch: 'b001' },
  { id: 'T10042', items: 1, total: 200,  payment: 'cash',   cashier: 'Carol Njoki',   time: '11:05 AM', branch: 'b001' },
  { id: 'T10041', items: 3, total: 680,  payment: 'credit', cashier: 'David Kazungu', time: '10:52 AM', branch: 'b001' },
  { id: 'T10040', items: 5, total: 1540, payment: 'mpesa',  cashier: 'Carol Njoki',   time: '10:35 AM', branch: 'b001' },
]

export const PURCHASE_ORDERS: PurchaseOrder[] = [
  { id: 'PO-001', supplier: 'EABL Distributors', items: 3, status: 'pending',  total: 45000, date: '2026-04-25', branch: 'b001' },
  { id: 'PO-002', supplier: 'Bidco Kenya',        items: 5, status: 'received', total: 28500, date: '2026-04-22', branch: 'b001' },
  { id: 'PO-003', supplier: 'Unga Group',          items: 2, status: 'transit',  total: 18000, date: '2026-04-24', branch: 'b002' },
]

export const DEFAULT_SETTINGS: Settings = {
  businessName: 'My Business',
  businessType: 'Minimart / Supermarket',
  country: 'Kenya',
  currency: 'KES — Kenyan Shilling',
  kraPin: '',
  vatNumber: '',
  businessEmail: '',
  businessPhone: '',
  cash: true, mpesa: true, mpesaManual: true, mpesaStk: true, credit: true, other: true,
  requirePin: true, autoPrint: false, lowStockAlerts: true,
  expiryTracking: true, barcodeMode: true, receiptPaper: '80mm', printerBaudRate: 9600,
  printerMode: 'cups', cupsName: '',
  showVat: true, showLogo: false, smsReceipt: false, branchInventory: true,
  consolidatedReports: true, stockTransfer: true,
  terminalMode: 'standalone', branchServerUrl: '', serverPort: 8765,
}

export function fmtKES(amount: number): string {
  return 'KES ' + amount.toLocaleString('en-KE', { minimumFractionDigits: 0 })
}
