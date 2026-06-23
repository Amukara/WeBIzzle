const wa = require('../services/whatsapp');
const db = require('../services/db');
const { formatPrice } = require('../utils/helpers');

// ── Entry point ────────────────────────────────────────────────────────────────
const handleMessage = async ({ phone, senderName, parsed, conv }) => {
  const state    = conv.state   || 'IDLE';
  const context  = conv.context || {};
  const text     = (parsed.body || '').trim();
  const buttonId = parsed.id    || '';

  const rider = await db.getRider(phone);

  // ── Approved rider ────────────────────────────────────────────────────────
  if (rider?.is_approved && !state.startsWith('RIDER_ONBOARD')) {
    return handleApprovedRider({ phone, senderName, parsed, conv, rider });
  }

  // ── Awaiting approval ─────────────────────────────────────────────────────
  if (rider && !rider.is_approved && !state.startsWith('RIDER_ONBOARD')) {
    return wa.sendText(phone,
      `⏳ *Application Pending*\n\n` +
      `Hi *${rider.name}*! Your rider application is under review.\n\n` +
      `You'll get a WhatsApp message once approved.\n\n` +
      `_Text *MENU* to go back to shopping._`
    );
  }

  // ── Onboarding Flow ───────────────────────────────────────────────────────
  if (!rider && !state.startsWith('RIDER_ONBOARD')) {
    await db.upsertConversation(phone, 'RIDER_ONBOARD_NAME', {}, 'rider');
    return wa.sendText(phone,
      `🛵 *Become a WeBizzle! Rider*\n\n` +
      `Earn *KES 150+ per delivery* while working your own hours!\n\n` +
      `✅ Jobs sent to this WhatsApp number\n` +
      `✅ Daily M-Pesa payouts\n` +
      `✅ No app to download\n` +
      `✅ Work anytime across Nairobi\n\n` +
      `Let's register you. What is your *full name*?`
    );
  }

  if (state === 'RIDER_ONBOARD_NAME') {
    if (text.length < 3) return wa.sendText(phone, `Please enter your full name:`);
    await db.updateConversationState(phone, 'RIDER_ONBOARD_ID', { name: text });
    return wa.sendText(phone,
      `✅ Hi *${text}*!\n\nEnter your *National ID number* for verification:`
    );
  }

  if (state === 'RIDER_ONBOARD_ID') {
    const clean = text.replace(/\s+/g, '');
    if (!/^\d{7,8}$/.test(clean)) {
      return wa.sendText(phone, `❌ Invalid ID. Enter your 7–8 digit Kenyan National ID:`);
    }
    await db.updateConversationState(phone, 'RIDER_ONBOARD_BIKE', { ...context, idNumber: clean });
    return wa.sendText(phone,
      `✅ ID: *${clean}*\n\nEnter your *motorcycle registration number*:\nExample: KMCA 123A`
    );
  }

  if (state === 'RIDER_ONBOARD_BIKE') {
    if (text.length < 5) return wa.sendText(phone, `Please enter your bike registration plate:`);
    const bikeReg = text.toUpperCase();
    await db.updateConversationState(phone, 'RIDER_ONBOARD_CONFIRM', { ...context, bikeReg });

    return wa.sendButtons(phone,
      `📋 *Confirm Your Details*\n\n` +
      `👤 Name:  *${context.name}*\n` +
      `🪪 ID:    *${context.idNumber}*\n` +
      `🛵 Bike:  *${bikeReg}*\n` +
      `📱 Phone: *${phone}*\n\nAll correct?`,
      [
        { id: 'confirm_rider', title: '✅ Register Now' },
        { id: 'restart_rider', title: '✏️ Edit Details' },
      ]
    );
  }

  if (state === 'RIDER_ONBOARD_CONFIRM') {
    if (buttonId === 'restart_rider') {
      await db.updateConversationState(phone, 'RIDER_ONBOARD_NAME', {});
      return wa.sendText(phone, `No problem! What is your *full name*?`);
    }
    if (buttonId === 'confirm_rider') {
      const newRider = await db.createRider({
        phone,
        name:              context.name,
        id_number:         context.idNumber,
        bike_registration: context.bikeReg,
        is_approved:       true,  // Auto-approve for MVP (set false for manual review)
        is_available:      false, // They must go "online" manually
        rating:            5.0,
        total_deliveries:  0,
        base_fee:          150,
      });

      await db.upsertConversation(phone, 'RIDER_MENU', { riderId: newRider.id }, 'rider');

      return wa.sendButtons(phone,
        `🎉 *Hongera ${context.name}!*\n\n` +
        `You're now a registered *WeBizzle! Rider!* 🛵\n\n` +
        `📱 Delivery jobs are sent here on WhatsApp\n` +
        `💰 Earn KES 150 per delivery\n` +
        `💳 Paid daily via M-Pesa to *${phone}*\n\n` +
        `Tap below when you're ready to receive your first job:`,
        [{ id: 'rider_go_available', title: '🟢 Go Online Now' }],
        '🛵 WeBizzle! Rider',
        'You control your own hours'
      );
    }
  }

  return wa.sendText(phone, `_Follow the steps above, or text *MENU* to go back to shopping._`);
};

