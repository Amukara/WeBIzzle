const wa     = require('../services/whatsapp');
const db     = require('../services/db');
const { mpesa } = require('../services/mpesa');
const { formatPrice, truncate } = require('../utils/helpers');

const DELIVERY_FEE = 150; // KES — flat fee

// ── Entry point ────────────────────────────────────────────────────────────────
const handleMessage = async ({ phone, senderName, parsed, conv }) => {
  const state    = conv.state    || 'IDLE';
  const context  = conv.context  || {};
  const text     = (parsed.body  || '').trim();
  const buttonId = (parsed.id    || '');

  switch (state) {
    case 'IDLE':
      return handleNewUser(phone, senderName);

    case 'ONBOARD_NAME':
      return handleOnboardName(phone, text);

    case 'MAIN_MENU':
      return handleMainMenu({ phone, senderName, parsed, context });

    case 'SEARCHING':
      if (text.length > 0) return searchProducts(phone, text, context);
      return wa.sendText(phone, `🔍 What are you looking for? Type a product name:`);

    case 'PRODUCT_LIST':
      if (parsed.type === 'list')   return showProductDetail(phone, buttonId, context);
      if (parsed.type === 'text' && text.length > 1) return searchProducts(phone, text, context);
      return wa.sendText(phone, `Please select a product from the list above, or type a new search.`);

    case 'PRODUCT_DETAIL':
      if (buttonId.startsWith('add_to_cart_')) return addToCart(phone, buttonId.replace('add_to_cart_',''), context);
      if (buttonId === 'view_cart')   return showCart(phone, context);
      if (buttonId === 'back_search') {
        await db.updateConversationState(phone, 'SEARCHING', context);
        return wa.sendText(phone, `🔍 What else are you looking for?`);
      }
      break;

    case 'CART_VIEW':
      if (buttonId === 'checkout')      return startCheckout(phone, context);
      if (buttonId === 'keep_shopping') {
        await db.updateConversationState(phone, 'SEARCHING', context);
        return wa.sendText(phone, `🔍 What else would you like to add?`);
      }
      if (buttonId === 'clear_cart') return clearCart(phone);
      break;

    case 'AWAITING_LOCATION':
      if (parsed.type === 'location') return handleLocationReceived(phone, parsed, context);
      if (text.length > 5)            return handleLocationText(phone, text, context);
      return wa.requestLocation(phone, `📍 Please share your delivery location using the 📎 icon → *Location*.`);

    case 'ORDER_CONFIRM':
      if (buttonId.startsWith('pay_order_')) return initiatePayment(phone, buttonId.replace('pay_order_',''), context);
      if (buttonId === 'cancel_order') {
        await db.updateConversationState(phone, 'MAIN_MENU', {});
        return showMainMenu({ phone, senderName, parsed: { type: 'text', body: '' }, context: {} });
      }
      break;

    case 'AWAITING_PAYMENT':
      if (buttonId.startsWith('retry_payment_')) return initiatePayment(phone, buttonId.replace('retry_payment_',''), context);
      return wa.sendText(phone,
        `⏳ *Waiting for your M-Pesa payment...*\n\nCheck your phone for the M-Pesa prompt and enter your PIN.\n\n_Text MENU to cancel._`
      );

    case 'RATING':
      return handleRating(phone, parsed, context);
  }

  // Catch-all: if text looks like a product search, search it
  if (parsed.type === 'text' && text.length > 1 && !['menu','hi','hello'].includes(text.toLowerCase())) {
    return searchProducts(phone, text, context);
  }
  return showMainMenu({ phone, senderName, parsed, context });
};

// ── New User ──────────────────────────────────────────────────────────────────
const handleNewUser = async (phone, senderName) => {
  await db.upsertConversation(phone, 'ONBOARD_NAME', {}, 'customer');
  await wa.sendText(phone,
    `🛒 *Karibu WeBizzle!* 👋\n\n` +
    `Hi ${senderName}! Compare prices, order from local vendors, and get *boda boda delivery* — right here on WhatsApp.\n\n` +
    `💳 Pay via M-Pesa\n` +
    `🛵 Fast local delivery (KES ${DELIVERY_FEE})\n` +
    `🏪 Vendors across Nairobi\n\n` +
    `First, what's your *name*?`
  );
};

