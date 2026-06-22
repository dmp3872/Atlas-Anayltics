export type OrderStatus = 'received' | 'processing' | 'analyzing' | 'in_review' | 'complete' | 'cancelled';
export type SampleStatus = 'received' | 'analyzing' | 'in_review' | 'complete';
export type COAResult = 'pass' | 'fail' | 'pending';
export type SampleType = 'single' | 'blend';

export interface TestPanel {
  id: string;
  name: string;
  description: string;
  price_per_sample: number;
  turnaround_days: number;
  category: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  order_number: string;
  status: OrderStatus;
  rush_processing: boolean;
  notes: string;
  subtotal: number;
  discount_amount: number;
  rush_fee: number;
  total: number;
  first_order_discount: boolean;
  prepaid_shipping: boolean;
  company_name: string;
  created_at: string;
  updated_at: string;
  order_samples?: OrderSample[];
}

export interface OrderSample {
  id: string;
  order_id: string;
  user_id: string;
  sample_name: string;
  display_name: string;
  sample_type: SampleType;
  vial_count: number;
  panel_ids: string[];
  status: SampleStatus;
  metadata?: Record<string, unknown> | null;
  analysis_results?: Record<string, unknown>[] | null;
  created_at: string;
}

export interface COA {
  id: string;
  sample_id: string | null;
  order_id: string | null;
  user_id: string;
  slug: string;
  sample_name: string;
  display_name: string;
  company_name: string;
  peptide_sequence: string;
  batch_number: string;
  purity_percent: number | null;
  molecular_weight: number | null;
  result_summary: Record<string, unknown>;
  panel_results: PanelResult[];
  chromatogram_data: ChromatogramData;
  overall_result: COAResult;
  is_public: boolean;
  content_hash: string;
  signature: string;
  pdf_url: string;
  issued_at: string;
  created_at: string;
}

export interface PanelResult {
  panel_name: string;
  result: string;
  value?: string;
  unit?: string;
  specification?: string;
  pass: boolean;
}

export interface ChromatogramData {
  retention_time?: number;
  peak_area?: number;
  points?: { x: number; y: number }[];
}

export interface ApiKey {
  id: string;
  user_id: string;
  label: string;
  key_prefix: string;
  key_hash: string;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface UserProfile {
  id: string;
  full_name: string;
  company_name: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  prepaid_balance: number;
  is_first_order: boolean;
  website?: string;
  created_at: string;
  updated_at: string;
}

export interface CartSample {
  id: string;
  sample_name: string;
  display_name: string;
  sample_type: SampleType;
  blend_compounds: number;
  vial_count: number;
  panel_ids: string[];
}
