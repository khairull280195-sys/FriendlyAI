async function requireUser(req){
  const h=req.headers.authorization||"";
  if(!h.startsWith("Bearer "))return null;
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return null;
  const r=await fetch(url+"/auth/v1/user",{headers:{apikey:key,Authorization:h}});
  if(!r.ok)return null;
  return await r.json();
}

async function useQuota(req,kind,limit){
  const h=req.headers.authorization||"";
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
  const r=await fetch(url+"/rest/v1/rpc/use_daily_quota",{
    method:"POST",
    headers:{apikey:key,Authorization:h,"Content-Type":"application/json"},
    body:JSON.stringify({p_kind:kind,p_limit:limit})
  });
  if(!r.ok)return false;
  return await r.json()===true;
}

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const user=await requireUser(req);
  if(!user?.id)return res.status(401).json({error:"Please sign in again."});

  try{
    const {image,prompt}=req.body||{};
    if(!image||!prompt)return res.status(400).json({error:"Image and edit instruction are required"});

    const isSuperUser=(user.email||"").toLowerCase()==="khairull280195@gmail.com";
    if(!isSuperUser&&!await useQuota(req,"image",2)){
      return res.status(429).json({error:"You have reached today’s limit of 2 image edits. Please try again tomorrow."});
    }

    const r=await fetch("https://friendlai-image.khairull280195.workers.dev/",{
      method:"POST",
      headers:{"Content-Type":"application/json","X-FriendlyAI-Secret":process.env.IMAGE_WORKER_SECRET||""},
      body:JSON.stringify({image,prompt})
    });

    const type=r.headers.get("content-type")||"";
    if(type.includes("application/json")){
      const data=await r.json();
      if(!r.ok)return res.status(r.status).json({error:data.error||"Image editing is temporarily unavailable."});
      if(data.image)return res.status(200).json({image:data.image});
      return res.status(500).json({error:"Cloudflare did not return an edited image."});
    }

    if(!r.ok)return res.status(r.status).json({error:"Image editing is temporarily unavailable."});
    const buf=Buffer.from(await r.arrayBuffer());
    return res.status(200).json({image:"data:"+type+";base64,"+buf.toString("base64")});
  }catch(e){
    return res.status(500).json({error:"Image editing is temporarily unavailable. Please try again later."});
  }
}
