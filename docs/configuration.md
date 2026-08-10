# Konfiguracja

API ładuje `.env` przez Nest `ConfigModule`; frontend odczytuje zmienne Vite w
czasie budowania. `.env` nie jest wersjonowany.

## Zmienne aplikacji

| Zmienna        | Wymagana na produkcji | Opis                                 |
| -------------- | --------------------- | ------------------------------------ |
| `NODE_ENV`     | tak                   | ustaw `production`                   |
| `DATABASE_URL` | tak                   | URL PostgreSQL dla Prisma            |
| `JWT_SECRET`   | tak                   | sekret JWT, minimum 32 znaki         |
| `PORT`         | nie                   | port API, domyślnie `3000`           |
| `HOST`         | nie                   | interfejs API, domyślnie `localhost` |
| `WEB_ORIGIN`   | tak                   | pojedynczy origin CORS bez ścieżki   |
| `TRUST_PROXY`  | nie                   | `true` wyłącznie za zaufanym proxy   |
| `VITE_API_URL` | tak dla web           | publiczny bazowy URL API             |

## MinIO

| Zmienna            | Opis                                         |
| ------------------ | -------------------------------------------- |
| `MINIO_ENDPOINT`   | hostname usługi, bez protokołu               |
| `MINIO_PORT`       | port API S3, domyślnie `9000`                |
| `MINIO_USE_SSL`    | `true` dla TLS bezpośrednio do MinIO         |
| `MINIO_ACCESS_KEY` | identyfikator konta aplikacyjnego            |
| `MINIO_SECRET_KEY` | sekret konta, minimum 16 znaków na produkcji |
| `MINIO_BUCKET`     | bucket, domyślnie `inspection-media`         |

Na produkcji API odmawia startu dla brakujących lub znanych przykładowych
wartości. Bucket powinien być prywatny; obrazy są serwowane przez API.

## APACS

| Zmienna                          | Domyślna wartość / opis                      |
| -------------------------------- | -------------------------------------------- |
| `APACS_DB_SERVER`                | serwer MSSQL                                 |
| `APACS_DB_PORT`                  | `1433`                                       |
| `APACS_DB_NAME`                  | `APACS`                                      |
| `APACS_DB_USER`                  | konto tylko do odczytu                       |
| `APACS_DB_PASSWORD`              | sekret konta                                 |
| `APACS_DB_ENCRYPT`               | domyślnie szyfrowanie włączone               |
| `APACS_DB_TRUST_CERTIFICATE`     | domyślnie `false`                            |
| `APACS_DB_CONNECTION_TIMEOUT_MS` | domyślnie `5000`                             |
| `APACS_DB_REQUEST_TIMEOUT_MS`    | domyślnie `5000`                             |
| `CARD_REVERIFICATION_PERCENT`    | procent ponownej weryfikacji, domyślnie `10` |

## Obrazy infrastruktury produkcyjnej

`docker-compose.production.yaml` wymaga jawnego ustawienia:

- `POSTGRES_IMAGE`,
- `MINIO_IMAGE`,
- `MINIO_MC_IMAGE`,
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`.

Wartości `*_IMAGE` powinny wskazywać niezmienny tag wydania lub digest, nigdy
`latest`.

## Ustawienia SCADA w bazie

Administrator zarządza nimi przez `/api/scada/settings`:

- `enabled` — aktywacja integracji,
- `baseUrl` — adres SCADA,
- `routeCheckPath` — endpoint sprawdzenia produktu,
- `submitResultPath` — endpoint odbioru wyniku,
- `publicWebUrl` — baza linku do raportu,
- `timeoutMs` — timeout od 500 do 30 000 ms.

## Kontrola konfiguracji produkcyjnej

```sh
docker compose --env-file .env.production \
  -f docker-compose.production.yaml config --quiet
```

Nie zapisuj sekretów w repozytorium, obrazie kontenera, logach ani parametrach
URL. Preferuj menedżer sekretów platformy wdrożeniowej.
