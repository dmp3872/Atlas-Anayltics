
/*
  # AccuMark Initial Schema

  ## Overview
  Full schema for AccuMark peptide testing lab platform.

  ## New Tables

  ### test_panels
  - Available test panels (HPLC Purity, Identity, etc.)
  - Pricing per panel

  ### orders
  - Customer orders with status tracking
  - Links to auth.users

  ### order_samples
  - Individual samples within an order
  - Blend vs single compound designation

  ### coas (Certificates of Analysis)
  - Digital COAs linked to samples
  - Cryptographic hash for tamper-proof verification
  - Unique permanent URL slug

  ### api_keys
  - Per-user API keys for integrations

  ## Security
  - RLS enabled on all tables
  - Users can only access their own data
  - Public read on coas where is_public = true
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS test_panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_per_sample numeric(10,2) NOT NULL DEFAULT 0,
  turnaround_days integer NOT NULL DEFAULT 5,
  category text NOT NULL DEFAULT 'standard',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

INSERT INTO test_panels (name, description, price_per_sample, turnaround_days, category, sort_order) VALUES
  ('HPLC Purity', 'High-performance liquid chromatography purity analysis with interactive chromatogram', 45.00, 5, 'standard', 1),
  ('Identity (HPLC-based)', 'Peptide identity confirmation via retention time comparison', 35.00, 5, 'standard', 2),
  ('Molecular Weight (MS)', 'Mass spectrometry molecular weight verification', 55.00, 7, 'standard', 3),
  ('Amino Acid Analysis', 'Quantitative amino acid composition analysis', 75.00, 7, 'standard', 4),
  ('Endotoxin (LAL)', 'Limulus amebocyte lysate endotoxin testing', 65.00, 5, 'safety', 5),
  ('Sterility (14-day)', 'Full sterility testing — coming soon', 95.00, 21, 'safety', 6),
  ('Heavy Metals', 'Heavy metals panel — coming soon', 85.00, 10, 'safety', 7),
  ('Residual Solvents', 'Residual solvents analysis — coming soon', 80.00, 10, 'purity', 8),
  ('Residual Moisture (Karl Fischer)', 'Water content determination — coming soon', 60.00, 7, 'purity', 9),
  ('NMR Analysis', 'Nuclear magnetic resonance spectroscopy — coming soon', 120.00, 10, 'advanced', 10),
  ('LC-MS Identity', 'Liquid chromatography–mass spectrometry identity — coming soon', 95.00, 10, 'advanced', 11)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_number text UNIQUE NOT NULL DEFAULT 'ACC-' || to_char(now(), 'YYYYMMDD') || '-' || floor(random() * 9000 + 1000)::text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'analyzing', 'in_review', 'complete', 'cancelled')),
  rush_processing boolean NOT NULL DEFAULT false,
  notes text DEFAULT '',
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  rush_fee numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  first_order_discount boolean NOT NULL DEFAULT false,
  prepaid_shipping boolean NOT NULL DEFAULT false,
  company_name text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sample_name text NOT NULL DEFAULT '',
  display_name text DEFAULT '',
  sample_type text NOT NULL DEFAULT 'single' CHECK (sample_type IN ('single', 'blend')),
  vial_count integer NOT NULL DEFAULT 1 CHECK (vial_count >= 1 AND vial_count <= 100),
  panel_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'analyzing', 'in_review', 'complete')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid REFERENCES order_samples(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(12), 'hex'),
  sample_name text NOT NULL DEFAULT '',
  display_name text DEFAULT '',
  company_name text DEFAULT '',
  peptide_sequence text DEFAULT '',
  batch_number text DEFAULT '',
  purity_percent numeric(5,2),
  molecular_weight numeric(10,4),
  result_summary jsonb DEFAULT '{}',
  panel_results jsonb DEFAULT '[]',
  chromatogram_data jsonb DEFAULT '{}',
  overall_result text NOT NULL DEFAULT 'pass' CHECK (overall_result IN ('pass', 'fail', 'pending')),
  is_public boolean NOT NULL DEFAULT true,
  content_hash text DEFAULT '',
  signature text DEFAULT '',
  pdf_url text DEFAULT '',
  issued_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'My API Key',
  key_prefix text NOT NULL DEFAULT '',
  key_hash text NOT NULL DEFAULT '',
  last_used_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text DEFAULT '',
  company_name text DEFAULT '',
  phone text DEFAULT '',
  address_line1 text DEFAULT '',
  address_line2 text DEFAULT '',
  city text DEFAULT '',
  state text DEFAULT '',
  zip text DEFAULT '',
  country text DEFAULT 'US',
  prepaid_balance numeric(10,2) NOT NULL DEFAULT 0,
  is_first_order boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE test_panels ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE coas ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active test panels"
  ON test_panels FOR SELECT
  USING (is_active = true);

CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own samples"
  ON order_samples FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own samples"
  ON order_samples FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public can view public COAs"
  ON coas FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can view own COAs"
  ON coas FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own COAs"
  ON coas FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own COAs"
  ON coas FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own API keys"
  ON api_keys FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys"
  ON api_keys FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys"
  ON api_keys FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys"
  ON api_keys FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_samples_order_id ON order_samples(order_id);
CREATE INDEX IF NOT EXISTS idx_coas_slug ON coas(slug);
CREATE INDEX IF NOT EXISTS idx_coas_user_id ON coas(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
