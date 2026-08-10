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
