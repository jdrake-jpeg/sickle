# Sickle

Pickleball matchmaking, doubles teams, challenges and court rankings. Built with
Expo (React Native) for iOS and Android, with Supabase for the backend.

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with the Expo Go app on your phone. If your phone can't reach
your computer (school or public Wi-Fi often blocks it), use
`npx expo start --tunnel` instead. Until Supabase is
connected, every screen runs on sample data from `lib/sample-data.ts`.

## Connect Supabase

1. Create a project at supabase.com.
2. Copy `.env.example` to `.env.local` and paste in the project URL and anon key
   (Project Settings > API). Never put the `service_role` key in the app.
3. Apply the database schema: `npx supabase link` then `npx supabase db push`,
   or paste each file in `supabase/migrations/` into the SQL editor, oldest first.
4. For testing, turn off email confirmation (Authentication > Sign In / Providers >
   Email > Confirm email) so new accounts can log in right away. Turn it back on
   before launch.
5. Restart `npx expo start`. The app now asks you to log in, then to pick a
   username.

## Sign in with Google

The sign-in screen has Continue with Google, which also signs new players up.
To turn it on:

1. In the Google Cloud console, go to APIs & Services > OAuth consent screen
   (Google Auth Platform) and set it up as External, with the app name Sickle.
2. Go to Credentials > Create credentials > OAuth client ID, type **Web
   application**. Under Authorized redirect URIs add
   `https://<your-project-ref>.supabase.co/auth/v1/callback`. Copy the client ID
   and client secret.
3. In Supabase, go to Authentication > Sign In / Providers > Google, turn it on,
   and paste the client ID and secret.
4. In Supabase, go to Authentication > URL Configuration and add these Redirect
   URLs: `exp://**` (Expo Go) and `sickle://**` (real builds).

## Sign in with Apple

On iPhone the sign-in screen also shows Continue with Apple (Apple requires it
next to Google). It only works in a real build (TestFlight or the App Store),
not in Expo Go. To turn it on:

1. In Supabase, go to Authentication > Sign In / Providers > Apple and turn it on.
2. Under Client IDs, add the app's bundle ID: `app.sicklepickle`. Native sign-in
   needs nothing else (the secret key fields are only for web sign-in).

The bundle ID needs Sign in with Apple turned on in the Apple Developer portal;
EAS Build does that for you when it sets up the app.

## Delete my account

Settings > Delete my account calls `delete_my_account`. It deletes the login and
everything personal (location, friends, ratings, blocks, reports). Played
matches stay so other teams' records don't change; the profile becomes a
"Deleted player" placeholder nobody can find, friend, team up with or challenge.
The last admin can't delete their account.

## Privacy policy and terms

The text lives in `constants/legal.json`. The app shows it in `app/privacy.tsx`
and `app/terms.tsx` (open to everyone, signed in or not), and
`npm run build:site` turns the same text into the public website in `site/`:
a home page, `/privacy` and `/terms`. After changing the text, run
`npm run build:site` and commit `site/` too.

`site/` is served by Cloudflare Pages at sicklepickle.app: Workers & Pages >
Create > Pages > Connect to Git, pick this repo, leave the build command empty
and set the build output directory to `site`. Then add `sicklepickle.app` under
the project's Custom domains.

## Store builds

The app ID is `app.sicklepickle` on both iPhone and Android. It can't change
after launch. Build settings are in `eas.json`. EAS builds don't see
`.env.local`, so add `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` as EAS environment variables (expo.dev > your
project > Environment variables, for preview and production), or the build runs
in demo mode.

## Location

Looking to Play asks for location the first time you tap Go. In Expo Go the
prompt names Expo Go rather than Sickle; that's expected. If you said no, turn
it back on in your phone's Settings under Expo Go > Location. Only a rough
position is stored (rounded to about 1 km) and other players see a distance,
never coordinates.

## Courts, maps and admins

Courts come from Sickle's own list, not from Google. Anyone can submit a court
from the Courts tab (Add a court): they drop a pin and give it a name. It stays
hidden until an admin approves it; then it shows on the map, gets a leaderboard
and can host challenges.

