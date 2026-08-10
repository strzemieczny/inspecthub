# Inspect Hub

Inspect Hub to aplikacja do cyfrowej obsługi kontroli jakości na stanowiskach
produkcyjnych. Łączy konfigurowalne formularze inspekcji, identyfikację
stanowisk i operatorów oraz publiczny dashboard wyników w jednym systemie.

Projekt jest monorepo opartym na Turborepo. Frontend powstał w React i Vite,
API w NestJS, a warstwa danych korzysta z PostgreSQL i Prisma. Zdjęcia z
inspekcji są przechowywane w kompatybilnym z S3 MinIO.

## Możliwości

- publiczny dashboard z bieżącymi wynikami, trendami i statusem synchronizacji,
- realizacja inspekcji przez operatora z walidacją wymaganych odpowiedzi,
- formularze wersjonowane i przypisywane do procesów produkcyjnych,
- obsługa pytań logicznych, tekstowych, wyboru, zakresów liczbowych i zdjęć,
- identyfikacja stanowiska na podstawie kodu oraz zapamiętanie urządzenia,
- zarządzanie stanowiskami, użytkownikami i rolami z panelu administratora,
- uwierzytelnianie JWT i autoryzacja oparta na rolach `ADMIN` / `OPERATOR`,
- route check i przekazywanie wyników do systemu SCADA.
- ustrukturyzowane logi techniczne i trwały dziennik zdarzeń jakościowych/audytowych.
- dashboard alertów jakościowych w czasie rzeczywistym: serie NOK i krytyczne
  niezgodności z pytań oznaczonych jako cechy krytyczne.

## Architektura

```text
apps/
├── api/                  # REST API w NestJS
└── web/                  # aplikacja React + Vite
packages/
├── database/             # schema i klient Prisma
├── types/                # współdzielone kontrakty domenowe
├── ui/                   # współdzielone komponenty UI
├── eslint-config/        # wspólna konfiguracja ESLint
└── typescript-config/    # wspólna konfiguracja TypeScript
```

Usługi lokalne:

| Usługa        | Adres                       | Zastosowanie                |
| ------------- | --------------------------- | --------------------------- |
| Web           | `http://localhost:5173`     | interfejs użytkownika       |
| API           | `http://localhost:3000/api` | REST API                    |
| PostgreSQL    | `localhost:5432`            | baza danych                 |
| MinIO API     | `http://localhost:9000`     | magazyn obiektów            |
| MinIO Console | `http://localhost:9001`     | panel administracyjny MinIO |

## Wymagania

- Node.js 20.19 lub nowszy,
- pnpm 9,
- Docker z obsługą Docker Compose.

## Uruchomienie lokalne

1. Utwórz lokalną konfigurację:

   ```sh
   cp .env.example .env
   ```

   Przed wdrożeniem poza środowiskiem lokalnym koniecznie ustaw własny, długi
   `JWT_SECRET` oraz bezpieczne dane dostępowe do PostgreSQL i MinIO.

2. Zainstaluj zależności:

   ```sh
   pnpm install
   ```

3. Uruchom PostgreSQL i MinIO:

   ```sh
   docker compose up -d
   ```

4. Wygeneruj klienta Prisma i zsynchronizuj schemat bazy:

   ```sh
   pnpm --filter @inspect-hub/database db:generate
   pnpm --filter @inspect-hub/database db:push
   ```

5. Uruchom aplikacje w trybie deweloperskim:

   ```sh
   pnpm dev
   ```

Po otwarciu `http://localhost:5173/login` utwórz pierwsze konto. Rejestracja
startowa działa wyłącznie wtedy, gdy baza nie zawiera jeszcze użytkowników, a
pierwsze konto automatycznie otrzymuje rolę administratora. Kolejne konta
tworzy administrator w panelu zarządzania.

### Uruchamianie aplikacji osobno

```sh
pnpm --filter api start:dev
pnpm --filter web dev
```

## Konfiguracja

Najważniejsze zmienne znajdują się w `.env.example`:

| Zmienna        | Znaczenie                                  | Wartość lokalna                                  |
| -------------- | ------------------------------------------ | ------------------------------------------------ |
| `DATABASE_URL` | połączenie z PostgreSQL                    | `postgresql://...@localhost:5432/inspect_hub_db` |
| `JWT_SECRET`   | klucz podpisujący tokeny JWT               | ustaw własny sekret                              |
| `PORT`         | port API                                   | `3000`                                           |
| `WEB_ORIGIN`   | dozwolone źródło CORS                      | `http://localhost:5173`                          |
| `TRUST_PROXY`  | zaufanie do adresu klienta z reverse proxy | `false`                                          |
| `MINIO_*`      | połączenie i dane dostępowe MinIO          | lokalna usługa na porcie `9000`                  |
| `VITE_API_URL` | bazowy adres API dla frontendu             | `http://localhost:3000/api`                      |

Logowanie operatorów kartą korzysta z bazy MSSQL `APACS`. Ustaw zmienne
`APACS_DB_*` zgodnie z `.env.example`; konto bazy powinno mieć wyłącznie
uprawnienie `SELECT` do `dbo.TCARDISSUE` i `dbo.TCARDHOLDERS`. Czytnik może
zwracać `FCARDNUM`, `FLONGCARDNUM` albo `FUUID` — API rozpoznaje te warianty.

