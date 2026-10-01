# Sickle

Pickleball matchmaking, doubles teams, challenges and court rankings. Built with
Expo (React Native) for iOS and Android, with Supabase for the backend.

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with the Expo Go app on your phone. Until Supabase is
connected, every screen runs on sample data from `lib/sample-data.ts`.

## Connect Supabase

1. Create a project at supabase.com.
2. Copy `.env.example` to `.env.local` and paste in the project URL and anon key
   (Project Settings > API).
3. Apply the database schema: `npx supabase link` then `npx supabase db push`,
   or paste `supabase/migrations/20261001000000_init.sql` into the SQL editor.

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
Challenges, Courts, Profile). Push notifications are next.

## Project layout

- `app/` screens (Expo Router). The four tabs live in `app/(tabs)/`.
- `components/ui.tsx` shared building blocks (text, cards, buttons, chips).
- `constants/theme.ts` brand colors and the dark and light palettes.
- `lib/theme.tsx` light, dark or match-phone appearance setting.
- `supabase/migrations/` database schema, security rules and functions.
