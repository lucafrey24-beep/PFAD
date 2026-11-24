// Stammdaten. Quelle des Modells: Studienarbeit T3100, Kapitel 5.7 (Tab. 15 und 16). Es gibt keine Beispielvorhaben.
const _n = new Date();
export const TODAY = _n.getFullYear() + "-" + String(_n.getMonth() + 1).padStart(2, "0") + "-" + String(_n.getDate()).padStart(2, "0"); // heutiges Datum
export const PCS = ["PC Diagnose", "PC Calibration & Emission", "PC Software & Data"];
export const PH = ["01 Idee & Briefing", "02 Konzept", "03 Entwicklung", "04 Absicherung", "05 Einführung"];
export const PFL = [["Idee / Problem", "Strategie-Fit", "Spur gewählt"], ["Business Case", "Projektplan", "Risikoanalyse", "Konfiguration"], ["Statusbericht", "Risiken aktualisiert"], ["Produktinformation", "Freigabeempfehlung"], ["Abschlussbericht", "Lessons Learned", "Rollen im Lebenszyklus"]];
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
  B: "Software führt auf bestehender Hardware. Sprints und Release-Management.",
  C: "Kein eigenes Gerät. Sprints, laufende Releases, Kennzahlen."
};
export const STATUS = {
  on: ["On Track", "s-on"], off: ["Off Track", "s-off"], bl: ["Blockiert", "s-bl"], pe: ["Freigabe offen", "s-pe"],
  li: ["ohne PEP", "s-li"], re: ["Zurück an PL", "s-re"], ho: ["Hold", "s-re"], ki: ["Abgebrochen (Kill)", "s-re"], do: ["Abgeschlossen", "s-on"]
};
export const ROLES = {PL: "Projektleitung", MS: "MS Gate Committee", PPB: "PGB"};

export function apprOf(l) {
  l = String(l);
  return l.startsWith("G1+2") ? {spur: true, stufe: true} : l.startsWith("G1") ? {spur: true, stufe: false} : l === "–" ? {spur: false, stufe: false} : {spur: true, stufe: true};
}
export const seedProjects = () => []; // keine erfundenen Vorhaben; echte Vorhaben kommen aus dem Roadmap Master (noch nicht angebunden)
// Referenzfälle aus Tab. 16 der Studienarbeit (Anzahl Reviews je Pfad). Die Prozentwerte sind Beispielwerte, die die jeweilige Stufe ergeben.
export const PRESETS = [
  {n: "Spur A · Full", s: "Tab. 16: 8 Reviews, mit Kundenpilot", q: [1, 1, 1], hw: 80, sw: 60, opt: {o1: 1}},
  {n: "Spur B · Standard", s: "Tab. 16: 5 Reviews", q: [1, 1, 0], hw: 30, sw: 50, opt: {}},
  {n: "Spur B · Light", s: "Tab. 16: 3 Reviews", q: [1, 0, 1], hw: 0, sw: 15, opt: {}},
  {n: "Spur C · Full", s: "Tab. 16: 5 Reviews, mit Kundenpilot", q: [0, 1, 1], hw: 0, sw: 75, opt: {o1: 1}}
];
