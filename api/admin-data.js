const {loggedIn,send}=require('./_admin-auth');
module.exports=async function(req,res){
  if(req.method!=='GET') return send(req,res,405,{error:'Method not allowed'});
  if(!loggedIn(req)) return send(req,res,401,{error:'Login required'});
  const url=process.env.GOOGLE_APPS_SCRIPT_URL;
  const secret=process.env.RSVP_SHARED_SECRET;
  if(!url||!secret) return send(req,res,503,{error:'RSVP backend not configured'});
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url))
    return send(req,res,503,{error:'Invalid backend URL'});
  try{
    const response=await fetch(url,{
      method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({secret,action:'dashboard_read'}),
      redirect:'follow',signal:AbortSignal.timeout(25000)
    });
    if(!response.ok)throw Error('upstream HTTP '+response.status);
    const result=await response.json();
    if(!result.ok)throw Error('upstream '+String(result.code||'failed').replace(/[^A-Z_]/g,''));
    return send(req,res,200,{ok:true,stats:result.stats,guests:result.guests});
  }catch(err){
    console.error('Admin data fetch failed:',err.message);
    return send(req,res,502,{error:'Unable to load guest records. Please retry.'});
  }
};