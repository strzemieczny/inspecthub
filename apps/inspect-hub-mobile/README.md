# Inspect Hub Mobile

Aplikacja operatora na tablety Zebra z Androidem: React Native 0.86, Expo SDK 57,
TypeScript i lokalny moduł Kotlin do DataWedge. Panel administratora i dashboard
pozostają w `apps/web`. To pierwsza implementacja mobilnego przepływu, wymagająca
odbioru na docelowym urządzeniu przed wdrożeniem na produkcję.

## Języki

Aplikacja obsługuje polski, angielski i ukraiński. Przycisk z okrągłą ikoną flagi w nagłówku
otwiera wybór języka; ustawienie jest zapisywane na urządzeniu i pozostaje po
ponownym uruchomieniu oraz wylogowaniu. Przy pierwszym uruchomieniu aplikacja
wybiera obsługiwany język urządzenia, a dla pozostałych języków używa polskiego.

Ikony flag pochodzą z `react-native-circle-flags`; aplikacja importuje tylko trzy
potrzebne grafiki i działa z nimi offline.

Interfejs korzysta ze słownika `src/translations.ts`. Treści pytań, opisy i opcje
pobierają tłumaczenia `en` / `uk` zapisane w formularzu przez administratora.
Brakujące tłumaczenia używają treści bazowej. Odpowiedzi wyboru zachowują oryginalne
wartości przy zapisie i ocenie, niezależnie od języka etykiet. Własne nazwy
stanowisk, procesów, formularzy i statusów pozostają zgodne z konfiguracją.

## Uruchomienie

Z katalogu głównego monorepo:

```sh
pnpm install --frozen-lockfile
cp apps/inspect-hub-mobile/.env.example apps/inspect-hub-mobile/.env
```

Ustaw `EXPO_PUBLIC_API_URL` na adres API osiągalny z tabletu, z końcówką `/api`.
Nie wpisuj sekretów do zmiennych `EXPO_PUBLIC_*`: trafiają do aplikacji.
`localhost` oznacza tablet; na emulatorze Androida adres hosta to zwykle `10.0.2.2`.

Do budowania lokalnego potrzebne są Node.js 22.13 lub nowszy, JDK 17, Android SDK zgodny z Expo SDK 57,
ustawione `ANDROID_HOME`, `adb` oraz tablet z debugowaniem USB lub emulator.

```sh
pnpm mobile:android
```

Polecenie generuje projekt Androida, kompiluje aplikację, instaluje ją i uruchamia
Metro. Kolejne uruchomienia serwera JS:

```sh
pnpm mobile:start
```

Expo Go nie zawiera naszego modułu DataWedge. Do testów skanera używaj własnego
builda aplikacji. Zmiana Kotlinu lub pluginów konfiguracji wymaga przebudowania APK.
Pliki w `android/` są generowane; źródłem konfiguracji jest `app.config.ts`,
a źródłem integracji `modules/zebra-datawedge`.

Po aktualizacji do SDK 57 przebuduj aplikację poleceniem `pnpm mobile:android`.
Jeśli katalog `android/` powstał dla poprzedniego SDK, najpierw uruchom
`pnpm --filter inspect-hub-mobile exec expo prebuild --platform android --no-install`.
W SDK 57 `prebuild` domyślnie generuje katalogi natywne od nowa.

Domyślnie aplikacja używa HTTPS. Wyłącznie w lokalnej sieci deweloperskiej można
ustawić `MOBILE_ALLOW_HTTP=1` oraz adres API po HTTP, a następnie przebudować APK.
Dla wydania ustaw tę flagę na `0` i używaj HTTPS z certyfikatem zaufanym przez Androida.

## Przepływ operatora

Aplikacja działa w trybie pełnoekranowym, z ukrytymi paskami systemowymi
i jasnością okna ustawioną na 100%. Dotyczy to również okna logowania.
Tryb jest przywracany po powrocie z aparatu lub tła; nie zmienia systemowej
jasności innych aplikacji. Android pozwala chwilowo odsłonić paski gestem.
Implementacja znajduje się w `modules/operator-display` — po dodaniu modułu
trzeba przebudować i zainstalować APK (`pnpm mobile:android`).

