const axios = require('axios');
const moment = require('moment');
const db = require('./db');
const wa = require('./whatsapp');

// Safaricom Daraja API — Free to use (sandbox + production)
class MpesaService {
  constructor() {
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.shortCode = process.env.MPESA_SHORT_CODE || '174379'; // Sandbox default
    this.passkey = process.env.MPESA_PASSKEY;
    this.callbackUrl = process.env.MPESA_CALLBACK_URL; // e.g. https://yourapp.onrender.com/mpesa-callback
    this.isSandbox = process.env.NODE_ENV !== 'production';

    this.baseUrl = this.isSandbox
      ? 'https://sandbox.safaricom.co.ke'
      : 'https://api.safaricom.co.ke';
  }

  // ── Get OAuth Access Token ────────────────────────────────────────────────────
  async getToken() {
    try {
      const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      const response = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${credentials}` },
      });
      return response.data.access_token;
    } catch (error) {
      console.error('[M-Pesa] Token error:', error.response?.data || error.message);
      throw new Error('Could not get M-Pesa token');
    }
  }

  // ── STK Push (Lipa Na M-Pesa Online) ─────────────────────────────────────────
  async stkPush({ phone, amount, orderId, description }) {
    const token = await this.getToken();
    const timestamp = moment().format('YYYYMMDDHHmmss');
    const password = Buffer.from(`${this.shortCode}${this.passkey}${timestamp}`).toString('base64');

    // Safaricom requires phone in 254XXXXXXXXX format (no leading 0 or +)
    const formattedPhone = this.formatPhone(phone);

    const payload = {
      BusinessShortCode: this.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount), // Must be integer
      PartyA: formattedPhone,
      PartyB: this.shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: this.callbackUrl,
      AccountReference: `WeBizzle-${orderId}`,
      TransactionDesc: description || 'WeBizzle Order Payment',
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = response.data;
      if (data.ResponseCode === '0') {
        // Store checkout request ID so we can match it in the callback
        await db.storeCheckoutRequest(orderId, data.CheckoutRequestID);
        return { success: true, checkoutRequestId: data.CheckoutRequestID };
      } else {
        console.error('[M-Pesa] STK Push failed:', data);
        return { success: false, message: data.ResponseDescription };
      }
    } catch (error) {
      console.error('[M-Pesa] STK Push error:', error.response?.data || error.message);
      return { success: false, message: 'Payment request failed' };
    }
  }

  // ── M-Pesa Callback Handler ───────────────────────────────────────────────────
  // Called by handleMpesaCallback route in index.js
  async processCallback(body) {
    try {
      const stk = body.Body?.stkCallback;
      if (!stk) return;

      const checkoutRequestId = stk.CheckoutRequestID;
      const resultCode = stk.ResultCode;

      // Find the order linked to this checkout request
      const order = await db.getOrderByCheckoutRequest(checkoutRequestId);
      if (!order) {
        console.warn('[M-Pesa] No order found for CheckoutRequestID:', checkoutRequestId);
        return;
      }

      if (resultCode === 0) {
        // Payment successful — extract receipt
        const items = stk.CallbackMetadata?.Item || [];
        const receipt = items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value || 'N/A';
        const amount = items.find((i) => i.Name === 'Amount')?.Value;

        // Update order status to PAID
        await db.updateOrderPaid(order.id, receipt);

        // Notify customer
        await wa.sendText(
          order.customer_phone,
          `✅ *Payment Confirmed!*\n\n📱 M-Pesa Receipt: *${receipt}*\n💰 Amount: *KES ${amount}*\n\nWe are now assigning you a boda boda rider. You'll receive their details shortly.\n\n_Asante! WeBizzle! 🛵_`
        );

        // Assign rider (automatic)
        await this.assignRider(order);
      } else {
        // Payment failed or cancelled
        const message =
          resultCode === 1032
            ? 'Payment cancelled by user'
            : `Payment failed (code: ${resultCode})`;

        await db.updateOrderStatus(order.id, 'payment_failed');

        await wa.sendButtons(
          order.customer_phone,
          `❌ *Payment Failed*\n\n${message}.\n\nWould you like to try again?`,
          [
            { id: `retry_payment_${order.id}`, title: 'Try Again' },
            { id: 'main_menu', title: 'Main Menu' },
          ]
        );
      }
    } catch (error) {
      console.error('[M-Pesa] Callback processing error:', error);
    }
  }

  // ── Auto-Assign Nearest Available Rider ───────────────────────────────────────
  async assignRider(order) {
    const rider = await db.getAvailableRider();

    if (!rider) {
      // No rider available — notify customer
      await wa.sendText(
        order.customer_phone,
        `🛵 *Finding your rider...*\n\nAll our riders are currently busy. We are looking for the next available one.\n\nYou'll be notified within 5-10 minutes. Thank you for your patience!`
      );

      // Queue it for retry (in production, use a job queue like Bull)
      setTimeout(() => this.assignRider(order), 5 * 60 * 1000);
      return;
    }

    // Mark rider as unavailable
    await db.setRiderAvailability(rider.id, false);

    // Create delivery record
    const delivery = await db.createDelivery({
      orderId: order.id,
      riderId: rider.id,
      pickupAddress: order.vendor_address || 'Vendor location',
      deliveryAddress: order.delivery_address,
      fee: order.delivery_fee,
    });

    // Update order with rider
    await db.updateOrderRider(order.id, rider.id, 'rider_assigned');

    // Notify rider with delivery details
    const orderItems = await db.getOrderItems(order.id);
    const itemsList = orderItems.map((i) => `• ${i.quantity}x ${i.product_name} @ KES ${i.unit_price}`).join('\n');

    await wa.sendButtons(
      rider.phone,
      `🛵 *New Delivery Job! WeBizzle!*\n\n📦 *Items:*\n${itemsList}\n\n📍 *Pick up from:* ${order.vendor_name || 'Vendor'}\n🏠 *Deliver to:* ${order.delivery_address}\n💰 *Your earnings: KES ${order.delivery_fee}*\n\n_You have 3 minutes to accept._`,
      [
        { id: `accept_delivery_${delivery.id}`, title: '✅ Accept' },
        { id: `reject_delivery_${delivery.id}`, title: '❌ Reject' },
      ]
    );

    // Auto-reassign if rider doesn't respond in 3 minutes
    setTimeout(async () => {
      const d = await db.getDelivery(delivery.id);
      if (d && d.status === 'assigned') {
        // Rider didn't respond — mark them unavailable and try again
        await db.setRiderAvailability(rider.id, true);
        await db.updateDeliveryStatus(delivery.id, 'rejected');
        await this.assignRider(order);
      }
    }, 3 * 60 * 1000);
  }

  // ── Helper: Format phone to 254XXXXXXXXX ─────────────────────────────────────
  formatPhone(phone) {
    let p = String(phone).replace(/\s+/g, '').replace(/[^0-9]/g, '');
    if (p.startsWith('0')) p = '254' + p.slice(1);
    if (p.startsWith('+')) p = p.slice(1);
    if (!p.startsWith('254')) p = '254' + p;
    return p;
  }
}

const mpesa = new MpesaService();

// Express route handler for M-Pesa callback
const handleMpesaCallback = async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); // Respond immediately to Safaricom
  await mpesa.processCallback(req.body);
};

module.exports = { mpesa, handleMpesaCallback };
