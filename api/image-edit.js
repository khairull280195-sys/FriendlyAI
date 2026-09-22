import { InferenceClient } from "@huggingface/inference";

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
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