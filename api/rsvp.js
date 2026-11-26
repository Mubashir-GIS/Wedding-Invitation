module.exports = async function handler(req, res) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed.'});}
  const url=process.env.GOOGLE_APPS_SCRIPT_URL,secret=process.env.RSVP_SHARED_SECRET;
  if(!url||!secret)return res.status(503).json({error:'RSVP service is being configured. Please try again soon.'});
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url))return res.status(503).json({error:'RSVP service is not configured correctly.'});
  let data;try{data=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!data||typeof data!=='object'||Array.isArray(data))throw Error();}catch{return res.status(400).json({error:'Invalid RSVP data.'});}
  const name=String(data.name||'').trim(),attending=String(data.attending||''),plusOne=String(data.plusOne||'').trim(),requests=String(data.requests||'').trim();
  const guests=attending==='yes'?(plusOne.toLowerCase()==='none'?1:2):0;
  if(name.length<2||name.length>120||!['yes','no'].includes(attending)||!plusOne||plusOne.length>120||requests.length>1000)return res.status(400).json({error:'Please check your name, RSVP choice, plus-one and message.'});
  const supplied=String(data.requestId||''),requestId=/^[A-Za-z0-9-]{16,100}$/.test(supplied)?supplied:(globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2));
  try{const upstream=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({secret,requestId,name,email:'',attending,guests,plusOne,meal:'',requests}),signal:AbortSignal.timeout(25000),redirect:'follow'});if(!upstream.ok)throw Error('Apps Script HTTP '+upstream.status);const result=await upstream.json();if(!result.ok){if(result.code==='VALIDATION')return res.status(400).json({error:'Please check your RSVP details.'});throw Error('Apps Script '+String(result.code||'failed').replace(/[^A-Z_]/g,''));}return res.status(200).json({ok:true,message:'RSVP saved successfully.'});}
  catch(error){console.error('RSVP submission failed:',error.message);return res.status(502).json({error:'Could not save your RSVP right now. Please try again shortly.'});}
};