1. Jeśli formularz wymaga logowania, otwórz „Zaloguj operatora” i odczytaj
   identyfikator czytnikiem lub wpisz jego numer. Aplikacja sprawdza operatora
   w kontroli dostępu przez `/auth/card-login`, tak jak aplikacja webowa.
   Przy wymaganym sparowaniu lub ponownej weryfikacji podaj 4-cyfrowy kod
   z odwrotu karty (sprawdzany przez `/auth/pair-card`, bez zapisu kodu na urządzeniu).
2. Zeskanuj lub wpisz kod stanowiska i połącz tablet. Dla nowego stanowiska
   uzupełnij również pola nazwy i procesu inspekcji przed połączeniem.
   Dla istniejącego stanowiska wystarczy kod.
3. Zeskanuj numer seryjny / VIN. Przed rozpoczęciem aplikacja sprawdza aktualne
   stanowisko i uzyskuje zgodę przez `/scada/route-check`.
4. Formularz dobierany jest do PN produktu i procesu stanowiska. Przy wielu
   dopasowaniach wybierz formularz z listy nazw, kodów i wersji. Jedno dopasowanie
   uruchamia się automatycznie. Możesz anulować wybór i zeskanować inną sztukę.
5. Odpowiedz na pytania: OK/NOK, tekst, wybór, pomiar, zdjęcie. Dostępne są
   instrukcje i obrazy wzorcowe. Wynik automatyczny odpowiada regułom backendu;
   przy formularzach wymagających oceny ręcznej operator wybiera dozwolony status.
6. Sprawdź podsumowanie i zapisz. Komunikat potwierdza zapis w Inspect Hub;
   potwierdzenie SCADA jest osobnym procesem backendu.

W pytaniu ze zdjęciem podgląd aparatu pojawia się automatycznie w polu odpowiedzi,
bez otwierania osobnego okna. Jeśli odpowiedź jest już zapisana, wyświetlane jest
zdjęcie oraz przycisk „Zrób nowe zdjęcie”.
Przycisk „Zrób zdjęcie” od razu robi zdjęcie, wysyła je i zapisuje jako odpowiedź,
bez dodatkowego potwierdzenia. Przy błędzie wysyłki podgląd pozostaje dostępny
z przyciskiem „Ponów zapis zdjęcia”;
„Anuluj” zachowuje poprzednią odpowiedź. Aparat zatrzymuje się w tle oraz po
opuszczeniu pytania. Zdjęcia tymczasowe są usuwane po powtórzeniu, anulowaniu
lub zakończeniu pracy z aparatem. Nie jest wymagany dostęp do mikrofonu ani galerii.
Zmiana z systemowego aparatu na `expo-camera` wymaga przebudowania i instalacji APK
(`pnpm mobile:android`); sam restart Metro nie wystarczy.

Token sesji jest przechowywany w Android Keystore przez Expo SecureStore.
Hasło nie jest zapisywane. Stanowisko oraz szkic są zapisywane w AsyncStorage,
w prywatnych danych aplikacji. Kopia zapasowa Androida jest wyłączona.
Dane są rozdzielone według adresu API.

Po ponad 30 minutach bez aktywności operator jest automatycznie wylogowywany.
Dotyk ekranu, wpisywanie danych i skany czytnika odnawiają czas aktywności.
Czas spędzony w tle i przy zamkniętej aplikacji również jest wliczany;
powrót do aplikacji nie odnawia wygasłej sesji. Wylogowanie nie otwiera okna
logowania; formularze bez wymaganego logowania nadal są dostępne.
Stanowisko oraz szkic inspekcji zostają zachowane. Kontynuacja szkicu
przypisanego do operatora wymaga ponownego zalogowania tego samego operatora.
Sesje zapisane przed wprowadzeniem pomiaru aktywności są usuwane.

Stanowisko jest pamiętane lokalnie; aplikacja jawnie przekazuje jego kod do API.
Nie polega na trwałości ciasteczka przypisania stanowiska w Androidzie.
Po ponownym uruchomieniu odśwież stanowisko, aby pobrać formularze, albo kontynuuj
przywrócony szkic. Skan podczas aktywnej inspekcji nie zmienia jej numeru seryjnego.