Make yourself an admin after you've signed up in the app, by running this in the
Supabase SQL editor:

```sql
update public.profiles set is_admin = true where username = 'your_username';
```

That's the only time you need SQL. Admins see a Review banner on the Courts tab,
and Settings has Review submitted courts and Manage admins, where an admin can
make another player an admin or remove one. The database checks this, so
nobody else can, and the last admin can't be removed. Other players never see
these screens. (In demo mode, with no Supabase, you see them so you can look
around.)

### Finding courts with Google

The map shows gray pins for pickleball courts Google knows about that aren't on
Sickle yet. Anyone can tap one to submit it, and admins can add them straight
to the map from Review courts. This runs through the `find-courts` edge
function so the Google key never ships in the app. To turn it on:

1. In the Google Cloud console, create a project, turn on billing, and enable
   **Places API (New)**.
2. Create an API key under APIs & Services > Credentials. Restrict it to
   Places API (New).
3. In Supabase, open Edge Functions > Secrets and add `GOOGLE_PLACES_API_KEY`
   with that key.
4. Deploy the function: Edge Functions > Deploy a new function > Via editor,
   name it `find-courts`, paste `supabase/functions/find-courts/index.ts`, and
   deploy. (Or `npx supabase functions deploy find-courts`.)

Without it, everything else works; the gray pins just don't show.

### Map tiles

The map uses Apple Maps on iPhone and Google Maps on Android. Expo Go needs no
map key. For an Android store build, create a Google Maps API key (Google Cloud
console > APIs & Services, enable "Maps SDK for Android"), restrict it to
Android apps with your package name and signing certificate, and set it as the
`GOOGLE_MAPS_ANDROID_API_KEY` EAS environment variable. Don't commit it.

## How results are verified

Every match is ranked and comes from an accepted challenge. Nobody can write
results directly; the app calls database functions:

- `submit_match_result`: a player in the match enters each game's score. The
  database checks they really are a best-of-3 (to 11, win by 2).
- `confirm_match_result`: only a player on the **other** team can confirm.
- `dispute_match_result`: the other team enters the score they think is right,
  which goes back to the first team. After two corrections, another dispute
  sends the match to an admin (status `needs_admin`).
- `expire_unanswered_results`: results nobody answers for 72 hours become
  `unconfirmed`. Schedule it hourly with pg_cron.

After a match is confirmed, the players can privately rate the level each
other player really played at (`rate_player`, within 14 days). Only the rated
player sees it (`my_ratings`, `my_rating_summary`, and the friend inbox in
`friend_activity`). Ratings never change rankings.

Only confirmed matches count in `team_records`, `player_records` and
`court_leaderboard` (Elo per team per court; rank 1 holds the crown). Admin edits
to a confirmed match are written to `match_audit_log`.

Run the database tests against a throwaway local Postgres (needs Postgres
installed, run as a non-root user):

```bash
npm run test:db
```

## First release scope

Built to the October first release in the plan doc: sign-up and login, profiles,
Looking to Play with nearby players and search, unlimited two-person teams,
challenges (accept or decline), best-of-3 scores both teams agree on, Rexburg
courts with leaderboards and crowns, block and report, and four tabs (Play,
Challenges, Courts, Profile). Also: a courts map, court sign-up with admin
approval, courts found through Google, and friends (requests, a friends list,
and everyone you've challenged or played), a private inbox per friend with your
games and ratings, private player ratings after a match, court conditions
(wet, windy, icy, crowded; reports fade after 6 hours), and a simple rules page.
Push notifications are next.

Everything is wired to Supabase. Without `.env.local` the app runs in demo mode
on sample data.

## Project layout

- `app/` screens (Expo Router). The four tabs live in `app/(tabs)/`.
- `components/ui.tsx` shared building blocks (text, cards, buttons, chips).
- `constants/theme.ts` brand colors and the dark and light palettes.
- `lib/theme.tsx` light, dark or match-phone appearance setting.
- `supabase/migrations/` database schema, security rules and functions.
