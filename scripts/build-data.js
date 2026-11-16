#!/usr/bin/env node
// Converte o retorno do conector "MCP - Meta" no data.json do painel Jingle Jangle (Ama Sounds).
// Uso: UNTIL=AAAA-MM-DD node scripts/build-data.js raw
// A pasta raw/ precisa ter: adsets.json, demo.json, ads.json (texto de ad_entities),
// pixel.json (resposta de ads_get_dataset_stats) e, opcionalmente, previews.json.
"use strict";
const fs = require("fs");
const path = require("path");
const CONFIG = require("./config.json");

const dir = process.argv[2] || "raw";
const read = (f, fallback) => { const p = path.join(dir, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback; };
const adsetsRaw = read("adsets.json", []);
const demoRaw = read("demo.json", []);
const adsRaw = read("ads.json", []);
const pixelRaw = read("pixel.json", null);
const previewsNew = read("previews.json", {});
const prev = fs.existsSync("data.json") ? JSON.parse(fs.readFileSync("data.json", "utf8")) : null;

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const mv = (v) => { if (v == null) return 0; if (typeof v === "object") return "value" in v ? mv(v.value) : 0; const x = Number(v); return isFinite(x) ? x : 0; };
const r2 = (x) => Math.round(x * 100) / 100;
const day = (r) => String(r.date_start).slice(0, 10);
const cleanName = (s) => String(s || "(sem nome)").replace(/(\s*[—–-]\s*C[óo]pia(\s*\d+)?)+\s*$/i, "").trim();
const UNTIL = process.env.UNTIL || null;

// Só campanhas do evento (nome da campanha com uma das palavras de config.campaign_keywords), a partir de config.since.
const isEvent = (r) => { const c = norm(r.campaign_name); return CONFIG.campaign_keywords.some((k) => c.includes(norm(k))); };
const inWindow = (r) => day(r) >= CONFIG.since && (!UNTIL || day(r) <= UNTIL);
const keep = (r) => isEvent(r) && inWindow(r) && (mv(r.amount_spent) > 0 || mv(r.impressions) > 0);

// Conjuntos -> públicos (abas)
const adsets = [], byId = {};
function audienceOf(name) {
  const n = norm(name);
  for (const a of CONFIG.audiences) if (a.keywords.some((k) => n.includes(norm(k)))) return a;
  return null;
}
function adsetKey(id, name) {
  if (byId[id]) return byId[id];
  const a = audienceOf(name);
  let key = a ? a.key : "x" + slug(name).slice(0, 24);
  if (adsets.some((s) => s.key === key && s.id !== id)) key = key + "-" + String(id).slice(-4);
  const entry = a
    ? { key, id, name, code: a.code, label: a.label, sub: a.sub }
    : { key, id, name, code: "NOVO", label: { pt: name, es: name, en: name }, sub: { pt: "Conjunto novo · ajuste scripts/config.json", es: "Conjunto nuevo", en: "New ad set" }, unmatched: true };
  adsets.push(entry); byId[id] = key; return key;
}

// [data, público, investimento, impressões, cliques, visitas à página, carrinho, checkout, compras, receita]
const adsets_daily = adsetsRaw.filter(keep).map((r) => [day(r), adsetKey(r.id, r.name), r2(mv(r.amount_spent)), mv(r.impressions), mv(r.link_click), mv(r.omni_landing_page_view), mv(r.omni_add_to_cart), mv(r.omni_initiated_checkout), mv(r.omni_purchase), r2(mv(r.omni_purchase_values))]);

// [data, público, idade, gênero (f/m/u), investimento, impressões, cliques, visitas, compras, receita]
const G = { female: "f", male: "m" };
const demo_daily = demoRaw.filter(keep).map((r) => [day(r), adsetKey(r.id, r.name), r.age, G[r.gender] || "u", r2(mv(r.amount_spent)), mv(r.impressions), mv(r.link_click), mv(r.omni_landing_page_view), mv(r.omni_purchase), r2(mv(r.omni_purchase_values))]);

// Criativos agrupados pelo nome (cópias contam como o mesmo criativo)
const creatives = {};
const ads_daily = adsRaw.filter(keep).map((r) => {
  const name = cleanName(r.name), key = slug(name);
  const c = creatives[key] || (creatives[key] = { name, top: 0, adId: "" });
  const sp = mv(r.amount_spent); if (sp >= c.top) { c.top = sp; c.adId = r.id; }
  const ak = r.adset_id ? adsetKey(r.adset_id, r.adset_name) : (adsets.find((a) => a.name === r.adset_name) || {}).key || adsetKey("name:" + r.adset_name, r.adset_name);
  // [data, público, criativo, investimento, impressões, cliques, visitas, checkout, compras, receita]
  return [day(r), ak, key, r2(sp), mv(r.impressions), mv(r.link_click), mv(r.omni_landing_page_view), mv(r.omni_initiated_checkout), mv(r.omni_purchase), r2(mv(r.omni_purchase_values))];
});
const prevCr = (prev && prev.creatives) || {};
Object.keys(creatives).forEach((k) => {
  const c = creatives[k], pv = previewsNew[k] || previewsNew[c.name] || {}, old = prevCr[k] || {};
  const thumbFile = "thumbs/" + k + ".jpg";
  creatives[k] = {
    name: c.name, adId: c.adId,
    label: CONFIG.creatives[k] || { pt: c.name, es: c.name, en: c.name },
    preview: (pv.url || old.preview || "").replace(/&amp;/g, "&"),
    thumb: pv.thumb || old.thumb || (fs.existsSync(thumbFile) ? thumbFile : "")
  };
});

// Pixel: [data, PageView, AddToCart, InitiateCheckout, Purchase]
let pixel_daily = (prev && prev.pixel_daily) || [];
if (pixelRaw && Array.isArray(pixelRaw.stats)) {
  const m = {};
  for (const s of pixelRaw.stats) {
    const d = String(s.timestamp).slice(0, 10); if (d < CONFIG.since || (UNTIL && d > UNTIL)) continue;
    const o = m[d] || (m[d] = { PageView: 0, AddToCart: 0, InitiateCheckout: 0, Purchase: 0 });
    for (const x of s.data || []) if (x.value in o) o[x.value] += Number(x.count) || 0;
  }
  pixel_daily = Object.keys(m).sort().map((d) => [d, m[d].PageView, m[d].AddToCart, m[d].InitiateCheckout, m[d].Purchase]);
}

const dates = adsets_daily.map((r) => r[0]).sort();
const out = {
  meta: {
    account_id: CONFIG.account.id, pixel_id: CONFIG.pixel_id, currency: CONFIG.account.currency, tz: CONFIG.account.tz,
    event_date: CONFIG.event_date, updated: new Date().toISOString(),
    firstDay: dates[0] || CONFIG.since, lastDay: UNTIL || dates[dates.length - 1] || null
  },
  adsets, creatives, adsets_daily, ads_daily, demo_daily, pixel_daily
};
fs.writeFileSync("data.json", JSON.stringify(out));

const tot = adsets_daily.reduce((t, r) => { t.s += r[2]; t.l += r[5]; t.p += r[8]; t.v += r[9]; return t; }, { s: 0, l: 0, p: 0, v: 0 });
const px = pixel_daily.reduce((t, r) => t + r[4], 0);
console.log(`data.json: ${adsets_daily.length} linhas por dia, ${demo_daily.length} de público, ${ads_daily.length} de criativos, ${Object.keys(creatives).length} criativos.`);
console.log(`Período ${out.meta.firstDay} a ${out.meta.lastDay} · investimento US$ ${tot.s.toFixed(2)} · ${tot.l} visitas à página · ${tot.p} compras atribuídas (US$ ${tot.v.toFixed(2)}) · ${px} compras no pixel.`);
const spAds = ads_daily.reduce((t, r) => t + r[3], 0), spDemo = demo_daily.reduce((t, r) => t + r[4], 0);
if (tot.s > 0 && Math.abs(spAds - tot.s) > Math.max(1, tot.s * 0.02)) console.log(`ATENÇÃO: criativos somam US$ ${spAds.toFixed(2)} e conjuntos US$ ${tot.s.toFixed(2)}. Refaça raw/ads.json em janelas menores (veja UPDATE.md).`);
if (tot.s > 0 && Math.abs(spDemo - tot.s) > Math.max(1, tot.s * 0.02)) console.log(`ATENÇÃO: público soma US$ ${spDemo.toFixed(2)} e conjuntos US$ ${tot.s.toFixed(2)}. Refaça raw/demo.json.`);
const sem = adsets.filter((a) => a.unmatched).map((a) => a.name);
if (sem.length) console.log("AVISO: conjunto sem público no config: " + sem.join(" | "));
const semThumb = Object.keys(creatives).filter((k) => !creatives[k].thumb);
if (semThumb.length) console.log("Criativos sem miniatura: " + semThumb.join(", "));
