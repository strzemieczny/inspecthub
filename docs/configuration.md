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
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`.

Wartości `*_IMAGE` powinny wskazywać niezmienny tag wydania lub digest, nigdy
`latest`.

## Symulacja SCADA

Tryb wybiera suwak w `/admin` → Connector SCADA. Po zapisaniu ustawień
`enabled=true` oznacza rzeczywisty serwer SCADA, a `enabled=false` — lokalną
symulację z numerami `_OK` / `_NOK`. Ustawienie obowiązuje także aplikację
mobilną, niezależnie od `NODE_ENV` i trybu jej kompilacji. Nie wymaga restartu API.

## Ustawienia SCADA w bazie

Administrator zarządza nimi przez `/api/scada/settings`:

- `enabled` — wybór serwera SCADA (`true`) lub symulacji (`false`),
- `baseUrl` — adres SCADA,
- `routeCheckPath` — endpoint sprawdzenia produktu,
- `submitResultPath` — endpoint odbioru wyniku,
- `unitHistoryPath` — ścieżka historii sztuki (domyślnie `/std_public/unithistory`),
- `publicWebUrl` — baza linku do raportu,
- `timeoutMs` — timeout od 500 do 30 000 ms.

## Kontrola konfiguracji produkcyjnej

```sh
docker compose --env-file .env.production \
  -f docker-compose.production.yaml config --quiet
```

Nie zapisuj sekretów w repozytorium, obrazie kontenera, logach ani parametrach
URL. Preferuj menedżer sekretów platformy wdrożeniowej.


## Active Directory (LDAP)

Logowanie domenowe używa tego samego przepływu co BW-Mind: bind konta
serwisowego, wyszukanie użytkownika i osobny bind jego DN z podanym hasłem.
Konfiguracja jest niezależna od BW-Mind; ustaw w `.env` (lokalnie) lub
`.env.production` (Docker):

| Zmienna | Znaczenie |
| --- | --- |
| `LDAP_URL` | Adres kontrolera, zalecane `ldaps://host:636` |
| `LDAP_BIND_DN` | DN lub UPN konta serwisowego z prawem odczytu katalogu |
| `LDAP_BIND_PASSWORD` | Hasło konta serwisowego |
| `LDAP_SEARCH_BASE` | Baza wyszukiwania, np. `DC=example,DC=local` |
| `LDAP_ADMIN_GROUP` | Grupa przyznająca rolę `ADMIN` |
| `LDAP_MANAGER_GROUP` | Grupa przyznająca rolę `MANAGER`, domyślnie `(PDS - Blonie) BW-Mind InspectHub Managers`; cała konfiguracja poza SCADA |
| `LDAP_REQUIRED_GROUP` | Grupa przyznająca rolę `OPERATOR` |
| `LDAP_TIMEOUT_MS` | Timeout operacji, domyślnie 5000 ms |
| `LDAP_CONNECT_TIMEOUT_MS` | Timeout połączenia, domyślnie 5000 ms |
| `LDAP_REQUEST_TIMEOUT_MS` | Limit całego logowania, domyślnie 10000 ms |

Wszystkie wartości oprócz timeoutów i `LDAP_MANAGER_GROUP` są wymagane.
Priorytet ról: `ADMIN`, `MANAGER`, `OPERATOR`. Zmiana grupy lub roli wymaga ponownego logowania. Timeouty muszą być całkowite
w zakresie 100–120000 ms. Grupy można podawać jako CN lub pełny DN; pełny DN
musi pasować do całego `memberOf`, nazwy porównywane są bez rozróżniania
wielkości liter. Sprawdzane jest bezpośrednie członkostwo `memberOf`, tak jak
w BW-Mind. Grupa administratorów ma pierwszeństwo i nie wymaga grupy operatorów.
Brak dostępu do LDAP nie uruchamia lokalnego logowania awaryjnego.

Obsługiwane loginy: `login`, `DOMENA\login` i UPN `login@domena`.
Wyszukiwanie odrzuca wyłączone konta AD. Logowanie bez hasła jest odrzucane.
Przy pierwszym logowaniu tworzony jest profil `LDAP`; kolejne logowania
aktualizują nazwę, email i rolę. Tożsamość to kanoniczny `sAMAccountName`
w skonfigurowanym katalogu — jego zmiana wymaga zaplanowania migracji profilu.
Stary lokalny profil z tym samym adresem email zostaje powiązany z AD, zachowuje
ID i historię, a lokalny hash hasła jest usuwany. Pozostałe stare konta pozostają
w historii, ale nie mogą się logować. Nie ma potrzeby migracji schematu bazy.

Role w aktywnych sesjach obowiązują do kolejnego logowania (JWT: 8 godzin).
Zmiana sposobu uwierzytelniania unieważnia wcześniej wydane sesje; użytkownicy
muszą ponownie zalogować się kontem domenowym lub kartą.
Karty APACS działają niezależnie od LDAP. Panel użytkowników jest tylko do odczytu.

Dla firmowego CA dodaj certyfikat PEM do kontenera API przez wolumen tylko do
odczytu i ustaw `NODE_EXTRA_CA_CERTS` na ścieżkę w kontenerze. Nie wyłączaj
walidacji TLS. Produkcyjny Compose przekazuje `LDAP_*` z `env_file` do API.
