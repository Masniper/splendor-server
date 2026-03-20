# Splendor — Backend API & Realtime Server

![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?logo=socket.io&logoColor=white)
![License](https://img.shields.io/badge/license-ISC-lightgrey)

REST API, JWT authentication, and **Socket.io** game/room orchestration for the **Splendor** online multiplayer client. Persists users, rooms, bets, and match outcomes with **Prisma** (SQLite by default).

---

## Features

- **Auth** — Register, login, guest sessions, guest → full account upgrade
- **Users** — Profile (`/me`, update), public profile for in-game opponent modal
- **Rooms** — Create/join, public listing, host/members persisted in the database
- **Bets** — Per-room stakes, settlement on match end, winner/loser stats for game-over UI
- **Leaderboard** — Ranked listing endpoint for the client modal
- **Realtime** — Rooms, lobby sync, full Splendor game actions, rematch, disconnect/reconnect handling
- **API docs** — OpenAPI/Swagger UI at `/api-docs`
- **Tests** — Vitest unit tests for critical bet logic

---

## Tech Stack

| Layer | Technologies |
|--------|----------------|
| **Runtime** | Node.js |
| **HTTP** | Express 5 |
| **Realtime** | Socket.io |
| **Database** | SQLite (via Prisma); schema supports switching to PostgreSQL |
| **ORM** | Prisma |
| **Auth** | JWT (`jsonwebtoken`), bcrypt password hashing |
| **Validation** | Zod |
| **Docs** | swagger-jsdoc, swagger-ui-express |

---

## Prerequisites

- **Node.js** ≥ 18 (LTS recommended)
- **npm** (or compatible package manager)

---

## Installation & Local Setup

```bash
cd back-end
npm install
```

Create a `.env` file (see [Environment variables](#environment-variables)).

```bash
# Generate Prisma client & apply schema to SQLite
npx prisma migrate dev

# Development (hot reload)
npm run dev
```

The server listens on **`http://localhost:5001`** by default.

```bash
# Production-style build
npm run build
npm start
```

```bash
# Run tests
npm test
```

---

## Environment variables

Create `.env` in `back-end/`:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | Prisma connection string. Default local SQLite: `file:./dev.db` |
| `JWT_SECRET` | Recommended | Secret for signing/verifying JWTs. A long random string in production |
| `PORT` | No | HTTP/Socket.io port (default: `5001`) |

**Example `.env`:**

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me-to-a-long-random-secret"
PORT=5001
```

> Never commit real secrets. Use strong `JWT_SECRET` values in production.

---

## Project structure

```
back-end/
├── prisma/
│   └── schema.prisma      # User, Room, Bet models & enums
├── src/
│   ├── config/            # Swagger/OpenAPI spec
│   ├── controllers/       # HTTP handlers
│   ├── middlewares/     # JWT auth, socket auth
│   ├── routes/            # Express routers (/api/...)
│   ├── services/          # Business logic (auth, rooms, bets, leaderboard)
│   ├── sockets/           # Socket.io handlers (room, game)
│   ├── types/             # Shared TS types (e.g. room list DTOs)
│   ├── utils/             # Input parsing helpers
│   ├── validations/       # Zod schemas
│   └── server.ts          # App entry, HTTP + Socket.io bootstrap
├── package.json
└── tsconfig.json
```

---

## API documentation

Interactive docs (try-it-out) are served at:

**`http://localhost:<PORT>/api-docs`**

Base URL for REST: **`http://localhost:<PORT>/api`**

Main route prefixes:

- `/api/auth` — login, register, guest, upgrade
- `/api/user` — current user & profile
- `/api/rooms` — room CRUD / join semantics as documented in Swagger
- `/api/bets` — bet-related endpoints
- `/api/leaderboard` — leaderboard query

---

## License

This package is licensed under the **ISC** License (see `package.json`).

---

## Related

- **Frontend** — Run the [front-end](../front-end) Vite app (default port `3000`) against this server.
