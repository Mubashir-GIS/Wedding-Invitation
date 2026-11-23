const crypto = require('crypto');
const COOKIE = 'wedding_admin_session';
const DURATION = 8 * 60 * 60 * 1000;
function sign(value) {
  return crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET || '')
    .update(value).digest('hex');
}
function constantEqual(a, b) {
  const aHash=crypto.createHash('sha256').update(String(a)).digest();
  const bHash=crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(aHash,bHash);
}
function validOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const base = 'https://' + req.headers.host;
    return new URL(origin).origin === base;
  } catch { return false; }
}
function loggedIn(req) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';')
    .map(p=>p.trim().split('=').map(decodeURIComponent)).filter(p=>p.length===2));
  const token=cookies[COOKIE] || '';
  const parts=token.split('.');
  if(parts.length!==2 || !process.env.ADMIN_SESSION_SECRET || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1])) return false;
  const expires=Number(parts[0]);
  return expires > Date.now() && expires <= Date.now()+DURATION && constantEqual(parts[1],sign(parts[0]));
}
function loginCookie(req) {
  const expires=String(Date.now()+DURATION);
  return COOKIE+'='+expires+'.'+sign(expires)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800';
}
function logoutCookie(){return COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';}
function send(req,res,code,payload){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store, private');
  return res.status(code).json(payload);
}
module.exports={constantEqual,validOrigin,loggedIn,loginCookie,logoutCookie,send};