## DataWedge

Pakiet Androida: `com.inspecthub.mobile`.
Przycisk **Skonfiguruj skaner** wysyła `SET_CONFIG` dla profilu `InspectHubMobile`:

- aplikacja powiązana: `com.inspecthub.mobile`, wszystkie aktywności;
- Barcode Input włączone, wybór skanera `auto`;
- Intent Output włączone, dostarczenie **Broadcast Intent**;
- action: `com.inspecthub.mobile.SCAN`;
- category: `android.intent.category.DEFAULT`;
- Keystroke Output wyłączone, aby skan nie trafiał równolegle do pola tekstowego.

Konfiguracja wymaga wersji DataWedge obsługującej wiele pluginów w `SET_CONFIG`
i `SEND_RESULT=COMPLETE_RESULT` (DataWedge 7.1+). Po odpowiedzi `SET_CONFIG`
aplikacja odczytuje profil przez `GET_CONFIG` i sprawdza jego włączenie,
powiązanie z aplikacją oraz ustawienia Barcode, Intent i Keystroke.
Pokazuje sukces dopiero po potwierdzeniu zapisanych ustawień, również gdy
`SET_CONFIG` zgłasza błąd przy już poprawnym profilu. Nie ignoruje konfliktów
powiązania z innym profilem. Aktualizacja nie resetuje pozostałych ustawień pluginów.
Brak odpowiedzi w ciągu 10 sekund jest zgłaszany jako `DATAWEDGE_RESPONSE_TIMEOUT`.
Przy błędzie wyświetla również niezgodne ustawienia, moduł i kody przyczyny
z `RESULT_LIST` lub `RESULT_INFO`, np. `APP_ALREADY_ASSOCIATED` oznacza
powiązanie aplikacji z innym profilem. Przy braku odpowiedzi sprawdź profil ręcznie w DataWedge.
Konfiguracja jest jawna: aplikacja nie nadpisuje profili przy każdym uruchomieniu.

Moduł odbiera `com.symbol.datawedge.data_string`, `label_type` i `source`.
Odbiornik jest rejestrowany dynamicznie i wyłączany w tle. Przycisk sprzętowy
obsługuje DataWedge; ekranowy przycisk **Skanuj kod** wysyła `SOFT_SCAN_TRIGGER`.
Skan łączy nieprzypisany tablet ze stanowiskiem, a po wybraniu formularza
rozpoczyna sprawdzenie sztuki w SCADA. Kod można też wpisać ręcznie.

Zgodność szyfrowanej karty HID z czytnikiem jest potwierdzona przez właściciela
projektu, ale ten etap nie implementuje jeszcze transportu danych z tego czytnika.
Logowanie używa istniejącego endpointu `/auth/login`. Nie interpretuje skanu
produktu jako identyfikatora pracownika.

## Szkice, brak sieci i ponawianie zapisu

Każda zmiana szkicu jest kolejkowana do lokalnego zapisu. Po restarcie aplikacja
przywraca formularz z jego wersją, zgodę SCADA, odpowiedzi i operatora.
Nie można przypisać rozpoczętej inspekcji innemu operatorowi.

Przed wysłaniem `/inspections` aplikacja trwale zapisuje dokładny payload
z UUID `clientSubmissionId`. Przy utracie odpowiedzi lub błędzie 5xx blokuje
edycję i pozwala ponowić identyczne żądanie; API rozpoznaje ten identyfikator.
Po jednoznacznym błędzie walidacji 4xx można poprawić odpowiedzi. Przy 401
należy ponownie zalogować tego samego operatora. Szkic jest usuwany dopiero po
potwierdzeniu zapisu przez API. Wysyłka nie ponawia się automatycznie w tle.

