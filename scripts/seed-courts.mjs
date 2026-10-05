#!/usr/bin/env node
// Builds the Utah and Idaho pickleball court seed from OpenStreetMap.
//
//   node scripts/seed-courts.mjs
//
// Writes supabase/seed/courts_utah_idaho.sql. Run that file once in the Supabase
// SQL Editor (it calls seed_map_courts from migration 20261021). Running it
// again is safe: courts that are already on Sickle are skipped.
//
// Needs Node 18 or newer and an internet connection. No packages.
// To test without the network: node scripts/seed-courts.mjs --from sample.json
// (a saved Overpass response with an "elements" list; used for both states).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const states = [
  { code: 'US-UT', name: 'Utah' },
  { code: 'US-ID', name: 'Idaho' },
];
const servers = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const out = 'supabase/seed/courts_utah_idaho.sql';
const chunk = 250;

// Same rules as the app (lib/courts.ts).
const notACourt = /\b(shop|store|outlet|supply|supplies|gear|apparel|sports? (goods|authority)|academy|lessons?|coach(ing)?|club ?house|restaurant|grill|bar)\b/i;

function miles(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

async function overpass(query) {
  for (const server of servers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`  asking ${new URL(server).host}...`);
        const res = await fetch(server, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'sickle-seed/1.0' },
          body: `data=${encodeURIComponent(query)}`,
        });
        if (res.ok) return (await res.json()).elements ?? [];
        console.log(`  ${res.status}, trying again`);
      } catch (e) {
        console.log(`  ${e.message}, trying again`);
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  throw new Error('No map server answered. Try again in a few minutes.');
}

function toSpots(elements) {
  // Bucket by roughly 0.01 degrees so merging stays fast.
  const grid = new Map();
  const spots = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) continue;
    const tags = el.tags ?? {};
    if (tags.access === 'private' || tags.access === 'no') continue;
    const name = tags.name;
    if (name && notACourt.test(name)) continue;
    if (!/pickleball/.test(tags.sport ?? '') && !/pickle ?ball/i.test(name ?? '')) continue;
    const gx = Math.floor(lat * 100);
    const gy = Math.floor(lng * 100);
    let merged = null;
    for (let dx = -1; dx <= 1 && !merged; dx++) {
      for (let dy = -1; dy <= 1 && !merged; dy++) {
        merged = (grid.get(`${gx + dx},${gy + dy}`) ?? []).find((s) => miles({ lat: s.la, lng: s.lo }, { lat, lng }) < 0.06) ?? null;
      }
    }
    const count = Number(tags.courts) > 0 ? Number(tags.courts) : null;
    if (merged) {
      if (name && !merged.named) Object.assign(merged, { n: name, named: true });
      if (count && !merged.c) merged.c = count;
      continue;
    }
    const street = tags['addr:street'];
    const spot = {
      n: name ?? (street ? `Pickleball courts on ${street}` : 'Pickleball courts'),
      a: street ?? undefined,
      la: Math.round(lat * 1e6) / 1e6,
      lo: Math.round(lng * 1e6) / 1e6,
      p: `osm:${el.type}/${el.id}`,
      c: count ?? undefined,
      named: Boolean(name),
    };
    spots.push(spot);
    const key = `${gx},${gy}`;
    grid.set(key, [...(grid.get(key) ?? []), spot]);
  }
  return spots.map(({ named, ...s }) => s);
}

const fromIndex = process.argv.indexOf('--from');
const sample = fromIndex > -1 ? JSON.parse(readFileSync(process.argv[fromIndex + 1], 'utf8')).elements ?? [] : null;

const all = [];
for (const state of states) {
  console.log(`${state.name}...`);
  const query = `[out:json][timeout:180];area["ISO3166-2"="${state.code}"]->.a;(nwr["sport"~"pickleball"](area.a);nwr["name"~"pickle ?ball",i](area.a););out center tags;`;
  const elements = sample ?? (await overpass(query));
  const spots = toSpots(elements);
  console.log(`  ${spots.length} courts`);
  all.push(...spots);
}

// Utah and Idaho share a border, so merge once more across both.
const seen = new Set();
const unique = all.filter((s) => (seen.has(s.p) ? false : seen.add(s.p)));

let sql = `-- Pickleball courts in Utah and Idaho, from OpenStreetMap.\n-- Built ${new Date().toISOString().slice(0, 10)} by scripts/seed-courts.mjs. ${unique.length} courts.\n-- Run once in the Supabase SQL Editor. Safe to run again.\n\n`;
for (let i = 0; i < unique.length; i += chunk) {
  const json = JSON.stringify(unique.slice(i, i + chunk));
  sql += `select public.seed_map_courts($sickle$${json}$sickle$::jsonb);\n`;
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, sql);
console.log(`\nDone. ${unique.length} courts written to ${out}`);