// ── Onboard Name ──────────────────────────────────────────────────────────────
const handleOnboardName = async (phone, name) => {
  if (name.length < 2) return wa.sendText(phone, `Please enter your name:`);
  let customer = await db.getCustomer(phone);
  if (!customer) customer = await db.createCustomer(phone, name);
  else           customer = await db.updateCustomer(phone, { name });
  await db.updateConversationState(phone, 'MAIN_MENU', { customerId: customer.id });
  return showMainMenu({ phone, senderName: name, parsed: {}, context: { customerId: customer.id } });
};

// ── Main Menu ─────────────────────────────────────────────────────────────────
const showMainMenu = async ({ phone, senderName, parsed, context }) => {
  await db.updateConversationState(phone, 'MAIN_MENU', context || {});
  const firstName = (senderName || 'Friend').split(' ')[0];
  return wa.sendButtons(
    phone,
    `👋 Hi *${firstName}!* Welcome to *WeBizzle!* 🛒\n\nWhat would you like to do?`,
    [
      { id: 'search',    title: '🔍 Search Products' },
      { id: 'my_cart',   title: '🛒 My Cart' },
      { id: 'my_orders', title: '📦 My Orders' },
    ],
    '🛒 WeBizzle! Kenya',
    'Text HELP for assistance'
  );
};

const handleMainMenu = async ({ phone, senderName, parsed, context }) => {
  const buttonId = parsed.id || '';
  const text     = (parsed.body || '').toLowerCase().trim();

  if (buttonId === 'search' || text === 'search') {
    await db.updateConversationState(phone, 'SEARCHING', context);
    return wa.sendText(phone,
      `🔍 *What are you looking for?*\n\nType a product name, e.g.\n_tomatoes, sugar, airtime, unga, eggs, chicken_`
    );
  }
  if (buttonId === 'my_cart') return showCart(phone, context);
  if (buttonId === 'my_orders') return showOrders(phone);

  // Free-text in MAIN_MENU → treat as product search
  if (parsed.type === 'text' && text.length > 1) {
    return searchProducts(phone, text, context);
  }
  return showMainMenu({ phone, senderName, parsed, context });
};

// ── Product Search ────────────────────────────────────────────────────────────
const searchProducts = async (phone, searchTerm, context) => {
  await db.updateConversationState(phone, 'PRODUCT_LIST', { ...context, lastSearch: searchTerm });

  const products = await db.searchProducts(searchTerm);

  if (!products.length) {
    return wa.sendButtons(phone,
      `😔 No results for *"${searchTerm}"*.\n\nTry a shorter or different term.`,
      [
        { id: 'search',   title: '🔍 Search Again' },
        { id: 'my_cart',  title: '🛒 My Cart' },
      ]
    );
  }

  // De-duplicate by name (lowest price first) to build the list
  const seen = new Set();
  const rows = [];
  for (const p of products) {
    const key = p.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const variants  = products.filter((x) => x.name.toLowerCase() === key);
    const minPrice  = Math.min(...variants.map((x) => x.price));
    const maxPrice  = Math.max(...variants.map((x) => x.price));
    const priceStr  = minPrice === maxPrice
      ? `KES ${formatPrice(minPrice)}`
      : `KES ${formatPrice(minPrice)}–${formatPrice(maxPrice)}`;
    const vendorStr = variants.length > 1 ? `${variants.length} vendors` : `1 vendor`;

    rows.push({
      id:          `product_${p.id}`,
      title:       truncate(p.name, 24),
      description: `${priceStr} · ${vendorStr}`,
    });

    if (rows.length === 10) break; // WhatsApp list row limit
  }

  return wa.sendList(
    phone,
    `🔍 *${products.length} result${products.length !== 1 ? 's' : ''}* for *"${searchTerm}"*\n\nTap a product to compare vendor prices:`,
    'View Products',
    [{ title: `Results for "${truncate(searchTerm, 20)}"`, rows }],
    '🛒 WeBizzle! Price Comparison',
    'Prices from verified local vendors'
  );
};

