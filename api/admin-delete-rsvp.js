const { loggedIn, validOrigin, send } = require('../lib/admin-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'DELETE') return send(req, res, 405, { error: 'Method not allowed' });
  if (!validOrigin(req)) return send(req, res, 403, { error: 'Invalid request origin' });
  if (!loggedIn(req)) return send(req, res, 401, { error: 'Login required' });
  const url = process.env.GOOGLE_APPS_SCRIPT_URL;
  const secret = process.env.RSVP_SHARED_SECRET;
  if (!url || !secret) return send(req, res, 503, { error: 'RSVP backend not configured' });
  let data;
  try {
    data = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid body');
  } catch (_) { return send(req, res, 400, { error: 'Invalid RSVP identifier' }); }
  const id = String(data.id || '').trim();
  if (!id || id.length > 100) return send(req, res, 400, { error: 'Invalid RSVP identifier' });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, action: 'rsvp_delete', id }),
      redirect: 'follow',
      signal: AbortSignal.timeout(25000)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      if (result.code === 'NOT_FOUND') return send(req, res, 404, { error: 'RSVP record was not found' });
      throw new Error('Google Sheets delete failed');
    }
    return send(req, res, 200, { ok: true });
  } catch (error) {
    console.error('Admin RSVP delete failed:', error.message);
    return send(req, res, 502, { error: 'Unable to delete this RSVP. Please retry.' });
  }
};
