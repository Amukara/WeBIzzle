const axios = require('axios');

// WhatsApp Business Cloud API (Meta - Free tier: 1,000 conversations/month)
class WhatsAppService {
  constructor() {
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.baseUrl = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;
  }

  get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  // ── Text Message ─────────────────────────────────────────────────────────────
  async sendText(to, text) {
    return this._send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    });
  }

  // ── Interactive Buttons (max 3 buttons) ───────────────────────────────────────
  async sendButtons(to, bodyText, buttons, headerText = null, footerText = null) {
    const interactive = {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map((btn) => ({
          type: 'reply',
          reply: {
            id: String(btn.id).substring(0, 256),
            title: String(btn.title).substring(0, 20),
          },
        })),
      },
    };
    if (headerText) interactive.header = { type: 'text', text: String(headerText).substring(0, 60) };
    if (footerText) interactive.footer = { text: String(footerText).substring(0, 60) };

    return this._send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    });
  }

  // ── Interactive List (max 10 rows per section, max 10 sections) ───────────────
  async sendList(to, bodyText, buttonText, sections, headerText = null, footerText = null) {
    const interactive = {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: String(buttonText).substring(0, 20),
        sections: sections.map((section) => ({
          title: String(section.title).substring(0, 24),
          rows: section.rows.slice(0, 10).map((row) => ({
            id: String(row.id).substring(0, 200),
            title: String(row.title).substring(0, 24),
            description: row.description ? String(row.description).substring(0, 72) : '',
          })),
        })),
      },
    };
    if (headerText) interactive.header = { type: 'text', text: String(headerText).substring(0, 60) };
    if (footerText) interactive.footer = { text: String(footerText).substring(0, 60) };

    return this._send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    });
  }

  // ── Location Request ──────────────────────────────────────────────────────────
  async requestLocation(to, bodyText) {
    return this._send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: { text: bodyText },
        action: { name: 'send_location' },
      },
    });
  }

  // ── Mark message as read ──────────────────────────────────────────────────────
  async markRead(messageId) {
    return this._send({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  // ── Internal send ──────────────────────────────────────────────────────────────
  async _send(payload) {
    try {
      const response = await axios.post(this.baseUrl, payload, { headers: this.headers });
      return response.data;
    } catch (error) {
      const errData = error.response?.data;
      console.error('[WhatsApp] Send error:', JSON.stringify(errData || error.message));
      // Don't throw — a failed message shouldn't crash the flow
      return null;
    }
  }
}

module.exports = new WhatsAppService();
