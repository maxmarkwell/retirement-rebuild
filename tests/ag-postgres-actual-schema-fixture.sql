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
CREATE TABLE public.transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.investment_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
 transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
 decision_type text NOT NULL CHECK (decision_type IN ('buy','sell','hold','watch','rebalance','avoid')),
 ticker text NOT NULL,
 decision_date timestamptz NOT NULL DEFAULT now(),
 decision_price numeric,
 recommended_quantity numeric,
 recommended_allocation numeric,
 confidence_score numeric CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
 risk_level text CHECK (risk_level IS NULL OR risk_level IN ('low','medium','high')),
 expected_holding_period text,
 thesis text NOT NULL,
 bull_case text,
 bear_case text,
 primary_risks text,
 reassessment_conditions text,
 exit_conditions text,
 source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai_committee','system')),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','executed','closed','superseded')),
 created_at timestamptz NOT NULL DEFAULT now(),
 ag_thesis_valid boolean,
 ag_liquidity_eligible boolean,
 ag_evidence_version text,
 ag_theme_key text,
 notes text
);
CREATE UNIQUE INDEX investment_decisions_one_active_ai_per_ticker
 ON public.investment_decisions(user_id,portfolio_id,ticker)
 WHERE source='ai_committee' AND status='active';
-- Mirror the live BEFORE INSERT lifecycle trigger. The atomic RPC must reject
-- pre-era active rows before INSERT, otherwise this trigger would supersede
-- historical state across strategy eras.
CREATE OR REPLACE FUNCTION public.supersede_prior_active_ai_decisions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $agfixture$
BEGIN
  IF NEW.source='ai_committee' THEN
    UPDATE public.investment_decisions
    SET status='superseded'
    WHERE user_id=NEW.user_id AND portfolio_id=NEW.portfolio_id
      AND ticker=NEW.ticker AND source='ai_committee' AND status='active';
  END IF;
  RETURN NEW;
END
$agfixture$;
CREATE TRIGGER supersede_prior_active_ai_decisions_before_insert
BEFORE INSERT ON public.investment_decisions
FOR EACH ROW EXECUTE FUNCTION public.supersede_prior_active_ai_decisions();
-- Actual-schema compatibility harness: the audited live table has all columns above except notes.\n-- notes is intentionally appended here to model the proposed provenance migration before loading recovery RPCs.
