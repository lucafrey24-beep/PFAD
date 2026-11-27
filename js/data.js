// Stammdaten. Quelle des Modells: Studienarbeit T3100, Kap. 5 (Liefergegenstände Tab. 12, Leitfragen Tab. 15, Referenzfälle Tab. 18).
// Fiktive Beispielvorhaben liegen in store.js und werden nur auf Wunsch geladen.
const _n = new Date();
export const TODAY = _n.getFullYear() + "-" + String(_n.getMonth() + 1).padStart(2, "0") + "-" + String(_n.getDate()).padStart(2, "0"); // heutiges Datum
export const PCS = ["PC Diagnose", "PC Calibration & Emission", "PC Software & Data"];
export const PH = ["01 Idee & Briefing", "02 Konzept", "03 Entwicklung", "04 Absicherung", "05 Einführung"];
export const MODS = [
  {id: "r1", t: "Abgleich Referenzprodukt", ph: 1, ty: "stufe", ln: "G", d: "Liste übernommen / angepasst / neu"},
  {id: "s1", t: "Muster & Design Freeze", ph: 2, ty: "spur", ln: "H", rv: {n: "Design Freeze", p: .45}, d: "A-/B-Muster, Freeze-Protokoll"},
  {id: "s2", t: "Abgleichpunkte HW/SW", ph: 2, ty: "spur", ln: "G", d: "Integrationsstand an G2, G3, G4"},
  {id: "s3", t: "Zulassung & Normen", ph: 3, ty: "spur", ln: "H", d: "Konformitäts- und Homologationsnachweise"},
  {id: "s4", t: "Werkzeug & Serienanlauf", ph: 3, ty: "spur", ln: "H", rv: {n: "Serienfreigabe", p: .72}, d: "Werkzeugfreigabe, Nullserie, Anlauf"},
  {id: "s5", t: "Sprints in den Phasen", ph: 2, ty: "spur", ln: "S", d: "Sprint Reviews mit Ergebnis"},
  {id: "s6", t: "Release- & Update-Management", ph: 4, ty: "spur", ln: "S", d: "Releaseplan, Update-Konzept"},
  {id: "o1", t: "Kundenpilot / Beta", ph: 3, ty: "opt", ln: "G", rv: {n: "Pilotfreigabe", p: .28, r: 3}, d: "Pilotbericht mit Feedback"},
  {id: "o3", t: "Markteinführung SoC / SoS / SoD", ph: 4, ty: "opt", ln: "G", d: "Termine Start of Communication, Sales, Delivery"}
];
export const SPN = {A: "Device with Software", B: "Software on Device", C: "Software & Data"};
export const SPDESC = {
  A: "Hardware führt. Muster, Design Freeze, Zulassung und Serienanlauf werden vorgeschlagen.",
  Bh: "Software führt, Hardware wird mitentwickelt. Sprints plus Muster und Abgleichpunkte.",
  B: "Software führt auf bestehender Hardware. Sprints, Abgleichpunkte HW/SW und Release-Management.",
  C: "Kein eigenes Gerät. Sprints, laufende Releases, Kennzahlen."
};
export const STATUS = {
  on: ["On Track", "s-on"], off: ["Off Track", "s-off"], bl: ["Blockiert", "s-bl"], pe: ["Freigabe offen", "s-pe"],
  li: ["ohne PEP", "s-li"], re: ["Zurück an PL", "s-re"], ho: ["Hold", "s-re"], ki: ["Abgebrochen (Kill)", "s-re"], do: ["Abgeschlossen", "s-on"]
};
export const ROLES = {PL: "Projektleitung", MS: "MS Gate Committee", PPB: "PGB", WP: "WP Board", PG: "Product Governance"};
// Leitfragen je Gate: vor dem Gate bekannte Freigabekriterien (Studienarbeit Kap. 5.6, Tab. 15)
export const LF = {
  G1: ["Passt das Vorhaben zur Strategie?", "Sind Spur und Konfiguration richtig gewählt?", "Reichen die Ressourcen für die Konzeptphase?"],
  G2: ["Ist die Lösung machbar und der Business Case belastbar?", "Sind die Anforderungen an Hardware und Software abgestimmt?", "Sind Generationsstufe und Bausteinwahl begründet?"],
  G3: ["Wie reif sind Hardware und Software, einzeln und gemeinsam?", "Welche Risiken sind offen?", "Hält der Plan bis zur Markteinführung?"],
  G4: ["Ist das Produkt freigabefähig in Qualität, Zulassung und Betrieb?", "Sind Vertrieb, Service und Support vorbereitet?", "Wie werden Updates nach dem Start freigegeben?"],
  G5: ["Wurden die Ziele erreicht?", "Wer verantwortet das Produkt im Lebenszyklus?", "Was folgt daraus für die nächste Generation?"]
};
export const lfOf = n => n === "G1+2" ? LF.G1.map((q, i) => ({k: "G1:" + i, q})).concat(LF.G2.map((q, i) => ({k: "G2:" + i, q}))) : (LF[n] || []).map((q, i) => ({k: n + ":" + i, q}));
// Änderungsanträge (Kap. 5.4 und 4.2.3): wohin eine Änderung geht
export const CRK = {
  backlog: {t: "Anforderung innerhalb der Spur", to: "backlog"},
  sys: {t: "Gemeinsame Systemanforderungen", to: "gate"},
  hw: {t: "Festgelegte Hardware (ab Design Freeze)", to: "gate"},
  gate: {t: "Termin eines Gates", to: "gate"},
  lt: {t: "Wesentliche Änderung des Liefertermins", to: "wp"},
  budget: {t: "Budgetänderung", to: "gate"}
};
export const WP_LIMIT = 50000; // Budgetänderungen darüber entscheidet das WP Board
export const RG = ["nicht erreicht", "teilweise", "erreicht"]; // Reifegrad gegenüber dem Ziel der Phase (Annahme)
export const TSS = {u: "übernommen", a: "angepasst", n: "neu"}; // Teilsystemstatus nach Variationsart

export function apprOf(l) {
  l = String(l);
  return l.startsWith("G1+2") ? {spur: true, stufe: true} : l.startsWith("G1") ? {spur: true, stufe: false} : l === "–" ? {spur: false, stufe: false} : {spur: true, stufe: true};
}
// Referenzfälle aus Tab. 18 der Studienarbeit (Anzahl Reviews je Pfad). Die Prozentwerte sind Beispielwerte, die die jeweilige Stufe ergeben.
export const PRESETS = [
  {n: "Spur A · Full", s: "Tab. 18: 8 Reviews, mit Kundenpilot", q: [1, 1, 1], hw: 80, sw: 60, opt: {o1: 1}},
  {n: "Spur B · Standard", s: "Tab. 18: 5 Reviews", q: [1, 1, 0], hw: 30, sw: 50, opt: {}},
  {n: "Spur B · Light", s: "Tab. 18: 3 Reviews", q: [1, 0, 1], hw: 0, sw: 15, opt: {}},
  {n: "Spur C · Full", s: "Tab. 18: 5 Reviews, mit Kundenpilot", q: [0, 1, 1], hw: 0, sw: 75, opt: {o1: 1}}
];
