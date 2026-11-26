/**
 * Google Sheets RSVP backend for the Kateryna & Dalton wedding site.
 * Run setupRSVP() once from the linked spreadsheet, then deploy as a Web App.
 * Existing legacy Email / Meal Preference columns are left intact so setup
 * never deletes or shifts guest data. New submissions do not use those fields.
 */
const TAB_NAME = 'Wedding RSVPs';
const HEADERS = [
  'Submitted At', 'Submission ID', 'Full Name', 'Attending',
  'Number of Guests', 'Plus-One Name', 'Special Requests'
];
const GIFT_TAB = 'Honeymoon Gifts';
const GIFT_HEADERS = [
  'Submitted At', 'Gift ID', 'Guest Name', 'Amount', 'Currency',
  'Payment Method', 'Message', 'Status'
];

function setupRSVP() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from Google Sheets > Extensions > Apps Script.');
  const sheet = ensureSheet_(ss, TAB_NAME, HEADERS);
  const giftSheet = ensureSheet_(ss, GIFT_TAB, GIFT_HEADERS);
  sheet.setFrozenRows(1);
  giftSheet.setFrozenRows(1);

  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());
  if (!props.getProperty('RSVP_SHARED_SECRET')) {
    props.setProperty('RSVP_SHARED_SECRET', [Utilities.getUuid(), Utilities.getUuid()].join('-'));
  }
  Logger.log('Google Sheet ready: ' + ss.getUrl());
  Logger.log('Copy RSVP_SHARED_SECRET to the matching Vercel environment variable.');
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    return sheet;
  }
  const present = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn()))
    .getDisplayValues()[0].map(normalizeHeader_);
  headers.forEach(function (header) {
    if (present.indexOf(normalizeHeader_(header)) !== -1) return;
    const column = sheet.getLastColumn() + 1;
    sheet.getRange(1, column).setValue(header).setFontWeight('bold');
    present.push(normalizeHeader_(header));
  });
  return sheet;
}

function doGet() {
  const props = PropertiesService.getScriptProperties();
  return json_({
    ok: true,
    service: 'Wedding RSVP backend',
    configured: Boolean(props.getProperty('SPREADSHEET_ID'))
  });
}

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  let data;
  try { data = JSON.parse(e && e.postData && e.postData.contents || '{}'); }
  catch (_) { return json_({ ok: false, code: 'VALIDATION' }); }
  const expectedSecret = props.getProperty('RSVP_SHARED_SECRET');
  if (!expectedSecret || String(data.secret || '') !== expectedSecret) {
    return json_({ ok: false, code: 'UNAUTHORIZED' });
  }

  if (data.action === 'dashboard_read') return dashboardRead_(props);
  if (data.action === 'gift_submit') return submitGift_(props, data);
  if (data.action === 'gift_status') return updateGiftStatus_(props, data);
  if (data.action === 'rsvp_delete') return deleteRsvp_(props, data);
  return submitRsvp_(props, data);
}

