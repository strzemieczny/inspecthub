# Rozwój i testowanie

## Wymagania

- Node.js co najmniej 20.19,
- pnpm 9,
- Docker Compose,
- PostgreSQL 16 i MinIO dla pełnego uruchomienia lokalnego.

## Instalacja

```sh
cp .env.example .env
pnpm install --frozen-lockfile
docker compose up -d
pnpm --filter @inspect-hub/database db:generate
pnpm --filter @inspect-hub/database db:push
pnpm dev
```

`db:push` jest przeznaczone wyłącznie do lokalnego prototypowania. Zmiany
schematu przeznaczone do współdzielenia muszą posiadać migrację w
`packages/database/prisma/migrations`.

## Komendy jakościowe

```sh
pnpm exec prettier --check "**/*.{ts,tsx,md}"
pnpm check-types
pnpm lint
pnpm build
pnpm --filter api test -- --runInBand
pnpm audit --prod
```

Minimalna bramka przed commitem obejmuje formatowanie, typy, lint i testy
dotkniętego pakietu. Bramka release obejmuje wszystkie powyższe komendy.

## Struktura zmian

- DTO i walidacja wejścia: `apps/api/src/<module>/dto`.
- Logika domenowa: serwis modułu, nie kontroler.
- Kontrakty współdzielone: `packages/types`.
- Zmiana bazy: schema Prisma oraz nowa migracja SQL.
- Nowa zmienna: `.env.example`, dokument konfiguracji i walidacja produkcyjna.
- Zmiana API: aktualizacja `docs/api.md`.

## Testy

Testy API używają Jest i `ts-jest`. Pliki jednostkowe znajdują się obok kodu
pod nazwą `*.spec.ts`; testy e2e w `apps/api/test`.

Przy zmianach reguł domenowych należy pokryć przypadek pozytywny, odmowę i
idempotencję. Przy integracjach należy mockować sieć i przetestować timeout,
niepoprawną odpowiedź oraz retry.

## Symulator SCADA

Poza produkcją, gdy connector jest wyłączony:

- numer zakończony `_OK` daje zgodę,
- numer zakończony `_NOK` daje odmowę,
- pozostałe numery są odrzucane.

Endpointy `/api/dev/scada/*` zwracają `404` na produkcji.
