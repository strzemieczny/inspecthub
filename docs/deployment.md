# Wdrożenie produkcyjne

Automatyczne wdrożenie po pushu do `main` na wspólnym serwerze BW Mind,
z adresem `/inspect-hub/`, opisuje [instrukcja Ubuntu](../deployment/ubuntu/README.md).

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

Konfiguracja produkcyjna obejmuje API i statyczny frontend, nie publikuje
portów na hoście i wymusza prywatny bucket. Usługi web i API łączą się
z zewnętrzną siecią `bw-apps-edge`, używaną przez wspólny Nginx.

## Migracje

Przed uruchomieniem nowej wersji wykonaj backup, a następnie:

```sh
NODE_ENV=production pnpm --filter @inspect-hub/database db:migrate:deploy
```

Komenda używa `prisma migrate deploy`; nie stosuj `migrate dev` ani `db push` na
produkcji. Migracja `20260810320000_add_inspection_query_indexes` dodaje indeksy
dashboardów. Tworzenie zwykłych indeksów może blokować operacje tabeli na czas
budowy — zaplanuj okno odpowiednie do rozmiaru `InspectionResult`.

Deploy uruchamia też `node dist/media/migrate-media.js --apply`, który kopiuje
stare media do katalogów `forms/` i `inspections/`. Oryginały pozostają na miejscu,
a adresy w bazie zmieniają się dopiero po weryfikacji kopii. Brakujące pliki
źródłowe są pomijane: migracja wypisuje ich nazwy i licznik `missing`, zachowując
dotychczasowe odwołania. Takie pliki wymagają osobnego odtworzenia z backupu;
ponowne uruchomienie migracji po ich przywróceniu dokończy kopiowanie.
Brak bucketu, błędy dostępu i błędy weryfikacji nadal przerywają deploy.
Wariant `--dry-run` sprawdza media bez zapisu obiektów i rekordów bazy.

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


## Aktualizacja otwartych przeglądarek

Build web generuje wspólny, unikalny identyfikator dla kodu aplikacji,
`version.json` i cache service workera. Te pliki należy publikować razem;
`version.json` oraz `sw.js` nie mogą trafiać do cache reverse proxy bez
odpowiedniej rewalidacji. Nginx wysyła dla nich odpowiednio `no-store` i
`no-cache`. Pliki JS/CSS z hashem nadal mają długi cache `immutable`.

Widoczna aplikacja sprawdza wersję co minutę, po powrocie do karty i po
odzyskaniu połączenia (powtarzające się zdarzenia są ograniczane). Service
worker pomija plik wersji. Przed aktualizacją pobiera komplet plików buildu,
w tym moduły ładowane na żądanie, i pyta wszystkie otwarte karty aplikacji,
czy można go aktywować. Brak odpowiedzi albo niezapisana praca odracza
aktualizację. Zamrożoną kartę może być konieczne otworzyć lub zamknąć.

Odświeżenie czeka na zakończenie inspekcji, zapisy i uploady, edycję formularzy,
stanowisk i ustawień SCADA oraz rozpoczęte logowanie. Komunikat informuje
o oczekującej aktualizacji. Ukryte karty i aplikacja offline nie są automatycznie
przeładowywane. Zachowuj zgodność API z poprzednim frontendem podczas wdrożeń,
ponieważ aktywna inspekcja może opóźnić przejście na nową wersję.

Przy pierwszym wdrożeniu tego mechanizmu dotychczas otwarte karty nie mają
jeszcze kodu wykrywania wersji ani odpowiedzi na pytanie workera. Trzeba je
jednorazowo odświeżyć, a jeśli nowy worker nadal oczekuje — zamknąć wszystkie
karty aplikacji i otworzyć ją ponownie. Kolejne wydania obsługują aktualizację
automatycznie.

Weryfikacja: `pnpm --filter web test:updates`, `pnpm --filter web lint` i
`pnpm --filter web build`. Smoke test na HTTPS: zostaw dashboard i rozpoczętą
inspekcję w dwóch kartach, opublikuj kolejny build, sprawdź komunikat i brak
przeładowania przed zapisem; po zapisaniu inspekcji obie karty powinny przejść
na nową wersję (ukryta po jej otwarciu). Sprawdź też pracę offline oraz
odpowiedzi `version.json` i `sw.js` przez publiczny reverse proxy.
