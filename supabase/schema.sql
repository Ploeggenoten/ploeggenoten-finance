-- ═══════════════════════════════════════════════════════════════
-- PLOEGGENOTEN FINANCE · databaseschema
-- Draai dit 1x in Supabase → SQL Editor (daarna seed.sql).
-- Alle tabellen zijn afgeschermd: alleen tjeerd@ploeggenoten.nl
-- kan ze lezen of schrijven. Het team merkt hier niets van.
-- ═══════════════════════════════════════════════════════════════

-- Plaatsingen (1 regel per geplaatste kandidaat)
create table if not exists fin_placements (
  id text primary key,                      -- P001, P002, ...
  klant text not null,
  kandidaat text not null default '',
  functie text not null default '',
  fee_excl numeric,                         -- totale fee excl. btw
  contract_datum date,
  eerste_factuurdatum date,
  aantal_termijnen int not null default 1,
  maanden_tussen int not null default 1,
  betaaltermijn_dgn int not null default 14,
  garantie_mnd int not null default 0,
  gestopt_op date,
  garantie_note text,
  vervangen_door text,                      -- id van vervangende plaatsing
  pipeline_candidate_id text,               -- koppeling naar candidates.id (pijplijnbord)
  bron text not null default 'app',         -- 'excel' | 'pipeline' | 'app'
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Factuurtermijnen (het factuurschema; 1 regel per termijn)
create table if not exists fin_installments (
  id bigint generated always as identity primary key,
  placement_id text not null references fin_placements(id) on delete cascade,
  termijn_nr int not null,
  bedrag_excl numeric not null default 0,
  geplande_datum date,
  status text not null default 'te_factureren'
    check (status in ('te_factureren','gefactureerd','betaald','vervallen')),
  factuurdatum date,
  betaaldatum date,
  note text,
  unique (placement_id, termijn_nr)
);

-- Kosten: budget (vaste maandlasten, geldig van/tot maand)
create table if not exists fin_costs_budget (
  id bigint generated always as identity primary key,
  categorie text not null,
  bedrag_pm numeric not null default 0,
  vanaf_maand date not null,                -- altijd de 1e van de maand
  tot_maand date,                           -- null = doorlopend
  note text
);

-- Kosten: werkelijke realisatie per maand per categorie
create table if not exists fin_costs_actual (
  id bigint generated always as identity primary key,
  maand date not null,                      -- altijd de 1e van de maand
  categorie text not null,
  bedrag numeric not null default 0,
  note text,
  unique (maand, categorie)
);

-- Banksaldo-metingen (handmatig bijgewerkt)
create table if not exists fin_bank_saldo (
  id bigint generated always as identity primary key,
  datum date not null unique,
  saldo numeric not null,
  note text
);

-- Banktransacties (CSV-import)
create table if not exists fin_bank_tx (
  id bigint generated always as identity primary key,
  datum date not null,
  bedrag numeric not null,
  omschrijving text not null default '',
  tegenpartij text not null default '',
  categorie text not null default '',
  hash text unique                          -- dedupe bij herhaalde import
);

-- Leningen + aflossingen
create table if not exists fin_loans (
  id bigint generated always as identity primary key,
  naam text not null,
  hoofdsom numeric not null,
  rente_pct numeric not null default 0,
  start_datum date,
  deadline date,
  note text
);

create table if not exists fin_loan_payments (
  id bigint generated always as identity primary key,
  loan_id bigint not null references fin_loans(id) on delete cascade,
  datum date not null,
  bedrag numeric not null,
  gepland boolean not null default false,   -- true = voornemen, false = gedaan
  note text
);

-- Flex-inkomsten via backoffice (Pronkert): 1 regel per week
create table if not exists fin_flex_weken (
  id bigint generated always as identity primary key,
  week date not null unique,                -- maandag van de week
  bedrag numeric not null default 0,        -- uitgekeerde marge excl. btw
  flexkrachten int,                         -- aantal actieve flexkrachten (optioneel)
  note text
);

-- Instellingen (key/value)
create table if not exists fin_settings (
  key text primary key,
  value jsonb not null
);

-- Kandidaten uit de pijplijn-inbox die je bewust overslaat
create table if not exists fin_dismissed_candidates (
  candidate_id text primary key,
  dismissed_at timestamptz not null default now()
);

-- ── Beveiliging: alléén Tjeerd ─────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'fin_placements','fin_installments','fin_costs_budget','fin_costs_actual',
    'fin_bank_saldo','fin_bank_tx','fin_loans','fin_loan_payments',
    'fin_settings','fin_dismissed_candidates','fin_flex_weken']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists fin_owner_only on %I', t);
    execute format(
      'create policy fin_owner_only on %I for all to authenticated
       using (auth.jwt()->>''email'' = ''tjeerd@ploeggenoten.nl'')
       with check (auth.jwt()->>''email'' = ''tjeerd@ploeggenoten.nl'')', t);
  end loop;
end $$;

-- ── Startwaarden (alleen ingevoegd als ze nog niet bestaan) ────
insert into fin_settings (key, value) values
  ('btw_pct',              '0.21'),
  ('vpb_pct',              '0.19'),
  ('waarschuwing_dgn',     '21'),     -- venster "te factureren binnenkort"
  ('stop_achterstand_mnd', '1'),      -- termijnen t/m stop + X mnd blijven staan
  ('default_betaaltermijn','14'),
  ('scenario_omzet_pm',    '25000'),  -- nieuwe W&S-omzet per maand (scenario)
  ('target_omzet_pm',      'null'),   -- nog samen te bepalen
  ('voorbelasting_pm',     '2800'),   -- btw-aftrek op kosten p/m (Yuki YTD: €18.719 / 6,5 mnd)
  ('yuki_winst_ytd',       '85238.87'),   -- winst vóór belastingen per rapportdatum (Vpb-anker)
  ('yuki_winst_datum',     '"2026-07-15"')
on conflict (key) do nothing;

-- Vaste maandlasten: loonkosten uit je prognose, rest uit Yuki YTD-gemiddelden (rapport 15-07-2026)
insert into fin_costs_budget (categorie, bedrag_pm, vanaf_maand, tot_maand, note)
select * from (values
  ('Loonkosten team (Bryan + Tjerk)', 6735::numeric,  date '2026-01-01', date '2026-07-01', 'werkgeverslasten, excl. Rajesh'),
  ('Loonkosten team (incl. Rajesh)', 11035::numeric,  date '2026-08-01', null::date,       'Rajesh erbij vanaf aug ''26 (€4300)'),
  ('Management fee TVE Holding',      4300::numeric,  date '2026-01-01', null::date,       'wordt nu opgeboekt in RC (niet uitbetaald) — zie lening RC TVE'),
  ('Huisvesting',                     1515::numeric,  date '2026-01-01', null::date,       'Yuki YTD-gemiddelde (huur €1.455 + gwe)'),
  ('Auto''s (verzekering/brandstof/wegenbelasting)', 654::numeric, date '2026-01-01', null::date, 'Yuki YTD-gemiddelde, excl. lease-termijnen'),
  ('Autolease-termijnen',                0::numeric,  date '2026-01-01', null::date,       'VUL IN: maandtermijn van de 2 leasecontracten (€36k langlopend op balans)'),
  ('Marketing & verkoop',             2255::numeric,  date '2026-01-01', null::date,       'Yuki YTD-gemiddelde — grootste post: advertenties €14k YTD'),
  ('Kantoor, adviseurs & overig',     2525::numeric,  date '2026-01-01', null::date,       'Yuki YTD-gemiddelde (adviseurs €10,5k YTD, deels eenmalig?)')
) v(categorie, bedrag_pm, vanaf_maand, tot_maand, note)
where not exists (select 1 from fin_costs_budget);

-- Leningen: moeder (aanname startdatum — pas aan) + RC-schuld aan TVE Holding (uit Yuki-balans)
insert into fin_loans (naam, hoofdsom, rente_pct, start_datum, deadline, note)
select * from (values
  ('Lening moeder', 30000::numeric, 5::numeric, date '2026-06-01', date '2028-06-01',
   'Terugbetalen binnen 2 jaar, 5% rente. Startdatum is een aanname — pas aan.'),
  ('RC TVE Holding', 24979.23::numeric, 0::numeric, date '2026-01-01', null::date,
   'Rekening-courant per 15-07-2026 (Yuki). Loopt op met €4.300/mnd zolang de management fee niet wordt uitbetaald.')
) v(naam, hoofdsom, rente_pct, start_datum, deadline, note)
where not exists (select 1 from fin_loans);

insert into fin_loan_payments (loan_id, datum, bedrag, gepland, note)
select l.id, date '2026-08-31', 15000, true, 'Voorgenomen aflossing per augustus'
from fin_loans l
where l.naam = 'Lening moeder'
  and not exists (select 1 from fin_loan_payments);

-- Werkelijk banksaldo uit Yuki-balans (Rabobank betaalrekening per 15-07-2026)
insert into fin_bank_saldo (datum, saldo, note)
select date '2026-07-15', 130709.61, 'Betaalrekening Rabobank — Yuki tussentijds rapport 15-07-2026'
where not exists (select 1 from fin_bank_saldo);
