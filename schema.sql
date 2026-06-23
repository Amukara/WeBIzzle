-- ============================================================
--  WeBizzle! — Supabase Database Schema
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CONVERSATIONS (state machine per phone number)
CREATE TABLE IF NOT EXISTS conversations (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  phone      VARCHAR(20) UNIQUE NOT NULL,
  user_type  VARCHAR(20) DEFAULT 'customer' CHECK (user_type IN ('customer','vendor','rider')),
  state      VARCHAR(60) DEFAULT 'IDLE',
  context    JSONB       DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_phone ON conversations(phone);

-- CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  phone      VARCHAR(20) UNIQUE NOT NULL,
  name       VARCHAR(100),
  location   VARCHAR(200),
  latitude   DECIMAL(10,7),
  longitude  DECIMAL(10,7),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cust_phone ON customers(phone);

-- VENDORS
CREATE TABLE IF NOT EXISTS vendors (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  phone         VARCHAR(20) UNIQUE NOT NULL,
  business_name VARCHAR(120) NOT NULL,
  location      VARCHAR(200),
  latitude      DECIMAL(10,7),
  longitude     DECIMAL(10,7),
  category      VARCHAR(80),
  mpesa_phone   VARCHAR(20),
  is_approved   BOOLEAN     DEFAULT false,
  is_active     BOOLEAN     DEFAULT true,
  rating        DECIMAL(3,1) DEFAULT 5.0,
  total_sales   INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vend_phone       ON vendors(phone);
CREATE INDEX IF NOT EXISTS idx_vend_approved    ON vendors(is_approved);
CREATE INDEX IF NOT EXISTS idx_vend_category    ON vendors(category);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id             UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id      UUID          REFERENCES vendors(id) ON DELETE CASCADE,
  name           VARCHAR(200)  NOT NULL,
  description    TEXT,
  price          DECIMAL(10,2) NOT NULL CHECK (price > 0),
  unit           VARCHAR(50),
  stock_quantity INTEGER       DEFAULT 0 CHECK (stock_quantity >= 0),
  category       VARCHAR(80),
  image_url      TEXT,
  is_available   BOOLEAN       DEFAULT true,
  created_at     TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prod_vendor_id   ON products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_prod_available   ON products(is_available);
CREATE INDEX IF NOT EXISTS idx_prod_name        ON products(name);
CREATE INDEX IF NOT EXISTS idx_prod_category    ON products(category);

-- RIDERS (boda boda)
CREATE TABLE IF NOT EXISTS riders (
  id                UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  phone             VARCHAR(20)  UNIQUE NOT NULL,
  name              VARCHAR(100),
  id_number         VARCHAR(20),
  bike_registration VARCHAR(20),
  is_approved       BOOLEAN      DEFAULT false,
  is_available      BOOLEAN      DEFAULT false,
  current_latitude  DECIMAL(10,7),
  current_longitude DECIMAL(10,7),
  rating            DECIMAL(3,1) DEFAULT 5.0,
  total_deliveries  INTEGER      DEFAULT 0,
  base_fee          DECIMAL(8,2) DEFAULT 150.00,
  created_at        TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rider_phone     ON riders(phone);
CREATE INDEX IF NOT EXISTS idx_rider_available ON riders(is_available, is_approved);

-- CARTS
CREATE TABLE IF NOT EXISTS carts (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID    REFERENCES customers(id) ON DELETE CASCADE,
  product_id  UUID    REFERENCES products(id)  ON DELETE CASCADE,
  vendor_id   UUID    REFERENCES vendors(id)   ON DELETE CASCADE,
  quantity    INTEGER DEFAULT 1 CHECK (quantity > 0),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (customer_id, product_id, vendor_id)
);
CREATE INDEX IF NOT EXISTS idx_cart_customer ON carts(customer_id);

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id                  UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id         UUID         REFERENCES customers(id),
  customer_phone      VARCHAR(20),
  rider_id            UUID         REFERENCES riders(id),
  total_amount        DECIMAL(10,2),
  delivery_fee        DECIMAL(8,2) DEFAULT 150.00,
  status              VARCHAR(40)  DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','rider_assigned','picked_up',
                                          'in_transit','delivered','payment_failed','cancelled')),
  delivery_address    TEXT,
  delivery_latitude   DECIMAL(10,7),
  delivery_longitude  DECIMAL(10,7),
  mpesa_receipt       VARCHAR(60),
  checkout_request_id VARCHAR(120),
  notes               TEXT,
  created_at          TIMESTAMPTZ  DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_customer     ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_status       ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_checkout     ON orders(checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_order_rider        ON orders(rider_id);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id           UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id     UUID          REFERENCES orders(id) ON DELETE CASCADE,
  product_id   UUID          REFERENCES products(id),
  vendor_id    UUID          REFERENCES vendors(id),
  product_name VARCHAR(200),
  quantity     INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price   DECIMAL(10,2) NOT NULL,
  total_price  DECIMAL(10,2) NOT NULL,
  created_at   TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oi_order  ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_oi_vendor ON order_items(vendor_id);

-- DELIVERIES
CREATE TABLE IF NOT EXISTS deliveries (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id         UUID        REFERENCES orders(id),
  rider_id         UUID        REFERENCES riders(id),
  pickup_address   TEXT,
  delivery_address TEXT,
  status           VARCHAR(30) DEFAULT 'assigned'
                     CHECK (status IN ('assigned','accepted','picked_up',
                                       'in_transit','delivered','rejected','cancelled')),
  fee              DECIMAL(8,2) DEFAULT 150.00,
  assigned_at      TIMESTAMPTZ  DEFAULT NOW(),
  picked_up_at     TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_del_order  ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_del_rider  ON deliveries(rider_id);
CREATE INDEX IF NOT EXISTS idx_del_status ON deliveries(status);

-- AUTO-UPDATE updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS (service key bypasses automatically — no public policies needed)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE riders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries    ENABLE ROW LEVEL SECURITY;

-- ─── SEED DATA ────────────────────────────────────────────────
INSERT INTO vendors (phone, business_name, location, category, mpesa_phone, is_approved, rating) VALUES
  ('254700000001','Mama Njeri Veggies',  'Westlands', 'Vegetables & Fruits',   '254700000001', true, 4.8),
  ('254700000002','Kamau Fresh Produce', 'Kibera',    'Vegetables & Fruits',   '254700000002', true, 4.6),
  ('254700000003','Nairobi Superstore',  'CBD',       'Groceries & Staples',   '254700000003', true, 4.5),
  ('254700000004','Eastleigh Wholesale', 'Eastleigh', 'Groceries & Staples',   '254700000004', true, 4.7),
  ('254700000005','TechHub Kenya',       'Westlands', 'Electronics & Gadgets', '254700000005', true, 4.9)
ON CONFLICT (phone) DO NOTHING;

INSERT INTO products (vendor_id, name, price, unit, stock_quantity, category, is_available)
SELECT v.id, p.name, p.price::DECIMAL, p.unit, p.stock::INTEGER, p.category, true
FROM (VALUES
  ('254700000001','Tomatoes',       80,  'kg',     50,  'Vegetables & Fruits'),
  ('254700000001','Sukuma Wiki',    30,  'bunch',  100, 'Vegetables & Fruits'),
  ('254700000001','Onions',         60,  'kg',     80,  'Vegetables & Fruits'),
  ('254700000002','Tomatoes',       75,  'kg',     60,  'Vegetables & Fruits'),
  ('254700000002','Carrots',        70,  'kg',     40,  'Vegetables & Fruits'),
  ('254700000002','Spinach',        25,  'bunch',  90,  'Vegetables & Fruits'),
  ('254700000003','Unga 2kg',       175, 'packet', 200, 'Groceries & Staples'),
  ('254700000003','Sugar 1kg',      130, 'kg',     150, 'Groceries & Staples'),
  ('254700000003','Cooking Oil 1L', 195, 'litre',  80,  'Groceries & Staples'),
  ('254700000004','Unga 2kg',       165, 'packet', 300, 'Groceries & Staples'),
  ('254700000004','Sugar 1kg',      125, 'kg',     200, 'Groceries & Staples'),
  ('254700000004','Rice 1kg',       120, 'kg',     120, 'Groceries & Staples'),
  ('254700000005','Phone Charger',  350, 'piece',  30,  'Electronics & Gadgets'),
  ('254700000005','Earphones',      450, 'piece',  25,  'Electronics & Gadgets')
) AS p(phone, name, price, unit, stock, category)
JOIN vendors v ON v.phone = p.phone
ON CONFLICT DO NOTHING;

INSERT INTO riders (phone, name, id_number, bike_registration, is_approved, is_available, rating, total_deliveries, base_fee)
VALUES ('254700000010','John Kamau','12345678','KMCA 001K', true, true, 4.9, 47, 150)
ON CONFLICT (phone) DO NOTHING;
