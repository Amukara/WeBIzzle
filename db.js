const { createClient } = require('@supabase/supabase-js');

// Supabase free tier: 500MB database, 2GB bandwidth — perfect for MVP
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

class Database {
  // ══════════════════════════════════════════════════════
  //  CONVERSATION STATE
  // ══════════════════════════════════════════════════════

  async getConversation(phone) {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('phone', phone)
      .single();
    if (error && error.code !== 'PGRST116') console.error('[DB] getConversation:', error.message);
    return data || null;
  }

  async upsertConversation(phone, state, context = {}, userType = 'customer') {
    const { data, error } = await supabase
      .from('conversations')
      .upsert(
        { phone, state, context, user_type: userType, updated_at: new Date().toISOString() },
        { onConflict: 'phone' }
      )
      .select()
      .single();
    if (error) console.error('[DB] upsertConversation:', error.message);
    return data;
  }

  async updateConversationState(phone, state, context = null) {
    const update = { state, updated_at: new Date().toISOString() };
    if (context !== null) update.context = context;
    const { data, error } = await supabase
      .from('conversations')
      .update(update)
      .eq('phone', phone)
      .select()
      .single();
    if (error) console.error('[DB] updateConversationState:', error.message);
    return data;
  }

  async mergeContext(phone, patch) {
    const conv = await this.getConversation(phone);
    const merged = { ...(conv?.context || {}), ...patch };
    return this.updateConversationState(phone, conv?.state, merged);
  }

  // ══════════════════════════════════════════════════════
  //  CUSTOMERS
  // ══════════════════════════════════════════════════════

  async getCustomer(phone) {
    const { data } = await supabase.from('customers').select('*').eq('phone', phone).single();
    return data || null;
  }

  async createCustomer(phone, name) {
    const { data, error } = await supabase
      .from('customers')
      .insert({ phone, name })
      .select()
      .single();
    if (error) console.error('[DB] createCustomer:', error.message);
    return data;
  }

  async updateCustomer(phone, updates) {
    const { data } = await supabase
      .from('customers')
      .update(updates)
      .eq('phone', phone)
      .select()
      .single();
    return data;
  }

  // ══════════════════════════════════════════════════════
  //  VENDORS
  // ══════════════════════════════════════════════════════

  async getVendor(phone) {
    const { data } = await supabase.from('vendors').select('*').eq('phone', phone).single();
    return data || null;
  }

  async getVendorById(id) {
    const { data } = await supabase.from('vendors').select('*').eq('id', id).single();
    return data || null;
  }

  async createVendor(payload) {
    const { data, error } = await supabase.from('vendors').insert(payload).select().single();
    if (error) console.error('[DB] createVendor:', error.message);
    return data;
  }

  async updateVendor(phone, updates) {
    const { data } = await supabase
      .from('vendors')
      .update(updates)
      .eq('phone', phone)
      .select()
      .single();
    return data;
  }

  async approveVendor(id) {
    const { data } = await supabase
      .from('vendors')
      .update({ is_approved: true })
      .eq('id', id)
      .select()
      .single();
    return data;
  }

  async getPendingVendors() {
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .eq('is_approved', false)
      .order('created_at', { ascending: false });
    return data || [];
  }

  // ══════════════════════════════════════════════════════
  //  PRODUCTS
  // ══════════════════════════════════════════════════════

  async searchProducts(term) {
    const { data } = await supabase
      .from('products')
      .select('*, vendors(business_name, location, rating, phone)')
      .ilike('name', `%${term}%`)
      .eq('is_available', true)
      .gt('stock_quantity', 0)
      .order('price', { ascending: true })
      .limit(10);
    return data || [];
  }

