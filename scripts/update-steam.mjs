#!/usr/bin/env node
/*
 * Aggiorna data/steam-data.js con i dati attuali dello store Steam:
 *  - prezzo (Italia, EUR), sconti, immagine, descrizione, recensioni per i giochi del catalogo
 *  - appid per i giochi del catalogo che non lo hanno ancora (ricerca per nome)
 *  - "candidati": i giochi multiplayer più venduti che Steam marca "Cross-Platform Multiplayer"
 *    e che non sono nel catalogo (da verificare: Steam non dice se il cross-play include Xbox)
 *
 * Uso: node scripts/update-steam.mjs
 * Nessuna chiave API necessaria. Gira anche in GitHub Actions (vedi .github/workflows).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { GAMES } = require(path.join(ROOT, 'js/games.js'));
const OUT = path.join(ROOT, 'data/steam-data.js');

const STORE = 'https://store.steampowered.com';
const CC = 'it';
const LANG = 'italian';
// Categorie Steam: 27 = Multigiocatore multipiattaforma, 38 = Cooperativa online, 36 = PvP online
const CAT_CROSS_PLATFORM = 27;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'app-attempatoni/1.0' } });
      if (res.status === 429) { await sleep(5000 * (i + 1)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(1500 * 2 ** i);
    }
  }
  return null;
}

async function loadPrevious() {
  try {
    const txt = await readFile(OUT, 'utf8');
    return JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
  } catch {
    return { apps: {}, resolved: {}, candidates: [] };
  }
}

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function resolveAppid(game) {
  const term = game.name.replace(/\(.*?\)/g, '').trim();
  const data = await getJson(`${STORE}/api/storesearch/?term=${encodeURIComponent(term)}&l=${LANG}&cc=${CC}`);
  const items = (data && data.items) || [];
  const wanted = normalize(term);
  const hit = items.find((it) => normalize(it.name) === wanted) || items.find((it) => normalize(it.name).startsWith(wanted));
  return hit ? hit.id : null;
}

async function appDetails(appid) {
  const data = await getJson(`${STORE}/api/appdetails?appids=${appid}&cc=${CC}&l=${LANG}`);
  const entry = data && data[appid];
  if (!entry || !entry.success) return null;
  const d = entry.data;
  return {
    name: d.name,
    isFree: !!d.is_free,
    price: d.price_overview
      ? {
          initial: d.price_overview.initial,
          final: d.price_overview.final,
          discount: d.price_overview.discount_percent,
          formatted: d.price_overview.final_formatted,
        }
      : null,
    headerImage: d.header_image,
    shortDescription: d.short_description,
    categories: (d.categories || []).map((c) => c.id),
    comingSoon: !!(d.release_date && d.release_date.coming_soon),
    releaseDate: d.release_date ? d.release_date.date : null,
  };
}

async function reviews(appid) {
  const data = await getJson(`${STORE}/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`);
  const q = data && data.query_summary;
  if (!q || !q.total_reviews) return null;
  return {
    desc: q.review_score_desc,
    pct: Math.round((100 * q.total_positive) / q.total_reviews),
    total: q.total_reviews,
  };
}

async function crossPlatformTopSellers(count = 100) {
  const url = `${STORE}/search/results/?query&start=0&count=${count}&filter=topsellers&category2=${CAT_CROSS_PLATFORM}&cc=${CC}&l=${LANG}&infinite=1`;
  const data = await getJson(url);
  const html = (data && data.results_html) || '';
  const out = [];
  const re = /data-ds-appid="(\d+)"[\s\S]*?<span class="title">([^<]+)<\/span>/g;
  let m;
  while ((m = re.exec(html))) out.push({ appid: Number(m[1]), name: m[2].trim() });
  return out;
}

async function main() {
  const prev = await loadPrevious();
  const result = { updatedAt: new Date().toISOString(), apps: {}, resolved: { ...prev.resolved }, candidates: [] };
  let ok = 0;
  let failed = 0;

  for (const game of GAMES) {
    if (game.store !== 'steam') continue;
    let appid = game.appid || result.resolved[game.id];
    try {
      if (!appid) {
        appid = await resolveAppid(game);
        if (appid) {
          result.resolved[game.id] = appid;
          console.log(`  appid trovato: ${game.name} -> ${appid}`);
        } else {
          console.warn(`  ! nessun appid per ${game.name}`);
          continue;
        }
      }
      const details = await appDetails(appid);
      if (!details) {
        console.warn(`  ! appdetails vuoto per ${game.name} (${appid})`);
        failed++;
        result.apps[appid] = prev.apps[appid];
        continue;
      }
      if (normalize(details.name).slice(0, 6) !== normalize(game.name).slice(0, 6)) {
        console.warn(`  ? nome diverso per ${game.id}: catalogo "${game.name}", Steam "${details.name}"`);
      }
      details.reviews = await reviews(appid);
      result.apps[appid] = details;
      ok++;
      console.log(`  ok ${game.name}: ${details.isFree ? 'gratis' : details.price ? details.price.formatted : 'n/d'}`);
    } catch (err) {
      failed++;
      console.warn(`  ! errore ${game.name}: ${err.message}`);
      if (prev.apps[appid]) result.apps[appid] = prev.apps[appid];
    }
    await sleep(1600); // appdetails tollera circa 200 richieste ogni 5 minuti
  }

  try {
    const known = new Set(Object.keys(result.apps).map(Number));
    const top = await crossPlatformTopSellers();
    for (const c of top) {
      if (known.has(c.appid) || result.candidates.length >= 30) continue;
      const d = await appDetails(c.appid);
      await sleep(1600);
      // Ci interessano solo i giochi con multiplayer online (co-op 38 o PvP 36)
      if (!d || !d.categories.some((id) => id === 38 || id === 36)) continue;
      result.candidates.push({
        appid: c.appid,
        name: d.name,
        isFree: d.isFree,
        price: d.price,
        headerImage: d.headerImage,
        shortDescription: d.shortDescription,
        coop: d.categories.includes(38),
        pvp: d.categories.includes(36),
      });
    }
    console.log(`Candidati cross-platform trovati: ${result.candidates.length}`);
  } catch (err) {
    console.warn(`Ricerca candidati fallita: ${err.message}`);
    result.candidates = prev.candidates || [];
  }

  const body = `// File generato da scripts/update-steam.mjs: non modificare a mano.\nwindow.STEAM_DATA = ${JSON.stringify(result, null, 2)};\n`;
  await writeFile(OUT, body);
  console.log(`Fatto: ${ok} giochi aggiornati, ${failed} errori. Scritto ${path.relative(ROOT, OUT)}`);
  if (ok === 0) process.exitCode = 1;
}

main();
