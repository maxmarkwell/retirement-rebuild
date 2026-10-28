const assert=require("node:assert/strict");
const {chromium}=require("playwright");
const {createClient}=require("@supabase/supabase-js");
const {createServerClient}=require("@supabase/ssr");
const {execFileSync}=require("node:child_process");
const info=JSON.parse(execFileSync("../node_modules/.bin/supabase",["status","-o","json"],{cwd:".contribution-supabase-ci",encoding:"utf8"}));
const url=info.API_URL||info.api_url,anon=info.ANON_KEY||info.anon_key,service=info.SERVICE_ROLE_KEY||info.service_role_key;
assert.ok(url.startsWith("http://127.0.0.1:"),"Must only use local Supabase");
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
(async()=>{
 let cookies=[];
 const auth=createServerClient(url,anon,{cookies:{
   getAll:()=>cookies,
   setAll(items){for(const item of items){cookies=cookies.filter(x=>x.name!==item.name);cookies.push(item);}}
 }});
 const {data,error}=await auth.auth.signUp({email:"browser-capital@example.test",password:"DisposablePass12345!"});
 assert.ifError(error);assert.ok(data.user&&data.session);
 const {error:pe}=await admin.from("portfolios").insert({user_id:data.user.id,type:"real",is_real_money:true});
 assert.ifError(pe);
 const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext();
  await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,domain:"localhost",path:"/"})));
  const page=await context.newPage();
  await page.goto("http://localhost:3029/shared-contribution-browser-test");
  await page.getByLabel("Settled deposit amount ($)").fill("10.29");
  await page.getByLabel("Settlement date").fill("2026-10-27");
  await page.getByLabel("Brokerage transaction reference").fill("browser_deposit_tx_0001");
  await page.getByLabel("I have independently verified this deposit is settled").check();
  await page.getByRole("button",{name:"Review proposed deposit"}).click();
  const submit=page.getByRole("button",{name:"Record confirmed deposit"});
  assert.equal(await submit.isDisabled(),true,"Final acknowledgement required");
  await page.getByLabel("I checked the amount, settlement date").check();
  assert.equal(await submit.isEnabled(),true);
  const [response]=await Promise.all([
    page.waitForResponse(r=>r.url().includes("/api/shared-capital/contributions")&&r.request().method()==="POST"),
    submit.click()
  ]);
  assert.equal(response.status(),201,"First record must succeed");
  await page.getByText(/Contribution recorded \(ID:/).waitFor();
  const {data:rows,error:re}=await admin.from("contributions").select("id,amount,external_deposit_reference");
  assert.ifError(re);assert.equal(rows.length,1);assert.equal(Number(rows[0].amount),10.29);
  // The same external deposit with a fresh request key is rejected, not double-counted.
  await page.getByRole("button",{name:"Review proposed deposit"}).click();
  await page.getByLabel("I checked the amount, settlement date").check();
  const [duplicate]=await Promise.all([
    page.waitForResponse(r=>r.url().includes("/api/shared-capital/contributions")&&r.request().method()==="POST"),
    page.getByRole("button",{name:"Record confirmed deposit"}).click()
  ]);
  assert.equal(duplicate.status(),409);
  const {count,error:ce}=await admin.from("contributions").select("*",{count:"exact",head:true});
  assert.ifError(ce);assert.equal(count,1);
  // Editing any field clears the final review and requires fresh acknowledgement.
  await page.getByLabel("Settled deposit amount ($)").fill("11.29");
  assert.equal(await page.getByRole("button",{name:"Record confirmed deposit"}).isDisabled(),true);
  console.log("Actual browser review -> authenticated API -> one local database row; duplicate rejected and edit reset verified.");
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
