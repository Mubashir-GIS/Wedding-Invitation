const {send}=require('../lib/admin-auth');
module.exports=async function(req,res){
 if(req.method!=='POST')return send(req,res,405,{error:'Method not allowed'});
 const url=process.env.GOOGLE_APPS_SCRIPT_URL,secret=process.env.RSVP_SHARED_SECRET;
 if(!url||!secret)return send(req,res,503,{error:'Gift recording is not configured.'});
 let data;try{data=typeof req.body==='string'?JSON.parse(req.body):req.body||{}}catch{return send(req,res,400,{error:'Invalid gift details.'})}
 const name=String(data.name||'').trim(),amount=Number(data.amount),method=String(data.method||''),message=String(data.message||'').trim();
 if(name.length<2||name.length>120||!Number.isFinite(amount)||amount<1||amount>100000||!['venmo','cashapp','zelle','other'].includes(method)||message.length>500)return send(req,res,400,{error:'Please check the gift details.'});
 const requestId=globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2);
 try{const upstream=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({secret,action:'gift_submit',requestId,name,amount,method,message}),redirect:'follow',signal:AbortSignal.timeout(25000)});const result=await upstream.json();if(!upstream.ok||!result.ok)throw Error('Gift record unavailable');return send(req,res,200,{ok:true,message:'Gift note saved as unconfirmed.'})}
 catch(error){console.error('Gift record failed:',error.message);return send(req,res,502,{error:'Could not record your gift note.'})}
};
