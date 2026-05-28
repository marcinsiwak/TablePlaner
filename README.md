# TablePlaner 💍

Aplikacja webowa do planowania rozsadzenia gości na weselu.

## Funkcje

- 🏛️ Wizualny plan sali z rzeczywistymi wymiarami (w cm)
- 🪑 Stoły okrągłe (ø 180 cm), prostokątne (180×90 cm), stół Młodych (160×90 cm)
- 🔄 Obracanie stołów (mysz, przyciski, klawiatura)
- 👥 Import gości z pliku CSV
- 🎯 Przypisywanie gości do konkretnych krzeseł
- ✏️ Edycja imion i grup gości
- 🔍 Wyszukiwarka gości
- 📐 Zoom i auto-układ stołów
- 💾 Eksport planu

## Uruchomienie

Otwórz `index.html` w przeglądarce — nie wymaga serwera ani instalacji.

## Format CSV

```csv
imie,nazwisko,grupa,stol
Anna,Kowalska,family,Rodzina
Piotr,Nowak,friend,Przyjaciele
```

Grupy: `family`, `friend`, `work`, `other`

## Technologie

Czysty HTML5 + CSS3 + Canvas API (bez zewnętrznych frameworków)