`TRUST_PROXY=true` ustawiaj tylko wtedy, gdy API działa za zaufanym reverse
proxy, które prawidłowo przekazuje adres klienta.

## Logi i zdarzenia audytowe

API emituje na standardowe wyjście logi JSON dla każdego żądania. Pole
`correlationId` jest przyjmowane z poprawnego nagłówka `X-Correlation-ID` albo
generowane przez serwer i zwracane w odpowiedzi. Log nie zawiera body, tokenów
ani parametrów zapytania.

Trwałe zdarzenia są zapisywane w tabeli `AuditEvent` w UTC. Zawierają typ,
kategorię, ważność, wynik, źródło, aktora, stanowisko, obiekt domenowy,
identyfikator korelacji i wersjonowany payload. Pola wrażliwe są automatycznie
redagowane, a `payloadHash` pozwala zweryfikować integralność treści. Zapis
zdarzenia `INSPECTION_COMPLETED` jest częścią tej samej transakcji co wynik
inspekcji.

Każda operacja zmieniająca stan API (`POST`, `PATCH`, `PUT`, `DELETE`) tworzy
zdarzenie audytowe zarówno dla powodzenia, jak i błędu. Obejmuje to m.in.
tworzenie, rewizje i archiwizację formularzy, zmiany stanowisk i użytkowników,
konfigurację SCADA, logowanie, parowanie kart oraz przesyłanie mediów. Typ jest
budowany z kontrolera i operacji, np. `FORMS_CREATE` lub `USERS_UPDATE`.

- `POST /api/events` — kolekcjonuje zdarzenie klienta od zalogowanego użytkownika,
- `GET /api/events` — wyszukuje zdarzenia (tylko `ADMIN`; filtry `from`, `to`,
  `type`, `correlationId`, `stationCode`, `limit`).

Na produkcji należy wysyłać stdout do centralnego systemu logów, ograniczyć
dostęp do dziennika, synchronizować czas przez NTP i ustalić retencję zgodnie z
oceną ryzyka oraz wymaganiami klienta/OEM. Moduł wspiera traceability typowe dla
Automotive SPICE i ISO/SAE 21434, ale sam w sobie nie stanowi certyfikacji
zgodności procesu ani produktu.

## Przydatne komendy

```sh
pnpm dev                  # uruchom wszystkie aplikacje w trybie dev
pnpm build                # zbuduj wszystkie pakiety i aplikacje
pnpm lint                 # uruchom lint w całym monorepo
pnpm check-types          # sprawdź typy TypeScript
pnpm --filter api test    # uruchom testy jednostkowe API
```

Operacje bazodanowe:

```sh
pnpm --filter @inspect-hub/database db:generate
pnpm --filter @inspect-hub/database db:migrate
pnpm --filter @inspect-hub/database db:push
pnpm --filter @inspect-hub/database db:studio
```

## Role i przepływ pracy

- `ADMIN` konfiguruje formularze, procesy i stanowiska oraz zarządza kontami.
- `OPERATOR` identyfikuje stanowisko, wybiera dostępny dla niego formularz i
  zapisuje wynik inspekcji.
- Dashboard publiczny prezentuje zagregowane wyniki oraz pełne numery VIN lub
  numery seryjne zgodnie z wymaganiami procesu.

## API analityczne i eksport

- `GET /api/inspections/analytics/v1` — wersjonowane dane analityczne JSON,
- `GET /api/inspections/analytics/v1/export?format=csv` — dane inspekcji CSV,
- `GET /api/inspections/analytics/v1/export?format=xlsx` — arkusz Excel,
- `GET /api/inspections/analytics/v1/export?format=pdf` — raport PDF.

Endpointy przyjmują filtry dashboardu: `from`, `to`, `processId`, `stationId`,
`formCode`, `formIds` (identyfikatory oddzielone przecinkami), `result` oraz
`search`. Maksymalny zakres wynosi 366 dni, a eksport tabelaryczny obejmuje do
50 000 najnowszych inspekcji spełniających kryteria.

Connector SCADA wykonuje synchroniczny route check po zeskanowaniu numeru
seryjnego i asynchronicznie przekazuje wynik zakończonej inspekcji wraz z
publicznym linkiem do raportu. Adres SCADA, ścieżki endpointów, timeout i
publiczny adres frontendu konfiguruje administrator w panelu aplikacji.

W środowisku deweloperskim API udostępnia symulator SCADA:

- `POST /api/dev/scada/route-check` — numery zakończone `_OK` otrzymują zgodę,
  adres historii produktu i dane produktu, a zakończone `_NOK` odmowę,
- `POST /api/dev/scada/inspection-result` — potwierdza przyjęcie wyniku.

Do testów ustaw bazowy URL na `http://localhost:3000`, a ścieżki odpowiednio
na `/api/dev/scada/route-check` oraz `/api/dev/scada/inspection-result`.

## Zatrzymywanie środowiska

```sh
docker compose down
```

Aby usunąć również lokalne wolumeny PostgreSQL i MinIO, użyj świadomie
`docker compose down --volumes` — ta operacja usuwa dane deweloperskie.
