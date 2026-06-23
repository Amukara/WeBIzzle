const wa = require('../services/whatsapp');
const db = require('../services/db');
const { formatPrice, truncate } = require('../utils/helpers');

const CATEGORIES = [
  'Groceries & Staples',
  'Vegetables & Fruits',
  'Meat & Poultry',
  'Electronics & Gadgets',
  'Clothing & Fashion',
  'Food & Snacks',
  'Beverages & Water',
  'Beauty & Health',
  'Hardware & Tools',
  'Other',
];

const UNITS = [
  { id: 'unit_kg',     title: 'kg',     description: 'Kilograms' },
  { id: 'unit_g',      title: 'grams',  description: 'Grams' },
  { id: 'unit_litre',  title: 'litre',  description: 'Litres' },
  { id: 'unit_piece',  title: 'piece',  description: 'Per piece' },
  { id: 'unit_bunch',  title: 'bunch',  description: 'Per bunch' },
  { id: 'unit_packet', title: 'packet', description: 'Per packet' },
  { id: 'unit_box',    title: 'box',    description: 'Per box' },
  { id: 'unit_dozen',  title: 'dozen',  description: 'Per dozen' },
];

// ── Entry point ────────────────────────────────────────────────────────────────
const handleMessage = async ({ phone, senderName, parsed, conv }) => {
  const state    = conv.state   || 'IDLE';
  const context  = conv.context || {};
  const text     = (parsed.body || '').trim();
  const buttonId = parsed.id    || '';

  // ── Is user already a vendor? ─────────────────────────────────────────────
  const vendor = await db.getVendor(phone);

  // Approved vendor using their vendor menu
  if (vendor?.is_approved && !state.startsWith('ONBOARD')) {
    return handleApprovedVendor({ phone, senderName, parsed, conv, vendor });
  }

  // Vendor awaiting approval
  if (vendor && !vendor.is_approved && !state.startsWith('ONBOARD')) {
    await wa.sendText(phone,
      `⏳ *Application Under Review*\n\n` +
      `Hi *${vendor.business_name}*! Your vendor application is being reviewed.\n\n` +
      `You'll get a WhatsApp message once approved (usually within a few minutes).\n\n` +
      `_Text *MENU* to go back to shopping._`
    );
    return;
  }

  // ── Onboarding State Machine ──────────────────────────────────────────────
  if (!vendor && (state === 'IDLE' || state === 'MAIN_MENU' || !state.startsWith('ONBOARD'))) {
    await db.upsertConversation(phone, 'ONBOARD_NAME', {}, 'vendor');
    return wa.sendText(phone,
      `🏪 *Become a WeBizzle! Vendor*\n\n` +
      `Reach hundreds of customers across Nairobi for *free*!\n\n` +
      `✅ Zero listing fees\n` +
      `✅ Orders straight to WhatsApp\n` +
      `✅ Same-day M-Pesa payouts\n` +
      `✅ Your own shop — set your own prices\n\n` +
      `Let's set up your shop. What is your *business name*?`
    );
  }

  // ONBOARD_NAME
  if (state === 'ONBOARD_NAME') {
    if (text.length < 2) return wa.sendText(phone, `Please enter your business name:`);
    await db.updateConversationState(phone, 'ONBOARD_LOCATION', { businessName: text });
    return wa.sendText(phone,
      `✅ *${text}* — great name!\n\nWhere is your business located?\n_(e.g., Westlands, Kibera, CBD, Eastleigh, Thika Road)_`
    );
  }

  // ONBOARD_LOCATION
  if (state === 'ONBOARD_LOCATION') {
    if (text.length < 3) return wa.sendText(phone, `Please enter your business location (neighbourhood or estate):`);
    await db.updateConversationState(phone, 'ONBOARD_CATEGORY', { ...context, location: text });

    const rows = CATEGORIES.map((cat, i) => ({ id: `cat_${i}`, title: cat, description: '' }));
    return wa.sendList(phone,
      `📍 Location: *${text}*\n\nWhat best describes your business?`,
      'Pick Category',
      [{ title: 'Business Categories', rows }],
      '🏪 Vendor Registration'
    );
  }

  // ONBOARD_CATEGORY
  if (state === 'ONBOARD_CATEGORY') {
    let category = text;
    if (parsed.type === 'list') {
      const idx = parseInt(buttonId.replace('cat_', ''));
      category  = CATEGORIES[idx] || text;
    }
    if (!category) return wa.sendText(phone, `Please select a category from the list.`);
    await db.updateConversationState(phone, 'ONBOARD_MPESA', { ...context, category });
    return wa.sendText(phone,
      `✅ Category: *${category}*\n\nWhat is your *M-Pesa phone number*?\nThis is where you'll receive order payments.\n\nFormat: 0712345678`
    );
  }

  // ONBOARD_MPESA
  if (state === 'ONBOARD_MPESA') {
    const clean = text.replace(/\s+/g, '');
    if (!/^(07|01|2547|2541|\+2547|\+2541)\d{7,8}$/.test(clean)) {
      return wa.sendText(phone, `❌ Invalid number. Enter a valid Kenyan phone:\nExample: 0712345678`);
    }
    await db.updateConversationState(phone, 'ONBOARD_CONFIRM', { ...context, mpesaPhone: clean });

    return wa.sendButtons(phone,
      `📋 *Confirm Your Details*\n\n` +
      `🏪 Business: *${context.businessName}*\n` +
      `📍 Location: *${context.location}*\n` +
      `🏷️ Category: *${context.category}*\n` +
      `📱 M-Pesa: *${clean}*\n\nAll good?`,
      [
        { id: 'confirm_vendor_reg',  title: '✅ Register My Shop' },
        { id: 'restart_vendor_reg',  title: '✏️ Edit Details' },
      ]
    );
  }

  // ONBOARD_CONFIRM
  if (state === 'ONBOARD_CONFIRM') {
    if (buttonId === 'restart_vendor_reg') {
      await db.updateConversationState(phone, 'ONBOARD_NAME', {});
      return wa.sendText(phone, `No problem! What is your *business name*?`);
    }
    if (buttonId === 'confirm_vendor_reg') {
      const newVendor = await db.createVendor({
        phone,
        business_name: context.businessName,
        location:      context.location,
        category:      context.category,
        mpesa_phone:   context.mpesaPhone,
        is_approved:   true, // Auto-approve for MVP (set false to require manual review)
        is_active:     true,
        rating:        5.0,
      });

      await db.upsertConversation(phone, 'VENDOR_MENU', { vendorId: newVendor.id }, 'vendor');

      return wa.sendButtons(phone,
        `🎉 *Hongera ${context.businessName}!*\n\n` +
        `Your shop is now *LIVE* on WeBizzle! 🎊\n\n` +
        `Customers can already search for your shop — add your products to start getting orders!`,
        [
          { id: 'add_product', title: '➕ Add First Product' },
          { id: 'vendor_menu', title: '🏪 Vendor Dashboard' },
        ],
        '✅ Shop is Live!'
      );
    }
  }

  // Fallback
  return wa.sendText(phone, `_Follow the steps above, or text *MENU* to go back to shopping._`);
};

