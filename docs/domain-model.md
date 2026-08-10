# Model domenowy i reguły biznesowe

## Encje

| Encja               | Znaczenie                                                           |
| ------------------- | ------------------------------------------------------------------- |
| `User`              | konto lokalne lub operator APACS, rola `ADMIN`/`OPERATOR`           |
| `Process`           | proces produkcyjny grupujący stanowiska i formularze                |
| `Station`           | stanowisko identyfikowane kodem, IP i hashowanym tokenem urządzenia |
| `Form`              | niezmienna rewizja standardu kontroli                               |
| `InspectionResult`  | zakończona kontrola wraz z odpowiedziami i wynikiem                 |
| `RouteCheck`        | zapisana decyzja SCADA dla produktu, stanowiska i procesu           |
| `ScadaDelivery`     | trwała kolejka wysyłki wyniku do SCADA                              |
| `ScadaSettings`     | pojedyncza konfiguracja integracji                                  |
| `AccessCardMapping` | HMAC identyfikatora karty do numeru APACS                           |
| `AuditEvent`        | append-only zdarzenie operacyjne lub jakościowe                     |

## Formularze i rewizje

- Kod formularza jest normalizowany do wielkich liter.
- Utworzenie formularza zaczyna od wersji `1`.
- Aktualizacja nie modyfikuje istniejącej rewizji. Powstaje rekord o wersji
  większej o jeden.
- Lista publiczna zwraca najnowszą, niezarchiwizowaną rewizję dla każdego kodu.
- Archiwizacja ustawia `archivedAt` dla wszystkich rewizji danego kodu.
- Formularz jest dostępny tylko na stanowisku, którego proces znajduje się w
  `processIds` formularza.
- `requiresLogin=true` blokuje anonimowy zapis wyniku.

Typy pytań: `CHECKBOX`, `TEXT`, `SELECT`, `PHOTO_UPLOAD`, `NUMBER_RANGE`.
Pytanie może posiadać oczekiwaną wartość, zakres liczbowy, poziom ważności,
obrazy referencyjne oraz tłumaczenia angielskie i ukraińskie.

## Stanowiska

- Kod stanowiska jest normalizowany do wielkich liter.
- Stanowisko musi być aktywne i przypisane do procesu, aby przyjąć inspekcję.
- Identyfikacja urządzenia zapisuje IP oraz losowy token w ciasteczku
  `inspect_hub_station`; w bazie przechowywany jest tylko SHA-256 tokenu.
- Ciasteczko jest `HttpOnly`, `SameSite=Strict`, ma ścieżkę `/api` i na
  produkcji flagę `Secure`.
- Ponowne przypisanie danego IP usuwa je z poprzedniego stanowiska.

## Zapis inspekcji

API wykonuje kolejno:

1. Sprawdzenie idempotencji przez opcjonalny UUID `clientSubmissionId`.
2. Sprawdzenie istnienia i aktywności rewizji formularza.
3. Wymuszenie logowania, jeżeli formularz tego wymaga.
4. Sprawdzenie aktywnego stanowiska, procesu i przypisania formularza.
5. Walidację zgody SCADA, jeśli integracja jest wymagana.
6. Sprawdzenie odpowiedzi wymaganych.
7. Automatyczne wyliczenie statusu, gdy wszystkie wymagane pytania są
   automatycznie ocenialne; w pozostałych przypadkach użycie przesłanego statusu.
8. Sprawdzenie statusu względem `allowedStatuses` formularza.
9. Transakcyjny zapis wyniku, relacji retestu, kolejki SCADA i audytu.

`clientSubmissionId` zapobiega duplikacji wyniku podczas ponowienia zapisu
offline. Jeżeli ostatnia kontrola tego samego numeru i kodu formularza była NOK,
nowy wynik wskazuje pierwotną nieudaną kontrolę przez `originalInspectionId`.

## Ocena odpowiedzi

- `expectedValue` daje `OK` przy ścisłej zgodności i `NOK` w innym przypadku.
- `NUMBER_RANGE` daje `OK`, gdy liczba mieści się włącznie między `min` i `max`.
- Pozostałe pytania nie mają automatycznej oceny (`null`).
- Status jest uznawany za pozytywny dla wartości: `PASSED`, `PASS`, `OK`,
  `ZDAŁ`, `ZDAL` — bez rozróżnienia wielkości liter.

## Dashboard jakości

Dashboard jakości analizuje maksymalnie 1000 najnowszych wyników z ostatnich 24
godzin. Wykrywa aktywne serie NOK per stanowisko i formularz oraz maksymalnie
100 najnowszych krytycznych niezgodności. Serię zamyka pierwszy wynik pozytywny.

## Publiczny raport

Raport jest identyfikowany losowym UUID `publicReportId`. Zawiera numer seryjny,
stanowisko, proces, operatora, formularz, odpowiedzi, ocenę, dane produktu,
status synchronizacji i informację o reteście.
