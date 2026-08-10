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

| Metoda i ścieżka                       | Dostęp         | Opis                                    |
| -------------------------------------- | -------------- | --------------------------------------- |
| `GET /`                                | publiczny      | health/identyfikacja API                |
| `POST /auth/register`                  | publiczny      | utworzenie pierwszego konta admina      |
| `POST /auth/login`                     | publiczny      | logowanie email/hasło                   |
| `POST /auth/card-login`                | publiczny      | logowanie identyfikatorem karty         |
| `POST /auth/pair-card`                 | publiczny      | powiązanie identyfikatora z kodem APACS |
| `GET /users`                           | admin          | lista użytkowników                      |
| `POST /users`                          | admin          | utworzenie użytkownika                  |
| `PATCH /users/:id`                     | admin          | aktualizacja użytkownika                |
| `DELETE /users/:id`                    | admin          | usunięcie użytkownika                   |
| `GET /stations`                        | operator+      | lista stanowisk                         |
| `GET /stations/current`                | publiczny      | rozpoznanie bieżącego urządzenia        |
| `POST /stations/identify`              | publiczny      | identyfikacja/rejestracja stanowiska    |
| `POST /stations`                       | admin          | utworzenie stanowiska                   |
| `PATCH /stations/:id`                  | admin          | aktualizacja stanowiska                 |
| `DELETE /stations/:id`                 | admin          | usunięcie stanowiska                    |
| `GET /forms`                           | publiczny      | najnowsze aktywne formularze            |
| `GET /forms/:id`                       | publiczny      | jedna rewizja formularza                |
| `GET /forms/:id/revisions`             | admin          | historia rewizji                        |
| `POST /forms`                          | admin          | utworzenie formularza                   |
| `POST /forms/:id/duplicate`            | admin          | kopia jako nowy kod                     |
| `PATCH /forms/:id`                     | admin          | utworzenie nowej rewizji                |
| `PATCH /forms/:id/archive`             | admin          | archiwizacja wszystkich rewizji kodu    |
| `DELETE /forms/:id`                    | admin          | fizyczne usunięcie rewizji              |
| `POST /inspections`                    | opcjonalny JWT | zapis inspekcji                         |
| `GET /inspections/public-dashboard`    | publiczny      | dashboard analityczny                   |
| `GET /inspections/analytics/v1`        | publiczny      | wersjonowany alias dashboardu           |
| `GET /inspections/analytics/v1/export` | publiczny      | CSV, XLSX lub PDF                       |
| `GET /inspections/quality-dashboard`   | publiczny      | alerty z ostatnich 24 godzin            |
| `GET /public/reports/:publicReportId`  | publiczny      | pełny raport inspekcji                  |
| `POST /media/upload`                   | publiczny      | upload obrazu do 20 MiB                 |
| `GET /media/object?name=...`           | publiczny      | strumień obrazu                         |
| `POST /scada/route-check`              | publiczny      | walidacja produktu przed kontrolą       |
| `GET /scada/settings`                  | admin          | konfiguracja SCADA                      |
| `PATCH /scada/settings`                | admin          | aktualizacja konfiguracji SCADA         |
| `POST /events`                         | zalogowany     | zapis zdarzenia klienta                 |
| `GET /events`                          | admin          | odczyt audytu                           |

Endpointy `/dev/scada/*` istnieją tylko poza `NODE_ENV=production`.

## Przykłady

### Logowanie

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "operator@example.com",
  "password": "strong-password"
}
```

Odpowiedź zawiera `accessToken` i obiekt `user`.

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

### Upload obrazu

```sh
curl -F 'file=@photo.jpg' http://localhost:3000/api/media/upload
```

Akceptowane formaty: JPEG, PNG, WebP, HEIC i HEIF. API weryfikuje sygnaturę
pliku, a nie tylko nagłówek MIME. Limit wynosi 20 MiB.

### Analityka i eksport

Wspólne parametry: `from`, `to`, `processId`, `stationId`, `formCode`,
`formIds`, `result`, `search`. Zakres czasu nie może przekraczać 366 dni.

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