// ── Product Detail / Vendor Comparison ───────────────────────────────────────
const showProductDetail = async (phone, listId, context) => {
  const productId = listId.replace(/^(vendor_)?product_/, '');
  const product   = await db.getProduct(productId);

  if (!product) {
    return wa.sendText(phone, `❌ Product not found. Please search again.`);
  }

  await db.updateConversationState(phone, 'PRODUCT_DETAIL', {
    ...context,
    viewingProductId:   productId,
    viewingProductName: product.name,
  });

  // Find all vendors selling the same product (by name match)
  const allMatches = await db.searchProducts(product.name);
  const sameItem   = allMatches.filter((p) => p.name.toLowerCase() === product.name.toLowerCase());

  if (sameItem.length <= 1) {
    // Single vendor — show simple detail
    const v = product.vendors;
    return wa.sendButtons(phone,
      `📦 *${product.name}*\n\n` +
      `🏪 Vendor: *${v?.business_name || 'Local Vendor'}*\n` +
      `📍 Location: ${v?.location || 'Nairobi'}\n` +
      `💰 Price: *KES ${formatPrice(product.price)}* per ${product.unit || 'unit'}\n` +
      `📊 Stock: ${product.stock_quantity} ${product.unit || 'units'}\n` +
      `⭐ Rating: ${v?.rating || '5.0'}/5\n` +
      `${product.description ? '\n' + product.description : ''}`,
      [
        { id: `add_to_cart_${productId}`, title: '🛒 Add to Cart' },
        { id: 'back_search',             title: '🔍 Search More' },
      ],
      '🛒 WeBizzle!',
      `+KES ${DELIVERY_FEE} delivery`
    );
  }

  // Multiple vendors — show price comparison list
  const cheapest = sameItem.reduce((a, b) => a.price < b.price ? a : b);
  const rows     = sameItem.slice(0, 10).map((p) => ({
    id:          `add_to_cart_${p.id}`,
    title:       truncate(p.vendors?.business_name || 'Vendor', 24),
    description: `KES ${formatPrice(p.price)} · ${p.vendors?.location || 'Nairobi'} · ⭐${p.vendors?.rating || 5}`,
  }));

  return wa.sendList(phone,
    `📊 *Price Comparison: ${product.name}*\n\n` +
    `${sameItem.length} vendors available.\n` +
    `💡 Best price: *KES ${formatPrice(cheapest.price)}* at ${cheapest.vendors?.business_name}\n\n` +
    `Select a vendor to add to cart:`,
    'Choose Vendor',
    [{ title: 'Compare Prices', rows }],
    `🛒 ${truncate(product.name, 24)}`,
    `+KES ${DELIVERY_FEE} delivery fee`
  );
};

// ── Add to Cart ───────────────────────────────────────────────────────────────
const addToCart = async (phone, productId, context) => {
  let customer = await db.getCustomer(phone);
  if (!customer) {
    customer = await db.createCustomer(phone, 'Customer');
    await db.updateConversationState(phone, 'MAIN_MENU', { customerId: customer.id });
  }

  const product = await db.getProduct(productId);
  if (!product) return wa.sendText(phone, `❌ Product no longer available.`);

  await db.addToCart(customer.id, productId, product.vendor_id, 1);
  await db.updateConversationState(phone, 'PRODUCT_DETAIL', { ...context, customerId: customer.id });

  return wa.sendButtons(phone,
    `✅ *Added to Cart!*\n\n` +
    `📦 ${product.name}\n` +
    `💰 KES ${formatPrice(product.price)} per ${product.unit || 'unit'}\n` +
    `🏪 From: ${product.vendors?.business_name || 'Vendor'}`,
    [
      { id: 'view_cart', title: '🛒 View Cart' },
      { id: 'search',    title: '🔍 Keep Shopping' },
    ]
  );
};

// ── Cart ──────────────────────────────────────────────────────────────────────
const showCart = async (phone, context) => {
  let customer = await db.getCustomer(phone);
  if (!customer) {
    customer = await db.createCustomer(phone, 'Customer');
  }

  const items = await db.getCart(customer.id);
  await db.updateConversationState(phone, 'CART_VIEW', { ...context, customerId: customer.id });

  if (!items.length) {
    return wa.sendButtons(phone,
      `🛒 Your cart is empty!\n\nFind products and add them to your cart.`,
      [{ id: 'search', title: '🔍 Start Shopping' }]
    );
  }

  let subtotal  = 0;
  let itemLines = '';
  for (const item of items) {
    const lineTotal = item.products.price * item.quantity;
    subtotal       += lineTotal;
    itemLines      += `• ${item.products.name} ×${item.quantity} — KES ${formatPrice(lineTotal)}\n  (${item.vendors?.business_name || 'Vendor'})\n`;
  }
  const total = subtotal + DELIVERY_FEE;

  return wa.sendButtons(phone,
    `🛒 *Your Cart* (${items.length} item${items.length !== 1 ? 's' : ''})\n\n` +
    `${itemLines}\n` +
    `📦 Subtotal:  KES ${formatPrice(subtotal)}\n` +
    `🛵 Delivery:  KES ${DELIVERY_FEE}\n` +
    `💰 *Total:   KES ${formatPrice(total)}*`,
    [
      { id: 'checkout',      title: '✅ Checkout' },
      { id: 'keep_shopping', title: '🔍 Add More' },
      { id: 'clear_cart',    title: '🗑️ Clear Cart' },
    ],
    '🛒 WeBizzle! Cart',
    'Pay via M-Pesa at checkout'
  );
};

