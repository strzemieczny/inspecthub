# API REST

Bazowa ścieżka: `/api`. Żądania i odpowiedzi JSON używają UTF-8. Globalna
walidacja usuwa nieznane pola i odrzuca payload zawierający pola spoza DTO.

## Uwierzytelnianie

Dla endpointów chronionych należy wysłać:

```http
Authorization: Bearer <accessToken>
```

Token JWT jest ważny 8 godzin. Role: `ADMIN`, `OPERATOR`.

Oznaczenia dostępu:

- **publiczny** — token nie jest wymagany,
- **opcjonalny JWT** — token może być pominięty, ale błędny token jest odrzucany,
- **operator+** — `ADMIN` lub `OPERATOR`,
- **admin** — tylko `ADMIN`.

## Endpointy

| Metoda i ścieżka                       | Dostęp         | Opis                                        |
| -------------------------------------- | -------------- | ------------------------------------------- |
| `GET /`                                | publiczny      | health/identyfikacja API                    |
| `POST /auth/login`                     | publiczny      | logowanie AD: username/hasło                |
| `POST /auth/card-login`                | publiczny      | logowanie identyfikatorem karty             |
| `POST /auth/pair-card`                 | publiczny      | powiązanie identyfikatora z kodem APACS     |
| `GET /users`                           | admin          | lista użytkowników                          |
| `GET /stations`                        | operator+      | lista stanowisk                             |
| `GET /stations/current`                | publiczny      | rozpoznanie bieżącego urządzenia            |
| `POST /stations/identify`              | publiczny      | identyfikacja/rejestracja stanowiska        |
| `POST /stations`                       | admin          | utworzenie stanowiska                       |
| `PATCH /stations/:id`                  | admin          | aktualizacja stanowiska                     |
| `DELETE /stations/:id`                 | admin          | usunięcie stanowiska                        |
| `GET /forms`                           | publiczny      | najnowsze aktywne formularze                |
| `GET /forms/:id`                       | publiczny      | jedna rewizja formularza                    |
| `GET /forms/:id/revisions`             | admin          | historia rewizji, autorzy i daty publikacji |
| `POST /forms`                          | admin          | utworzenie formularza                       |
| `POST /forms/:id/duplicate`            | admin          | kopia jako nowy kod                         |
| `PATCH /forms/:id`                     | admin          | utworzenie nowej rewizji                    |
| `PATCH /forms/:id/archive`             | admin          | archiwizacja wszystkich rewizji kodu        |
| `DELETE /forms/:id`                    | admin          | fizyczne usunięcie rewizji                  |
| `POST /inspections`                    | opcjonalny JWT | zapis inspekcji                             |
| `GET /inspections/public-dashboard`    | publiczny      | dashboard analityczny                       |
| `GET /inspections/analytics/v1`        | publiczny      | wersjonowany alias dashboardu               |
| `GET /inspections/analytics/v1/export` | publiczny      | CSV, XLSX lub PDF                           |
| `GET /inspections/quality-dashboard`   | publiczny      | alerty z ostatnich 24 godzin                |
| `GET /public/reports/:publicReportId`  | publiczny      | pełny raport inspekcji                      |
| `POST /media/upload`                   | publiczny      | upload obrazu do 20 MiB                     |
| `GET /media/object?name=...`           | publiczny      | strumień obrazu                             |
| `POST /scada/route-check`              | publiczny      | walidacja produktu przed kontrolą           |
| `GET /scada/settings`                  | admin          | konfiguracja SCADA                          |
| `PATCH /scada/settings`                | admin          | aktualizacja konfiguracji SCADA             |
| `POST /events`                         | zalogowany     | zapis zdarzenia klienta                     |
| `GET /events`                          | admin          | odczyt audytu                               |

Endpointy `/dev/scada/*` istnieją tylko poza `NODE_ENV=production`.

## Przykłady