// ══════════════════════════════════════════════════════════════════════════════
//  APPROVED RIDER FLOWS
// ══════════════════════════════════════════════════════════════════════════════
const handleApprovedRider = async ({ phone, senderName, parsed, conv, rider }) => {
  const state    = conv.state   || 'RIDER_MENU';
  const context  = conv.context || {};
  const text     = (parsed.body || '').trim().toLowerCase();
  const buttonId = parsed.id    || '';

  // ── Go Available ──────────────────────────────────────────────────────────
  if (buttonId === 'rider_go_available' || ['available', 'online', 'go online', 'ready'].includes(text)) {
    await db.setRiderAvailability(rider.id, true);
    await db.updateConversationState(phone, 'RIDER_AVAILABLE', { riderId: rider.id });

    return wa.sendButtons(phone,
      `🟢 *You're Online!*\n\n` +
      `Delivery jobs will now be sent to this chat.\n\n` +
      `⭐ Your rating:      ${rider.rating || 5}/5\n` +
      `📦 Total deliveries: ${rider.total_deliveries || 0}\n` +
      `💰 Per delivery:     KES ${rider.base_fee || 150}\n\n` +
      `_Text OFF anytime to go offline._`,
      [{ id: 'rider_go_offline', title: '🔴 Go Offline' }],
      '🛵 WeBizzle! Rider',
      'Waiting for delivery requests...'
    );
  }

  // ── Go Offline ────────────────────────────────────────────────────────────
  if (buttonId === 'rider_go_offline' || ['off', 'offline', 'go offline', 'stop'].includes(text)) {
    await db.setRiderAvailability(rider.id, false);
    await db.updateConversationState(phone, 'RIDER_MENU', { riderId: rider.id });

    return wa.sendButtons(phone,
      `🔴 *You're Offline*\n\nYou won't receive new jobs until you go back online.\n\nTake a break — you've earned it! ☕`,
      [{ id: 'rider_go_available', title: '🟢 Go Online' }],
      '🛵 WeBizzle! Rider'
    );
  }

  // ── Accept Delivery ───────────────────────────────────────────────────────
  if (buttonId.startsWith('accept_delivery_')) {
    const deliveryId = buttonId.replace('accept_delivery_', '');
    const delivery   = await db.getDelivery(deliveryId);

    if (!delivery) {
      return wa.sendButtons(phone,
        `❌ This delivery is no longer available.`,
        [{ id: 'rider_go_available', title: '🟢 Stay Online' }]
      );
    }
    if (delivery.status !== 'assigned') {
      return wa.sendButtons(phone,
        `❌ Delivery already taken or cancelled.`,
        [{ id: 'rider_go_available', title: '🟢 Stay Online' }]
      );
    }

    await db.updateDeliveryStatus(deliveryId, 'accepted');
    await db.updateConversationState(phone, 'RIDER_ON_DELIVERY', { riderId: rider.id, deliveryId });

    // Notify customer
    const customerPhone = delivery.orders?.customers?.phone;
    const customerName  = delivery.orders?.customers?.name || 'Customer';
    if (customerPhone) {
      await wa.sendText(customerPhone,
        `🛵 *Rider On The Way!*\n\n` +
        `Your order has been assigned to a rider.\n\n` +
        `👤 Rider: *${rider.name}*\n` +
        `🛵 Bike:  *${rider.bike_registration}*\n` +
        `📞 Call:  ${phone}\n\n` +
        `You'll be notified when your order is picked up. _Itakuwa hako hivi karibuni!_ 🛵`
      );
    }

    return wa.sendButtons(phone,
      `✅ *Job Accepted!*\n\n` +
      `📍 *Pick up from:*\n${delivery.pickup_address}\n\n` +
      `🏠 *Deliver to:*\n${delivery.delivery_address}\n\n` +
      `👤 Customer: *${customerName}*\n` +
      `📞 Customer: ${customerPhone || 'N/A'}\n` +
      `💰 Your fee: *KES ${formatPrice(delivery.fee)}*\n\n` +
      `Head to the vendor, collect the order, then tap:`,
      [
        { id: `picked_up_${deliveryId}`, title: '📦 Order Collected' },
        { id: `problem_${deliveryId}`,   title: '⚠️ Report Problem' },
      ],
      '🛵 Active Delivery — Step 1 of 2'
    );
  }

  // ── Reject Delivery ───────────────────────────────────────────────────────
  if (buttonId.startsWith('reject_delivery_')) {
    const deliveryId = buttonId.replace('reject_delivery_', '');
    await db.updateDeliveryStatus(deliveryId, 'rejected');
    await db.setRiderAvailability(rider.id, true);
    await db.updateConversationState(phone, 'RIDER_AVAILABLE', { riderId: rider.id });

    return wa.sendButtons(phone,
      `❌ Job rejected. You're still online.\n\nAnother delivery will be sent when available.`,
      [{ id: 'rider_go_offline', title: '🔴 Go Offline' }]
    );
  }

  // ── Order Picked Up ───────────────────────────────────────────────────────
  if (buttonId.startsWith('picked_up_')) {
    const deliveryId = buttonId.replace('picked_up_', '');
    const delivery   = await db.getDelivery(deliveryId);
    if (!delivery) return wa.sendText(phone, `❌ Delivery record not found.`);

    await db.updateDeliveryStatus(deliveryId, 'picked_up');
    await db.updateOrderStatus(delivery.orders.id, 'picked_up');

    const customerPhone = delivery.orders?.customers?.phone;
    const customerName  = delivery.orders?.customers?.name || 'Customer';

    if (customerPhone) {
      await wa.sendText(customerPhone,
        `📦 *Order Picked Up!*\n\n` +
        `*${rider.name}* has your order and is heading to you now.\n\n` +
        `🛵 Rider: *${rider.name}* · ${rider.bike_registration}\n` +
        `📞 Call rider: ${phone}\n\n` +
        `_You'll be notified once it arrives._`
      );
    }

    return wa.sendButtons(phone,
      `🏃 *En Route!*\n\n` +
      `Delivering to: *${delivery.delivery_address}*\n\n` +
      `👤 Customer: *${customerName}*\n` +
      `📞 Customer phone: ${customerPhone || 'N/A'}\n\n` +
      `Once you hand over the order, tap:`,
      [
        { id: `delivered_${deliveryId}`, title: '✅ Order Delivered' },
        { id: `problem_${deliveryId}`,   title: '⚠️ Report Problem' },
      ],
      '🛵 En Route — Step 2 of 2'
    );
  }

  // ── Order Delivered ───────────────────────────────────────────────────────
  if (buttonId.startsWith('delivered_')) {
    const deliveryId = buttonId.replace('delivered_', '');
    const delivery   = await db.getDelivery(deliveryId);
    if (!delivery) return wa.sendText(phone, `❌ Delivery record not found.`);

    await db.updateDeliveryStatus(deliveryId, 'delivered');
    await db.updateOrderStatus(delivery.orders.id, 'delivered');
    await db.setRiderAvailability(rider.id, true);

    const customerPhone = delivery.orders?.customers?.phone;
    const orderId       = delivery.orders?.id;

    // Ask customer to rate the experience
    if (customerPhone) {
      await wa.sendButtons(customerPhone,
        `🎉 *Order Delivered!*\n\n` +
        `Your WeBizzle! order has arrived. How was your experience?`,
        [
          { id: 'rate_5', title: '⭐⭐⭐⭐⭐ Excellent' },
          { id: 'rate_4', title: '⭐⭐⭐⭐ Good' },
          { id: 'rate_3', title: '⭐⭐⭐ Okay' },
        ],
        '🛒 WeBizzle! — Rate Your Order'
      );
      // Put customer in RATING state so their reply is handled
      await db.updateConversationState(customerPhone, 'RATING', { riderId: rider.id, orderId });
    }

    await db.updateConversationState(phone, 'RIDER_MENU', { riderId: rider.id });

    const newTotal = (rider.total_deliveries || 0) + 1;
    return wa.sendButtons(phone,
      `🎉 *Delivery Complete!*\n\n` +
      `💰 *KES ${formatPrice(delivery.fee)}* will be paid to your M-Pesa by end of day.\n\n` +
      `📦 Total deliveries: *${newTotal}*\n` +
      `⭐ Rating: *${rider.rating || 5}/5*\n\n` +
      `Excellent work! Ready for the next one?`,
      [
        { id: 'rider_go_available', title: '🟢 Next Delivery' },
        { id: 'rider_go_offline',   title: '☕ Take a Break' },
      ],
      '✅ WeBizzle! — Job Done!'
    );
  }

  // ── Problem Report ────────────────────────────────────────────────────────
  if (buttonId.startsWith('problem_')) {
    const deliveryId = buttonId.replace('problem_', '');
    await db.updateConversationState(phone, 'RIDER_MENU', { riderId: rider.id, deliveryId });

    return wa.sendText(phone,
      `⚠️ *Report a Problem*\n\n` +
      `Type your problem below and our support team will assist you immediately.\n\n` +
      `📞 Support hotline: +254700000000\n` +
      `⏰ Available 7am – 10pm daily`
    );
  }

  // ── Earnings Summary ──────────────────────────────────────────────────────
  if (['earnings', 'pesa', 'pay', 'makubaliano'].includes(text)) {
    const fee      = rider.base_fee || 150;
    const total    = rider.total_deliveries || 0;
    const lifetime = total * fee;

    return wa.sendButtons(phone,
      `💰 *Your Earnings*\n\n` +
      `📦 Total deliveries: *${total}*\n` +
      `💵 Per delivery:     *KES ${formatPrice(fee)}*\n` +
      `🏦 Lifetime earned:  *KES ${formatPrice(lifetime)}*\n\n` +
      `Payouts are processed daily to *${phone}* via M-Pesa by 8pm.`,
      [{ id: rider.is_available ? 'rider_go_offline' : 'rider_go_available',
         title: rider.is_available ? '🔴 Go Offline' : '🟢 Go Online' }]
    );
  }

  // ── Default Dashboard ─────────────────────────────────────────────────────
  return showRiderDashboard(phone, rider, context);
};

const showRiderDashboard = async (phone, rider, context) => {
  await db.updateConversationState(phone, 'RIDER_MENU', { riderId: rider.id });

  const statusLine = rider.is_available ? '🟢 Online — accepting jobs' : '🔴 Offline';

  return wa.sendButtons(phone,
    `🛵 *WeBizzle! Rider Dashboard*\n\n` +
    `👤 ${rider.name}\n` +
    `🛵 ${rider.bike_registration}\n` +
    `⭐ Rating:       ${rider.rating || 5}/5\n` +
    `📦 Deliveries:  ${rider.total_deliveries || 0}\n` +
    `💰 Per delivery: KES ${rider.base_fee || 150}\n` +
    `📶 Status: ${statusLine}`,
    [
      rider.is_available
        ? { id: 'rider_go_offline',   title: '🔴 Go Offline' }
        : { id: 'rider_go_available', title: '🟢 Go Online' },
    ],
    '🛵 WeBizzle! Rider',
    'Text EARNINGS for payout summary'
  );
};

module.exports = { handleMessage };
