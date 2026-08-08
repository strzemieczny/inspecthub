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
- wydzielona granica integracji z systemem MES.

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

`TRUST_PROXY=true` ustawiaj tylko wtedy, gdy API działa za zaufanym reverse
proxy, które prawidłowo przekazuje adres klienta.

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
- Dashboard publiczny prezentuje zagregowane wyniki bez ujawniania pełnych
  numerów VIN lub numerów seryjnych.

Aktualny konektor MES stanowi punkt rozszerzenia: przygotowuje rekord
traceability, zapisuje go w logu API i oznacza inspekcję jako zsynchronizowaną.
Docelowy transport HTTP lub kolejkę komunikatów należy podłączyć w
`apps/api/src/mes-connector/mes-connector.service.ts`.

## Zatrzymywanie środowiska

```sh
docker compose down
```

Aby usunąć również lokalne wolumeny PostgreSQL i MinIO, użyj świadomie
`docker compose down --volumes` — ta operacja usuwa dane deweloperskie.