function submitRsvp_(props, data) {
  const name = String(data.name || '').trim();
  const attending = String(data.attending || '').trim().toLowerCase();
  const plusOne = String(data.plusOne || '').trim();
  const requests = String(data.requests || '').trim();
  const submissionId = String(data.requestId || '').trim();
  if (!/^[A-Za-z0-9-]{16,100}$/.test(submissionId) || name.length < 2 || name.length > 120 ||
      ['yes', 'no'].indexOf(attending) === -1 || !plusOne || plusOne.length > 120 || requests.length > 1000) {
    return json_({ ok: false, code: 'VALIDATION' });
  }
  // Count on the server; never trust a browser-supplied guest total.
  const guests = attending === 'no' ? 0 : (plusOne.toLowerCase() === 'none' ? 1 : 2);
  const sheet = getSheet_(props, TAB_NAME, HEADERS);
  if (!sheet) return json_({ ok: false, code: 'NOT_CONFIGURED' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return json_({ ok: false, code: 'BUSY' });
  try {
    const schema = schema_(sheet);
    const idColumn = schema.columns['submission id'];
    const lastRow = sheet.getLastRow();
    if (lastRow > 1 && findId_(sheet, idColumn, lastRow, submissionId)) {
      return json_({ ok: true, duplicate: true });
    }
    appendByHeader_(sheet, schema, {
      'submitted at': new Date(),
      'submission id': safeCell_(submissionId),
      'full name': safeCell_(name),
      'attending': attending === 'yes' ? 'Accepts' : 'Declines',
      'number of guests': guests,
      'plus-one name': safeCell_(plusOne),
      'special requests': safeCell_(requests)
    });
    return json_({ ok: true, guests: guests });
  } catch (error) {
    console.error('Sheet RSVP write failed: ' + error.message);
    return json_({ ok: false, code: 'SAVE_FAILED' });
  } finally { lock.releaseLock(); }
}

function dashboardRead_(props) {
  const ss = openSpreadsheet_(props);
  if (!ss) return json_({ ok: false, code: 'NOT_CONFIGURED' });
  const sheet = ensureSheet_(ss, TAB_NAME, HEADERS);
  const giftSheet = ensureSheet_(ss, GIFT_TAB, GIFT_HEADERS);
  if (sheet.getLastRow() < 2) return json_({ ok: true, guests: [], gifts: [], stats: emptyStats_() });
  const schema = schema_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const guests = values.map(function (row) {
    const id = String(value_(row, schema, 'submission id') || '').trim();
    if (!id) return null;
    const attending = accepted_(value_(row, schema, 'attending'));
    const plusOne = String(value_(row, schema, 'plus-one name') || '').trim() || 'None';
    const count = attending ? (plusOne.toLowerCase() === 'none' ? 1 : 2) : 0;
    return {
      id: id,
      submittedAt: value_(row, schema, 'submitted at') || '',
      name: String(value_(row, schema, 'full name') || ''),
      attending: attending ? 'Accepts' : 'Declines',
      guests: count,
      plusOne: plusOne,
      requests: String(value_(row, schema, 'special requests') || '')
    };
  }).filter(Boolean);

  const gifts = giftSheet && giftSheet.getLastRow() > 1 ? readGifts_(giftSheet) : [];
  const stats = guests.reduce(function (result, guest) {
    result.totalResponses += 1;
    if (guest.attending === 'Accepts') result.accepted += 1;
    else result.declined += 1;
    result.expectedGuests += guest.guests;
    return result;
  }, emptyStats_());
  return json_({ ok: true, guests: guests, gifts: gifts, stats: stats });
}

function readGifts_(sheet) {
  const schema = schema_(sheet);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return rows.map(function (row) {
    const id = String(value_(row, schema, 'gift id') || '').trim();
    if (!id) return null;
    return {
      submittedAt: value_(row, schema, 'submitted at') || '',
      id: id,
      name: String(value_(row, schema, 'guest name') || ''),
      amount: Number(value_(row, schema, 'amount')) || 0,
      currency: String(value_(row, schema, 'currency') || 'USD'),
      method: String(value_(row, schema, 'payment method') || ''),
      message: String(value_(row, schema, 'message') || ''),
      status: String(value_(row, schema, 'status') || 'Unconfirmed')
    };
  }).filter(Boolean);
}

function submitGift_(props, data) {
  const id = String(data.requestId || '').trim();
  const name = String(data.name || '').trim();
  const amount = Number(data.amount);
  const method = String(data.method || '').trim().toLowerCase();
  const message = String(data.message || '').trim();
  if (!/^[A-Za-z0-9-]{16,100}$/.test(id) || name.length < 2 || name.length > 120 ||
      !Number.isFinite(amount) || amount < 1 || amount > 100000 ||
      ['venmo', 'cashapp', 'zelle', 'other'].indexOf(method) === -1 || message.length > 500) {
    return json_({ ok: false, code: 'VALIDATION' });
  }
  const sheet = getSheet_(props, GIFT_TAB, GIFT_HEADERS);
  if (!sheet) return json_({ ok: false, code: 'NOT_CONFIGURED' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return json_({ ok: false, code: 'BUSY' });
  try {
    const schema = schema_(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow > 1 && findId_(sheet, schema.columns['gift id'], lastRow, id)) {
      return json_({ ok: true, duplicate: true });
    }
    appendByHeader_(sheet, schema, {
      'submitted at': new Date(), 'gift id': safeCell_(id), 'guest name': safeCell_(name),
      'amount': amount, 'currency': 'USD', 'payment method': method,
      'message': safeCell_(message), 'status': 'Unconfirmed'
    });
    return json_({ ok: true, status: 'Unconfirmed' });
  } catch (error) {
    console.error('Gift write failed: ' + error.message);
    return json_({ ok: false, code: 'SAVE_FAILED' });
  } finally { lock.releaseLock(); }
}

function updateGiftStatus_(props, data) {
  const id = String(data.id || '').trim();
  const status = String(data.status || '');
  if (!id || id.length > 100 || ['Received', 'Unconfirmed'].indexOf(status) === -1) {
    return json_({ ok: false, code: 'VALIDATION' });
  }
  const sheet = getSheet_(props, GIFT_TAB, GIFT_HEADERS);
  if (!sheet) return json_({ ok: false, code: 'NOT_CONFIGURED' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return json_({ ok: false, code: 'BUSY' });
  try {
    const schema = schema_(sheet);
    const cell = findId_(sheet, schema.columns['gift id'], sheet.getLastRow(), id);
    if (!cell) return json_({ ok: false, code: 'NOT_FOUND' });
    sheet.getRange(cell.getRow(), schema.columns.status).setValue(status);
    return json_({ ok: true });
  } finally { lock.releaseLock(); }
}

function deleteRsvp_(props, data) {
  const id = String(data.id || '').trim();
  if (!id || id.length > 100) return json_({ ok: false, code: 'VALIDATION' });
  const sheet = getSheet_(props, TAB_NAME, HEADERS);
  if (!sheet) return json_({ ok: false, code: 'NOT_CONFIGURED' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return json_({ ok: false, code: 'BUSY' });
  try {
    const schema = schema_(sheet);
    const cell = findId_(sheet, schema.columns['submission id'], sheet.getLastRow(), id);
    if (!cell) return json_({ ok: false, code: 'NOT_FOUND' });
    sheet.deleteRow(cell.getRow());
    return json_({ ok: true });
  } finally { lock.releaseLock(); }
}

function getSheet_(props, name, headers) {
  const ss = openSpreadsheet_(props);
  if (!ss) return null;
  return ensureSheet_(ss, name, headers);
}

function openSpreadsheet_(props) {
  const id = props.getProperty('SPREADSHEET_ID');
  if (!id) return null;
  try { return SpreadsheetApp.openById(id); }
  catch (error) { console.error('Cannot open configured RSVP spreadsheet: ' + error.message); return null; }
}

function schema_(sheet) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const columns = {};
  headers.forEach(function (header, index) {
    const key = normalizeHeader_(header);
    if (key) columns[key] = index + 1;
  });
  return { columns: columns, length: lastColumn };
}

function appendByHeader_(sheet, schema, values) {
  const row = new Array(schema.length).fill('');
  Object.keys(values).forEach(function (header) {
    const column = schema.columns[header];
    if (!column) throw new Error('Missing sheet column: ' + header);
    row[column - 1] = values[header];
  });
  sheet.appendRow(row);
}

function value_(row, schema, header) {
  const column = schema.columns[header];
  return column ? row[column - 1] : '';
}

function findId_(sheet, column, lastRow, id) {
  if (!column || lastRow < 2) return null;
  return sheet.getRange(2, column, lastRow - 1, 1)
    .createTextFinder(id).matchEntireCell(true).findNext();
}

function normalizeHeader_(value) { return String(value || '').trim().toLowerCase(); }
function accepted_(value) {
  return ['accepts', 'accepted', 'yes', 'joyfully accepts', 'attending'].indexOf(
    String(value || '').trim().toLowerCase()
  ) !== -1;
}
function emptyStats_() { return { totalResponses: 0, accepted: 0, declined: 0, expectedGuests: 0 }; }
function safeCell_(value) {
  const text = String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim();
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
function json_(object) {
  return ContentService.createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}