  async getProductsByVendor(vendorId) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false });
    return data || [];
  }

  async getProduct(id) {
    const { data } = await supabase
      .from('products')
      .select('*, vendors(business_name, location, rating, phone)')
      .eq('id', id)
      .single();
    return data || null;
  }

  async createProduct(payload) {
    const { data, error } = await supabase.from('products').insert(payload).select().single();
    if (error) console.error('[DB] createProduct:', error.message);
    return data;
  }

  async updateProduct(id, updates) {
    const { data } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    return data;
  }

  async deleteProduct(id) {
    await supabase.from('products').delete().eq('id', id);
  }

  // ══════════════════════════════════════════════════════
  //  CART
  // ══════════════════════════════════════════════════════

  async getCart(customerId) {
    const { data } = await supabase
      .from('carts')
      .select('*, products(name, price, unit), vendors(business_name)')
      .eq('customer_id', customerId);
    return data || [];
  }

  async addToCart(customerId, productId, vendorId, quantity = 1) {
    const { data } = await supabase
      .from('carts')
      .upsert(
        { customer_id: customerId, product_id: productId, vendor_id: vendorId, quantity },
        { onConflict: 'customer_id,product_id,vendor_id' }
      )
      .select()
      .single();
    return data;
  }

  async clearCart(customerId) {
    await supabase.from('carts').delete().eq('customer_id', customerId);
  }

  // ══════════════════════════════════════════════════════
  //  ORDERS
  // ══════════════════════════════════════════════════════

  async createOrder(payload) {
    const { data, error } = await supabase.from('orders').insert(payload).select().single();
    if (error) console.error('[DB] createOrder:', error.message);
    return data;
  }

  async createOrderItems(items) {
    const { data, error } = await supabase.from('order_items').insert(items).select();
    if (error) console.error('[DB] createOrderItems:', error.message);
    return data;
  }

  async getOrder(id) {
    const { data } = await supabase
      .from('orders')
      .select('*, customers(phone, name), riders(phone, name, bike_registration)')
      .eq('id', id)
      .single();
    return data || null;
  }

  async getOrdersByCustomer(customerId) {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, products(name))')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(5);
    return data || [];
  }

  async getOrdersByVendor(vendorId) {
    const { data } = await supabase
      .from('order_items')
      .select(
        '*, orders(id, status, created_at, delivery_address, customers(name, phone)), products(name)'
      )
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .limit(10);
    return data || [];
  }

  async getOrderItems(orderId) {
    const { data } = await supabase
      .from('order_items')
      .select('*, products(name), vendors(business_name, phone)')
      .eq('order_id', orderId);
    return data || [];
  }

  async updateOrderStatus(id, status) {
    const { data } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return data;
  }

  async updateOrderPaid(id, mpesaReceipt) {
    const { data } = await supabase
      .from('orders')
      .update({ mpesa_receipt: mpesaReceipt, status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return data;
  }

  async updateOrderRider(orderId, riderId, status = 'rider_assigned') {
    const { data } = await supabase
      .from('orders')
      .update({ rider_id: riderId, status, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();
    return data;
  }

  async getOrderByCheckoutRequest(checkoutRequestId) {
    const { data } = await supabase
      .from('orders')
      .select('*, customers(phone, name), vendors:order_items(vendors(business_name, location))')
      .eq('checkout_request_id', checkoutRequestId)
      .single();
    return data || null;
  }

  async storeCheckoutRequest(orderId, checkoutRequestId) {
    await supabase
      .from('orders')
      .update({ checkout_request_id: checkoutRequestId })
      .eq('id', orderId);
  }

  // ══════════════════════════════════════════════════════
  //  RIDERS
  // ══════════════════════════════════════════════════════

  async getRider(phone) {
    const { data } = await supabase.from('riders').select('*').eq('phone', phone).single();
    return data || null;
  }

  async getRiderById(id) {
    const { data } = await supabase.from('riders').select('*').eq('id', id).single();
    return data || null;
  }

  async createRider(payload) {
    const { data, error } = await supabase.from('riders').insert(payload).select().single();
    if (error) console.error('[DB] createRider:', error.message);
    return data;
  }

  async updateRider(phone, updates) {
    const { data } = await supabase
      .from('riders')
      .update(updates)
      .eq('phone', phone)
      .select()
      .single();
    return data;
  }

  async approveRider(id) {
    const { data } = await supabase
      .from('riders')
      .update({ is_approved: true, is_available: true })
      .eq('id', id)
      .select()
      .single();
    return data;
  }

  async getPendingRiders() {
    const { data } = await supabase
      .from('riders')
      .select('*')
      .eq('is_approved', false)
      .order('created_at', { ascending: false });
    return data || [];
  }

  /** Returns the least-busy approved available rider */
  async getAvailableRider() {
    const { data } = await supabase
      .from('riders')
      .select('*')
      .eq('is_approved', true)
      .eq('is_available', true)
      .order('total_deliveries', { ascending: true })
      .limit(1)
      .single();
    return data || null;
  }

  async setRiderAvailability(id, isAvailable) {
    await supabase.from('riders').update({ is_available: isAvailable }).eq('id', id);
  }

  // ══════════════════════════════════════════════════════
  //  DELIVERIES
  // ══════════════════════════════════════════════════════

  async createDelivery({ orderId, riderId, pickupAddress, deliveryAddress, fee }) {
    const { data, error } = await supabase
      .from('deliveries')
      .insert({
        order_id: orderId,
        rider_id: riderId,
        pickup_address: pickupAddress,
        delivery_address: deliveryAddress,
        fee,
        status: 'assigned',
      })
      .select()
      .single();
    if (error) console.error('[DB] createDelivery:', error.message);
    return data;
  }

  async getDelivery(id) {
    const { data } = await supabase
      .from('deliveries')
      .select('*, orders(id, customers(phone, name), delivery_address), riders(phone, name)')
      .eq('id', id)
      .single();
    return data || null;
  }

  async getActiveDeliveryByRider(riderId) {
    const { data } = await supabase
      .from('deliveries')
      .select('*, orders(id, customers(phone, name), delivery_address)')
      .eq('rider_id', riderId)
      .in('status', ['assigned', 'accepted', 'picked_up'])
      .single();
    return data || null;
  }

  async updateDeliveryStatus(id, status) {
    const patch = { status };
    if (status === 'picked_up') patch.picked_up_at = new Date().toISOString();
    if (status === 'delivered') patch.delivered_at = new Date().toISOString();
    const { data } = await supabase
      .from('deliveries')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    return data;
  }

  // ══════════════════════════════════════════════════════
  //  ADMIN / STATS
  // ══════════════════════════════════════════════════════

  async getDashboardStats() {
    const [orders, vendors, riders, customers, revenue] = await Promise.all([
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase.from('vendors').select('*', { count: 'exact', head: true }),
      supabase.from('riders').select('*', { count: 'exact', head: true }),
      supabase.from('customers').select('*', { count: 'exact', head: true }),
      supabase.from('orders').select('total_amount').eq('status', 'delivered'),
    ]);

    const totalRevenue = (revenue.data || []).reduce(
      (sum, o) => sum + (parseFloat(o.total_amount) || 0),
      0
    );

    return {
      total_orders: orders.count || 0,
      total_vendors: vendors.count || 0,
      total_riders: riders.count || 0,
      total_customers: customers.count || 0,
      total_revenue_kes: totalRevenue,
    };
  }
}

module.exports = new Database();
