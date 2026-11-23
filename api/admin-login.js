const {constantEqual,validOrigin,loginCookie,send}=require('../lib/admin-auth');
module.exports=async function(req,res){
  if(req.method!=='POST') return send(req,res,405,{error:'Method not allowed'});
  if(!validOrigin(req)) return send(req,res,403,{error:'Invalid request origin'});
  const expected=process.env.ADMIN_PASSWORD;
  const sessionSecret=process.env.ADMIN_SESSION_SECRET;
  if(!expected || expected.length<16 || !sessionSecret || sessionSecret.length<32)
    return send(req,res,503,{error:'Admin login not configured'});
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{};
  const password=String(body.password||'');
  if(password.length>256 || !constantEqual(password,expected)) return send(req,res,401,{error:'Incorrect password'});
  res.setHeader('Set-Cookie',loginCookie(req));
  return send(req,res,200,{ok:true});
};