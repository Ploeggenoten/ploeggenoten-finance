# Ploeggenoten Finance

Financiële cockpit voor Ploeggenoten BV — planningslaag naast Yuki.
Draait op dezelfde Supabase-database als het [pijplijnbord](https://ploeggenotenpipeline.netlify.app), maar alle finance-tabellen zijn via Row Level Security afgeschermd: alleen `tjeerd@ploeggenoten.nl` kan erbij.

## Eerste keer installeren

1. **Database**: ga naar [supabase.com](https://supabase.com) → jouw project → *SQL Editor* en draai achtereenvolgens:
   - `supabase/schema.sql` (tabellen + beveiliging + startwaarden)
   - `supabase/seed.sql` (je historische data uit Excel: P001–P027)
2. **Online zetten**: ga naar [app.netlify.com/drop](https://app.netlify.com/drop) en sleep deze **hele map** erin. Klaar.
3. Log in met je pijplijnbord-account (tjeerd@ploeggenoten.nl).

## Bijwerken na een code-wijziging

Sleep de map opnieuw naar Netlify (*Deploys → drag & drop*), of vraag Claude om het te doen.

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
