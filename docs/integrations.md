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

### Dostarczenie wyniku

Po transakcyjnym zapisie inspekcji powstaje `ScadaDelivery` z payloadem:

```json
{
  "serialNumber": "VIN123",
  "processName": "Montaż",
  "result": "PASS",
  "reportUrl": "https://inspect.example/reports/<publicReportId>"
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

## WebSocket

API używa adaptera `ws`. Gateway jakości emituje sygnał po zakończeniu
inspekcji, aby klienci mogli odświeżyć dashboard. Dane trwałe nadal należy
pobierać przez REST; zdarzenie WebSocket jest sygnałem, nie źródłem prawdy.
