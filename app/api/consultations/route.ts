import { env } from "cloudflare:workers";
export async function POST(request:Request){
 try{
  if(Number(request.headers.get("content-length")||0)>4000)return Response.json({error:"Request too large"},{status:413});
  const body=await request.json() as Record<string,unknown>;
  const read=(key:string,max:number)=>typeof body[key]==="string"?(body[key] as string).trim().slice(0,max):"";
  if(read("website",100))return Response.json({ok:true});
  const name=read("name",100),email=read("email",180),phone=read("phone",30),service=read("service",80),message=read("message",500);
  const allowed=["Individual tax preparation","Business tax filing","Tax planning","IRS notice help","Not sure yet"];
  if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||phone.length<7||!allowed.includes(service))return Response.json({error:"Please check the required fields."},{status:400});
  if(!env.DB)throw Error("Database unavailable");
  await env.DB.prepare("INSERT INTO consultations (name,email,phone,service,message) VALUES (?,?,?,?,?)").bind(name,email,phone,service,message).run();
  return Response.json({ok:true},{status:201});
 }catch(error){console.error("Consultation request failed",error);return Response.json({error:"Unable to save the request."},{status:503})}
}
