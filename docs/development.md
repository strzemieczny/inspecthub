# Rozwój i testowanie

## Wymagania

- Node.js co najmniej 22.13,
- pnpm 12.14.0 (wersja przypięta w `package.json`),
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

## Testowy operator APACS

Przy `NODE_ENV=development` numer `0000` loguje operatora „Testowy User” bez
połączenia z bazą APACS. Konto z rolą `OPERATOR` jest tworzone lub aktualizowane
przy logowaniu w lokalnej bazie aplikacji. Pozostałe numery są sprawdzane w APACS.
Komendy API `dev` i `start:dev` ustawiają `NODE_ENV=development`.
Logowanie testowe jest wyłączone dla pozostałych wartości `NODE_ENV`.

## Testowy administrator

Przy `NODE_ENV=development` login `admin` i hasło `admin` logują jako „Testowy
Admin” z rolą `ADMIN`, bez połączenia z LDAP. Konto lokalne jest tworzone lub
aktualizowane przy logowaniu. Zarówno logowanie, jak i sesje tego konta działają
wyłącznie w środowisku development.

## Komendy jakościowe

```sh
pnpm exec prettier --check "**/*.{ts,tsx,md}"
pnpm check-types
pnpm lint
pnpm build
pnpm --filter api test --runInBand
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

Tryb wybiera administrator suwakiem w `/admin` → Connector SCADA i zatwierdza
przyciskiem „Zapisz ustawienia”. Wyłączony suwak oznacza „Symulacja DEV”,
włączony — komunikację z serwerem SCADA. Wybór działa niezależnie od `NODE_ENV`,
bez zmiany zmiennych środowiskowych i bez restartu API.

W trybie symulacji:

- numer zakończony `_OK` daje zgodę,
- numer zakończony `_NOK` daje odmowę,
- pozostałe numery są odrzucane.

Endpointy `/api/dev/scada/*` zwracają `404` na produkcji.