### Logowanie

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "operator@example.com",
  "password": "strong-password"
}
```

Odpowiedź zawiera `accessToken` i obiekt `user`. `username` przyjmuje krótki login,
`DOMENA\login` lub pełny UPN. Lokalne konta i rejestracja są wyłączone.
Wyjątkiem jest konto `admin` / `admin` z rolą `ADMIN` dostępne przy
`NODE_ENV=development`. Jego sesje są akceptowane wyłącznie w development.
`GET /users` zwraca również `externalProvider` (`LDAP`, `APACS`, `DEV` lub `null` dla
starych kont). Dane kont i role są synchronizowane podczas logowania.

### Route check

```http
POST /api/scada/route-check
Content-Type: application/json

{
  "serialNumber": "VIN123",
  "stationCode": "ST-01"
}
```

Pozytywna odpowiedź zawiera `allowed`, `routeCheckId`, `serverUrl`,
`partNumber` i `productFamily` w obiekcie `product`.

### Zapis inspekcji

```http
POST /api/inspections
Content-Type: application/json
Authorization: Bearer <token>

{
  "clientSubmissionId": "0d755b4f-ab55-41e7-b41d-44e88830df6c",
  "routeCheckId": "route-check-id",
  "formId": "form-id",
  "vinOrSerialNumber": "VIN123",
  "stationId": "ST-01",
  "status": "PASS",
  "durationSeconds": 120,
  "answerCorrections": 1,
  "answers": [
    { "questionId": "q1", "value": true }
  ]
}
```

### Czyszczenie treści pytań i odpowiedzi

Przy tworzeniu, kopiowaniu i zapisie nowej rewizji formularza API normalizuje
pytania, opisy, opcje wyboru, tekstowe wartości oczekiwane i tłumaczenia. Usuwa
odstępy na brzegach, zamienia wielokrotne i nierozdzielające spacje na pojedyncze,
usuwając także niewidoczne artefakty kopiowania i znaki sterujące. Zachowuje
wielkość liter, interpunkcję i znaki narodowe; opisy zachowują podział na akapity.
Kolejność opcji i ich tłumaczeń pozostaje zachowana. Puste po czyszczeniu pytania
oraz opcje wyboru powodują błąd 400.

Odpowiedzi tekstowe i wybrane opcje są czyszczone przed walidacją wymaganych
odpowiedzi, oceną OK/NOK i zapisem inspekcji. Tekstowe wartości oczekiwane są
porównywane po tej samej normalizacji, także dla starszych formularzy. Pusta
po czyszczeniu odpowiedź nie spełnia wymagania obowiązkowego pytania. Czyszczenie
nie dotyczy identyfikatorów, adresów zdjęć ani wartości liczbowych i logicznych.
Zapisane wcześniej rewizje formularzy i inspekcje nie są nadpisywane.

### Upload obrazu

```sh
curl -F 'file=@photo.jpg' http://localhost:3000/api/media/upload
```

Akceptowane formaty: JPEG, PNG, WebP, HEIC i HEIF. API weryfikuje sygnaturę
pliku, a nie tylko nagłówek MIME. Limit wynosi 20 MiB.

### Analityka i eksport

Wspólne parametry: `from`, `to`, `processId`, `stationId`, `formCode`,
`formIds`, `result`, `search`, `partNumber`.
`search` filtruje po numerze seryjnym, a `partNumber` po numerze części produktu
(dopasowanie fragmentu bez rozróżniania wielkości liter, z pominięciem spacji na początku i końcu). Zakres czasu nie może przekraczać 366 dni.

```http
GET /api/inspections/analytics/v1/export?format=csv&from=2026-08-01&to=2026-08-10&stationId=ST-01
```

Formaty: `csv`, `xlsx`, `pdf`. Eksport tabelaryczny obejmuje do 50 000
najnowszych rekordów. CSV neutralizuje wartości mogące zostać zinterpretowane
jako formuły arkusza kalkulacyjnego.

## Błędy i correlation ID

NestJS zwraca standardowe kody HTTP, m.in. `400`, `401`, `403`, `404`, `409`,
`502`, `503`. Każda odpowiedź zawiera `x-correlation-id`. Klient może podać
własny identyfikator zgodny z `[A-Za-z0-9._:-]{1,128}`.

### Autorzy rewizji formularzy

`GET /forms/:id/revisions` zwraca pełne wersje formularza, datę publikacji
`createdAt` oraz `createdBy: { id, name } | null`. Nazwa autora jest zapisywana
przy publikacji i pozostaje niezmienna po zmianie lub usunięciu konta.
Tożsamość autora pochodzi z uwierzytelnionej sesji administratora. Publiczne
endpointy formularzy nie zwracają `createdBy`.

Migracja `20261019110000_add_form_revision_author` uzupełnia autorów starszych
rewizji na podstawie udanych zdarzeń publikacji w audycie. Gdy brakuje danych,
`createdBy` pozostaje `null`. W panelu edycji formularza każdą rewizję można
rozwinąć, aby zobaczyć wartości przed i po zmianie względem poprzedniej wersji.

### Definicje wskaźników dashboardu

Wskaźniki endpointów `public-dashboard` i `analytics/v1` dotyczą zakończonych
inspekcji w wybranym okresie oraz wszystkich aktywnych filtrów. Filtr `result`
zawęża także mianowniki procentów; do oceny ogólnej jakości należy go usunąć.

- `summary.passRate`: udział OK wszystkich prób, w tym retestów (dotychczasowe pole).
- `summary.firstPassTotal`, `firstPassPassed`, `firstPassRate`: liczba pierwszych
  kontroli, liczba pierwszych OK oraz ich iloraz w procentach. Pierwsza kontrola
  to początek zapisanego cyklu (`originalInspectionId = null`). Przy braku
  pierwszych kontroli FPY wynosi `null`. Te same pola są dostępne w przekrojach
  stanowisk i rewizji formularzy.
- `summary.retestTotal`, `retestPassed`: liczba powiązanych retestów i ich wyników
  OK. Pierwsza kontrola może pochodzić spoza wybranego okresu. Wynik retestu nie
  jest dowodem wykonania naprawy.
- `summary.uniqueUnits`: liczba różnych numerów seryjnych/VIN w wybranym zbiorze,
  łącznie dla wszystkich wybranych standardów.
- `summary.issuesToday`: liczba inspekcji NOK; `summary.defectCount`: liczba ocen
  NOK punktów kontroli, które można ocenić automatycznie. Jedna inspekcja może
  zawierać kilka takich ocen. Obie wartości obejmują również retesty.
- `completeness.p90DurationSeconds`: percentyl najbliższej rangi (element
  `ceil(0.9 * n)` posortowanej próby), `null` bez pomiarów. Czas dotyczy inspekcji,
  nie pełnego cyklu produkcyjnego. `durationSampleSize` podaje liczebność próby.
- `daily`: liczba wszystkich i pozytywnych prób dla każdego lokalnego dnia.
  Dzień bez inspekcji oznacza brak danych o NOK%, a nie 0% NOK.

Ranking na home uwzględnia stanowiska z co najmniej 30 pierwszymi kontrolami.
Jest to próg prezentacji, nie gwarancja wiarygodności statystycznej. Stały cel
97% nie jest stosowany. System nie zna wolumenu wymagającego kontroli, więc nie
wylicza pokrycia kontrolą.

Eksport CSV/XLSX zawiera dodatkowo ID inspekcji, ID pierwszej kontroli, rodzaj
próby, czas inspekcji w sekundach oraz liczbę poprawionych odpowiedzi. Nowe pola
uzupełniają dotychczasowy kontrakt API; `passRate` zachowuje swoje znaczenie.
