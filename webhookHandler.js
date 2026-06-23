const wa = require('../services/whatsapp');
const db = require('../services/db');
const customerFlow = require('../flows/customerFlow');
const vendorFlow = require('../flows/vendorFlow');
const riderFlow = require('../flows/riderFlow');

// ── Webhook Verification (GET) ─────────────────────────────────────────────────
// Meta calls this once when you configure the webhook URL in the dashboard
const verifyWebhook = (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('[Webhook] ✅ Verified by Meta');
    return res.status(200).send(challenge);
  }
  console.warn('[Webhook] ❌ Verification failed — check WEBHOOK_VERIFY_TOKEN');
  res.status(403).send('Forbidden');
};

// ── Incoming Message Handler (POST) ───────────────────────────────────────────
const handleWebhook = async (req, res) => {
  // Always respond 200 first — WhatsApp will retry if it doesn't hear back quickly
  res.status(200).json({ status: 'ok' });

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value    = change.value;
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        for (const message of messages) {
          const phone       = message.from;
          const contact     = contacts.find((c) => c.wa_id === phone);
          const senderName  = contact?.profile?.name || 'Friend';

          // Mark message as read (shows blue ticks to sender)
          await wa.markRead(message.id).catch(() => {});

          // Parse message into a normalised object
          const parsed = parseMessage(message);
          if (parsed.type === 'unknown') continue; // Ignore unsupported types (video, audio…)

          // Load or bootstrap conversation state
          let conv = await db.getConversation(phone);
          if (!conv) {
            conv = { phone, state: 'IDLE', context: {}, user_type: 'customer' };
          }

          console.log(
            `[MSG] ${phone} (${conv.user_type}|${conv.state}) → type=${parsed.type} body="${parsed.body || parsed.id || ''}"`
          );

          await routeMessage({ phone, senderName, parsed, conv });
        }
      }
    }
  } catch (err) {
    console.error('[Webhook] Unhandled error:', err);
  }
};

// ── Message Parser ─────────────────────────────────────────────────────────────
const parseMessage = (message) => {
  const type = message.type;

  if (type === 'text') {
    return { type: 'text', body: (message.text?.body || '').trim() };
  }

  if (type === 'interactive') {
    const interactive = message.interactive;
    if (interactive.type === 'button_reply') {
      return {
        type: 'button',
        id:    interactive.button_reply.id,
        title: interactive.button_reply.title,
        body:  interactive.button_reply.title,
      };
    }
    if (interactive.type === 'list_reply') {
      return {
        type:  'list',
        id:    interactive.list_reply.id,
        title: interactive.list_reply.title,
        body:  interactive.list_reply.title,
      };
    }
  }

  if (type === 'location') {
    return {
      type:      'location',
      latitude:  message.location.latitude,
      longitude: message.location.longitude,
      address:   message.location.address || message.location.name || '',
    };
  }

  if (type === 'image') {
    return { type: 'image', mediaId: message.image?.id };
  }

  return { type: 'unknown' };
};

// ── Message Router ─────────────────────────────────────────────────────────────
const routeMessage = async ({ phone, senderName, parsed, conv }) => {
  const rawText  = (parsed.body || parsed.title || '').toLowerCase().trim();
  const buttonId = parsed.id || '';

  // ── Global keyword shortcuts (override any state) ─────────────────────────
  if (parsed.type === 'text') {
    const isGreeting = ['hi','hello','hujambo','habari','hey','oya','niaje','sasa'].includes(rawText);
    const isMenu     = ['menu','start','0','home','mwanzo'].includes(rawText);

    if (isGreeting || isMenu) {
      await db.upsertConversation(phone, 'MAIN_MENU', {}, conv.user_type || 'customer');
      return customerFlow.showMainMenu(phone, senderName);
    }

    if (['vendor','niwe vendor','become vendor','i want to sell'].includes(rawText)) {
      const existing = await db.getConversation(phone);
      const newConv  = { ...conv, user_type: 'vendor', state: existing?.user_type === 'vendor' ? conv.state : 'IDLE' };
      return vendorFlow.handleMessage({ phone, senderName, parsed, conv: newConv });
    }

    if (['rider','niwe rider','become rider','i want to deliver'].includes(rawText)) {
      const existing = await db.getConversation(phone);
      const newConv  = { ...conv, user_type: 'rider', state: existing?.user_type === 'rider' ? conv.state : 'IDLE' };
      return riderFlow.handleMessage({ phone, senderName, parsed, conv: newConv });
    }

    if (['help','msaada','?'].includes(rawText)) {
      return sendHelp(phone);
    }
  }

  // ── Route by user type ─────────────────────────────────────────────────────
  const userType = conv.user_type || 'customer';

  if (userType === 'vendor') {
    return vendorFlow.handleMessage({ phone, senderName, parsed, conv });
  }
  if (userType === 'rider') {
    return riderFlow.handleMessage({ phone, senderName, parsed, conv });
  }

  // Default: customer
  return customerFlow.handleMessage({ phone, senderName, parsed, conv });
};

// ── Help Message ──────────────────────────────────────────────────────────────
const sendHelp = async (phone) => {
  await wa.sendText(
    phone,
    `🛒 *WeBizzle! — How It Works*\n\n` +
    `👤 *Shopping (Customer):*\n` +
    `• Text anything to start\n` +
    `• Search products from many vendors\n` +
    `• Compare prices side by side\n` +
    `• Pay via M-Pesa\n` +
    `• Get delivered by boda boda\n\n` +
    `🏪 *Selling (Vendor):*\n` +
    `• Text *VENDOR* to register your shop\n` +
    `• Add products with prices\n` +
    `• Receive orders on WhatsApp\n` +
    `• Get paid daily via M-Pesa\n\n` +
    `🛵 *Delivering (Rider):*\n` +
    `• Text *RIDER* to register\n` +
    `• Accept delivery jobs on WhatsApp\n` +
    `• Earn KES 150 per delivery\n` +
    `• Daily M-Pesa payouts\n\n` +
    `📞 *Support:* +254700000000\n` +
    `🌐 Free to use — powered by WeBizzle!\n\n` +
    `_Text *MENU* anytime to restart._`
  );
};

module.exports = { verifyWebhook, handleWebhook };
