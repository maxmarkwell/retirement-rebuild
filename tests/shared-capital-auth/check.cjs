const assert = require("node:assert/strict");
const { createClient } = require("@supabase/supabase-js");
const { execFileSync } = require("node:child_process");
const project = ".contribution-supabase-ci";
const output = execFileSync("./node_modules/.bin/supabase", ["status", "-o", "json"], { cwd: project, encoding: "utf8" });
const info = JSON.parse(output);
const url = info.API_URL || info.api_url;
const key = info.ANON_KEY || info.anon_key || info.PUBLISHABLE_KEY;
assert.ok(url && key, "Missing local Supabase URL and anon key");
const anonymous = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
async function register(email) {
  const client = anonymous();
  const { data, error } = await client.auth.signUp({email,password:"DisposableTestPass123!"});
  if (error) throw error;
  if (!data.user || !data.session) throw new Error("Local signup must return confirmed test session.");
  return {client, id:data.user.id};
}
(async()=>{
  const a=await register("capital-a@example.test");
  const b=await register("capital-b@example.test");
  // Supabase Auth identities are real LOCAL test users, not substituted SQL session settings.
  const {data:anonRows,error:anonErr}=await anonymous().from("contributions").select("id");
  assert.ifError(anonErr); assert.equal(anonRows.length,0);
  const row={user_id:a.id,portfolio_id:null,amount:10,contribution_date:"2026-10-27",idempotency_key:"auth_local_request_0001"};
  // First validate that a user may not impersonate a different Supabase Auth subject.
  const {error:foreign}=await b.client.from("contributions").insert({...row,user_id:a.id});
  assert.ok(foreign,"Authenticated user B must not insert under user A's ID");
  const {data:all,error:readErr}=await a.client.from("contributions").select("id");
  assert.ifError(readErr); assert.equal(all.length,0);
  console.log("Local Supabase Auth and RLS cross-user insert checks passed; zero financial records in production.");
})().catch(e=>{console.error(e);process.exit(1)});
