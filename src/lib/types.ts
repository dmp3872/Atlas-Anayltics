export type UserRole = 'client' | 'admin' | 'reviewer' | 'chemist' | 'verifier';

export type LabPriority = 'normal' | 'high' | 'urgent';

export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'awaiting_sample'
  | 'sample_received'
  | 'in_testing'
  | 'qa_review'
  | 'complete'
  | 'archived';

export type SubmissionUrgency = 'standard' | 'rush';

export type PaymentStatus = 'unpaid' | 'paid' | 'waived' | 'refunded';

export type OrderStatus =
  | 'received'
  | 'awaiting_sample'
  | 'processing'
  | 'analyzing'
  | 'in_review'
  | 'complete'
  | 'cancelled';

export type SampleStatus =
  | 'awaiting_sample'
  | 'received'
  | 'analyzing'
  | 'in_review'
  | 'complete';

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
  lab_priority?: LabPriority;
  notes: string;
  subtotal: number;
  discount_amount: number;
  rush_fee: number;
  total: number;
  first_order_discount: boolean;
  prepaid_shipping: boolean;
  shipping_label_id?: string;
  payment_method?: 'card' | 'crypto';
  payment_status?: PaymentStatus;
  paid_at?: string | null;
  paid_by?: string | null;
  payment_note?: string;
  due_at?: string | null;
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
  assigned_to?: string | null;
  assigned_at?: string | null;
  lab_priority?: LabPriority | null;
  accession_number?: string | null;
  created_at: string;
}

export type CoaWorkflowStage = 'issued' | 'awaiting_info' | 'verified' | 'published';

export interface COA {
  id: string;
  sample_id: string | null;
  order_id: string | null;
  user_id: string;
  slug: string;
  sample_name: string;
  display_name: string;
  company_name: string;
  company_logo?: string;
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
  seal_serial?: string;
  accession_number?: string;
  coa_workflow_stage?: CoaWorkflowStage;
  verified_at?: string | null;
  verified_by?: string | null;
  published_at?: string | null;
  issued_at: string;
  created_at: string;
}

export interface OrderStatusHistoryEntry {
  id: string;
  order_id: string;
  sample_id?: string | null;
  from_status: string | null;
  to_status: string;
  changed_by?: string | null;
  note?: string;
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
  vial_size?: string;
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

export interface Submission {
  id: string;
  submission_number: string;
  user_id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  status: SubmissionStatus;
  urgency: SubmissionUrgency;
  notes: string;
  document_url: string | null;
  created_at: string;
  updated_at: string;
  submission_samples?: SubmissionSample[];
}

export interface SubmissionSample {
  id: string;
  submission_id: string;
  sample_number: string;
  product_name: string;
  batch_lot_number: string;
  sample_count: number;
  panel_id: string | null;
  panel_ids: string[];
  status: SubmissionStatus;
  created_at: string;
  submission_results?: SubmissionResult[];
}

export interface SubmissionResult {
  id: string;
  sample_id: string;
  panel_id: string | null;
  result_data: Record<string, unknown>;
  overall_pass: boolean | null;
  entered_by: string | null;
  created_at: string;
}

export interface StatusHistoryEntry {
  id: string;
  submission_id: string;
  sample_id: string | null;
  from_status: SubmissionStatus | null;
  to_status: SubmissionStatus;
  changed_by: string | null;
  note: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  full_name: string;
  role?: UserRole;
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
  company_logo?: string;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  user_id: string;
  name: string;
  logo: string;
  website?: string;
  email?: string;
  address?: string;
  chromatograph_background?: string;
  is_default: boolean;
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
