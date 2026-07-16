// ═══ YUKI-SYNC · Supabase Edge Function ═══
// Haalt dagvers de kerncijfers uit Yuki (alleen-lezen) en schrijft ze naar de
// finance-tabellen. De Yuki-sleutel staat als secret (YUKI_ACCESS_KEY), nooit
// in code of browser. Alleen tjeerd@ploeggenoten.nl mag deze functie aanroepen.
import { createClient } from "jsr:@supabase/supabase-js@2";

const YUKI = "https://api.yukiworks.nl/ws/Accounting.asmx";
const OWNER = "tjeerd@ploeggenoten.nl";

async function soap(action: string, body: string): Promise<string> {
  const res = await fetch(YUKI, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": `"http://www.theyukicompany.com/${action}"`,
    },
    body: `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`,
  });
  return await res.text();
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // ── alleen de eigenaar ──
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if ((user?.email ?? "").toLowerCase() !== OWNER) return json({ error: "geen toegang" }, 403);

    const key = Deno.env.get("YUKI_ACCESS_KEY");
    const adminId = Deno.env.get("YUKI_ADMIN_ID");
    if (!key || !adminId) return json({ error: "YUKI_ACCESS_KEY / YUKI_ADMIN_ID nog niet ingesteld als secret" }, 500);

    // ── Yuki: authenticeren + alle grootboeksaldi per vandaag ──
    const authXml = await soap("Authenticate",
      `<Authenticate xmlns="http://www.theyukicompany.com/"><accessKey>${key}</accessKey></Authenticate>`);
    const sessie = authXml.match(/<AuthenticateResult>([^<]+)</)?.[1];
    if (!sessie) return json({ error: "Yuki-authenticatie mislukt (sleutel verlopen/ingetrokken?)" }, 502);

    const vandaag = new Date().toISOString().slice(0, 10);
    const xml = await soap("GLAccountBalance",
      `<GLAccountBalance xmlns="http://www.theyukicompany.com/"><sessionID>${sessie}</sessionID><administrationID>${adminId}</administrationID><transactionDate>${vandaag}</transactionDate></GLAccountBalance>`);
    const accounts = [...xml.matchAll(
      /<GLAccount Code="(\d+)" BalanceType="(\w)"><Description>([^<]*)<\/Description><Amount>([-\d.]+)<\/Amount>/g,
    )].map((m) => ({ code: m[1], type: m[2], naam: m[3], bedrag: Number(m[4]) }));
    if (!accounts.length) return json({ error: "geen saldi ontvangen van Yuki" }, 502);

    const van = (code: string) => accounts.find((a) => a.code === code)?.bedrag ?? 0;
    const winst = -accounts.filter((a) => a.type === "W").reduce((s, a) => s + a.bedrag, 0);
    const omzet = -van("80000");
    const saldo = van("11000");        // Betaalrekening Rabobank
    const debiteuren = van("13000");
    const rcTve = -van("20200");       // RC TVE Holding (schuld)

    // ── wegschrijven (service-role, alleen server-side) ──
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const settings = [
      { key: "yuki_winst_ytd", value: Math.round(winst * 100) / 100 },
      { key: "yuki_winst_datum", value: vandaag },
      { key: "yuki_omzet_ytd", value: Math.round(omzet * 100) / 100 },
      { key: "yuki_debiteuren", value: Math.round(debiteuren * 100) / 100 },
      { key: "yuki_rc_tve", value: Math.round(rcTve * 100) / 100 },
      { key: "yuki_synced_at", value: new Date().toISOString() },
    ];
    const r1 = await db.from("fin_settings").upsert(settings);
    if (r1.error) throw r1.error;
    const r2 = await db.from("fin_bank_saldo").upsert(
      { datum: vandaag, saldo, note: "Automatisch uit Yuki" },
      { onConflict: "datum" },
    );
    if (r2.error) throw r2.error;

    return json({ ok: true, datum: vandaag, saldo, winst, omzet, debiteuren, rcTve });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
