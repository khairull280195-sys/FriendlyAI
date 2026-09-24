async function requireUser(req){const h=req.headers.authorization||"";if(!h.startsWith("Bearer "))return null;const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;if(!url||!key)return null;const r=await fetch(url+"/auth/v1/user",{headers:{apikey:key,Authorization:h}});if(!r.ok)return null;return await r.json()}
async function useQuota(req,kind,limit){const h=req.headers.authorization||"";const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;const r=await fetch(url+"/rest/v1/rpc/use_daily_quota",{method:"POST",headers:{apikey:key,Authorization:h,"Content-Type":"application/json"},body:JSON.stringify({p_kind:kind,p_limit:limit})});if(!r.ok)return false;return await r.json()===true}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const user=await requireUser(req);
  if(!user?.id)return res.status(401).json({error:"Please sign in again."});
  if(!await useQuota(req,"chat",50))return res.status(429).json({error:"You have reached today’s limit of 50 AI messages. Please try again tomorrow."});
  try{
    const incoming=(req.body.messages||[]).slice(-20);
    const imageIndex=incoming.map(m=>!!m.image).lastIndexOf(true);

    // Keep using the most recent image for follow-up questions in the same chat.
    if(imageIndex!==-1){
      const workerUrl=process.env.VISION_WORKER_URL,secret=process.env.VISION_SECRET;
      if(!workerUrl||!secret)return res.status(500).json({error:"Vision service is not configured"});
      const imageMessage=incoming[imageIndex];
      const afterImage=incoming.slice(imageIndex);
      const latestUser=[...afterImage].reverse().find(m=>m.role==="user");
      const context=afterImage.filter(m=>!m.image).slice(-8).map(m=>`${m.role==="assistant"?"Assistant":"User"}: ${m.content||""}`).join("\n");
      const prompt=`${latestUser?.content||imageMessage.content||"Describe and analyze this image clearly."}${context?"\n\nRecent conversation about this image:\n"+context:""}`;
      let visionImage=imageMessage.image;
      if(visionImage?.startsWith("storage:")){
        const storagePath=visionImage.slice(8);
        const supabaseUrl=process.env.SUPABASE_URL;
        const supabaseKey=process.env.SUPABASE_PUBLISHABLE_KEY;
        const h=req.headers.authorization||"";
        const ir=await fetch(supabaseUrl+"/storage/v1/object/authenticated/chat-images/"+storagePath,{headers:{apikey:supabaseKey,Authorization:h}});
        if(!ir.ok)return res.status(502).json({error:"Could not reload the saved image"});
        const mime=ir.headers.get("content-type")||"image/jpeg";
        const bytes=new Uint8Array(await ir.arrayBuffer());
        let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
        visionImage=`data:${mime};base64,${btoa(binary)}`;
      }else if(/^https?:\/\//i.test(visionImage)){
        const ir=await fetch(visionImage);
        if(!ir.ok)return res.status(502).json({error:"Could not reload the previous image"});
        const mime=ir.headers.get("content-type")||"image/jpeg";
        const bytes=new Uint8Array(await ir.arrayBuffer());
        let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
        visionImage=`data:${mime};base64,${btoa(binary)}`;
      }
      const r=await fetch(workerUrl,{method:"POST",headers:{Authorization:"Bearer "+secret,"Content-Type":"application/json"},body:JSON.stringify({image:visionImage,prompt})});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)return res.status(r.status).json({error:data.error||"Vision provider error"});
      const result=typeof data.result==="string"?data.result:(data.result?.response||data.response||JSON.stringify(data.result||data));
      res.setHeader("Content-Type","text/plain; charset=utf-8");
      res.setHeader("Cache-Control","no-cache, no-transform");
      return res.end(result||"I could not analyze that image.");
    }

    // Text chat also uses the Cloudflare Worker, so FriendlyAI no longer depends on HF credits.
    const workerUrl=process.env.VISION_WORKER_URL,secret=process.env.VISION_SECRET;
    if(!workerUrl||!secret)return res.status(500).json({error:"AI service is not configured"});
    const transcript=incoming.slice(-16).map(m=>`${m.role==="assistant"?"Assistant":"User"}: ${m.content||""}`).join("\n");
    const prompt=`You are FriendlyAI, a helpful friendly general-purpose assistant. Reply naturally in the user's language. Understand English, Malay and Brunei Malay. Be clear, useful and concise. Continue this conversation and answer the latest user message.\n\n${transcript}`;
    // The current Cloudflare worker expects an image on every request. For text-only chat,
    // send a tiny transparent PNG so the worker can use the same AI route without HF.
    const blankImage="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const r=await fetch(workerUrl,{method:"POST",headers:{Authorization:"Bearer "+secret,"Content-Type":"application/json"},body:JSON.stringify({image:blankImage,prompt})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)return res.status(r.status).json({error:data.error||"AI provider error"});
    const result=typeof data.result==="string"?data.result:(data.result?.response||data.response||JSON.stringify(data.result||data));
    res.setHeader("Content-Type","text/plain; charset=utf-8");
    res.setHeader("Cache-Control","no-cache, no-transform");
    return res.end(result||"FriendlyAI could not answer right now.");
  }catch(e){if(!res.headersSent)return res.status(500).json({error:"FriendlyAI backend error"});res.end()}
}