// ══════════════════════════════════════════════════════════════════════════════
//  APPROVED VENDOR FLOWS
// ══════════════════════════════════════════════════════════════════════════════
const handleApprovedVendor = async ({ phone, senderName, parsed, conv, vendor }) => {
  const state    = conv.state   || 'VENDOR_MENU';
  const context  = conv.context || {};
  const text     = (parsed.body || '').trim().toLowerCase();
  const buttonId = parsed.id    || '';

  // ── Vendor Dashboard ───────────────────────────────────────────────────────
  if (
    buttonId === 'vendor_menu' ||
    text === 'dashboard' ||
    (state === 'VENDOR_MENU' && parsed.type === 'text' && !['add','view','orders','products'].some(k => text.includes(k)))
  ) {
    return showVendorDashboard(phone, vendor);
  }

  // ── Add Product: Name ──────────────────────────────────────────────────────
  if (buttonId === 'add_product' || (state === 'VENDOR_MENU' && text.includes('add'))) {
    await db.updateConversationState(phone, 'ADD_PRODUCT_NAME', { vendorId: vendor.id });
    return wa.sendText(phone,
      `📦 *Add New Product*\n\nWhat is the *product name*?\n\nExamples:\n_Tomatoes, Unga 2kg, Samsung Charger, Men's Polo Shirt_`
    );
  }

  // ADD_PRODUCT_NAME
  if (state === 'ADD_PRODUCT_NAME') {
    if (text.length < 2) return wa.sendText(phone, `Please enter the product name:`);
    await db.updateConversationState(phone, 'ADD_PRODUCT_PRICE', { ...context, productName: text });
    return wa.sendText(phone, `✅ Product: *${text}*\n\nWhat is the *price in KES*?\nExample: 80`);
  }

  // ADD_PRODUCT_PRICE
  if (state === 'ADD_PRODUCT_PRICE') {
    const price = parseFloat((parsed.body || '').replace(/[^0-9.]/g, ''));
    if (isNaN(price) || price <= 0) return wa.sendText(phone, `❌ Enter a valid price (numbers only):\nExample: 80`);
    await db.updateConversationState(phone, 'ADD_PRODUCT_UNIT', { ...context, price });
    return wa.sendList(phone,
      `✅ Price: *KES ${formatPrice(price)}*\n\nWhat is the *unit of measurement*?`,
      'Select Unit',
      [{ title: 'Units', rows: UNITS }]
    );
  }

  // ADD_PRODUCT_UNIT
  if (state === 'ADD_PRODUCT_UNIT') {
    let unit = parsed.body?.trim() || '';
    if (parsed.type === 'list') unit = buttonId.replace('unit_', '');
    if (!unit) return wa.sendText(phone, `Please select a unit.`);
    await db.updateConversationState(phone, 'ADD_PRODUCT_STOCK', { ...context, unit });
    return wa.sendText(phone, `✅ Unit: *${unit}*\n\nHow many in *stock*?\nExample: 50`);
  }

  // ADD_PRODUCT_STOCK
  if (state === 'ADD_PRODUCT_STOCK') {
    const stock = parseInt((parsed.body || '').replace(/[^0-9]/g, ''));
    if (isNaN(stock) || stock < 0) return wa.sendText(phone, `❌ Enter a valid stock quantity:\nExample: 50`);
    await db.updateConversationState(phone, 'ADD_PRODUCT_DESC', { ...context, stock });
    return wa.sendButtons(phone,
      `✅ Stock: *${stock} ${context.unit}*\n\nAdd a short *description* (optional):\ne.g. _Fresh daily, Brand new sealed, Organic farm_\n\nOr skip:`,
      [{ id: 'skip_desc', title: '⏭️ Skip' }]
    );
  }

  // ADD_PRODUCT_DESC
  if (state === 'ADD_PRODUCT_DESC') {
    const description = buttonId === 'skip_desc' ? '' : (parsed.body || '').trim();
    await db.updateConversationState(phone, 'ADD_PRODUCT_CONFIRM', { ...context, description });
    return wa.sendButtons(phone,
      `📦 *Confirm Product*\n\n` +
      `📝 Name:  *${context.productName}*\n` +
      `💰 Price: *KES ${formatPrice(context.price)} per ${context.unit}*\n` +
      `📊 Stock: *${context.stock} ${context.unit}*\n` +
      `📄 Desc:  ${description || '—'}\n\nSave this product?`,
      [
        { id: 'save_product',  title: '✅ Save Product' },
        { id: 'add_product',   title: '🔄 Start Over' },
        { id: 'vendor_menu',   title: '❌ Cancel' },
      ]
    );
  }

  // ADD_PRODUCT_CONFIRM
  if (state === 'ADD_PRODUCT_CONFIRM' && buttonId === 'save_product') {
    const product = await db.createProduct({
      vendor_id:      vendor.id,
      name:           context.productName,
      price:          context.price,
      unit:           context.unit,
      stock_quantity: context.stock,
      description:    context.description || '',
      category:       vendor.category,
      is_available:   true,
    });

    await db.updateConversationState(phone, 'VENDOR_MENU', { vendorId: vendor.id });
    return wa.sendButtons(phone,
      `✅ *Product Live!*\n\n📦 ${product.name} — KES ${formatPrice(product.price)} per ${product.unit}\n\nCustomers can now find and order it!`,
      [
        { id: 'add_product',  title: '➕ Add Another' },
        { id: 'view_products', title: '📋 My Products' },
        { id: 'vendor_menu',  title: '🏪 Dashboard' },
      ]
    );
  }

  // ── View Products ──────────────────────────────────────────────────────────
  if (buttonId === 'view_products' || (state === 'VENDOR_MENU' && text.includes('product'))) {
    const products = await db.getProductsByVendor(vendor.id);
    if (!products.length) {
      return wa.sendButtons(phone,
        `📦 No products yet!\n\nAdd your first product to start receiving orders.`,
        [{ id: 'add_product', title: '➕ Add Product' }]
      );
    }

    const rows = products.slice(0, 10).map((p) => ({
      id:          `manage_${p.id}`,
      title:       truncate(p.name, 24),
      description: `KES ${formatPrice(p.price)} · Stock: ${p.stock_quantity} · ${p.is_available ? '✅ Live' : '❌ Off'}`,
    }));

    await db.updateConversationState(phone, 'MANAGE_PRODUCTS', { vendorId: vendor.id });
    return wa.sendList(phone,
      `📋 *Your Products* (${products.length})\n\nSelect a product to manage:`,
      'Manage',
      [{ title: `${vendor.business_name} Products`, rows }],
      '🏪 ' + vendor.business_name
    );
  }

  // ── Manage Single Product ──────────────────────────────────────────────────
  if (buttonId.startsWith('manage_') || state === 'MANAGE_PRODUCTS') {
    const productId = buttonId.replace('manage_', '');
    if (productId) {
      const product = await db.getProduct(productId);
      if (product) {
        await db.updateConversationState(phone, 'MANAGE_PRODUCTS', { ...context, editingProductId: productId });
        return wa.sendButtons(phone,
          `📦 *${product.name}*\n\n` +
          `💰 KES ${formatPrice(product.price)} per ${product.unit}\n` +
          `📊 Stock: ${product.stock_quantity}\n` +
          `🟢 Status: ${product.is_available ? 'Live ✅' : 'Hidden ❌'}\n\nActions:`,
          [
            { id: `toggle_${product.id}`, title: product.is_available ? '❌ Hide Product' : '✅ Make Live' },
            { id: `delete_${product.id}`, title: '🗑️ Delete' },
            { id: 'view_products',         title: '← Back' },
          ]
        );
      }
    }
  }

  if (buttonId.startsWith('toggle_')) {
    const productId = buttonId.replace('toggle_', '');
    const product   = await db.getProduct(productId);
    if (product) {
      const updated = await db.updateProduct(productId, { is_available: !product.is_available });
      await db.updateConversationState(phone, 'VENDOR_MENU', { vendorId: vendor.id });
      return wa.sendButtons(phone,
        `✅ *${product.name}* is now *${updated.is_available ? 'Live' : 'Hidden'}*`,
        [
          { id: 'view_products', title: '📋 All Products' },
          { id: 'vendor_menu',   title: '🏪 Dashboard' },
        ]
      );
    }
  }

  if (buttonId.startsWith('delete_')) {
    const productId = buttonId.replace('delete_', '');
    const product   = await db.getProduct(productId);
    if (product) {
      await db.deleteProduct(productId);
      await db.updateConversationState(phone, 'VENDOR_MENU', { vendorId: vendor.id });
      return wa.sendButtons(phone,
        `🗑️ *${product.name}* deleted.`,
        [
          { id: 'add_product',  title: '➕ Add Product' },
          { id: 'view_products', title: '📋 Products' },
        ]
      );
    }
  }

  // ── View Orders ────────────────────────────────────────────────────────────
  if (buttonId === 'view_orders' || (state === 'VENDOR_MENU' && text.includes('order'))) {
    const orderItems = await db.getOrdersByVendor(vendor.id);
    if (!orderItems.length) {
      return wa.sendButtons(phone,
        `📦 No orders yet.\n\nAdd products so customers can find and order from you!`,
        [
          { id: 'add_product', title: '➕ Add Product' },
          { id: 'vendor_menu', title: '🏪 Dashboard' },
        ]
      );
    }

    const statusEmoji = { pending:'⏳', paid:'💳', rider_assigned:'🛵', picked_up:'📦', delivered:'✅', cancelled:'❌' };
    const lines = orderItems.slice(0, 8).map((item) => {
      const o    = item.orders;
      const e    = statusEmoji[o?.status] || '📦';
      const id   = o?.id?.slice(0, 6).toUpperCase() || '---';
      const name = o?.customers?.name || 'Customer';
      const kshs = formatPrice(item.quantity * (item.unit_price || 0));
      const stat = (o?.status || '').replace(/_/g, ' ').toUpperCase();
      return `${e} *#${id}* — ${item.products?.name} ×${item.quantity}\n   Customer: ${name} | KES ${kshs} | ${stat}`;
    }).join('\n\n');

    await db.updateConversationState(phone, 'VENDOR_MENU', { vendorId: vendor.id });
    return wa.sendButtons(phone,
      `📦 *Recent Orders*\n\n${lines}`,
      [{ id: 'vendor_menu', title: '🏪 Dashboard' }]
    );
  }

  // ── Default: Dashboard ─────────────────────────────────────────────────────
  return showVendorDashboard(phone, vendor);
};

const showVendorDashboard = async (phone, vendor) => {
  await db.updateConversationState(phone, 'VENDOR_MENU', { vendorId: vendor.id });

  const [products, orderItems] = await Promise.all([
    db.getProductsByVendor(vendor.id),
    db.getOrdersByVendor(vendor.id),
  ]);

  const pendingCount  = orderItems.filter((o) => ['paid','pending'].includes(o.orders?.status)).length;
  const liveProducts  = products.filter((p) => p.is_available).length;

  return wa.sendButtons(phone,
    `🏪 *${vendor.business_name}*\n\n` +
    `📍 ${vendor.location} · ${vendor.category}\n` +
    `📦 Products: ${liveProducts} live (${products.length} total)\n` +
    `📬 New orders: ${pendingCount}\n` +
    `⭐ Rating: ${vendor.rating || 5}/5\n\n` +
    `_Text MENU to switch to customer view_`,
    [
      { id: 'add_product',  title: '➕ Add Product' },
      { id: 'view_products', title: '📋 My Products' },
      { id: 'view_orders',  title: '📦 My Orders' },
    ],
    `🏪 Vendor Dashboard`,
    'Powered by WeBizzle!'
  );
};

module.exports = { handleMessage };
