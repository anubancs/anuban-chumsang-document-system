import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return json({error:"Unauthorized"},401);
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!;
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const {data:{user},error:userError}=await userClient.auth.getUser();if(userError||!user)return json({error:"Unauthorized"},401);
 const body=await req.json().catch(()=>null);if(!body?.user_id||body.user_id!==user.id)return json({error:"Forbidden"},403);
 const pub=Deno.env.get("VAPID_PUBLIC_KEY"),priv=Deno.env.get("VAPID_PRIVATE_KEY");if(!pub||!priv)return json({error:"VAPID secrets are not configured"},503);
 const service=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const {data:subs,error}=await service.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id",user.id);if(error)return json({error:error.message},500);
 webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")||"mailto:admin@example.com",pub,priv);
 const payload=JSON.stringify({title:body.title||"ระบบสารบรรณ",body:body.message||"มีการแจ้งเตือนใหม่",url:"/",tag:body.tag||"anuban"});
 const results=[];
 for(const s of subs||[]){try{await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},payload);results.push({id:s.id,ok:true})}catch(e){const status=(e as any)?.statusCode;if(status===404||status===410)await service.from("push_subscriptions").delete().eq("id",s.id);results.push({id:s.id,ok:false,status})}}
 return json({ok:true,results});
});