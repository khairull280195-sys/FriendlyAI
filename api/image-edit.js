import { InferenceClient } from "@huggingface/inference";

async function requireUser(req){const h=req.headers.authorization||"";if(!h.startsWith("Bearer "))return null;const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;if(!url||!key)return null;const r=await fetch(url+"/auth/v1/user",{headers:{apikey:key,Authorization:h}});if(!r.ok)return null;return await r.json()}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  const user=await requireUser(req);if(!user?.id)return res.status(401).json({error:"Please sign in again."});
  const token=process.env.HF_TOKEN;
  if(!token) return res.status(500).json({error:"HF_TOKEN is not configured"});
  try{
    const {image,prompt}=req.body||{};
    if(!image||!prompt) return res.status(400).json({error:"Image and edit instruction are required"});
    const base64=image.includes(",")?image.split(",")[1]:image;
    const bytes=Buffer.from(base64,"base64");
    const client=new InferenceClient(token);
    const output=await client.imageToImage({
      provider:"fal-ai",
      model:"black-forest-labs/FLUX.2-dev",
      inputs:new Blob([bytes],{type:"image/jpeg"}),
      parameters:{prompt}
    });
    const buf=Buffer.from(await output.arrayBuffer());
    const type=output.type||"image/jpeg";
    return res.status(200).json({image:"data:"+type+";base64,"+buf.toString("base64")});
  }catch(e){
    const msg=e?.message||String(e);
    return res.status(500).json({error:"Image editing failed: "+msg.slice(0,500)});
  }
}