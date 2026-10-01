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

Nobody can write match results directly. The app calls database functions:

- `submit_match_result` checks the caller played in the match, that the four
  players are different people, and that every game score is a real pickleball
  score in a best-of-3.
- `respond_to_match_result` lets only a player on the **other** team confirm or
  dispute. Only confirmed, ranked matches count in `team_records` and
  `court_team_records`.

Run the database tests against a throwaway local Postgres (needs Postgres
installed, run as a non-root user):

```bash
npm run test:db
```

## Project layout

- `app/` screens (Expo Router). The five tabs live in `app/(tabs)/`.
- `components/ui.tsx` shared building blocks (text, cards, buttons, chips).
- `constants/theme.ts` brand colors and the dark and light palettes.
- `lib/theme.tsx` light, dark or match-phone appearance setting.
- `supabase/migrations/` database schema, security rules and functions.
