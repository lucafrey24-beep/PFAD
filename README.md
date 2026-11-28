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

## Ablauf (ab 1.8.0, nach Fragenkatalog vom 28.11.2026 und Visio PFAD_Prozess_v5)
- **Ideenpool:** Jeder reicht Ideen ein, bewertet (1 bis 5) und kommentiert. Das PGB stößt Ideen an, eine Projektleitung übernimmt sie und legt daraus ein Vorhaben an.
- **Spur (ab 1.8.1):** Die drei Fragen zur Spur sind Pflicht; erst danach schlägt die App die Spur vor. Eine andere Spur ist wählbar, braucht aber eine Begründung. Vorschlag, Wahl und Begründung stehen im Nachweis und sind für MS Gate Committee und PGB sichtbar.
- **Konfiguration:** Einstufung, Spur, Teilsystemliste (ab Standard Pflicht), Generationsstufe mit Risiko-Korrektur, Bausteine (je Spur Pflicht, vorgeschlagen oder optional; im Regelwerk pflegbar).
- **G1:** Die Projektleitung hakt die Nachweise ab, beantwortet die Leitfragen, bestätigt den Sponsor und reicht ein; das PGB entscheidet direkt.
- **Ab G2:** Das MS Gate Committee (= Projektteam) prüft auf Vollständigkeit, in Spur A und B mit Prüfvermerk HW und SW; das PGB entscheidet. Freigabe nur, wenn alles vorliegt (kein Go mit offenen Punkten). Regulatorik nicht erfüllt: Modify.
- **Wochensitzung:** Das PGB tagt wöchentlich (Tag unter Mehr einstellbar); die Tagesordnung wird als Text oder CSV exportiert.
- **Hold** mit Wiedervorlage spätestens nach 3 Monaten, **Kill** mit Abbruchbericht, **WP Board** nur auf Vorlage des PGB.
- **Änderungen:** Backlog, nächstes Gate oder über das PGB an das WP Board (Liefertermin über 4 Wochen, Budget über 50 000 €); vorgezogene Arbeit mit vertraglicher Bindung entscheidet das PGB.
- **Nach G5:** Verantwortung im Lebenszyklus, Post-Launch-Review 6 bis 12 Monate später, Folgegeneration.
- **Festschreiben und Regelwerk:** wie ab 1.7.0 (erstes Go schreibt das Regelwerk fest; Product Governance pflegt, PGB gibt frei).
- **Konzept:** Nachweise werden abgehakt, nicht hochgeladen; E-Mails werden als mailto vorbereitet; keine Anmeldung.

## Bedienung am PC
- Ab 900 px Breite: Navigation als Seitenleiste links, Fenster (Sheets) mittig, Hover-Zustände.
- Tastenkürzel (Hilfe mit `?` oder unter Mehr): `g` dann `v/n/f/c/m` wechselt den Bereich, `n` neues Vorhaben, `/` Suche, `Strg+Enter` im Assistenten weiter bzw. einreichen, Pfeiltasten in Tab-Leiste und Auswahlschaltern, `Esc` schließt Fenster.
- Barrierefreiheit: Überspringen-Link, sichtbarer Fokus, Fokus kehrt nach Fenstern zurück, Seitentitel pro Bildschirm, Tabellen als Alternative zu den Cockpit-Diagrammen, Schriftgröße bis 150 %, Kontrast erhöhen, reduzierte Bewegung, Windows-Kontrastmodus.

## Grenzen
- Daten liegen nur im Browser (localStorage). Sicherung über Mehr > Exportieren.
- Rollen sind ein Umschalter, keine Anmeldung (Projektleitung, MS Gate Committee = Projektteam, PGB, WP Board, Product Governance).
- Keine Anbindung an den Roadmap Master. Schwellen 20 %/60 %, Max-Regel HW/SW, gleiche Gewichtung angepasster und neuer Teilsysteme, Reifegrad-Skala und die Zuordnung der Liefergegenstände zu Leitfragen sind Annahmen bzw. Vorschläge.
- Gate-Schema der App (G1 bis G5) weicht vom Renew PEP (G0 bis G8) ab. Die Zuordnung beim CSV-Import (G0 und G1 → G1 usw.) ist eine Annahme und im Regelwerk änderbar.
