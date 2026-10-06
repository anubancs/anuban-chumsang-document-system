import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-push-secret","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{...cors,"Content-Type":"application/json"}});
const vaultSecret=async(admin:ReturnType<typeof createClient>,name:string)=>{
  const {data,error}=await admin.rpc("get_web_push_secret",{secret_name:name});
  if(error) throw new Error(`Vault lookup failed: ${error.message}`);
  return data??null;
};
Deno.serve(async(req)=>{
  try {
    if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
    if(req.method!=="POST") return json({error:"Method not allowed"},405);
    const url=Deno.env.get("SUPABASE_URL"),serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),anon=Deno.env.get("SUPABASE_ANON_KEY");
    if(!url||!serviceRole||!anon) return json({error:"Supabase runtime secrets are missing"},500);
    const admin=createClient(url,serviceRole);
    const internal=await vaultSecret(admin,"web_push_internal_secret");
    const isInternal=!!internal && req.headers.get("x-push-secret")===internal;
    const body=await req.json().catch(()=>null);
    if(!body?.user_id) return json({error:"user_id is required"},400);
    if(!isInternal){
      const auth=req.headers.get("Authorization");
      if(!auth?.startsWith("Bearer ")) return json({error:"Unauthorized"},401);
      const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
      const {data:{user},error}=await userClient.auth.getUser();
      if(error||!user) return json({error:"Unauthorized"},401);
      if(body.user_id!==user.id) return json({error:"Forbidden"},403);
    }
    const pub=await vaultSecret(admin,"web_push_vapid_public_key"),priv=await vaultSecret(admin,"web_push_vapid_private_key"),subject=await vaultSecret(admin,"web_push_vapid_subject");
    if(!pub||!priv) return json({error:"VAPID secrets are not configured"},503);
    const {data:subs,error}=await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id",body.user_id);
    if(error) return json({error:error.message},500);
    webpush.setVapidDetails(subject||"mailto:admin@example.com",pub,priv);
    const payload=JSON.stringify({title:body.title||"ระบบสารบรรณ",body:body.message||"มีการแจ้งเตือนใหม่",url:body.url||"/",tag:body.tag||`anuban-${body.type||"notification"}`});
    const results=[];
    for(const s of subs||[]){
      try{await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},payload);results.push({id:s.id,ok:true});}
      catch(e){const status=(e as {statusCode?:number})?.statusCode;if(status===404||status===410)await admin.from("push_subscriptions").delete().eq("id",s.id);results.push({id:s.id,ok:false,status});}
    }
    return json({ok:true,internal:isInternal,results});
  } catch(e) {
    return json({error:e instanceof Error?e.message:String(e)},500);
  }
});