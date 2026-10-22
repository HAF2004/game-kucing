# Kucing Terbang

Kucing Terbang is a React, TypeScript, and Vite game with a Node.js player and leaderboard API. Vercel serves the Vite assets and runs the API as a serverless Node function. Turso/libSQL stores player identities, scores, audit events, and rate-limit state across deployments and function instances.

## Local development

Use Node.js 24 and npm. Install dependencies, then start the local app:

```sh
npm ci
npm run dev
```

The local API uses a file-backed SQLite database at `.data/kucing_terbang.sqlite` and applies additive schema migrations at startup. It seeds the five existing demo leaderboard rivals only when the player table is empty. Local SQLite is for development; deployed Vercel functions require Turso credentials and never fall back to a local or in-memory database.

Useful checks:

```sh
npm run lint
npm test
npm run build
```

## Production database

Create a Turso/libSQL database and a database-scoped server-side authentication token. With the Turso CLI installed, the current CLI flow is:

```sh
turso auth login
turso db create kucing-terbang
turso db show --url kucing-terbang
turso db tokens create kucing-terbang
```

Use the database URL and token output for the server-side environment variables below. The token needs read/write access for sessions, usernames, rate limits, and score submissions; keep it scoped to this database and private.

- `TURSO_DATABASE_URL`: the database URL, such as `libsql://<database>-<organization>.turso.io`.
- `TURSO_AUTH_TOKEN`: the matching server-side database token.

You can also create the database and token in the Turso dashboard.

Set both values in the Vercel project for **Production** and any Preview environments that should use a database. Do not prefix them with `VITE_`. The browser bundle must never receive these credentials. `.env.example` contains placeholders only; do not commit a real `.env` file.

Before the first deployment that serves API traffic, apply schema migrations from a trusted machine with those variables available:

```sh
npm ci
npm run db:migrate
```

The migration command changes only the schema and is safe to run again. It does not seed or erase player data. If you want the five existing demo rivals in a completely empty database, run `npm run db:seed` after migrations. Seeding is idempotent and skips all seed insertion whenever any player already exists.

### Transfer an existing local SQLite database

The importer is optional. It reads the local database without modifying it, refuses to import into a Turso database that already has players, scores, or audit events, copies those records in one transaction, and verifies the copied counts before commit.

1. Back up `.data/kucing_terbang.sqlite` and confirm the backup can be opened.
2. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in a trusted local environment.
3. Do not seed the empty Turso database first.
4. Run `npm run db:import-sqlite -- .data/kucing_terbang.sqlite`.
5. Verify the reported record counts and test player/profile/leaderboard reads before switching traffic.

The import preserves player IDs, hashed authentication tokens, usernames, player statistics, score idempotency keys, and audit events. It does not import historical rate-limit counters. No local database was included with the repository when this change was prepared, so no production or local records have been transferred here. Keep the original SQLite file and a Turso backup until verification is complete. The importer refuses non-empty targets rather than merging or overwriting them.

## Vercel deployment

The project uses Vercel's Vite framework build, with `npm ci` and `npm run build`, and publishes `dist/`. `api/handler.ts` is the serverless Node function. Rewrites send `/api/*` requests to that function and keep API paths out of the Vite SPA fallback. The handler shares the same route services used by local development and does not start an Express listener.

Deployment steps:

1. Create the Turso database and set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the Vercel project for the Production environment.
2. Run `npm run db:migrate` with the same database credentials from a trusted machine. Optionally run `npm run db:seed` only if the database is empty and demo rivals are wanted.
3. Configure Vercel to use the repository's Node.js 24 runtime and Vite framework preset. The repository pins Node 24 in `package.json`.
4. Deploy or redeploy after adding the variables.
5. Verify the API routes and the game in the production domain. A production deployment was not available from this checkout, so the steps here have not been executed against the owner’s Vercel or Turso accounts.

Required API routes:

- `POST /api/v1/players/session`
- `GET /api/v1/players/:playerId`
- `PATCH /api/v1/players/:playerId/username`
- `GET /api/v1/leaderboard`
- `POST /api/v1/leaderboard/submit`

Unknown `/api/*` paths return the JSON error envelope. Frontend navigation still falls through to `index.html`; static assets are served from `dist/assets`.

## Verify API responses

Use the browser's Network panel or `curl` against the deployed origin. API responses should have `Content-Type: application/json` and an envelope with `ok` plus `data` or `error`.

```sh
curl -i https://<your-domain>/api/v1/leaderboard
curl -i -X POST https://<your-domain>/api/v1/players/session \
  -H "Content-Type: application/json" \
  --data '{"deviceId":"dev_verify_player_001"}'
curl -i https://<your-domain>/api/v1/not-a-route
```

The session call creates a real player, so use a test deployment or remove test data through an intentional database procedure. Do not use a client's device ID alone as proof of identity: browser storage can be copied or cleared. The existing recovery token is verified server-side, and only its hash is stored.

## Troubleshooting

- **API 404:** confirm the deployed commit contains `api/handler.ts`, the Vercel build uses this `vercel.json`, and the requested path starts with `/api/v1/`.
- **API returns HTML:** verify the API rewrite is deployed. API paths are excluded from the SPA rewrite; an HTML response usually means the current deployment has older routing configuration or the request missed the API function.
- **Invalid or empty JSON response:** inspect the HTTP status and `Content-Type` in the Network panel. The frontend reports empty, malformed, HTML, network, and backend errors separately and does not parse a response body twice.
- **HTTP 500 or 503:** check Vercel function logs for the sanitized error category, confirm both Turso variables exist in the correct environment, and run `npm run db:migrate`. The function never initializes a temporary production database.
- **Database connection failure:** verify the URL/token pair, database availability, token permissions, and that the Vercel environment was redeployed after changing variables. Do not paste tokens into logs or issue reports.
- **Score not shown on the leaderboard:** local gameplay and local best-score/achievement progress continue when offline, but a score is reported remotely only after the server accepts it. Check the API response and idempotency key before resubmitting manually.

## Schema changes and recovery

Schema versions are recorded in `schema_migrations`; migrations run in a libSQL write transaction and add tables, indexes, and integrity triggers. Apply them explicitly with `npm run db:migrate`, not in ordinary function requests. Back up the Turso database before schema changes and keep a separate copy of the local SQLite source during transfer. These migrations do not drop existing tables or records. If a migration or import fails, inspect the sanitized command result and database state before retrying; the importer rolls back the entire data copy on failure and will not merge into a populated target.
