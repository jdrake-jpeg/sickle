// Searches Google Places for pickleball courts near a spot, so the app can
// show courts that exist but aren't on Sickle yet. The Google key stays here on
// the server (set it as the GOOGLE_PLACES_API_KEY secret); the app never sees it.
//
// Deploy from the Supabase dashboard (Edge Functions > Deploy a new function >
// Via editor, name it find-courts) or with `npx supabase functions deploy find-courts`.
// Only signed-in players can call it ("Verify JWT" stays on).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Place = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!key) return json({ error: 'Google search is not set up yet' }, 503);

  let lat: number, lng: number;
  try {
    ({ lat, lng } = await req.json());
  } catch {
    return json({ error: 'Send lat and lng' }, 400);
  }
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return json({ error: 'Send lat and lng' }, 400);
  }

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({
      textQuery: 'pickleball courts',
      maxResultCount: 20,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 25000 } },
    }),
  });
  if (!res.ok) {
    console.error('Places error', res.status, await res.text());
    return json({ error: 'Google search failed' }, 502);
  }

  const { places = [] } = (await res.json()) as { places?: Place[] };
  const courts = places
    .filter((p) => p.location && p.displayName?.text)
    .map((p) => ({
      place_id: p.id,
      name: p.displayName!.text.slice(0, 60),
      address: p.formattedAddress ?? null,
      lat: p.location!.latitude,
      lng: p.location!.longitude,
    }));
  return json({ courts });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
