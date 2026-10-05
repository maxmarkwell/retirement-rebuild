-- Disposable PostgreSQL-only harness. Never run against a real database.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.portfolios (id uuid PRIMARY KEY, user_id uuid NOT NULL, type text NOT NULL, is_real_money boolean NOT NULL DEFAULT false);
CREATE TABLE public.portfolio_strategy_eras (id uuid PRIMARY KEY, user_id uuid NOT NULL, portfolio_id uuid NOT NULL, strategy_key text NOT NULL, execution_mode text NOT NULL, ended_at timestamptz, inception_at timestamptz NOT NULL);
CREATE TABLE public.ag_daily_cycles (id uuid PRIMARY KEY, user_id uuid NOT NULL, portfolio_id uuid NOT NULL, strategy_era_id uuid NOT NULL, cycle_date date NOT NULL, status text NOT NULL);
CREATE TABLE public.investment_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, portfolio_id uuid NOT NULL,
 transaction_id uuid, ticker text NOT NULL, decision_type text NOT NULL, decision_date timestamptz NOT NULL DEFAULT now(),
 source text NOT NULL, status text NOT NULL, thesis text NOT NULL, confidence_score numeric(5,2),
 expected_holding_period text, bull_case text, bear_case text, primary_risks text,
 reassessment_conditions text, exit_conditions text, recommended_quantity numeric,
 recommended_allocation numeric, notes text, ag_thesis_valid boolean,
 ag_liquidity_eligible boolean, ag_evidence_version text, ag_theme_key text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX investment_decisions_one_active_ai_per_ticker
 ON public.investment_decisions(user_id,portfolio_id,ticker)
 WHERE source='ai_committee' AND status='active';
-- This fixture deliberately supplies notes; the production catalog must be checked independently.
