const { send } = require('../lib/admin-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(req, res, 405, { error: 'Method not allowed' });
  const url = process.env.GOOGLE_APPS_SCRIPT_URL;
  const secret = process.env.RSVP_SHARED_SECRET;
  if (!url || !secret) return send(req, res, 503, { error: 'Gift recording is not configured.' });
  let data;
  try {
    data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid body');
  } catch (_) { return send(req, res, 400, { error: 'Invalid gift details.' }); }

  const name = String(data.name || '').trim();
  const amount = Number(data.amount);
  const method = String(data.method || '').trim().toLowerCase();
  const message = String(data.message || '').trim();
  if (name.length < 2 || name.length > 120 || !Number.isFinite(amount) || amount < 1 || amount > 100000 ||
      !['venmo', 'cashapp', 'zelle', 'other'].includes(method) || message.length > 500) {
    return send(req, res, 400, { error: 'Please check the gift details.' });
  }
  const suppliedId = String(data.requestId || '');
  const requestId = /^[A-Za-z0-9-]{16,100}$/.test(suppliedId)
    ? suppliedId
    : (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, action: 'gift_submit', requestId, name, amount, method, message }),
      redirect: 'follow',
      signal: AbortSignal.timeout(25000)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error('Gift record unavailable');
    return send(req, res, 200, { ok: true, status: 'Unconfirmed', duplicate: Boolean(result.duplicate) });
  } catch (error) {
    console.error('Gift record failed:', error.message);
    return send(req, res, 502, { error: 'Could not record your gift note.' });
  }
};
