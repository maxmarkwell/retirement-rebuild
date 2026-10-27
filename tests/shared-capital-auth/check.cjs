const assert = require("node:assert/strict");
const { createClient } = require("@supabase/supabase-js");
const { execFileSync } = require("node:child_process");
const info = JSON.parse(execFileSync("./node_modules/.bin/supabase", ["status", "-o", "json"], {
  cwd: ".contribution-supabase-ci", encoding: "utf8"
}));
const url = info.API_URL || info.api_url;
const key = info.ANON_KEY || info.anon_key;
const serviceKey = info.SERVICE_ROLE_KEY || info.service_role_key;
assert.ok(url && key && serviceKey, "Missing local Supabase keys");
const client = (k) => createClient(url, k, { auth: { persistSession: false, autoRefreshToken: false } });
async function register(email) {
  const c = client(key);
  const { data, error } = await c.auth.signUp({ email, password: "DisposableTestPass123!" });
  if (error) throw error;
  if (!data.user || !data.session) throw new Error("Local sign-up must return a session.");
  return { client: c, id: data.user.id };
}
(async () => {
  const admin = client(serviceKey); // Only disposable local Supabase, not a hosted project
  const a = await register("capital-a@example.test");
  const b = await register("capital-b@example.test");
  const { data: portfolios, error: portfolioErr } = await admin.from("portfolios")
    .insert([
      { user_id: a.id, type: "real", is_real_money: true },
      { user_id: b.id, type: "real", is_real_money: true }
    ]).select("id,user_id");
  assert.ifError(portfolioErr);
  const ownPortfolio = portfolios.find(p => p.user_id === a.id).id;
  const row = {
    user_id: a.id, portfolio_id: ownPortfolio, amount: 10.29,
    contribution_date: "2026-10-27", idempotency_key: "auth_local_request_0001"
  };
  const { data: inserted, error: insertErr } = await a.client.from("contributions").insert(row).select("id").single();
  assert.ifError(insertErr);
  assert.ok(inserted.id, "Owner insert must return ID");
  const { error: repeatErr } = await a.client.from("contributions").insert(row);
  assert.equal(repeatErr?.code, "23505", "Retry must fail uniqueness constraint");
  const { error: conflictingErr } = await a.client.from("contributions").insert({ ...row, amount: 20.29 });
  assert.equal(conflictingErr?.code, "23505", "Changed amount with same key must be rejected");
  const { error: foreignErr } = await b.client.from("contributions")
    .insert({ ...row, idempotency_key: "auth_local_request_0002" });
  assert.ok(foreignErr, "Different user must not insert under owner A");
  const { data: otherReads, error: otherReadErr } = await b.client.from("contributions").select("id");
  assert.ifError(otherReadErr);
  assert.equal(otherReads.length, 0, "Other user must not read A's contribution");
  const { data: ownerReads, error: ownerReadErr } = await a.client.from("contributions").select("id");
  assert.ifError(ownerReadErr);
  assert.equal(ownerReads.length, 1, "Owner must see exactly one contribution");
  const { data: anonymousReads, error: anonymousReadErr } = await client(key).from("contributions").select("id");
  assert.ifError(anonymousReadErr);
  assert.equal(anonymousReads.length, 0, "Anonymous visitor must not see contributions");
  console.log("Local Supabase Auth contribution insert, duplicate, conflict and ownership checks passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
