# GATE Productivity

GATE/27 is a Next.js study dashboard connected to an Express/TypeScript API backed by Supabase. It includes a session timer and editor, daily/hourly/weekly/monthly study views, the subject catalogue, and question totals. The API is single-user and has no login or rate limiting.

## Setup

1. Install dependencies with `npm install`.
2. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the root `.env`. The backend reads them and uses the Supabase Data API; no database password or Auth user UUID is needed.
   - Keep `SUPABASE_SECRET_KEY` server-side. Never prefix it with `NEXT_PUBLIC_` or include it in browser code.
   - `PORT` (optional, default `4000`) and `WEB_ORIGIN` (optional CORS origin, default `http://localhost:3000`).
3. Optionally create `web/.env.local` and set `NEXT_PUBLIC_API_URL` if the API is not at `http://localhost:4000/api`.
4. Ensure the GATE tables and the single-user migration are present in Supabase.
5. The API has no login and is intended for one trusted user. Do not expose the API or its server-side database credentials publicly.
6. Start the frontend and API together with:

   ```sh
   npm run dev
   ```

The frontend listens on `http://localhost:3000` and the API on `http://localhost:4000`; `/api/health` checks that Supabase is reachable. `npm run dev` starts both services for local development. The root `npm start` also starts both processes and is intended for local use, not a single Railway service.

## Railway deployment

Deploy this monorepo as **two Railway services**, both using the repository root as their working directory so npm workspaces and the root lockfile are available:

| Service | Build command | Start command | Required variables |
| --- | --- | --- | --- |
| API | `npm run build:api` | `npm run start:api` | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `WEB_ORIGIN` |
| Web | `npm run build:web` | `npm run start:web` | `NEXT_PUBLIC_API_URL` |

Set `WEB_ORIGIN` to the web service's public origin. Set `NEXT_PUBLIC_API_URL` to `https://api-production-8ea0.up.railway.app/api` (or your API service's public URL followed by `/api`); Next.js embeds this value during the web build, so configure it before building. Railway provides `PORT` to each service. Keep the Supabase secret only on the API service and never set it as a `NEXT_PUBLIC_` variable.

**Access warning:** this API intentionally has no authentication and its session routes can write to Supabase. A public Railway API URL is reachable by anyone; CORS does not restrict non-browser clients. Do not make the API public until you have chosen an access-control approach or explicitly accept that exposure. This project currently has no auth-free way to keep the browser frontend public while restricting API writes.

## API

All routes are under `/api`. The API calls Supabase's REST Data API with the server-only secret key. Calendar day boundaries and ISO Monday week starts use UTC. Hourly breakdowns are computed from sessions; no hourly table is stored.

Endpoints include `/sessions`, `/sessions/active`, `/daily`, `/daily/:date/hourly`, `/weekly`, `/monthly`, `/questions/by-sub`, and `/subs`. Invalid input returns JSON with status 400; missing sessions/routes return 404.

The frontend reads `NEXT_PUBLIC_API_URL` at build time and defaults to `https://api-production-8ea0.up.railway.app/api`. Local development overrides it through `web/.env.local`. The API allows the frontend origin configured in `WEB_ORIGIN`.
