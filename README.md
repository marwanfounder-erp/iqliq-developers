# Thief — Party Game

A real-time multiplayer party game of deception and deduction. One player is the Thief, one is the Police — everyone picks a token and the Police must figure out who the Thief is.

## Tech Stack

- **Next.js 14** (App Router) + TypeScript
- **Neon** — serverless Postgres for game state
- **Pusher Channels** — real-time events between players
- **Tailwind CSS** — mobile-first styling

## Game Phases

1. **Waiting** — Players join and pick a token (item). Host starts when all are ready.
2. **Revealing** — Each player privately reveals their role on their own device.
3. **Guessing** — Police sees all players + tokens and picks the Thief.
4. **Result** — Outcome revealed, scores updated. Host starts next round.

Roles per game: **1 Thief**, **1 Police**, **rest Civilians**. Minimum 4 players.

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd iqliq-thief-game
npm install
```

### 2. Create a Neon database

1. Sign up at [neon.tech](https://neon.tech) (free tier)
2. Create a new project
3. Copy the **connection string** from the dashboard

### 3. Run the SQL schema

Open the **SQL Editor** in your Neon project dashboard and paste the contents of [`schema.sql`](./schema.sql), then run it.

### 4. Create a Pusher app

1. Sign up at [pusher.com](https://pusher.com) (free tier)
2. Create a new app — choose the **Channels** product
3. Pick a cluster (e.g. `mt1` for US East)
4. Note your **App ID**, **Key**, **Secret**, and **Cluster**

### 5. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

```env
DATABASE_URL=postgresql://...          # from Neon dashboard
PUSHER_APP_ID=...
PUSHER_SECRET=...
NEXT_PUBLIC_PUSHER_KEY=...
NEXT_PUBLIC_PUSHER_CLUSTER=mt1
```

### 6. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Share the room code with friends on the same network (or deploy to Vercel).

### 7. Deploy to Vercel

1. Push the repo to GitHub
2. Import the project at [vercel.com](https://vercel.com)
3. Add the five environment variables in **Settings → Environment Variables**
4. Deploy — Vercel auto-detects Next.js

---

## API Reference

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/create-room` | Creates a room and adds the first player |
| POST | `/api/join-room` | Joins an existing room |
| POST | `/api/pick-token` | Player locks in their token choice |
| POST | `/api/assign-roles` | Host shuffles roles and starts the game |
| POST | `/api/make-guess` | Police submits their guess |
| GET | `/api/room/[code]` | Returns room state and players |
| POST | `/api/room/[code]` | Actions: `next-round`, `start-guessing` |

## Pusher Events (channel: `room-{code}`)

| Event | Payload |
|-------|---------|
| `player-joined` | `{ players }` |
| `token-picked` | `{ players }` |
| `roles-assigned` | `{ state: 'revealing' }` |
| `guessing-started` | `{ state: 'guessing' }` |
| `guess-made` | `{ correct, guessedName, thiefName, thiefToken, players }` |
| `next-round` | `{}` |
