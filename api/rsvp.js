// Vercel Node.js Function. The browser calls /api/rsvp on the same domain.
// Configure GOOGLE_APPS_SCRIPT_URL and RSVP_SHARED_SECRET in Vercel settings.
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const url = process.env.GOOGLE_APPS_SCRIPT_URL;
  const secret = process.env.RSVP_SHARED_SECRET;
  if (!url || !secret) {
    return res.status(503).json({ error: 'RSVP service is being configured. Please try again soon.' });
  }
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url)) {
    return res.status(503).json({ error: 'RSVP service is not configured correctly.' });
  }
  let data;
  try {
    data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid data');
  } catch (_) {
    return res.status(400).json({ error: 'Invalid RSVP data.' });
  }
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim();
  const attending = String(data.attending || '');
  const guests = attending === 'yes' ? Number(data.guests) : 0;
  const plusOne = attending === 'yes' ? String(data.plusOne || '').trim() : '';
  const meal = attending === 'yes' ? String(data.meal || '').trim() : '';
  const requests = String(data.requests || '').trim();
  if (name.length < 2 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 || !['yes','no'].includes(attending) ||
      (attending === 'yes' && (!Number.isInteger(guests) || guests < 1 || guests > 6)) ||
      plusOne.length > 120 || meal.length > 60 || requests.length > 1000) {
    return res.status(400).json({ error: 'Please check your name, email and RSVP details.' });
  }
  const requestId = (globalThis.crypto && globalThis.crypto.randomUUID)
    ? globalThis.crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, requestId, name, email, attending, guests, plusOne, meal, requests }),
      signal: AbortSignal.timeout(25000),
      redirect: 'follow'
    });
    if (!response.ok) throw Error('Google Apps Script HTTP ' + response.status);
    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); } catch (_) { throw Error('Non-JSON response from Google Apps Script'); }
    if (!result.ok) {
      if (result.code === 'VALIDATION') return res.status(400).json({ error: 'Please check your RSVP details.' });
      throw Error('Apps Script rejected RSVP');
    }
    return res.status(200).json({ ok: true, message: 'RSVP saved successfully.' });
  } catch (error) {
    console.error('RSVP submission failed:', error.message);
    return res.status(502).json({ error: 'Could not save your RSVP right now. Please try again shortly.' });
  }
};