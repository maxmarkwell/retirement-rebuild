const assert=require("node:assert/strict");
const fs=require("node:fs");
const s=fs.readFileSync("components/shared-contribution-preview.tsx","utf8");
assert.match(s,/Review proposed deposit/);
assert.match(s,/reviewAcknowledged/);
assert.match(s,/Posting locked — review only/);
assert.doesNotMatch(s,/\bfetch\s*\(|\baxios\b|formAction\s*=|\baddContribution\s*\(|\.from\s*\(|\.insert\s*\(/);
console.log("Two-step shared contribution preview has no write path.");
