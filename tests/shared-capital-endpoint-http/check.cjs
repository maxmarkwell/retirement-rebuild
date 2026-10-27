const assert = require("node:assert/strict");
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const { execFileSync } = require("node:child_process");
const info = JSON.parse(execFileSync("../node_modules/.bin/supabase",["status","-o","json"],{cwd:".contribution-supabase-ci",encoding:"utf8"}));
const url=info.API_URL||info.api_url, anon=info.ANON_KEY||info.anon_key, service=info.SERVICE_ROLE_KEY||info.service_role_key;
assert.ok(url?.includes("127.0.0.1") && anon && service, "Refusing nonlocal Supabase endpoint");
const base="http://127.0.0.1:3029";
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
async function signup(name) {
  let cookies=[];
  const s=createServerClient(url,anon,{cookies:{
    getAll(){return cookies;},
    setAll(items){for(const {name,value,options} of items){cookies=cookies.filter(c=>c.name!==name); cookies.push({name,value,...options});}}
  }});
  const {data,error}=await s.auth.signUp({email:name+"@example.test",password:"DisposablePass12345!"});
  assert.ifError(error);
  assert.ok(data.user&&data.session,"local Auth signup must produce session");
  return {id:data.user.id,cookie:()=>cookies.map(c=>encodeURIComponent(c.name)+"="+encodeURIComponent(c.value)).join("; ")};
}
async function post(body,identity) {
  const res=await fetch(base+"/api/shared-capital/contributions",{
    method:"POST",headers:{"Origin":"http://localhost:3029","Content-Type":"application/json",...(identity?{"Cookie":identity.cookie()}:{})},
    body:JSON.stringify(body)
  });
  return {status:res.status,data:await res.json()};
}
(async()=>{
  const a=await signup("http-contribution-a");
  const b=await signup("http-contribution-b");
  const {data:ps,error:pe}=await admin.from("portfolios").insert([
    {user_id:a.id,type:"real",is_real_money:true},
    {user_id:b.id,type:"real",is_real_money:true}
  ]).select("id,user_id");
  assert.ifError(pe);
  const payload={confirmedExternalDeposit:true,amount:10.29,contributionDate:"2026-10-27",idempotencyKey:"http_auth_request_0001",externalDepositReference:"etrade_deposit_tx_0001"};
  const unauth=await post(payload,null);
  assert.equal(unauth.status,401,JSON.stringify(unauth));
  const created=await post(payload,a);
  assert.equal(created.status,201,JSON.stringify(created));
  assert.equal(created.data.status,"recorded");
  assert.equal(created.data.fundsTransferred,false);
  const repeat=await post(payload,a);
  assert.equal(repeat.status,200,JSON.stringify(repeat));
  assert.equal(repeat.data.status,"already_recorded");
  assert.equal(repeat.data.contributionId,created.data.contributionId);
  const alternateKey=await post({...payload,idempotencyKey:"http_auth_request_9999"},a);
  assert.equal(alternateKey.status,409,JSON.stringify(alternateKey));
  const missingRef=await post({...payload,externalDepositReference:undefined,idempotencyKey:"http_auth_request_0003"},a);
  assert.equal(missingRef.status,400,JSON.stringify(missingRef));
  const conflict=await post({...payload,amount:20.29},a);
  assert.equal(conflict.status,409,JSON.stringify(conflict));
  const {data:rows,error:re}=await admin.from("contributions").select("id,user_id,portfolio_id,amount,idempotency_key");
  assert.ifError(re);
  assert.equal(rows.length,1,"Only one contribution row may be written");
  assert.equal(rows[0].user_id,a.id);
  assert.equal(rows[0].portfolio_id,ps.find(p=>p.user_id===a.id).id);
  assert.equal(Number(rows[0].amount),10.29);
  // User B has a distinct valid portfolio, but cannot read or change A's deposit via the endpoint.
  const bRecord=await post({...payload,idempotencyKey:"http_auth_request_0002"},b);
  assert.equal(bRecord.status,201,JSON.stringify(bRecord));
  assert.notEqual(bRecord.data.contributionId,created.data.contributionId);
  const {data:after,error:ae}=await admin.from("contributions").select("user_id,portfolio_id");
  assert.ifError(ae);
  assert.equal(after.length,2);
  assert.equal(after.find(r=>r.user_id===b.id).portfolio_id,ps.find(p=>p.user_id===b.id).id);
  console.log("Real Next HTTP -> local Supabase Auth/PostgREST test passed: 401, 201, 200 retry, 409 conflict, user ownership; no transfers.");
})().catch(e=>{console.error(e);process.exitCode=1;});
