/**
 * Google Sheets RSVP backend. Open a Sheet → Extensions → Apps Script,
 * paste this source, run setupRSVP once, then deploy a Web App.
 */
const TAB_NAME = 'Wedding RSVPs';
const HEADERS = ['Submitted At', 'Submission ID', 'Full Name', 'Email', 'Attending', 'Number of Guests', 'Plus-One Name', 'Meal Preference', 'Special Requests'];

function setupRSVP() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Create Apps Script from Google Sheets > Extensions > Apps Script.');
  let sheet = ss.getSheetByName(TAB_NAME);
  if (!sheet) sheet = ss.insertSheet(TAB_NAME);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());
  if (!props.getProperty('RSVP_SHARED_SECRET')) {
    props.setProperty('RSVP_SHARED_SECRET', [Utilities.getUuid(), Utilities.getUuid()].join('-'));
  }
  Logger.log('Google Sheet ready: ' + ss.getUrl());
  Logger.log('Secret location: Project Settings > Script Properties > RSVP_SHARED_SECRET (never make it public).');
}

function doGet() {
  return json_({ ok: true, service: 'Wedding RSVP backend', configured: Boolean(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')) });
}

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  let data;
  try { data = JSON.parse(e.postData.contents || '{}'); }
  catch (_) { return json_({ ok: false, code: 'VALIDATION' }); }
  if (!props.getProperty('RSVP_SHARED_SECRET') ||
      String(data.secret || '') !== props.getProperty('RSVP_SHARED_SECRET')) {
    return json_({ ok: false, code: 'UNAUTHORIZED' });
  }
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim();
  const attending = String(data.attending || '');
  const guests = attending === 'yes' ? Number(data.guests) : 0;
  const plusOne = attending === 'yes' ? String(data.plusOne || '').trim() : '';
  const meal = attending === 'yes' ? String(data.meal || '').trim() : '';
  const requests = String(data.requests || '').trim();
  const submissionId = String(data.requestId || '').trim().slice(0, 100);
  if (!submissionId || name.length < 2 || name.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 ||
      ['yes', 'no'].indexOf(attending) === -1 ||
      (attending === 'yes' && (!Number.isInteger(guests) || guests < 1 || guests > 6)) ||
      plusOne.length > 120 || meal.length > 60 || requests.length > 1000) {
    return json_({ ok: false, code: 'VALIDATION' });
  }
  const id = props.getProperty('SPREADSHEET_ID');
  if (!id) return json_({ ok: false, code: 'NOT_CONFIGURED' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return json_({ ok: false, code: 'BUSY' });
  try {
    const sheet = SpreadsheetApp.openById(id).getSheetByName(TAB_NAME);
    if (!sheet) return json_({ ok: false, code: 'NOT_CONFIGURED' });
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const existing = sheet.getRange(2, 2, lastRow - 1, 1)
        .createTextFinder(submissionId).matchEntireCell(true).findNext();
      if (existing) return json_({ ok: true, duplicate: true });
    }
    sheet.appendRow([new Date(), submissionId, safeCell_(name), safeCell_(email),
      attending === 'yes' ? 'Accepts' : 'Declines', guests, safeCell_(plusOne),
      safeCell_(meal), safeCell_(requests)]);
    return json_({ ok: true });
  } catch (error) {
    console.error('Sheet write failed: ' + error.message);
    return json_({ ok: false, code: 'SAVE_FAILED' });
  } finally { lock.releaseLock(); }
}
function safeCell_(value) {
  const s = String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim();
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function json_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}