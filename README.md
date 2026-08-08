# Inspect Hub

Monorepo aplikacji z frontendem React/Vite i API NestJS.

## Wymagania

- Node.js 20 lub nowszy
- pnpm 9

## Uruchomienie lokalne

```sh
cp .env.example .env
pnpm install
docker compose up -d
pnpm --filter @inspect-hub/database db:push
pnpm dev
```

API działa pod `http://localhost:3000/api`, frontend pod `http://localhost:5173`,
a konsola MinIO pod `http://localhost:9001`.

Pierwsze konto można utworzyć przez API. Ze względów bezpieczeństwa tylko pierwszy
użytkownik może w ten sposób otrzymać rolę `ADMIN`; kolejne rejestracje publiczne
tworzą operatorów:

```sh
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"inspect123","name":"Admin","role":"ADMIN"}'
```

Frontend i API można uruchomić osobno:

```sh
pnpm --filter web dev
pnpm --filter api start:dev
```

## Kontrola jakości

```sh
pnpm lint
pnpm check-types
pnpm build
```

## Struktura

- `apps/web` — frontend React + Vite
- `apps/api` — backend NestJS
- `packages/database` — schema i klient Prisma
- `packages/types` — wspólne kontrakty domenowe
- `packages/ui` — współdzielone komponenty
- `packages/eslint-config` — współdzielona konfiguracja ESLint
- `packages/typescript-config` — współdzielona konfiguracja TypeScript
