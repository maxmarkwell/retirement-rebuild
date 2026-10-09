# AG recovery migration review record

Status: review template only. This file does not authorize a production change.

## Reviewed artifact

Candidate: supabase/migration-candidates/20261005_ag_recovery_review_candidate.sql
Pinned Git content digest: 105d32e85078df1e5eb9b953c983ca6732e679d4
Runbook: docs/ag-production-migration-runbook.md
Verification queries: docs/ag-production-migration-verification.sql
Draft PR: #13

## Review checklist

- [ ] Candidate digest independently verified.
- [ ] Candidate CI green at the exact reviewed content.
- [ ] Live preflight freshly rerun and runbook preconditions pass.
- [ ] Backup and recovery posture confirmed.
- [ ] Migration failure and ambiguous-response handling reviewed.
- [ ] Recovery RLS and direct grants reviewed.
- [ ] Authenticated SECURITY DEFINER surface reviewed.
- [ ] Function ownership, search_path and PUBLIC execution postflight reviewed.
- [ ] Supabase advisor review plan confirmed.
- [ ] No AG research or transaction process can race the change.
- [ ] Reviewer understands schema success does not enable AG.

## Review decision

Decision: ____________________
Reviewer: ____________________
Timestamp: ____________________
Reviewed candidate digest: ____________________
Conditions or notes: ____________________

## Execution evidence

Populate only after a separately authorized production change.

Migration version/name: ____________________
Start/end timestamps: ____________________
Candidate digest at execution: ____________________
Migration result: ____________________
Postflight result: ____________________
Advisor result: ____________________
Owner/grant verification: ____________________
Baseline/postflight comparison: ____________________
Unexpected findings: ____________________

After schema verification, keep AG off. Runner deployment, paper activation, and transaction execution remain separate decisions.
