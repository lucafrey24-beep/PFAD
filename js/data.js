// Stammdaten und Demodaten. Alles fiktiv. Quelle des Modells: Studienarbeit, Kapitel 5.7.
export const TODAY = "2026-11-23"; // Datenstand der Demo (fest, damit "nächste Gates" nachvollziehbar bleiben)
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
  {id: "o2", t: "Datenschutz & IT-Sicherheit", ph: 1, ty: "opt", ln: "S", d: "Datenschutz- und Security-Konzept"},
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
  li: ["ohne PEP", "s-li"], re: ["Zurück an PL", "s-re"], ho: ["Hold", "s-re"], ki: ["Abgebrochen (Kill)", "s-re"]
};
export const ROLES = {PL: "Projektleitung", MS: "MS Gate Committee", PPB: "PPB"};

export function apprOf(l) {
  l = String(l);
  return l.startsWith("G1+2") ? {spur: true, stufe: true} : l.startsWith("G1") ? {spur: true, stufe: false} : l === "–" ? {spur: false, stufe: false} : {spur: true, stufe: true};
}
function D(id, name, pc, pl, q, hw, sw, opt, status, last, next, date, upd, note, thr) {
  return {id, name, pc, pl, c: {thr: thr || [1, 1, 1], q, hw, sw, sel: {}, opt: opt || {}, why: {}}, status, last, next, date, upd, note: note || "",
    demo: true, appr: apprOf(last), stage: "ms", rec: "", ver: 1, versions: [], log: []};
}
export function seedProjects() {
  return [
    D("RM-2026-101", "Diagnosegerät Gen. 5", "PC Diagnose", "M. Kern", [1, 1, 0], 40, 70, {o1: 1, o3: 1}, "on", "G2 Konzeptfreigabe", "G3", "2027-02-10", true),
    D("RM-2026-102", "Softwareversion 2027.1", "PC Diagnose", "S. Wolf", [1, 0, 1], 0, 25, {o3: 1}, "on", "G2 Konzeptfreigabe", "G4", "2026-12-15", true),
    D("RM-2026-103", "Softwareversion 2026.4", "PC Diagnose", "S. Wolf", [1, 0, 1], 0, 10, {o3: 1}, "on", "G4 Produktfreigabe", "G5", "2026-12-02", true),
    D("RM-2026-104", "Abgasmessmodul neu", "PC Calibration & Emission", "T. Berger", [1, 1, 1], 85, 50, {o1: 1, o3: 1}, "off", "G2 Konzeptfreigabe", "Design Freeze", "2027-01-20", true, "Terminverzug ca. 6 Wochen (Lieferant Sensorik)"),
    D("RM-2026-105", "ADAS-Kalibriertafel Plus", "PC Calibration & Emission", "J. Hahn", [1, 1, 1], 35, 20, {}, "bl", "G1 Ideenfreigabe", "G2", "2026-12-09", false, "Business Case fehlt"),
    D("RM-2026-106", "Scheinwerfer-Einstellgerät Update", "PC Calibration & Emission", "J. Hahn", [1, 1, 0], 15, 30, {o3: 1}, "on", "G2 Konzeptfreigabe", "Design Freeze", "2026-12-18", true),
    D("RM-2026-107", "Fahrzeugdaten-API", "PC Software & Data", "A. Roth", [0, 1, 1], 0, 70, {o1: 1, o2: 1}, "on", "G2 Konzeptfreigabe", "Pilotfreigabe", "2027-01-12", true),
    D("RM-2026-108", "Werkstatt-Cloud Reporting", "PC Software & Data", "A. Roth", [0, 1, 1], 0, 40, {o2: 1}, "bl", "G1 Ideenfreigabe", "G2", "2026-11-30", false, "Kapazität Backend-Team ungeklärt"),
    D("RM-2026-109", "Remote-Diagnose-Dienst", "PC Software & Data", "K. Lenz", [0, 1, 1], 0, 80, {o1: 1, o2: 1, o3: 1}, "off", "G2 Konzeptfreigabe", "Pilotfreigabe", "2026-12-04", true, "Budget ca. 15 % über Plan"),
    D("RM-2026-110", "Kalibrier-Software 3.2", "PC Calibration & Emission", "T. Berger", [1, 0, 1], 0, 20, {}, "on", "G1+2 Startfreigabe", "G4", "2026-12-11", true),
    D("RM-2026-111", "Diagnose-Adapter USB-C", "PC Diagnose", "M. Kern", [1, 1, 1], 60, 10, {}, "on", "G1 Ideenfreigabe", "G2", "2026-12-16", true),
    D("RM-2026-112", "Lizenzportal Relaunch", "PC Software & Data", "K. Lenz", [0, 1, 1], 0, 55, {o3: 1}, "on", "G2 Konzeptfreigabe", "G4", "2027-02-03", false),
    D("RM-2026-113", "Emissions-Datenbank 2027", "PC Software & Data", "A. Roth", [0, 1, 1], 0, 30, {}, "on", "G2 Konzeptfreigabe", "G4", "2027-01-28", false),
    D("RM-2026-114", "Bremsenprüf-Erweiterung", "PC Calibration & Emission", "J. Hahn", [1, 1, 1], 45, 30, {}, "bl", "G2 Konzeptfreigabe", "G3", "2027-01-15", false, "Zielhardware nicht verfügbar"),
    D("RM-2026-115", "Klimaservice-Integration", "PC Diagnose", "S. Wolf", [1, 0, 1], 0, 35, {o3: 1}, "off", "G2 Konzeptfreigabe", "G4", "2026-12-07", true, "Anforderungen nach G2 erweitert"),
    D("RM-2026-116", "Kleines Feature-Paket Q1", "PC Diagnose", "S. Wolf", [1, 0, 1], 0, 10, {}, "li", "–", "–", "", true, "unter den Projektschwellen", [1, 0, 0]),
    Object.assign(D("RM-2026-117", "Batterietester-Modul", "PC Calibration & Emission", "T. Berger", [1, 1, 1], 70, 40, {o3: 1}, "pe", "–", "Konfiguration", "2026-11-25", true),
      {submitted: "20.11.2026", stage: "ppb", rec: "Empfohlen (MS Gate Committee, 21.11.2026)", log: [
        {t: "20.11.2026", who: "Projektleitung (T. Berger)", x: "Konfiguration A-Full eingereicht"},
        {t: "21.11.2026", who: "MS Gate Committee", x: "Prüfung abgeschlossen, Empfehlung an PPB"}]}),
    Object.assign(D("RM-2026-118", "App für Werkstattkunden", "PC Software & Data", "K. Lenz", [0, 1, 1], 0, 90, {o1: 1, o2: 1}, "pe", "–", "Konfiguration", "2026-11-25", true),
      {submitted: "21.11.2026", log: [{t: "21.11.2026", who: "Projektleitung (K. Lenz)", x: "Konfiguration C-Full eingereicht"}]})
  ];
}
export const PRESETS = [
  {n: "Neues Messgerät", s: "Spur A · Full, mit Pilot", name: "Abgasmessmodul Gen. 2", pc: 1, q: [1, 1, 1], hw: 80, sw: 60, opt: {o1: 1, o3: 1}, ref: ""},
  {n: "Diagnosegerät Folgegeneration", s: "Spur B · Standard", name: "Diagnosegerät Gen. 6", pc: 0, q: [1, 1, 0], hw: 30, sw: 50, opt: {o3: 1}, ref: "Diagnosegerät Gen. 5"},
  {n: "Softwareversion", s: "Spur B · Light", name: "Softwareversion 2027.2", pc: 0, q: [1, 0, 1], hw: 0, sw: 15, opt: {o3: 1}, ref: "Softwareversion 2027.1"},
  {n: "Cloud-Dienst", s: "Spur C · Full, mit Pilot", name: "Werkstatt-Terminportal", pc: 2, q: [0, 1, 1], hw: 0, sw: 75, opt: {o1: 1, o2: 1}, ref: ""}
];
