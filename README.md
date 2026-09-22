## CodeFeast

High-security coding assessment platform with a neon-glass UI.

### Stack
- **Frontend**: React + TypeScript + Vite + Tailwind + Framer Motion + Monaco Editor
- **Backend**: Express + TypeScript + MongoDB (native driver)
- **Optional services**: Judge0 (code execution), OpenAI (DSA problem generator)

## Quick start

### Prerequisites
- **Node.js** 18+
- **npm** (or pnpm/yarn)
- **MongoDB** running locally or an Atlas URI

### 1) Backend
```bash
cd backend
npm install
# create .env (see template below)
npm run dev
```
The API listens on port 4000 by default.

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```
App is available at `http://localhost:5173`. The dev server proxies `/api` to `http://localhost:4000`.

### 3) Seed a sample problem (optional but recommended)
```bash
cd backend
npx tsx src/scripts/seed.ts
```
This inserts the "Two Sum" problem from `backend/src/seed/sampleProblem.json`.

## Configuration

Create `backend/.env` with the following keys:
```ini
# Server
PORT=4000

# MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=codefeast

# Auth
JWT_SECRET=change-me

# Optional Google Sign-In (used by /api/auth/google)
GOOGLE_CLIENT_ID=

# Optional OpenAI (used by admin problem generator)
OPENAI_API_KEY=

# Optional Judge0 (used by code runner)
# Example (RapidAPI-hosted Judge0 CE):
# JUDGE0_URL=https://judge0-ce.p.rapidapi.com
# JUDGE0_KEY=your-rapidapi-key
JUDGE0_URL=
JUDGE0_KEY=
```

Notes:
- `JWT_SECRET` must be set in production (app will exit if missing with `NODE_ENV=production`); dev fallback only for local.
- Admin seeding: set `SEED_ADMIN_EMAIL` to the email that should become admin on first registration. Otherwise first user becomes admin with warning (legacy).
- `FRONTEND_URL` / `ALLOWED_ORIGINS` controls CORS (default `http://localhost:5173,http://localhost:5178`).
- If `OPENAI_API_KEY` is not set, admin generation will return a 400 error.
- If Judge0 env vars are not set, runner uses a sandboxed JS-only VM (blocked patterns, 1.5s timeout) and returns explanatory messages for other languages.
- `VITE_API_URL` defaults to `/api` (proxy in dev, same-origin in prod). Set explicitly for cloud deployments.
- Reports `GET` now requires admin auth; use `?limit=50&skip=0` for pagination.
- **Security:** rotate any leaked keys from previous `.env` (committed secrets). Consider moving git root into `CodeFeast/` only.

## Scripts

### Backend
- `npm run dev`: start API with tsx (watch)
- `npm run build`: type-check and build to `dist`
- `npm start`: run built server from `dist/index.js`

### Frontend
- `npm run dev`: start Vite dev server
- `npm run build`: type-check (project refs) and build
- `npm run preview`: preview built frontend

## API overview

Base URL in dev: `http://localhost:4000/api`

### Health
- `GET /api/health` → `{ ok: true }`

### Auth
- `POST /api/auth/register` → `{ token, user }` (first user becomes admin)
- `POST /api/auth/login` → `{ token, user }`
- `POST /api/auth/google` → `{ token, user }` (requires `GOOGLE_CLIENT_ID`)
- `GET /api/auth/me` (Bearer token) → `{ user }`

### Problems
- `GET /api/problems` → list (excludes hidden testcases)
- `GET /api/problems/sample` → one sample (excludes hidden testcases)
- `DELETE /api/problems/:id` (admin) → `{ ok: true }`

### Admin
- `POST /api/admin/generate` (admin) → create AI-generated DSA problem (requires `OPENAI_API_KEY`)
- `POST /api/admin/problems` (admin) → create problem from JSON payload

### Runner
- `POST /api/runner/execute` → execute code with provided `testcases`.
  - With Judge0 configured: uses Judge0 synchronous submissions.
  - Without Judge0: JS-only demo evaluator; other languages return an explanatory error per case.

### Assessments
- `GET /api/assessments` (auth) → list
- `GET /api/assessments/:id` (auth) → detail
- `POST /api/assessments` (admin) → create
- `PUT /api/assessments/:id` (admin) → update
- `DELETE /api/assessments/:id` (admin) → delete
- `POST /api/assessments/submit` (auth) → submit solution; also writes a lightweight report row

### Reports
- `GET /api/reports?limit=50&skip=0` (admin) → paginated reports
- `POST /api/reports/submit` (auth) → append a report row (email from token)
- `POST /api/reports/force-end` (auth) → record forced end event and a minimal report entry
- `DELETE /api/reports/:id` (admin) → delete one
- `DELETE /api/reports` (admin) → delete all

## Frontend integration

- API client attaches `Authorization: Bearer <token>` from `localStorage` key `cf_token`.
- Unauthorized responses (401) clear storage and redirect to `/login`.
- Dev proxy is defined in `frontend/vite.config.ts`:
  - `/api` → `http://localhost:4000`

## Troubleshooting

- **Vite proxy ECONNREFUSED (/api/...)**
  - Cause: backend not running or wrong `PORT`.
  - Fix: start backend on port 4000 or update `frontend/vite.config.ts` proxy target.

- **MongoDB connection errors**
  - Ensure local MongoDB is running or provide a valid `MONGODB_URI`.

- **OpenAI/Judge0 not configured**
  - Admin generation and multi-language execution require the respective env vars. Without them, endpoints respond with clear error messages or JS-only fallback.

## Production

1. Backend
```bash
cd backend
npm run build
npm start
```
2. Frontend
```bash
cd frontend
npm run build
npm run preview # or serve the dist/ with your web server
```

Harden rate limits, tokens, CORS, and TLS for production.
