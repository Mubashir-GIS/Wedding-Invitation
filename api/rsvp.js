module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const url = process.env.GOOGLE_APPS_SCRIPT_URL;
  const secret = process.env.RSVP_SHARED_SECRET;
  if (!url || !secret) return res.status(503).json({ error: 'RSVP service is being configured. Please try again soon.' });
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) {
    return res.status(503).json({ error: 'RSVP service is not configured correctly.' });
  }

  let data;
  try {
    data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid body');
  } catch (_) { return res.status(400).json({ error: 'Invalid RSVP data.' }); }

  const name = String(data.name || '').trim();
  const attending = String(data.attending || '').trim().toLowerCase();
  const plusOne = String(data.plusOne || '').trim();
  const requests = String(data.requests || '').trim();
  if (name.length < 2 || name.length > 120 || !['yes', 'no'].includes(attending) ||
      !plusOne || plusOne.length > 120 || requests.length > 1000) {
    return res.status(400).json({ error: 'Please check your name, RSVP choice, plus-one and message.' });
  }

  const suppliedId = String(data.requestId || '');
  const requestId = /^[A-Za-z0-9-]{16,100}$/.test(suppliedId)
    ? suppliedId
    : (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  // The server is the source of truth for headcount. A declined invitation is always zero.
  const guests = attending === 'no' ? 0 : (plusOne.toLowerCase() === 'none' ? 1 : 2);

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, requestId, name, attending, guests, plusOne, requests }),
      signal: AbortSignal.timeout(25000),
      redirect: 'follow'
    });
    let result;
    try { result = await upstream.json(); }
    catch (_) { throw new Error(`Apps Script returned non-JSON (${upstream.status})`); }
    if (!upstream.ok || !result.ok) {
      if (result.code === 'VALIDATION') return res.status(400).json({ error: 'Please check your RSVP details.' });
      throw new Error(`Apps Script ${String(result.code || upstream.status || 'failed').replace(/[^A-Z_0-9]/gi, '')}`);
    }
    return res.status(200).json({ ok: true, message: 'RSVP saved successfully.', duplicate: Boolean(result.duplicate) });
  } catch (error) {
    console.error('RSVP submission failed:', error.message);
    return res.status(502).json({ error: 'Could not save your RSVP right now. Please try again shortly.' });
  }
};
