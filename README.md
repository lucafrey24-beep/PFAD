# PFAD – PEP-Konfigurator (App)

Installierbare Web-App (PWA) zum Konfigurieren des PEP nach dem Modell der Studienarbeit (Kap. 5.7): Einstufung, Spur A/B/C, Generationsstufe Full/Standard/Light, Bausteine mit Begründung bei Abwahl, zweistufige Freigabe (MS Gate Committee prüft, PPB entscheidet), Cockpit, CSV-/JSON-Export. Aufbau und Bedienung wie SATZ, Farben nur Hella-Gutmann-Grün #007d40, Weiß #ffffff und Schwarz.

## Starten
ES-Module und Service Worker brauchen einen Server (nicht `file://`):
`python3 -m http.server 8000` und `http://localhost:8000` öffnen.

## Veröffentlichen (wie SATZ)
Ordnerinhalt in ein GitHub-Repo legen, Settings > Pages > Branch `main`, Ordner `/ (root)`. Danach auf dem Handy die URL öffnen und "Zum Home-Bildschirm" wählen. Bei jeder Änderung `CACHE` in `sw.js` erhöhen.

## Struktur
- `js/model.js` Konfigurationslogik (ohne DOM), `js/data.js` Konstanten und Demo-Daten, `js/store.js` Zustand, Workflow, Export, `js/app.js` Oberfläche
- `icons/icon.svg` Quelle, `sh tools/make-icons.sh` erzeugt PNGs (rsvg-convert)

## Bedienung am PC
- Ab 900 px Breite: Navigation als Seitenleiste links, Fenster (Sheets) mittig, Hover-Zustände.
- Tastenkürzel (Hilfe mit `?` oder unter Mehr): `g` dann `v/n/f/c/m` wechselt den Bereich, `n` neues Vorhaben, `/` Suche, `Strg+Enter` im Assistenten weiter bzw. einreichen, Pfeiltasten in Tab-Leiste und Auswahlschaltern, `Esc` schließt Fenster.
- Barrierefreiheit: Überspringen-Link, sichtbarer Fokus, Fokus kehrt nach Fenstern zurück, Seitentitel pro Bildschirm, Tabellen als Alternative zu den Cockpit-Diagrammen, Schriftgröße bis 150 %, Kontrast erhöhen, reduzierte Bewegung, Windows-Kontrastmodus.

## Grenzen
- Daten liegen nur im Browser (localStorage). Sicherung über Mehr > Exportieren.
- Rollen sind ein Umschalter, keine Anmeldung.
- Demo-Vorhaben sind erfunden. Schwellen 20 %/60 % und Max-Regel HW/SW sind Annahmen.
- Gate-Schema der App (G1 bis G5) weicht vom Renew PEP (G0 bis G8) ab, Abgleich offen.
