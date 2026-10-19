# Automatyczny deploy Inspect Hub

Push do `main` uruchamia `Code checks` na runnerze GitHuba. Po udanym CI
`Deploy to Ubuntu` wdraża ten sam SHA na osobnym runnerze
`inspect-hub-production`. Pull requesty nie uruchamiają kodu na serwerze.
Starszy SHA jest pomijany, jeśli `main` zawiera już nowszy commit.

## Serwer

- klon: `/opt/inspect-hub`, właściciel `bwdeploy`,
- osobny runner: `/home/bwdeploy/inspect-hub-runner`,
- Compose: `inspect-hub-production`,
- sekrety: `/opt/inspect-hub/.env.production`, prawa `600`,
- zewnętrzna sieć proxy: `bw-apps-edge`,
- Nginx BW Mind udostępnia `/inspect-hub/` i `/inspect-hub/api/`.

Repozytorium jest publiczne, więc klon serwerowy może korzystać z HTTPS bez
tokenu. Jeśli repo stanie się prywatne, skonfiguruj osobny deploy key tylko
do odczytu. Nie kopiuj poświadczeń runnera BW Mind do nowego runnera.

Jako administrator przygotuj katalog i klon:

```bash
sudo install -d -o bwdeploy -g bwdeploy -m 0750 /opt/inspect-hub
sudo -u bwdeploy git clone https://github.com/strzemieczny/inspecthub.git /opt/inspect-hub
```

Skopiuj `.env.production.example` do `.env.production`, ustaw
`IH_ENV_FILE=.env.production` i wygeneruj własne hasła oraz `JWT_SECRET`.
`DATABASE_URL` musi wskazywać wewnętrzny host `postgres` i odpowiadać
wartościom `POSTGRES_*`. Dla hasła w URL użyj znaków bezpiecznych dla URI,
np. losowego ciągu hex. Wersje obrazów infrastruktury ustal jawnie.
Nie uruchamiaj produkcji z przykładowymi sekretami.

`WEB_ORIGIN` zawiera origin bez ścieżki. Frontend jest budowany z
`VITE_BASE_PATH=/inspect-hub/` i `VITE_API_URL=/inspect-hub/api`.
Gdy serwer działa przez HTTP, ustaw jawnie `STATION_COOKIE_SECURE=false`.
Przy HTTPS ustaw `true`. Kamera i service worker wymagają bezpiecznego
kontekstu przeglądarki; produkcyjny dostęp przez HTTP w LAN tego nie zapewnia.

API i web nie publikują portów na hoście. PostgreSQL i MinIO mają własne
wolumeny i są dostępne wyłącznie w prywatnej sieci stosu Inspect Hub.
Bucket pozostaje prywatny, zdjęcia są udostępniane przez API.

## GitHub i runner

W repozytorium utwórz środowisko `production`. Domyślne zmienne workflow:

| Zmienna         | Domyślnie                |
| --------------- | ------------------------ |
| `IH_DEPLOY_DIR` | `/opt/inspect-hub`       |
| `IH_STACK_NAME` | `inspect-hub-production` |

Sekrety aplikacji pozostają na serwerze. Środowisko nie wymaga ręcznego
zatwierdzania, jeśli deploy ma następować automatycznie.

W **Settings → Actions → Runners → New self-hosted runner** wybierz Linux x64.
Zainstaluj runner jako `bwdeploy` w `/home/bwdeploy/inspect-hub-runner`, dodając
etykietę `inspect-hub-production`. Katalog `_work` musi być osobny od
`/opt/inspect-hub` i od runnera BW Mind. Zainstaluj usługę przez `svc.sh`.
Runner wymaga Git, `flock`, Docker i Compose z obsługą `--wait`.

## Proxy BW Mind

W repo BW Mind zmiany obejmują `nginx/nginx.conf`, `docker-compose.ubuntu.yml`
i `deployment/ubuntu/deploy.sh`. Nginx łączy się do `bw-apps-edge`, używa
aliasów `inspect-hub-api` i `inspect-hub-web` i rozwiązuje je przez Docker DNS
podczas żądania. Brak Inspect Hub nie blokuje startu BW Mind.

Proxy usuwa `/inspect-hub` z żądań upstream, przepisuje Path cookie stanowiska
z `/api` na `/inspect-hub/api` i obsługuje natywny WebSocket `/api/quality-live`.
Statyczny serwer web obsługuje fallback SPA dla odświeżania podstron.
Service worker jest ograniczony do `/inspect-hub/`.

Przy pierwszym uruchomieniu utwórz sieć `bw-apps-edge`, jeśli nie istnieje,
i wdroż zmiany bramki BW Mind. Skrypty deployu obu repo tworzą tę sieć w razie
jej braku. Nie łącz baz ani usług MinIO z siecią proxy.

## Przebieg i odtworzenie

Skrypt blokuje równoległe wdrożenia, sprawdza czystość klonu i buduje obrazy
oznaczone SHA. Następnie uruchamia bazę i MinIO, zapisuje dump PostgreSQL
w `.git/deploy-backups/`, inicjalizuje prywatny bucket, wykonuje
`prisma migrate deploy` i aktualizuje API oraz web. Kończy po healthcheckach
i sprawdzeniu odpowiedzi SPA. Przed logowaniem ustaw `LDAP_*` w pliku środowiska API. Administrator loguje
się kontem AD należącym do `LDAP_ADMIN_GROUP`; konto powstaje automatycznie.
APACS i SCADA skonfiguruj osobno; adres API aplikacji mobilnej powinien kończyć
się na `/inspect-hub/api`.

Ręczne ponowienie aktualnego `main`:

```bash
cd /opt/inspect-hub
git fetch origin main
IH_DEPLOY_SHA="$(git rev-parse origin/main)" bash deployment/ubuntu/deploy.sh
```

Diagnostyka:

```bash
docker compose -p inspect-hub-production --env-file .env.production -f docker-compose.production.yaml ps --all
cat .git/inspect-hub-last-successful-deploy
```

Skrypt nie usuwa wolumenów ani nie cofa migracji automatycznie. Powrót kodu
wykonuj przez `git revert` i push do `main`, po sprawdzeniu zgodności ze
schematem bazy. Kopie przed migracją są lokalne; ustal ich retencję i kopie
poza serwerem oraz osobny backup MinIO. Build odbywa się przed wymianą usług,
ale aktualizacja może powodować krótką przerwę.
