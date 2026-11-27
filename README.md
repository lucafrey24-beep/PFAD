# PFAD – PEP-Konfigurator (App)

Installierbare Web-App (PWA) zum Konfigurieren des PEP nach dem Modell der Studienarbeit (Kap. 5): Einstufung, Spur A/B/C, Generationsstufe Full/Standard/Light (aus Teilsystemliste oder Schätzung), Bausteine mit Begründung bei Abwahl, Liefergegenstände je Phase und Spur (Tab. 12), Leitfragen je Gate (Tab. 15), zweistufige Freigabe (MS Gate Committee prüft, PGB entscheidet, WP Board bei Uneinigkeit und Rahmenänderungen), Änderungsanträge, Folgegeneration, Cockpit, CSV-/JSON-Export. Aufbau und Bedienung wie SATZ, Farben nur Hella-Gutmann-Grün #007d40, Weiß #ffffff und Schwarz.

## Starten
ES-Module und Service Worker brauchen einen Server (nicht `file://`):
`python3 -m http.server 8000` und `http://localhost:8000` öffnen.

## Veröffentlichen (wie SATZ)
Ordnerinhalt in ein GitHub-Repo legen, Settings > Pages > Branch `main`, Ordner `/ (root)`. Danach auf dem Handy die URL öffnen und "Zum Home-Bildschirm" wählen. Bei jeder Änderung `CACHE` in `sw.js` erhöhen.

## Struktur
- `js/model.js` Konfigurationslogik (ohne DOM), `js/rules.js` Regelwerk (aktive Fassung, Entwurf, Versionen, CSV-Import), `js/data.js` Konstanten (Leitfragen, Bausteine, Referenzfälle), `js/store.js` Zustand, Workflow, Export und 14 fiktive Beispielvorhaben (nur auf Wunsch geladen), `js/app.js` Oberfläche, `js/cfg.js` Konfigurator-Ansicht
- `tests/referenzfaelle.test.mjs` prüft Tab. 18 (8/5/3/5 Reviews), G3-Regel, Abgleichpunkte, Liefergegenstände je Spur und das Festschreiben: `node tests/referenzfaelle.test.mjs`
- `icons/icon.svg` Quelle, `sh tools/make-icons.sh` erzeugt PNGs (rsvg-convert)

## Konfigurator (ab 1.6.0)
Aufbau wie ein Autokonfigurator: links die Schritte (Schnellstart, Einstufung, Spur, Generationsstufe, Bausteine, Zusammenfassung), oben eine Zeile mit Pfad, Gates, Reviews und Liefergegenständen, darunter der Gesamtprozess über die fünf Phasen. Spur, Stufe, Bausteine und Referenzfälle sind Karten; jede Karte zeigt vorab, was sie am Pfad ändert (z. B. „+1 Gate“, „+2 Liefergegenstände“). Nach einer Wahl zeigt die obere Zeile die Änderung, neue Gates, Reviews und Bausteine leuchten im Gesamtprozess kurz auf. Logik in `js/cfg.js`.

## Regeln (ab 1.7.0)
- **Festschreiben:** Beim ersten Go wird das Regelwerk im Vorhaben gespeichert. Spätere Änderungen an Schwellen oder Liefergegenständen ändern freigegebene Vorhaben nicht (Konfigurationsnachweis).
- **Regelwerk-Governance:** Nur die Rolle Product Governance ändert das Regelwerk, und zwar als Entwurf. Aktiv wird er erst nach Freigabe durch das PGB (neue Version mit Verlauf).
- **Freigabe:** Projektleitung beantwortet die Leitfragen, gibt in Spur A/B den Reifegrad HW/SW/System an, der Sponsor bestätigt die Ressourcen. Das MS Gate Committee bewertet die Leitfragen, gibt in Spur A/B je einen Prüfvermerk HW und SW und prüft die Regulatorik (nicht erfüllt = Modify). Offene Punkte führen zu „Go mit offenen Punkten“, dem das PGB ausdrücklich zustimmen muss. Bei Uneinigkeit entscheidet das WP Board.
- **Änderungen:** Backlog der Spur, nächstes Gate (Systemanforderungen, Hardware, Gate-Termin, Budget bis 50 000 €) oder WP Board (Liefertermin, Budget über 50 000 €). Spurwechsel = Neufreigabe ab G1.
- **Spur C:** Kennzahlen werden an G2 festgelegt. **G5:** Lessons Learned sind Pflicht und erscheinen bei der Folgegeneration.
- **Cockpit:** Kill-, Hold- und Modify-Quote, Tage bis zur Entscheidung.

## Bedienung am PC
- Ab 900 px Breite: Navigation als Seitenleiste links, Fenster (Sheets) mittig, Hover-Zustände.
- Tastenkürzel (Hilfe mit `?` oder unter Mehr): `g` dann `v/n/f/c/m` wechselt den Bereich, `n` neues Vorhaben, `/` Suche, `Strg+Enter` im Assistenten weiter bzw. einreichen, Pfeiltasten in Tab-Leiste und Auswahlschaltern, `Esc` schließt Fenster.
- Barrierefreiheit: Überspringen-Link, sichtbarer Fokus, Fokus kehrt nach Fenstern zurück, Seitentitel pro Bildschirm, Tabellen als Alternative zu den Cockpit-Diagrammen, Schriftgröße bis 150 %, Kontrast erhöhen, reduzierte Bewegung, Windows-Kontrastmodus.

## Grenzen
- Daten liegen nur im Browser (localStorage). Sicherung über Mehr > Exportieren.
- Rollen sind ein Umschalter, keine Anmeldung (Projektleitung, MS Gate Committee, PGB, WP Board, Product Governance).
- Keine Anbindung an den Roadmap Master. Schwellen 20 %/60 %, Max-Regel HW/SW, gleiche Gewichtung angepasster und neuer Teilsysteme, Reifegrad-Skala und die Zuordnung der Liefergegenstände zu Leitfragen sind Annahmen bzw. Vorschläge.
- Gate-Schema der App (G1 bis G5) weicht vom Renew PEP (G0 bis G8) ab. Die Zuordnung beim CSV-Import (G0 und G1 → G1 usw.) ist eine Annahme und im Regelwerk änderbar.
