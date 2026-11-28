// Prüft, dass der Prototyp die Regeln der Studienarbeit umsetzt:
// Referenzfälle aus Tab. 18 (Folge und Anzahl der Reviews), G3-Regel, Abgleichpunkte in Spur B,
// Liefergegenstände je Spur (Tab. 12) und das Festschreiben des Regelwerks beim Go.
// Aufruf: node tests/referenzfaelle.test.mjs  (ohne Abhängigkeiten)
const mem = {}; globalThis.localStorage = {getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; }};
const {compute, stepDelivs} = await import("../js/model.js");
const {PRESETS} = await import("../js/data.js");
const RW = await import("../js/rules.js");
let fail = 0, n = 0;
const ok = (cond, msg) => { n++; if (cond) console.log("ok   " + msg); else { fail++; console.log("FEHL " + msg); } };
const cfg = (q, hw, sw, opt = {}, risk = [0, 0, 0]) => ({thr: [1, 1, 1], q, hw, sw, opt, sel: {}, why: {}, ts: [], risk});

// Tab. 18: beispielhafte Konfigurationen und daraus folgende Reviews
const TAB18 = [
  ["A-Full", 8, "G1, G2, Design Freeze, G3, Pilotfreigabe, Serienfreigabe, G4, G5"],
  ["B-Standard", 5, "G1, G2, Design Freeze, G4, G5"],
  ["B-Light", 3, "G1+2, G4, G5"],
  ["C-Full", 5, "G1, G2, Pilotfreigabe, G4, G5"]
];
PRESETS.forEach((p, i) => {
  const r = compute(cfg(p.q, p.hw, p.sw, p.opt)), [path, cnt, seq] = TAB18[i];
  ok(r.path === path, "Tab. 18 Fall " + (i + 1) + ": Pfad " + r.path + " = " + path);
  ok(r.n === cnt, "Tab. 18 Fall " + (i + 1) + ": " + r.n + " Reviews = " + cnt);
  ok(r.order.map(o => o.n).join(", ") === seq, "Tab. 18 Fall " + (i + 1) + ": Folge " + seq);
});
// G3 nur in Spur A (nicht Light) und Spur B Full
ok(compute(cfg([1, 1, 0], 70, 40)).gates.some(g => g.n === "G3"), "G3 Pflicht in Spur B, Stufe Full");
ok(!compute(cfg([0, 1, 1], 0, 80)).gates.some(g => g.n === "G3"), "kein G3 in Spur C");
ok(!compute(cfg([1, 1, 1], 10, 10)).gates.some(g => g.n === "G3"), "kein G3 in Spur A, Stufe Light");
// Abgleichpunkte HW/SW gelten für Spur A und B, auch ohne Hardwareänderung
const bOhne = compute(cfg([1, 0, 1], 0, 40));
ok(bOhne.sp === "B" && bOhne.on.some(m => m.id === "s2"), "Spur B ohne Hardwareänderung hat Abgleichpunkte HW/SW");
ok(!compute(cfg([0, 1, 1], 0, 40)).on.some(m => m.id === "s2"), "Spur C hat keine Abgleichpunkte");
// Liefergegenstände je Spur statt Device/Digital
const g2 = r => stepDelivs(r, r.gates.find(g => g.n === "G2"));
ok(g2(compute(cfg([1, 1, 0], 30, 50))).includes("Schnittstellenvereinbarung Hardware und Software"), "Spur B: Schnittstellenvereinbarung an G2 (Tab. 12)");
ok(!g2(compute(cfg([1, 1, 1], 70, 40))).includes("Schnittstellenvereinbarung Hardware und Software"), "Spur A: keine Schnittstellenvereinbarung aus Spalte B");
ok(g2(compute(cfg([0, 1, 1], 0, 40))).includes("Kennzahlen"), "Spur C: Kennzahlen an G2");
const bs = compute(cfg([1, 1, 0], 30, 50)), g4 = stepDelivs(bs, bs.gates.find(g => g.n === "G4"));
ok(g4.includes("Integrationstestbericht") && g4.includes("Update-Konzept"), "B-Standard ohne G3: Phase 03 wird an G4 mitgeprüft");
// Festschreiben: ein freigegebenes Vorhaben ändert sich nicht, wenn das Regelwerk geändert wird
const c30 = cfg([1, 0, 1], 0, 30), frozen = RW.freeze();
ok(compute(c30, frozen).path === "B-Standard", "Vorher: B mit 30 % ist Standard");
RW.edit(R => { R.thr.light = 35; }); RW.submitDraft(); RW.approveDraft("Test");
ok(compute(c30).path === "B-Light", "Neues Regelwerk (Light bis 35 %): neue Vorhaben werden B-Light");
ok(compute(c30, frozen).path === "B-Standard" && compute(c30, frozen).gates.some(g => g.n === "G1"), "Festgeschrieben: bleibt B-Standard mit getrenntem G1 und G2");
// Spur: erst alle Fragen, dann Vorschlag; Abweichung nur mit Begründung (die Begründung prüft der Assistent)
const offen = cfg([1, null, null], 50, 50); ok(!compute(offen).qok && compute(offen).path === "Spur offen", "Fragen offen: keine Spur, kein Pfad");
ok(compute(cfg([0, null, null], 0, 50)).qok && compute(cfg([0, null, null], 0, 50)).pk === "C", "Erste Frage nein reicht: Vorschlag Spur C");
const abw = Object.assign(cfg([1, 1, 0], 50, 50), {ov: {k: "A", why: "Zulassung bestimmt den Termin"}}); const ra = compute(abw);
ok(ra.pk === "Bh" && ra.key === "A" && ra.sp === "A" && ra.gates.some(g => g.n === "G3"), "Abweichung auf Spur A wirkt auf Pfad (G3), Vorschlag bleibt B mit HW");
// Risiko-Korrektur (Ergänzung V2): hebt die Stufe um eine an, nie ab
ok(compute(cfg([1, 0, 1], 0, 15, {}, [1, 0, 0])).st === "Standard" && compute(cfg([1, 0, 1], 0, 15)).st === "Light", "Risiko-Korrektur: Light wird Standard");
ok(compute(cfg([1, 1, 1], 70, 70, {}, [0, 1, 1])).st === "Full", "Risiko-Korrektur: Full bleibt Full");
// Bausteine als Daten: Pflicht nicht abwählbar, nicht verfügbar fällt weg
RW.edit(R => { R.mods.s5 = {t: "Sprints in den Phasen", d: "Sprint Reviews mit Ergebnis", pf: {A: "p", Bh: "v", B: "v", C: "v"}}; }); RW.submitDraft(); RW.approveDraft("Test");
const aSel = cfg([1, 1, 1], 70, 40); aSel.sel = {s5: false};
ok(compute(aSel).on.some(m => m.id === "s5"), "Pflichtbaustein bleibt aktiv, auch wenn abgewählt");
ok(compute(cfg([0, 1, 1], 0, 40)).ab.length === 0 && compute(Object.assign(cfg([0, 1, 1], 0, 40), {sel: {s6: false}})).ab.some(m => m.id === "s6"), "Vorgeschlagener Baustein abgewählt: Begründung nötig");
// Regelwerk-Entwurf wirkt erst nach Freigabe
RW.edit(R => { R.thr.full = 90; });
ok(RW.rules().thr.full === 60 && RW.draft().thr.full === 90, "Entwurf ist nicht aktiv, bis das PGB freigibt");
RW.discardDraft();
console.log("\n" + (n - fail) + " von " + n + " Prüfungen bestanden");
process.exit(fail ? 1 : 0);
