export type OrgStatus = "trial" | "active" | "suspended" | "cancelled";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string | null;
  country: string;
  status: OrgStatus;
  trial_ends_at: string | null;
  is_active: boolean;
  created_at: string;
  user_count: number;
  branch_count: number;
  active_product_count: number;
  max_branches: number | null;
  max_users: number | null;
  max_products: number | null;
}

export interface PlatformStats {
  total_organizations: number;
  active_organizations: number;
  trial_organizations: number;
  suspended_organizations: number;
  total_users: number;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: string;
  price_annual: string;
  max_users: number | null;
  max_products: number | null;
  max_branches: number | null;
  trial_days: number;
  features: Record<string, boolean>;
  sort_order: number;
  is_active: boolean;
  is_recommended: boolean;
}

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled";
export type BillingInterval = "monthly" | "annual";

export interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  billing_interval: BillingInterval;
  current_period_start: string;
  current_period_end: string;
  billing_phone: string | null;
  last_payment_at: string | null;
  last_payment_amount: string | null;
  created_at: string;
}

export type InvoiceStatus = "open" | "paid" | "overdue" | "void";

export interface Invoice {
  id: number;
  invoice_number: string | null;
  organization_id: number;
  subscription_id: number | null;
  plan_name: string;
  amount: string;
  currency: string;
  billing_interval: string;
  period_start: string;
  period_end: string;
  due_date: string;
  status: InvoiceStatus;
  paid_at: string | null;
  payment_method: string | null;
  mpesa_receipt: string | null;
  mpesa_phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface OrgUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  organization_id: string | null;
  created_at: string;
}
