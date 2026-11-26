const {loggedIn,validOrigin,send}=require('../lib/admin-auth');
module.exports=async function(req,res){
 if(req.method!=='PATCH')return send(req,res,405,{error:'Method not allowed'});
 if(!validOrigin(req))return send(req,res,403,{error:'Invalid request origin'});
 if(!loggedIn(req))return send(req,res,401,{error:'Login required'});
 const url=process.env.GOOGLE_APPS_SCRIPT_URL,secret=process.env.RSVP_SHARED_SECRET;
 if(!url||!secret)return send(req,res,503,{error:'Gift backend not configured'});
 let data;try{data=typeof req.body==='string'?JSON.parse(req.body):req.body||{}}catch{return send(req,res,400,{error:'Invalid gift status'})}
 const id=String(data.id||'').trim();
 if(!id||id.length>100||!['Received','Unconfirmed'].includes(data.status))return send(req,res,400,{error:'Invalid gift status'});
 try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({secret,action:'gift_status',id,status:data.status}),redirect:'follow',signal:AbortSignal.timeout(25000)});const result=await response.json();if(!response.ok||!result.ok)throw Error('Gift status update failed');return send(req,res,200,{ok:true})}
 catch(error){console.error('Gift status update failed:',error.message);return send(req,res,502,{error:'Unable to update gift status'})}
};
