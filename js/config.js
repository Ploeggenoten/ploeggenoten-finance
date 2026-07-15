// ═══════════════════════════════════════════════════════════════
// Supabase-verbinding — zelfde project als het pijplijnbord.
// De anon key is publiek (beveiliging zit in Row Level Security).
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://gyhrwjdlwamyjhxtdypw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5aHJ3amRsd2FteWpoeHRkeXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODgwMzUsImV4cCI6MjA5NzM2NDAzNX0.M2huzUfbYtcOqimYIkcuGW-6BCion4HqJVn7TxtkZ9c';

// Alleen dit account krijgt toegang (moet gelijk zijn aan de RLS-policy in schema.sql)
const OWNER_EMAIL = 'tjeerd@ploeggenoten.nl';

// Fases op het pijplijnbord die tellen als "geplaatst"
const PLACED_FASES = ['Contract getekend', 'Gestart'];
