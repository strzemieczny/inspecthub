# Wdrożenie produkcyjne

## Warunki release’u

- czysty commit przeznaczony do wdrożenia,
- zielone formatowanie, build, typy, lint i testy,
- `pnpm audit --prod` bez znanych podatności,
- zatwierdzone migracje i backup bazy,
- komplet sekretów oraz niezmienne obrazy kontenerów,
- przygotowany rollback i okno wdrożeniowe.

## Przygotowanie

1. Zbuduj artefakty z `pnpm install --frozen-lockfile` i `pnpm build`.
2. Ustaw `NODE_ENV=production`.
3. Ustaw `DATABASE_URL`, silny `JWT_SECRET`, `WEB_ORIGIN` oraz dane MinIO.
4. Ustaw `VITE_API_URL` przed budową frontendu.
5. Zweryfikuj `docker-compose.production.yaml`:

```sh
docker compose --env-file .env.production \
  -f docker-compose.production.yaml config --quiet
```

Konfiguracja produkcyjna nie publikuje portów PostgreSQL ani MinIO i wymusza
prywatny bucket. API i frontend mogą być wdrażane przez właściwą platformę;
repozytorium nie narzuca konkretnego runtime dla tych dwóch procesów.

## Migracje

Przed uruchomieniem nowej wersji wykonaj backup, a następnie:

```sh
NODE_ENV=production pnpm --filter @inspect-hub/database db:migrate:deploy
```

Komenda używa `prisma migrate deploy`; nie stosuj `migrate dev` ani `db push` na
produkcji. Migracja `20260810320000_add_inspection_query_indexes` dodaje indeksy
dashboardów. Tworzenie zwykłych indeksów może blokować operacje tabeli na czas
budowy — zaplanuj okno odpowiednie do rozmiaru `InspectionResult`.

## Kolejność wdrożenia

1. Backup PostgreSQL i weryfikacja MinIO.
2. Migracje kompatybilne z wdrażaną wersją.
3. Uruchomienie nowego API.
4. Health/smoke test API.
5. Publikacja frontendu z poprawnym `VITE_API_URL`.
6. Smoke test całego przepływu.
7. Obserwacja logów, kolejki SCADA i metryk błędów.

## Smoke test

- `GET /api` zwraca odpowiedź i `x-correlation-id`.
- Logowanie administratora działa.
- Lista formularzy i identyfikacja stanowiska działają.
- Route check zwraca oczekiwaną decyzję.
- Testowa inspekcja zapisuje się dokładnie raz.
- Publiczny raport otwiera się.
- Upload i odczyt obrazu działają.
- Przy aktywnej SCADA wpis kolejki przechodzi do `DELIVERED`.
- Log audytowy zawiera zdarzenie inspekcji bez sekretów.

## Rollback

Zmiana aplikacji może zostać wycofana przez uruchomienie poprzedniego artefaktu.
Migracje w tym repozytorium nie zawierają automatycznego `down`. Indeksy dodane
w bieżącym release są kompatybilne z poprzednią wersją, więc nie trzeba ich
usuwać podczas rollbacku aplikacji.

Nie przywracaj starego schematu przez `prisma db push`. Przy zmianach
destrukcyjnych przygotuj osobny, przetestowany runbook i backup point-in-time.