const clearCart = async (phone) => {
  const customer = await db.getCustomer(phone);
  if (customer) await db.clearCart(customer.id);
  await db.updateConversationState(phone, 'MAIN_MENU', {});
  return wa.sendButtons(phone,
    `🗑️ Cart cleared!`,
    [{ id: 'search', title: '🔍 Start Shopping' }]
  );
};

// ── Checkout ──────────────────────────────────────────────────────────────────
const startCheckout = async (phone, context) => {
  await db.updateConversationState(phone, 'AWAITING_LOCATION', context);
  return wa.requestLocation(phone,
    `📍 *Where should we deliver your order?*\n\nTap the 📎 icon and choose *Location* to share your pin.\n\nOr type your address if you prefer.`
  );
};

const handleLocationReceived = async (phone, location, context) => {
  const address = location.address
    ? location.address
    : `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  return buildOrderSummary(phone, address, location.latitude, location.longitude, context);
};

const handleLocationText = async (phone, address, context) => {
  return buildOrderSummary(phone, address, null, null, context);
};

const buildOrderSummary = async (phone, address, lat, lng, context) => {
  let customer = await db.getCustomer(phone);
  if (!customer) customer = await db.createCustomer(phone, 'Customer');

  const items = await db.getCart(customer.id);
  if (!items.length) {
    return wa.sendButtons(phone,
      `🛒 Your cart is empty. Please add products first.`,
      [{ id: 'search', title: '🔍 Search Products' }]
    );
  }

  let subtotal  = 0;
  let itemLines = '';
  for (const item of items) {
    const lineTotal = item.products.price * item.quantity;
    subtotal       += lineTotal;
    itemLines      += `• ${item.products.name} ×${item.quantity} — KES ${formatPrice(lineTotal)}\n`;
  }
  const total = subtotal + DELIVERY_FEE;

  // Persist the order
  const order = await db.createOrder({
    customer_id:        customer.id,
    customer_phone:     phone,
    total_amount:       total,
    delivery_fee:       DELIVERY_FEE,
    status:             'pending',
    delivery_address:   address,
    delivery_latitude:  lat,
    delivery_longitude: lng,
  });

  const orderItemRows = items.map((item) => ({
    order_id:     order.id,
    product_id:   item.product_id,
    vendor_id:    item.vendor_id,
    quantity:     item.quantity,
    unit_price:   item.products.price,
    total_price:  item.products.price * item.quantity,
    product_name: item.products.name,
  }));
  await db.createOrderItems(orderItemRows);

  await db.updateConversationState(phone, 'ORDER_CONFIRM', {
    ...context,
    orderId:    order.id,
    grandTotal: total,
    address,
  });

  return wa.sendButtons(phone,
    `📋 *Order Summary*\n\n` +
    `${itemLines}\n` +
    `📍 Deliver to: ${address}\n` +
    `📦 Subtotal:  KES ${formatPrice(subtotal)}\n` +
    `🛵 Delivery:  KES ${DELIVERY_FEE}\n` +
    `💰 *Total:   KES ${formatPrice(total)}*\n\n` +
    `Tap below to pay via M-Pesa:`,
    [
      { id: `pay_order_${order.id}`, title: `💳 Pay KES ${formatPrice(total)}` },
      { id: 'cancel_order',          title: '❌ Cancel' },
    ],
    '🛒 WeBizzle! Order',
    'M-Pesa prompt will appear on your phone'
  );
};

// ── Payment ───────────────────────────────────────────────────────────────────
const initiatePayment = async (phone, orderId, context) => {
  const order = await db.getOrder(orderId);
  if (!order) return wa.sendText(phone, `❌ Order not found. Please try again.`);

  await db.updateConversationState(phone, 'AWAITING_PAYMENT', { ...context, orderId });

  await wa.sendText(phone,
    `📱 *M-Pesa Payment*\n\n` +
    `Sending a KES *${formatPrice(order.total_amount)}* request to *${phone}*...\n\n` +
    `Check your phone for the M-Pesa prompt and enter your PIN.`
  );

  const result = await mpesa.stkPush({
    phone,
    amount:      order.total_amount,
    orderId:     order.id,
    description: `WeBizzle Order ${order.id.slice(0, 8).toUpperCase()}`,
  });

  if (!result.success) {
    await db.updateConversationState(phone, 'ORDER_CONFIRM', context);
    return wa.sendButtons(phone,
      `❌ *Payment Request Failed*\n\n${result.message || 'Please try again.'}\n\n_Make sure your M-Pesa account is active and has enough balance._`,
      [
        { id: `pay_order_${orderId}`, title: '🔄 Try Again' },
        { id: 'cancel_order',         title: '❌ Cancel Order' },
      ]
    );
  }

  // Clear cart immediately after STK Push is sent
  const customer = await db.getCustomer(phone);
  if (customer) await db.clearCart(customer.id);
};

// ── My Orders ─────────────────────────────────────────────────────────────────
const showOrders = async (phone) => {
  const customer = await db.getCustomer(phone);
  if (!customer) {
    return wa.sendButtons(phone,
      `📦 No orders yet!\n\nStart shopping to see your order history.`,
      [{ id: 'search', title: '🔍 Shop Now' }]
    );
  }

  const orders = await db.getOrdersByCustomer(customer.id);
  if (!orders.length) {
    return wa.sendButtons(phone,
      `📦 You haven't placed any orders yet.`,
      [{ id: 'search', title: '🔍 Start Shopping' }]
    );
  }

  const emoji = { pending:'⏳', paid:'💳', rider_assigned:'🛵', picked_up:'📦', in_transit:'🏃', delivered:'✅', payment_failed:'❌', cancelled:'❌' };

  const lines = orders.map((o) => {
    const e    = emoji[o.status] || '📦';
    const date = new Date(o.created_at).toLocaleDateString('en-KE', { day:'numeric', month:'short' });
    const id   = o.id.slice(0, 6).toUpperCase();
    const stat = o.status.replace(/_/g, ' ').toUpperCase();
    return `${e} *#${id}* — KES ${formatPrice(o.total_amount)}\n   ${stat} · ${date}`;
  }).join('\n\n');

  await db.updateConversationState(phone, 'MAIN_MENU', {});
  return wa.sendButtons(phone,
    `📦 *Your Recent Orders*\n\n${lines}`,
    [{ id: 'search', title: '🔍 Shop Again' }]
  );
};

