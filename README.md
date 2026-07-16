# Ploeggenoten Finance

Financiële cockpit voor Ploeggenoten BV — planningslaag naast Yuki.

**Live:** https://ploeggenoten.github.io/ploeggenoten-finance/ (GitHub Pages, deploy = push naar `main`)

Draait op dezelfde Supabase-database als het [pijplijnbord](https://ploeggenoten.github.io/pijplijnbord/), maar alle finance-tabellen zijn via Row Level Security afgeschermd: alleen `tjeerd@ploeggenoten.nl` kan erbij. Inloggen met het pijplijnbord-account.

## Database (eenmalig, al gedaan op 16-07-2026)

Supabase → *SQL Editor* → draai `supabase/schema.sql` en daarna `supabase/seed.sql`. Beide zijn idempotent (veilig om opnieuw te draaien).

## Bijwerken na een code-wijziging

`git push` naar `main` — GitHub Pages deployt automatisch binnen ±1 minuut. Het deploy-token staat lokaal in `~/.config/ploeggenoten/github_token` (niet in de repo).

## Structuur

- `index.html` — pagina-skelet + login
- `style.css` — vormgeving
- `js/config.js` — Supabase-verbinding + eigenaar-account
- `js/core.js` — data laden, helpers, grafieken
- `js/calc.js` — alle financiële logica (termijnen, garantie, stop, projectie, potjes, KPI's)
- `js/vandaag.js` `js/plaatsingen.js` `js/facturatie.js` `js/cashflow.js` `js/kosten.js` `js/instellingen.js` — de zes schermen
- `js/main.js` — login + navigatie
- `supabase/schema.sql` — databaseschema (idempotent, veilig om opnieuw te draaien)
- `supabase/seed.sql` — historische data uit de Excel-bestanden (gegenereerd)
