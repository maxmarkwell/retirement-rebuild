-- Retirement Rebuild
-- V1 managed SELL accounting foundation.
-- Transactions remain the permanent activity ledger. These fields persist the
-- deterministic accounting result for SELLs so realized performance is auditable.

alter table public.transactions
  add column if not exists cost_basis numeric(14,2),
  add column if not exists realized_gain_loss numeric(14,2),
  add column if not exists lot_method text;

alter table public.transactions
  drop constraint if exists transactions_sell_accounting_check;

alter table public.transactions
  add constraint transactions_sell_accounting_check check (
    transaction_type <> 'sell'
    or (
      cost_basis is null
      or cost_basis >= 0
    )
  );

alter table public.transactions
  drop constraint if exists transactions_lot_method_check;

alter table public.transactions
  add constraint transactions_lot_method_check check (
    lot_method is null
    or lot_method in ('fifo')
  );

comment on column public.transactions.cost_basis is
  'For SELL transactions, deterministic cost basis of shares sold.';
comment on column public.transactions.realized_gain_loss is
  'For SELL transactions, net proceeds minus persisted cost basis.';
comment on column public.transactions.lot_method is
  'Lot-consumption method used to calculate SELL cost basis. V1 uses fifo.';
