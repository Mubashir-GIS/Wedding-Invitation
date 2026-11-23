const {validOrigin,logoutCookie,send}=require('../lib/admin-auth');
module.exports=async function(req,res){
  if(req.method!=='POST')return send(req,res,405,{error:'Method not allowed'});
  if(!validOrigin(req))return send(req,res,403,{error:'Invalid origin'});
  res.setHeader('Set-Cookie',logoutCookie());
  return send(req,res,200,{ok:true});
};