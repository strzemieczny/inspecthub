# Integracje

## SCADA

### Route check

Inspect Hub wysyła `POST` na `baseUrl + routeCheckPath`:

```json
{
  "serialNumber": "VIN123",
  "processName": "Montaż"
}
```

Odmowa:

```json
{ "allowed": false }
```

Zgoda musi zawierać komplet danych:

```json
{
  "allowed": true,
  "serverUrl": "https://scada.example/unit/VIN123",
  "product": {
    "partNumber": "PN-100",
    "productFamily": "FAMILY-A"
  }
}
```

Decyzja jest zapisywana jako `RouteCheck`. Zgoda jest związana z numerem
seryjnym, kodem stanowiska i nazwą procesu oraz może zostać wykorzystana tylko
przez jeden wynik inspekcji.

Formularz jest wybierany przez API na podstawie procesu przypisanego do stanowiska
oraz `product.partNumber` z odpowiedzi SCADA. Administrator przypisuje formularzowi
procesy i listę numerów części (`partNumbers`). Numery części są zapisywane i
porównywane po usunięciu otaczających spacji i zamianie liter na wielkie.
Uwzględniana jest wyłącznie najnowsza aktywna rewizja każdego kodu formularza.
Brak dopasowania blokuje rozpoczęcie inspekcji. Przy jednym dopasowaniu odpowiedź
`/scada/route-check` zawiera `form`, a zgoda zapisuje jego identyfikator.
Przy wielu dopasowaniach API zwraca `forms` oraz `routeCheckId: null`.
Aplikacja mobilna pokazuje operatorowi listę nazw, kodów i wersji formularzy.
Po wyborze ponawia `/scada/route-check` z tym samym numerem seryjnym i stanowiskiem
oraz `formId`. API ponownie sprawdza zgodę SCADA i dopasowanie wybranego formularza
do PN i procesu, a następnie zapisuje zgodę dla tej wersji formularza. Zapis wyniku
wymaga tej samej wersji. Anulowanie wyboru pozwala zeskanować kolejną sztukę.

Po wdrożeniu migracji `20261019100000_add_form_part_numbers` istniejące formularze
mają pustą listę numerów części. Należy uzupełnić przypisania przed rozpoczęciem
inspekcji (również dla symulacji, np. `DEV-SERIAL` dla `SERIAL_OK`).

Link do historii sztuki jest budowany z `serverUrl` oraz konfigurowalnej
`unitHistoryPath` (domyślnie `/std_public/unithistory`) i otrzymuje numer seryjny
w parametrze `unit`.

### Dostarczenie wyniku

Po transakcyjnym zapisie inspekcji powstaje `ScadaDelivery` z payloadem:

```json
{
  "serialNumber": "VIN123",
  "processName": "Montaż",
  "result": "PASS",
  "reportUrl": "<publicReportId>"
}
```

SCADA musi odpowiedzieć kodem 2xx i `{ "accepted": true }`. Dostawa jest
ponawiana maksymalnie 10 razy z wykładniczym backoffem do 60 minut.

## APACS

Logowanie kartą odczytuje parametryzowanym zapytaniem:

- `dbo.TCARDISSUE`,
- `dbo.TCARDHOLDERS`.

Rozpoznawane identyfikatory to `FLONGCARDNUM`, `FUUID` i numeryczny `FCARDNUM`.
Przypisanie musi być aktywne i mieścić się w okresie ważności, chyba że
`FOVERRIDEACTIVE=1`.

Pierwsze użycie UID może wymagać podania czterocyfrowego kodu karty. UID jest
normalizowany, hashowany HMAC i wiązany z numerem APACS. System okresowo wymusza
ponowną weryfikację zgodnie z `CARD_REVERIFICATION_PERCENT`.

Konto MSSQL powinno posiadać wyłącznie `SELECT` na wymaganych tabelach. Domyślnie
połączenie wymaga szyfrowania i nie ufa certyfikatowi serwera bez jawnej zgody.

## MinIO

API tworzy bucket podczas startu, jeśli nie istnieje. Nowe obiekty mają format:

```text
YYYY-MM-DD/<uuid>.<canonical-extension>
```

Metadane `Content-Type` są zapisywane razem z obiektem. Publiczny URL wskazuje
na proxy API `/api/media/object?name=...`, dzięki czemu bucket może pozostać
prywatny i nie trzeba utrwalać hosta MinIO w danych formularza.

Przed zapisem nowych zdjęć backend używa `sharp`: JPEG, PNG i WebP są obracane
zgodnie z EXIF i skalowane proporcjonalnie do maksymalnie 2560 px na dłuższym
boku, bez powiększania. JPEG i WebP mają jakość 82; PNG zachowuje przezroczystość
i używa bezstratnej kompresji (samo zmniejszenie wymiarów usuwa część szczegółów).
Format pozostaje bez zmian. Wynik zastępuje oryginał tylko wtedy, gdy jest mniejszy.
HEIC/HEIF i obrazy animowane są zapisywane bez zmian. Standardowe binaria `sharp`
nie obsługują dekodowania HEIC/HEVC. Limit uploadu nadal wynosi 20 MiB, a dekodowanie
JPEG/PNG/WebP jest ograniczone do 50 mln pikseli. Istniejące obiekty w MinIO nie
są ponownie przetwarzane.

## WebSocket

API używa adaptera `ws`. Gateway jakości emituje sygnał po zakończeniu
inspekcji, aby klienci mogli odświeżyć dashboard. Dane trwałe nadal należy
pobierać przez REST; zdarzenie WebSocket jest sygnałem, nie źródłem prawdy.
