/**
 * Google Sheets RSVP backend. Open a Sheet → Extensions → Apps Script,
 * paste this source, run setupRSVP once, then deploy a Web App.
 */
const TAB_NAME = 'Wedding RSVPs';
const HEADERS = ['Submitted At', 'Submission ID', 'Full Name', 'Email', 'Attending', 'Number of Guests', 'Plus-One Name', 'Meal Preference', 'Special Requests'];
const GIFT_TAB = 'Honeymoon Gifts';
const GIFT_HEADERS = ['Submitted At','Gift ID','Guest Name','Amount','Currency','Payment Method','Message','Status'];

function setupRSVP() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Create Apps Script from Google Sheets > Extensions > Apps Script.');
  let sheet = ss.getSheetByName(TAB_NAME);
  if (!sheet) sheet = ss.insertSheet(TAB_NAME);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  let giftSheet=ss.getSheetByName(GIFT_TAB);if(!giftSheet)giftSheet=ss.insertSheet(GIFT_TAB);if(giftSheet.getLastRow()===0)giftSheet.getRange(1,1,1,GIFT_HEADERS.length).setValues([GIFT_HEADERS]).setFontWeight('bold');giftSheet.setFrozenRows(1);
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
  if(data.action==='dashboard_read') return dashboardRead_(props);
  if(data.action==='gift_submit') return submitGift_(props,data);
  if(data.action==='gift_status') return updateGiftStatus_(props,data);
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim();
  const attending = String(data.attending || '');
  const guests = attending === 'yes' ? Number(data.guests) : 0;
  const plusOne = String(data.plusOne || '').trim();
  const meal = '';
  const requests = String(data.requests || '').trim();
  const submissionId = String(data.requestId || '').trim().slice(0, 100);
  if (!submissionId || name.length < 2 || name.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 ||
      ['yes', 'no'].indexOf(attending) === -1 ||
      (attending === 'yes' && (!Number.isInteger(guests) || guests < 1 || guests > 2)) ||
      !plusOne || plusOne.length > 120 || requests.length > 1000) {
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
function dashboardRead_(props){const id=props.getProperty('SPREADSHEET_ID');if(!id)return json_({ok:false,code:'NOT_CONFIGURED'});const ss=SpreadsheetApp.openById(id),sheet=ss.getSheetByName(TAB_NAME),giftSheet=ss.getSheetByName(GIFT_TAB);const rows=sheet.getDataRange().getValues();const guests=rows.slice(1).filter(r=>r[1]).map((r,i)=>({id:String(r[1]),submittedAt:r[0],name:r[2],email:r[3],attending:r[4],guests:Number(r[5])||0,plusOne:r[6],requests:r[8]}));const gifts=giftSheet?giftSheet.getDataRange().getValues().slice(1).filter(r=>r[1]).map(r=>({submittedAt:r[0],id:String(r[1]),name:r[2],amount:r[3],currency:r[4],method:r[5],message:r[6],status:r[7]})):[];return json_({ok:true,guests,gifts});}
function submitGift_(props,data){const id=String(data.requestId||''),name=String(data.name||'').trim(),amount=Number(data.amount),method=String(data.method||''),message=String(data.message||'').trim();if(!id||name.length<2||name.length>120||!Number.isFinite(amount)||amount<1||amount>100000||!['venmo','cashapp','zelle','other'].includes(method)||message.length>500)return json_({ok:false,code:'VALIDATION'});const lock=LockService.getScriptLock();if(!lock.tryLock(15000))return json_({ok:false,code:'BUSY'});try{const sh=SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')).getSheetByName(GIFT_TAB);const last=sh.getLastRow();if(last>1&&sh.getRange(2,2,last-1,1).createTextFinder(id).matchEntireCell(true).findNext())return json_({ok:true,duplicate:true});sh.appendRow([new Date(),safeCell_(id),safeCell_(name),amount,'USD',method,safeCell_(message),'Unconfirmed']);return json_({ok:true});}finally{lock.releaseLock();}}
function updateGiftStatus_(props,data){const id=String(data.id||''),status=String(data.status||'');if(!id||!['Received','Unconfirmed'].includes(status))return json_({ok:false,code:'VALIDATION'});const sh=SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')).getSheetByName(GIFT_TAB);if(!sh)return json_({ok:false,code:'NOT_CONFIGURED'});const last=sh.getLastRow();if(last<2)return json_({ok:false,code:'NOT_FOUND'});const cell=sh.getRange(2,2,last-1,1).createTextFinder(id).matchEntireCell(true).findNext();if(!cell)return json_({ok:false,code:'NOT_FOUND'});sh.getRange(cell.getRow(),8).setValue(status);return json_({ok:true});}
