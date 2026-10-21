# Operacje i utrzymanie

## Logowanie i korelacja

Każde żądanie HTTP tworzy pojedynczy JSON na stdout z czasem, typem,
correlation ID, metodą, ścieżką, statusem i czasem wykonania. Przekazuj stdout i
stderr do centralnego systemu logów. Nie parsuj logów jako tekstu swobodnego.

Klient może przesłać `X-Correlation-ID`; API zwraca użyty identyfikator w
odpowiedzi. W przypadku incydentu zaczynaj analizę od tego pola.

## Audyt

`AuditEvent` jest append-only z perspektywy API. Endpoint administratora:

```http
GET /api/events?from=2026-08-10T00:00:00Z&limit=100
Authorization: Bearer <admin-token>
```

Filtry: `from`, `to`, `type`, `correlationId`, `stationCode`, `limit` 1–500.
Ustal retencję zgodną z wymaganiami organizacji i ogranicz bezpośrednie prawa DB
do aktualizacji/usuwania audytu.

## SCADA

Worker sprawdza kolejkę co 5 sekund i pobiera maksymalnie 20 rekordów. Po
błędzie stosuje backoff 1, 2, 4, 8, 16, 32 i maksymalnie 60 minut. Po 10 próbach
rekord otrzymuje `FAILED`.

Monitoruj liczbę rekordów `PENDING`, `RETRYING`, `FAILED`, wiek najstarszego
rekordu oraz `lastError`. Brak automatycznego wznowienia `FAILED` — wymaga ono
kontrolowanej procedury operacyjnej lub zmiany statusu w narzędziu administracyjnym.

## Backup

Minimum:

- automatyczne backupy PostgreSQL z point-in-time recovery,
- wersjonowanie lub backup bucketu MinIO,
- regularny test odtworzenia w izolowanym środowisku,
- dokumentacja RPO/RTO oraz właściciela procedury.

Backup PostgreSQL i MinIO powinien reprezentować spójny punkt biznesowy. Po
odtworzeniu sprawdź, czy URL-e mediów wskazują istniejące obiekty.

## Monitoring zalecany

- dostępność i latency API,
- odsetek HTTP 4xx/5xx,
- zużycie CPU, pamięci i przestrzeni,
- liczba połączeń i wolne zapytania PostgreSQL,
- stan MinIO i pojemność bucketu,
- błędy APACS i czas odpowiedzi MSSQL,
- długość i wiek kolejki SCADA,
- serie NOK i krytyczne niezgodności.

## Troubleshooting

### API nie startuje na produkcji

Sprawdź komunikat walidacji konfiguracji. Wymagane są bezpieczne:
`DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN`, `MINIO_ENDPOINT`,
`MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`.

### Brak bieżącego stanowiska

Sprawdź ciasteczko `inspect_hub_station`, aktywność stanowiska, jego IP oraz
ustawienie `TRUST_PROXY`. Nie włączaj zaufania do proxy bez kontrolowanego
reverse proxy.

### Upload jest odrzucany

Sprawdź limit 20 MiB, dozwolony MIME oraz rzeczywisty nagłówek pliku. Zmiana
samego rozszerzenia nie wystarcza.

### Inspekcja jest odrzucana

Sprawdź aktywność formularza i stanowiska, przypisanie procesu, wymagane
odpowiedzi, dozwolony status i zgodność `routeCheckId` z numerem, stanowiskiem
oraz procesem.

### SCADA nie otrzymuje wyników

Sprawdź ustawienia, DNS/TLS, timeout, `ScadaDelivery.lastError` oraz status
kolejki. Potwierdź, że odpowiedź endpointu wyniku zawiera `{ "accepted": true }`.

## Rozdzielenie zdjęć formularzy i wyników inspekcji

Nowe zdjęcia w buckecie `inspection-media` mają prefiksy:

- `forms/YYYY-MM-DD/UUID.ext` — instrukcje i wzorce OK/NOK formularzy,
- `inspections/YYYY-MM-DD/UUID.ext` — zdjęcia z odpowiedzi inspekcji.

API nadal odczytuje wcześniejsze ścieżki `YYYY-MM-DD/UUID.ext`. Wysyłanie
zdjęcia przez `POST /api/media/upload` przyjmuje pole multipart `purpose`:
`forms` lub `inspections`. Brak pola oznacza `inspections`, dla zgodności
z wcześniej zainstalowaną aplikacją mobilną.

Wdrożenie uruchamia migrację po wykonaniu backupu PostgreSQL i uruchomieniu
nowego API. Migracja przegląda wszystkie wersje formularzy (również archiwalne)
oraz odpowiedzi typu `PHOTO_UPLOAD` w wynikach inspekcji. Kopiuje pliki do nowych
prefiksów, porównuje SHA-256 rzeczywistych bajtów, rozmiar i typ zawartości,
a dopiero potem aktualizuje odnośniki w danym rekordzie bazy. Zdjęcie używane
w obu kontekstach ma dwie kopie. Pola tekstowe i dziennik audytowy pozostają
bez zmian. Niepowiązane pliki pozostają w dotychczasowych lokalizacjach.

**Migracja nie usuwa starych plików ani folderów i nie nadpisuje istniejących
kopii.** Dotychczasowe adresy pozostają sprawne, także dla otwartych sesji
operatorów i raportów. Backup bazy jest zapisywany przez wdrożenie w
`.git/deploy-backups/`. Oryginalne obiekty MinIO pozostają zachowane.

Podgląd bez zapisu (na serwerze, z katalogu `/opt/inspect-hub`, po wdrożeniu):

```bash
docker compose -p inspect-hub-production --env-file .env.production -f docker-compose.production.yaml exec -T api node dist/media/migrate-media.js --dry-run
```

Ręczne ponowienie migracji:

```bash
docker compose -p inspect-hub-production --env-file .env.production -f docker-compose.production.yaml exec -T api node dist/media/migrate-media.js --apply
```

Tryb `--dry-run` sprawdza istnienie źródeł i zgodność już istniejących kopii,
ale nie tworzy brakujących kopii i nie zmienia bazy. Licznik `verified` oznacza
w tym trybie sprawdzone źródła/kopie, a `forms` i `inspections` liczbę rekordów
do aktualizacji. W trybie `--apply` licznik `verified` obejmuje wyłącznie kopie
sprawdzone przed zmianą odnośników.

Ponowienie jest bezpieczne: już przepisane adresy są pomijane, a istniejące
kopie weryfikowane przed użyciem. Brak źródła, niezgodna kopia lub równoległa
zmiana rekordu przerywa polecenie z błędem. Wcześniej ukończone rekordy mogą
być już przepisane; obie lokalizacje nadal działają. Należy sprawdzić błąd
i ponowić migrację. Starsze otwarte sesje mogą ponownie zapisać stary adres;
kolejne uruchomienie migracji obejmie taki rekord.