To nie jest pełny tryb offline: rozpoczęcie nowej inspekcji wymaga route check,
a zdjęcia wymagają przesłania na serwer. Przy braku sieci można uzupełniać
odpowiedzi tekstowe, wybory i pomiary w rozpoczętej inspekcji oraz ponowić zapis
po odzyskaniu połączenia. Nie ma jeszcze kolejki wielu inspekcji ani lokalnej
kolejki zdjęć. Pierwsza wersja interfejsu jest w języku polskim.

## Weryfikacja

```sh
pnpm --filter inspect-hub-mobile check-types
pnpm --filter inspect-hub-mobile lint
pnpm --filter inspect-hub-mobile test
pnpm --filter inspect-hub-mobile build
pnpm --filter inspect-hub-mobile exec expo install --check
```

`build` generuje bundle JavaScript/Hermes dla Androida w `dist/`; nie generuje APK
ani nie kompiluje Kotlinu. Projekt natywny można zweryfikować przez:

```sh
pnpm --filter inspect-hub-mobile exec expo prebuild --platform android --no-install
pnpm --filter inspect-hub-mobile android --variant release
```

`eas.json` zawiera także profile APK do developmentu, testów i produkcji.
Konfiguracja konta EAS, zmiennych środowiskowych i podpisywania wydania jest
osobnym krokiem wdrożenia; żaden build nie jest automatycznie publikowany.

Przed wdrożeniem wykonaj na docelowej Zebrze: konfigurację profilu, skan przyciskiem,
przejście w tło i powrót, logowanie, zdjęcie, wszystkie typy odpowiedzi, odmowę
SCADA, restart w trakcie kontroli, wygaśnięcie sesji i ponowienie zapisu po utracie
sieci. Kiosk i dystrybucję APK skonfiguruj w używanym MDM.

Źródła integracji: [Expo Modules](https://docs.expo.dev/modules/module-api/),
[Zebra SET_CONFIG](https://techdocs.zebra.com/datawedge/latest/guide/api/setconfig/),
[Zebra Intent Output](https://techdocs.zebra.com/datawedge/latest/guide/output/intent/).

## Tożsamość i przypisanie tabletu

Przy pierwszym uruchomieniu aplikacja tworzy UUID v4 instalacji oraz niezależny,
losowy token 256-bitowy. Obie wartości zapisuje w Expo SecureStore, osobno dla
każdego adresu API. Token jest zapisany przed pierwszą próbą parowania, więc
utrata odpowiedzi nie blokuje ponowienia. Serwer przechowuje wyłącznie SHA-256 tokenu.
UUID nie jest sprzętowym identyfikatorem; MAC i IP nie służą do rozpoznawania mobile.

`POST /stations/mobile/pair` otrzymuje `deviceId`, kod stanowiska i opcjonalne
nazwę/proces dla nowego stanowiska. Nagłówki `X-Device-Id` i `X-Device-Token`
są wysyłane przez aplikację; `GET /stations/mobile/current` odtwarza przypisanie.
Route check i zapis inspekcji sprawdzają token oraz zgodność kodu stanowiska dla
żądań z nagłówkami urządzenia. Klient webowy zachowuje dotychczasowy przepływ;
nie jest to globalny wymóg autoryzacji urządzenia dla wszystkich klientów API.

Jedna instalacja może być przypisana do jednego stanowiska, a stanowisko do jednego
tabletu. Zmiana stanowiska zwalnia poprzednie przypisanie. Zajęte stanowisko wymaga
odłączenia poprzedniego tabletu przez ADMIN/MANAGER w panelu stanowisk
(`DELETE /stations/:id/mobile-device`). Odłączenie natychmiast unieważnia token
w bazie; tablet wykryje to przy kolejnym sprawdzeniu lub zapisie.

Po aktualizacji istniejącej aplikacji wymagane jest jednorazowe ponowne parowanie
kodem stanowiska. Szkice pozostają zapisane i można je dokończyć po przypisaniu
do ich stanowiska. Reinstalacja lub wyczyszczenie danych tworzy nową tożsamość;
przed przypisaniem należy odłączyć poprzednią instalację w panelu.

Przed uruchomieniem nowego API wykonaj migracje bazy, w tym
`20261020100000_add_mobile_device_binding` (`pnpm --filter @inspect-hub/database db:migrate:deploy`).
