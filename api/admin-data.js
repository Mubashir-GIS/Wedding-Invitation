const { loggedIn, send } = require('../lib/admin-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(req, res, 405, { error: 'Method not allowed' });
  if (!loggedIn(req)) return send(req, res, 401, { error: 'Login required' });

  const url = process.env.GOOGLE_APPS_SCRIPT_URL;
  const secret = process.env.RSVP_SHARED_SECRET;
  if (!url || !secret) return send(req, res, 503, { error: 'RSVP backend not configured' });
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) {
    return send(req, res, 503, { error: 'Invalid backend URL' });
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, action: 'dashboard_read' }),
      redirect: 'follow',
      signal: AbortSignal.timeout(25000)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error('Google Sheets read failed');
    const guests = Array.isArray(result.guests) ? result.guests : [];
    const gifts = Array.isArray(result.gifts) ? result.gifts : [];
    const stats = result.stats && typeof result.stats === 'object' ? result.stats : {
      totalResponses: guests.length,
      accepted: guests.filter(g => g.attending === 'Accepts').length,
      declined: guests.filter(g => g.attending !== 'Accepts').length,
      expectedGuests: guests.reduce((sum, g) => sum + (Number(g.guests) || 0), 0)
    };
    return send(req, res, 200, { ok: true, stats, guests, gifts });
  } catch (error) {
    console.error('Admin data fetch failed:', error.message);
    return send(req, res, 502, { error: 'Unable to load guest records. Please retry.' });
  }
};
