# Bezpieczeństwo

## Model dostępu

- JWT jest pobierany wyłącznie z nagłówka Bearer i wygasa po 8 godzinach.
- Strategia JWT po każdej walidacji odczytuje użytkownika z bazy, dzięki czemu
  usunięte konto natychmiast traci dostęp.
- Administracja użytkownikami, formularzami, stanowiskami, ustawieniami SCADA i
  audytem jest chroniona rolami.
- Formularz może dodatkowo wymagać zalogowanego operatora.
- Rejestracja publiczna działa wyłącznie przed utworzeniem pierwszego konta;
  transakcja `Serializable` chroni przed wyścigiem dwóch rejestracji.

## Hasła i karty

- Hasła są hashowane przez bcrypt z kosztem 12.
- Surowy UID karty nie jest zapisywany. Mapowanie wykorzystuje HMAC-SHA-256 z
  `JWT_SECRET`.
- Zapytania APACS są parametryzowane i korzystają z konta tylko do odczytu.
- Identyfikatory kart są maskowane w logach.

Zmiana `JWT_SECRET` unieważnia JWT oraz zmienia HMAC kart; po rotacji operatorzy
mogą wymagać ponownego sparowania kart.

## Upload i przechowywanie mediów

- Limit jednego pliku wynosi 20 MiB.
- Dozwolone są JPEG, PNG, WebP, HEIC i HEIF.
- API sprawdza magic bytes/strukturę nagłówka, nie ufa nazwie pliku.
- Nazwa obiektu zawiera datę i UUID generowany przez serwer.
- Odczyt przyjmuje tylko format nazw generowany przez aplikację, także legacy.
- Produkcyjny bucket jest prywatny.
- Odpowiedzi otrzymują `X-Content-Type-Options: nosniff`.

## Nagłówki i przeglądarka

API wyłącza `X-Powered-By` oraz ustawia:

- `X-Content-Type-Options: nosniff`,
- `X-Frame-Options: DENY`,
- `Referrer-Policy: no-referrer`,
- ograniczone `Permissions-Policy`.

CORS na produkcji dopuszcza wyłącznie `WEB_ORIGIN`. TLS powinien kończyć się na
reverse proxy lub load balancerze.

## Dane publiczne

Dashboard, analityka, raporty, formularze, route check i media mają publiczne
endpointy zgodnie z bieżącym modelem biznesowym. Publiczny raport zawiera pełny
numer seryjny/VIN i nazwę operatora. Przed wdrożeniem organizacja musi
potwierdzić, że taki zakres publikacji jest zgodny z polityką danych.

Publiczne endpointy powinny być objęte rate limitingiem na reverse proxy/WAF.
Szczególnie dotyczy to logowania, route check, uploadu, eksportu i raportów.

## Audyt i redakcja

Mutacje HTTP są zapisywane jako zdarzenia sukcesu lub błędu. Klucze zawierające
m.in. `password`, `secret`, `token`, `authorization`, `cookie`, `cardCode` i
`identifier` są redagowane. Log HTTP nie zawiera body ani query string.

`payloadHash` jest skrótem treści, a nie podpisem kryptograficznym całego
rekordu. Ochrona przed zmianą rekordów wymaga również ograniczeń konta DB,
backupów i zewnętrznej retencji logów.

## Lista kontrolna bezpieczeństwa

- [ ] Sekrety są w menedżerze sekretów i różnią się od `.env.example`.
- [ ] PostgreSQL, MinIO i MSSQL nie są publicznie dostępne.
- [ ] Bucket MinIO jest prywatny.
- [ ] Obrazy kontenerów są przypięte do tagów/digestów.
- [ ] TLS, WAF/rate limiting i limity request body są skonfigurowane na proxy.
- [ ] Konto APACS ma wyłącznie wymagany `SELECT`.
- [ ] `pnpm audit --prod` nie zgłasza podatności.
- [ ] Backup i odtwarzanie zostały przetestowane.
