export type Role = 'admin' | 'manager' | 'cashier' | 'stock'
export type PaymentMethod = 'cash' | 'mpesa' | 'credit' | 'split' | 'other'
export type BranchStatus = 'active' | 'inactive'
export type OrderStatus = 'pending' | 'transit' | 'received'

export interface Category {
  id: string
  name: string
  color: string
}

export interface Product {
  id: string
  name: string
  category: string
  price: number
  cost: number
  sku: string
  barcode: string
  stock: number
  minStock: number
  expiryDate: string
  unit: string
  vatRate: number
  imageUrl?: string
}

export interface Branch {
  id: string
  name: string
  location: string
  phone: string
  manager: string
  status: BranchStatus
  monthSales: number
  daysSales: number
}

export interface User {
  id: string
  name: string
  role: Role
  branch: string       // stringified numeric branch_id
  branch_name?: string // display name of the branch
  avatar: string
  pin: string
}

export interface Transaction {
  id: string
  items: number
  total: number
  payment: PaymentMethod
  cashier: string
  time: string
  branch: string
}

export interface PurchaseOrder {
  id: string
  supplier: string
  items: number
  status: OrderStatus
  total: number
  date: string
  branch: string
}

export interface CartItem extends Product {
  qty: number
  itemDiscount: number  // percentage 0-100 off this line item
}

export interface SaleInfo {
  id: string
  items: CartItem[]
  subtotal: number
  total: number
  payment: PaymentMethod
  cashier: string
  branchName?: string
  branchLocation?: string
  notes?: string
  cashTendered?: number
  cashAmount?: number
  mpesaAmount?: number
  mpesaRef?: string
  creditName?: string
  creditPhone?: string
}

export interface Settings {
  // Business info
  businessName: string
  businessType: string
  country: string
  currency: string
  kraPin: string
  vatNumber: string
  businessEmail: string
  businessPhone: string
  // Payment methods
  cash: boolean
  mpesa: boolean       // legacy: true when either mpesaManual or mpesaStk is on
  mpesaManual: boolean
  mpesaStk: boolean
  credit: boolean
  other: boolean
  // POS behaviour
  requirePin: boolean
  autoPrint: boolean
  lowStockAlerts: boolean
  expiryTracking: boolean
  barcodeMode: boolean
  // Receipt
  receiptPaper: '58mm' | '80mm' | 'a4'
  printerBaudRate: 9600 | 19200 | 38400 | 57600 | 115200
  printerMode: 'serial' | 'cups'
  cupsName: string
  showVat: boolean
  showLogo: boolean
  smsReceipt: boolean
  // Branches
  branchInventory: boolean
  consolidatedReports: boolean
  stockTransfer: boolean
}
