require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { verifyWebhook, handleWebhook } = require('./src/handlers/webhookHandler');
const { handleMpesaCallback } = require('./src/services/mpesa');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'WeBizzle!',
    status: 'running',
    description: 'WhatsApp Price Comparison & Boda Delivery Platform for Kenya',
    timestamp: new Date().toISOString(),
  });
});

// ── WhatsApp Webhook ──────────────────────────────────────────────────────────
// Meta sends a GET to verify the webhook endpoint
app.get('/webhook', verifyWebhook);

// All incoming WhatsApp messages arrive here
app.post('/webhook', handleWebhook);

// ── M-Pesa Callback ───────────────────────────────────────────────────────────
// Safaricom sends STK Push results here
app.post('/mpesa-callback', handleMpesaCallback);

// ── Admin Routes ──────────────────────────────────────────────────────────────
// Simple token-protected admin endpoints
const adminAuth = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Get all pending vendors
app.get('/admin/vendors/pending', adminAuth, async (req, res) => {
  const db = require('./src/services/db');
  const vendors = await db.getPendingVendors();
  res.json(vendors);
});

// Approve a vendor
app.post('/admin/vendors/:id/approve', adminAuth, async (req, res) => {
  const db = require('./src/services/db');
  const wa = require('./src/services/whatsapp');
  const vendor = await db.approveVendor(req.params.id);
  if (vendor) {
    await wa.sendText(
      vendor.phone,
      `✅ *WeBizzle! Vendor Approved!*\n\nKongratulations ${vendor.business_name}! Your vendor account is now live.\n\nText *MENU* to manage your products and view orders.\n\n_Asante kwa kujiunga na WeBizzle!_ 🛒`
    );
  }
  res.json({ success: true, vendor });
});

// Get all pending riders
app.get('/admin/riders/pending', adminAuth, async (req, res) => {
  const db = require('./src/services/db');
  const riders = await db.getPendingRiders();
  res.json(riders);
});

// Approve a rider
app.post('/admin/riders/:id/approve', adminAuth, async (req, res) => {
  const db = require('./src/services/db');
  const wa = require('./src/services/whatsapp');
  const rider = await db.approveRider(req.params.id);
  if (rider) {
    await wa.sendButtons(
      rider.phone,
      `✅ *Hongera ${rider.name}! You're approved as a WeBizzle! Rider!*\n\nYou'll receive delivery requests when customers place orders near you.\n\nText *AVAILABLE* to start receiving jobs. Each delivery earns you *KES 120-200*.`,
      [{ id: 'rider_go_available', title: 'Go Available Now' }]
    );
  }
  res.json({ success: true, rider });
});

// Dashboard stats
app.get('/admin/stats', adminAuth, async (req, res) => {
  const db = require('./src/services/db');
  const stats = await db.getDashboardStats();
  res.json(stats);
});

// ── Keep-Alive Ping (prevents Render free tier sleep) ─────────────────────────
if (process.env.SELF_PING_URL) {
  const axios = require('axios');
  setInterval(async () => {
    try {
      await axios.get(process.env.SELF_PING_URL);
    } catch (_) {}
  }, 14 * 60 * 1000); // ping every 14 minutes
}

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 WeBizzle! running on port ${PORT}`);
  console.log(`   WhatsApp webhook: POST /webhook`);
  console.log(`   M-Pesa callback:  POST /mpesa-callback`);
  console.log(`   Admin dashboard:  GET  /admin/stats\n`);
});
