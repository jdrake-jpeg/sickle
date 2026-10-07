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

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
// Home and neighborhood courts: not for the public, so they never get a pin.
const privateName = /\b(home|house|residen\w*|private|backyard|back yard|driveway|family|hoa|apartments?|condos?|townhomes?|villas?|estates?|ranch|farm|my|our)\b/i;
const publicAccess = new Set(['yes', 'permissive', 'public', 'customers_and_members']);

// A court nobody named is only kept when it sits inside a named park, school
// or rec center. That is how backyard courts (almost always unnamed, on a lot
// with a house number) get left out.
function insideRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat, xi = ring[i].lon, yj = ring[j].lat, xj = ring[j].lon;
    if (yi > pt.lat !== yj > pt.lat && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function makeAreas(elements) {
  const list = [];
  for (const el of elements) {
    const name = el.tags?.name;
    if (!name || notACourt.test(name) || privateName.test(name)) continue;
    if (el.type === 'way' && el.geometry?.length > 3) {
      const lats = el.geometry.map((g) => g.lat), lons = el.geometry.map((g) => g.lon);
      list.push({ name, ring: el.geometry, box: [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)] });
    } else if (el.bounds) {
      const b = el.bounds;
      list.push({ name, ring: null, box: [b.minlat, b.minlon, b.maxlat, b.maxlon] });
    }
  }
  const size = (a) => (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]);
  return list.sort((a, b) => size(a) - size(b));
}

// The smallest named park, school or rec center that contains the point.
function areaAt(areas, lat, lng) {
  return areas.find((a) => lat >= a.box[0] && lat <= a.box[2] && lng >= a.box[1] && lng <= a.box[3] && (!a.ring || insideRing({ lat, lng }, a.ring)))?.name ?? null;
}

function miles(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

async function overpass(query) {
  // The free servers are often busy (504). Keep cycling through them, waiting a bit longer each round.
  for (let round = 1; round <= 6; round++) {
    for (const server of servers) {
      try {
        console.log(`  asking ${new URL(server).host}...`);
        const res = await fetch(server, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'sickle-seed/1.0' },
          body: `data=${encodeURIComponent(query)}`,
        });
        if (res.ok) return (await res.json()).elements ?? [];
        console.log(`  ${res.status}, busy`);
      } catch (e) {
        console.log(`  ${e.message}`);
      }
    }
    const wait = round * 10;
    console.log(`  waiting ${wait} seconds, then trying again (round ${round + 1} of 6)`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  throw new Error('No map server answered. Run it again in a few minutes. States that finished are saved, so it picks up where it left off.');
}

function toSpots(elements, areas) {
  // Bucket by roughly 0.01 degrees so merging stays fast.
  const grid = new Map();
  const spots = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) continue;
    const tags = el.tags ?? {};
    // Anything marked as not open to everyone is out.
    if (tags.access && !publicAccess.has(tags.access)) continue;
    if (tags['operator:type'] === 'private' || tags.location === 'private' || tags.private) continue;
    const name = tags.name;
    if (name && (notACourt.test(name) || privateName.test(name))) continue;
    // Courts tagged for pickleball, tennis courts with pickleball lines, or named for it.
    const tagged = /pickleball/.test(tags.sport ?? '') || /pickleball/.test(tags.lines ?? '') || tags.pickleball === 'yes';
    if (!tagged && !/pickle ?ball/i.test(name ?? '')) continue;
    // A house number and no name is somebody's yard.
    if (!name && tags['addr:housenumber']) continue;
    const inPark = name ? null : areaAt(areas, lat, lng);
    if (!name && !inPark) continue;
    const gx = Math.floor(lat * 100);
    const gy = Math.floor(lng * 100);
    let merged = null;
    for (let dx = -1; dx <= 1 && !merged; dx++) {
      for (let dy = -1; dy <= 1 && !merged; dy++) {
        merged = (grid.get(`${gx + dx},${gy + dy}`) ?? []).find((s) => miles({ lat: s.la, lng: s.lo }, { lat, lng }) < 0.06) ?? null;
      }
    }
    // Same park again (a second court across the park): one pin per park.
    if (!name && inPark) {
      const same = spots.find((sp) => sp.park === inPark && miles({ lat: sp.la, lng: sp.lo }, { lat, lng }) < 0.5);
      if (same) continue;
    }
    const count = Number(tags.courts) > 0 ? Number(tags.courts) : null;
    if (merged) {
      if (name && !merged.named) Object.assign(merged, { n: name, named: true });
      if (count && !merged.c) merged.c = count;
      continue;
    }
    const street = tags['addr:street'];
    const spot = {
      n: (name ?? inPark).slice(0, 60),
      park: name ? undefined : inPark,
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
  return spots.map(({ named, park, ...s }) => s);
}

const fromIndex = process.argv.indexOf('--from');
const sampleFile = fromIndex > -1 ? JSON.parse(readFileSync(process.argv[fromIndex + 1], 'utf8')) : null;
const sample = sampleFile ? sampleFile.elements ?? [] : null;

const all = [];
for (const state of states) {
  console.log(`${state.name}...`);
  const query = `[out:json][timeout:180];area["ISO3166-2"="${state.code}"]->.a;(nwr["sport"~"pickleball"](area.a);nwr["lines"~"pickleball"](area.a);nwr["pickleball"="yes"](area.a);nwr["name"~"pickle ?ball",i](area.a););out center tags;`;
  // A finished state is saved, so a rerun skips it.
  const saved = `supabase/seed/.v2.${state.code}.json`;
  let spots;
  if (!sample && existsSync(saved)) {
    spots = JSON.parse(readFileSync(saved, 'utf8'));
    console.log('  already done, using the saved copy');
  } else {
    const courts = sample ?? (await overpass(query));
    console.log('  looking up the parks and schools they sit in');
    const areaQuery = `[out:json][timeout:180];area["ISO3166-2"="${state.code}"]->.a;(way["leisure"~"^(park|recreation_ground|sports_centre|stadium)$"]["name"](area.a);way["amenity"~"^(school|college|university)$"]["name"](area.a);way["landuse"="recreation_ground"]["name"](area.a);)->.w;(relation["leisure"~"^(park|recreation_ground|sports_centre)$"]["name"](area.a);relation["amenity"~"^(school|college|university)$"]["name"](area.a);)->.r;.w out geom tags;.r out bb tags;`;
    const areas = makeAreas(sampleFile ? sampleFile.areas ?? [] : await overpass(areaQuery));
    console.log(`  ${areas.length} parks, schools and rec centers`);
    spots = toSpots(courts, areas);
    if (!sample) {
      mkdirSync(dirname(saved), { recursive: true });
      writeFileSync(saved, JSON.stringify(spots));
    }
  }
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