// ── Rating ────────────────────────────────────────────────────────────────────
const handleRating = async (phone, parsed, context) => {
  const buttonId = parsed.id || '';
  let rating = 0;

  if (buttonId.startsWith('rate_')) {
    rating = parseInt(buttonId.replace('rate_', ''));
  } else {
    rating = parseInt((parsed.body || '').trim());
  }

  if (isNaN(rating) || rating < 1 || rating > 5) {
    return wa.sendButtons(phone,
      `⭐ Please rate your experience (1–5):`,
      [
        { id: 'rate_5', title: '⭐⭐⭐⭐⭐ 5 Stars' },
        { id: 'rate_4', title: '⭐⭐⭐⭐ 4 Stars' },
        { id: 'rate_3', title: '⭐⭐⭐ 3 Stars' },
      ]
    );
  }

  // Update rider rating
  if (context.riderId) {
    const rider = await db.getRiderById(context.riderId);
    if (rider) {
      const deliveries  = rider.total_deliveries || 0;
      const newRating   = ((rider.rating || 5) * deliveries + rating) / (deliveries + 1);
      await db.updateRider(rider.phone, {
        rating:            Math.round(newRating * 10) / 10,
        total_deliveries:  deliveries + 1,
        is_available:      true,
      });
    }
  }

  await db.updateConversationState(phone, 'MAIN_MENU', {});
  const stars = '⭐'.repeat(rating);
  return wa.sendButtons(phone,
    `${stars} *Thank you for rating us ${rating}/5!*\n\nYour feedback keeps WeBizzle! awesome.\n_Asante sana — see you next time!_ 🛒`,
    [{ id: 'search', title: '🔍 Shop Again' }]
  );
};

module.exports = { handleMessage, showMainMenu };
