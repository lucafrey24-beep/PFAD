// Regelwerk: welche Liefergegenstände je Gate, Spur und Generationsstufe gelten, dazu Schwellen und Bausteintexte.
// Governance (Studienarbeit, Rollen): Product Governance pflegt das Regelwerk als Entwurf, das PGB gibt ihn frei.
// Erst die Freigabe macht den Entwurf aktiv (neue Version). Laufende Vorhaben behalten die Version ihres ersten Go.
// Standardinhalt: Tab. 12 der Studienarbeit (Liefergegenstände je Phase und Spur). Die Product-Governance-CSV
// (Renew PEP, G0 bis G8) wird nur im Browser importiert und landet im Entwurf.
import {MODS} from "./data.js";

const KEY = "pfad-rules", STUFEN = ["Full", "Standard", "Light"], SPUREN = ["A", "B", "C"], PROCS = ["Device", "Digital"];
export const APP_GATES = ["G1", "G2", "G3", "G4", "G5"];
export const GATE_IDS = ["G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"]; // Renew PEP, nur für den CSV-Import
const today = () => { const n = new Date(); return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0"); };

// [App-Gate, Name, Spuren, Leitfrage ("G2:1" = 2. Leitfrage an G2) oder "", weiterverwendet in Phase (0–4) oder ""]
// Die Zuordnung zu Leitfrage oder Folgephase (Regel aus Kap. 5.5) ist ein Vorschlag (zv) und im Regelwerk änderbar.
const ABC = "ABC";
const SEED = [
  ["G1", "Beschreibung von Idee oder Problem", ABC, "G1:0", ""], ["G1", "Strategie-Fit", ABC, "G1:0", ""], ["G1", "Gewählte Spur", ABC, "G1:1", ""],
  ["G1", "Idea One-Pager", "A", "", ""], ["G1", "Scoring", "A", "", ""], ["G1", "Management Summary", "A", "", ""],
  ["G1", "Project Brief", "BC", "", ""], ["G1", "Prüfung der Geräteplattform", "B", "", ""], ["G1", "Projektorganisation", "C", "", ""],
  ["G2", "Business Case", ABC, "G2:0", ""], ["G2", "Projektplan", ABC, "", 2], ["G2", "Risikoanalyse", ABC, "", 2], ["G2", "Generationsstufe", ABC, "G2:2", ""],
  ["G2", "Proof of Concept", "A", "G2:0", ""], ["G2", "Produktanforderungen für Hardware und Software", "A", "G2:1", ""],
  ["G2", "Concept Summary", "BC", "", ""], ["G2", "Schnittstellenvereinbarung Hardware und Software", "B", "G2:1", ""], ["G2", "Delivery Plan", "BC", "", ""], ["G2", "Kennzahlen", "C", "", ""],
  ["G3", "Statusbericht", ABC, "G3:0", ""], ["G3", "Aktualisierte Risikoanalyse", ABC, "G3:1", ""],
  ["G3", "A- und B-Muster", "A", "", ""], ["G3", "Zeichnungen und 3D-Modell", "A", "", ""], ["G3", "Design Verification Plan", "A", "", ""],
  ["G3", "Lauffähige Stände auf dem Gerät", "B", "", ""], ["G3", "Integrationstestbericht", "B", "G3:0", ""], ["G3", "Release-Kandidat", "C", "", ""],
  ["G4", "Produktinformation", ABC, "G4:1", ""], ["G4", "Freigabeempfehlung", ABC, "G4:0", ""],
  ["G4", "Homologationsbericht", "A", "G4:0", ""], ["G4", "Feldtestbericht", "A", "", ""], ["G4", "Bedienungsanleitung", "A", "", ""],
  ["G4", "QA-Bericht", "BC", "G4:0", ""], ["G4", "Release-Information", "B", "", ""], ["G4", "Update-Konzept", "B", "G4:2", ""], ["G4", "Markteinführungsplan", "C", "G4:1", ""],
  ["G5", "Abschlussbericht", ABC, "G5:0", ""], ["G5", "Lessons Learned", ABC, "G5:2", ""], ["G5", "Rollen im Lebenszyklus", ABC, "G5:1", ""],
  ["G5", "Vertriebsbericht", "A", "", ""], ["G5", "Produktaudit", "A", "", ""], ["G5", "Update-Plan", "B", "", ""], ["G5", "Kennzahlenbericht", "C", "", ""]
];
const mk = () => ({
  v: 2, ver: 1, at: "", by: "Standard (Studienarbeit)",
  thr: {light: 20, full: 60},
  imp: {Device: ["A", "B"], Digital: ["B", "C"]}, // CSV-Import: Quellprozess → Spuren (Spur B ist aus beiden abgeleitet)
  gates: {G0: "Gate 0", G1: "Gate 1", G2: "Gate 2", G3: "Gate 3", G4: "Gate 4", G5: "Gate 5", G6: "Gate 6", G7: "Gate 7", G8: "Gate 8"},
  gateMap: {G1: ["G0", "G1"], G2: ["G2"], G3: ["G3"], G4: ["G4", "G5"], G5: ["G6", "G7", "G8"]}, // Annahme, im Regelwerk änderbar
  items: SEED.map((x, i) => ({id: "i" + (i + 1), gate: x[0], name: x[1], kat: "D", spuren: x[2].split(""), stufen: STUFEN.slice(), src: "Tab. 12", lf: x[3], wv: x[4], zv: !!(x[3] || x[4] !== "")})),
  mods: {}, seq: SEED.length + 1
});
const str = (v, n) => String(v ?? "").slice(0, n);
// Ältere Fassungen: Gate G1 bis G8 (Renew) und Prozess Device/Digital je Liefergegenstand
const OLDMAP = {G1: "G1", G2: "G2", G3: "G3", G4: "G4", G5: "G4", G6: "G5", G7: "G5", G8: "G5", G0: "G1"};
function clean(x) {
  const d = mk(); if (!x || typeof x !== "object") return d;
  const num = (v, a, b, f) => Number.isFinite(+v) && +v >= a && +v <= b ? Math.round(+v) : f;
  d.ver = num(x.ver, 1, 1e6, 1); d.at = str(x.at, 10); d.by = str(x.by || d.by, 60);
  d.thr.light = num(x.thr?.light, 0, 99, d.thr.light); d.thr.full = num(x.thr?.full, 1, 100, d.thr.full); if (d.thr.light >= d.thr.full) { d.thr.light = 20; d.thr.full = 60; }
  if (x.imp && typeof x.imp === "object") for (const p of PROCS) if (Array.isArray(x.imp[p])) d.imp[p] = SPUREN.filter(s => x.imp[p].includes(s));
  if (x.gates && typeof x.gates === "object") for (const g of GATE_IDS) if (typeof x.gates[g] === "string") d.gates[g] = str(x.gates[g], 60);
  if (x.gateMap && typeof x.gateMap === "object") for (const g of APP_GATES) if (Array.isArray(x.gateMap[g])) d.gateMap[g] = x.gateMap[g].filter(y => GATE_IDS.includes(y));
  const old = x.v !== 2;
  if (Array.isArray(x.items) && !(old && x.items.every(i => i && i.src === "Studienarbeit"))) { // alter Standard wird durch Tab. 12 ersetzt
    d.items = x.items.filter(i => i && typeof i.name === "string" && i.name.trim() && (APP_GATES.includes(i.gate) || (old && OLDMAP[i.gate]))).slice(0, 500).map((i, n) => {
      const spuren = Array.isArray(i.spuren) ? SPUREN.filter(s => i.spuren.includes(s)) : [...new Set((i.proc || []).flatMap(p => d.imp[p] || []))];
      return {id: /^[\w\-]{1,20}$/.test(i.id || "") ? i.id : "i" + (n + 1), gate: old ? OLDMAP[i.gate] : i.gate, name: str(i.name, 120), kat: i.kat === "A" ? "A" : "D",
        spuren, stufen: STUFEN.filter(s => (i.stufen || []).includes(s)), src: str(i.src, 30), lf: /^G[1-5]:[0-2]$/.test(i.lf || "") ? i.lf : "", wv: Number.isInteger(i.wv) && i.wv >= 0 && i.wv <= 4 ? i.wv : "", zv: !!i.zv,
        ...(old && i.gate !== OLDMAP[i.gate] ? {rg: i.gate} : (GATE_IDS.includes(i.rg) ? {rg: i.rg} : {})),
        ...(Array.isArray(i.quellen) ? {quellen: i.quellen.slice(0, 40).map(q => ({id: str(q.id, 80), ms: str(q.ms, 80), name: str(q.name, 120)}))} : {})};
    });
    const used = new Set(); d.items.forEach(i => { while (used.has(i.id)) i.id += "x"; used.add(i.id); });
  }
  if (x.mods && typeof x.mods === "object") for (const m of MODS) { const o = x.mods[m.id]; if (o && typeof o === "object") d.mods[m.id] = {t: str(o.t || m.t, 80), d: str(o.d || m.d, 120)}; }
  d.seq = d.items.length + 1000;
  if (x.pending && typeof x.pending === "object") d.pending = {at: str(x.pending.at, 10)};
  if (typeof x.rej === "string") d.rej = str(x.rej, 400);
  if (Array.isArray(x.hist)) d.hist = x.hist.slice(-50).map(h => ({ver: num(h.ver, 1, 1e6, 1), at: str(h.at, 10), by: str(h.by, 60), diff: Array.isArray(h.diff) ? h.diff.slice(0, 10).map(t => str(t, 160)) : []}));
  return d;
}
// R = aktive Fassung, D = Entwurf (oder null)
let R, D = null;
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && s.R) { R = clean(s.R); delete R.pending; delete R.rej; D = s.D ? clean(s.D) : null; } else { R = clean(s); D = null; }
  } catch (e) { R = mk(); D = null; }
}
load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({R, D})); } catch (e) { /* Speicher voll */ } };
const copy = x => JSON.parse(JSON.stringify(x));
export const rules = () => R;
export const draft = () => D;
export const work = () => D || R; // was im Regelwerk angezeigt wird
export const isDefault = () => !D && R.ver === 1 && JSON.stringify({...R, at: "", by: ""}) === JSON.stringify({...mk(), at: "", by: ""});
// Änderungen gehen immer in den Entwurf. Ist er zur Freigabe eingereicht, ist er gesperrt.
export function edit(fn) { if (D && D.pending) return false; if (!D) { D = copy(R); delete D.rej; delete D.hist; } fn(D); D = clean(D); save(); return true; }
export function submitDraft() { if (!D || D.pending) return false; D.pending = {at: today()}; delete D.rej; save(); return true; }
export function approveDraft(by) {
  if (!D || !D.pending) return 0;
  const n = R.ver + 1, diff = diffDraft(), hist = (R.hist || []).concat([{ver: n, at: today(), by: str(by || "PGB", 60), diff}]);
  R = clean(D); delete R.pending; delete R.rej; R.ver = n; R.at = today(); R.by = str(by || "PGB", 60); R.hist = hist.slice(-50); D = null; save(); return n;
}
export function rejectDraft(why) { if (!D || !D.pending) return false; delete D.pending; D.rej = str(why, 400); save(); return true; }
export function discardDraft() { D = null; save(); }
export function draftToStandard() { if (D && D.pending) return false; const v = {ver: R.ver, at: R.at, by: R.by}; D = Object.assign(mk(), v); save(); return true; }
export function resetRules() { R = mk(); D = null; try { localStorage.removeItem(KEY); } catch (e) { /* egal */ } }
export const exportRules = () => JSON.stringify(work(), null, 2);
export function importRules(text) { const x = JSON.parse(text); if (!x || typeof x !== "object" || !Array.isArray(x.items)) throw new Error("format"); if (D && D.pending) throw new Error("gesperrt"); const v = {ver: R.ver, at: R.at, by: R.by}; D = Object.assign(clean(x), v); save(); return D.items.length; }
// Sicherung wiederherstellen: aktive Fassung direkt übernehmen
export function restoreActive(x) { if (!x || typeof x !== "object") return; R = clean(x); delete R.pending; delete R.rej; D = null; save(); }
// Kopie für ein Vorhaben (ohne Quellzeilen, damit der Speicher klein bleibt)
export function freeze() { const x = copy(R); x.items.forEach(i => delete i.quellen); delete x.pending; delete x.rej; delete x.hist; return x; }
export const asRules = x => x && typeof x === "object" && x.thr ? x : R;
export const mods = (rr = R) => MODS.map(m => rr.mods && rr.mods[m.id] ? {...m, t: rr.mods[m.id].t, d: rr.mods[m.id].d} : m);
export function addItem(gate) { let nid = ""; edit(X => { nid = "n" + (X.seq++); X.items.push({id: nid, gate, name: "Neuer Liefergegenstand", kat: "D", spuren: SPUREN.slice(), stufen: STUFEN.slice(), src: "eigene", lf: "", wv: "", zv: false}); }); return nid; }
// Regel aus Kap. 5.5: jeder Liefergegenstand beantwortet eine Leitfrage oder wird später weiterverwendet
export const purposeMissing = i => !i.lf && i.wv === "";
// Liefergegenstände eines App-Gates für Spur und Stufe, je Name einmal
export function gateItems(n, sp, st, rr = R) {
  const ids = n === "G1+2" ? ["G1", "G2"] : [n], out = [];
  for (const g of ids) for (const i of rr.items) {
    if (i.gate !== g || !(i.spuren || []).includes(sp) || !i.stufen.includes(st)) continue;
    const f = out.find(o => o.t === i.name); if (f) { if (i.kat === "D") f.kat = "D"; continue; }
    out.push({t: i.name, kat: i.kat, gate: g, kern: (i.spuren || []).length === 3, lf: i.lf, wv: i.wv});
  }
  return out;
}
// Kurzfassung der Änderungen zwischen aktiver Fassung und Entwurf (für die Freigabe im PGB)
export function diffDraft() {
  if (!D) return [];
  const out = [], key = i => i.gate + "|" + i.name;
  if (R.thr.light !== D.thr.light || R.thr.full !== D.thr.full) out.push("Schwellen " + R.thr.light + "/" + R.thr.full + " % → " + D.thr.light + "/" + D.thr.full + " %");
  const a = new Map(R.items.map(i => [i.id, i])), b = new Map(D.items.map(i => [i.id, i]));
  const add = D.items.filter(i => !a.has(i.id)), del = R.items.filter(i => !b.has(i.id));
  const chg = D.items.filter(i => a.has(i.id) && JSON.stringify({...a.get(i.id), quellen: 0}) !== JSON.stringify({...i, quellen: 0}));
  if (add.length) out.push(add.length + " Liefergegenstände neu" + (add.length <= 3 ? ": " + add.map(key).join(", ") : ""));
  if (del.length) out.push(del.length + " Liefergegenstände entfernt" + (del.length <= 3 ? ": " + del.map(key).join(", ") : ""));
  if (chg.length) out.push(chg.length + " Liefergegenstände geändert");
  if (JSON.stringify(R.gateMap) !== JSON.stringify(D.gateMap)) out.push("Zuordnung Renew-Gates geändert");
  if (JSON.stringify(R.imp) !== JSON.stringify(D.imp)) out.push("Import-Zuordnung Prozess → Spuren geändert");
  if (JSON.stringify(R.mods) !== JSON.stringify(D.mods)) out.push("Bausteintexte geändert");
  if (JSON.stringify(R.gates) !== JSON.stringify(D.gates)) out.push("Gate-Namen geändert");
  const zw = D.items.filter(purposeMissing).length; if (zw) out.push(zw + " Liefergegenstände ohne Leitfrage oder Folgephase (Regel Kap. 5.5)");
  return out.length ? out : ["Keine inhaltliche Änderung"];
}

// Quell-CSV der Product Governance einlesen (Semikolon, Windows-1252). Bleibt im Browser, nichts wird hochgeladen.
function parseCsv(t) {
  const rows = []; let r = [], c = "", q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === ";") { r.push(c); c = ""; } else if (ch === "\n") { r.push(c); rows.push(r); r = []; c = ""; } else if (ch !== "\r") c += ch; }
  if (c || r.length) { r.push(c); rows.push(r); }
  return rows;
}
export function importCsv(buf) {
  if (D && D.pending) throw new Error("gesperrt");
  const t = new TextDecoder("windows-1252").decode(buf), rows = parseCsv(t), hi = rows.findIndex(r => (r[0] || "").trim() === "Trace ID");
  if (hi < 0) throw new Error("format");
  const H = rows[hi].map(x => x.replace(/\s+/g, " ").trim()), col = n => H.findIndex(h => h.startsWith(n));
  const c = {id: col("Trace ID"), proc: col("Source Process"), ms: col("Source Milestone"), name: col("Original Deliverable Name"), kat: col("Source Category"), gate: col("Target Gate G0"), sheet: col("Target Gate Sheet"), tgt: col("Related Target Deliverable")};
  if (Object.values(c).some(v => v < 0)) throw new Error("format");
  let n = 0, neu = 0, ohne = 0;
  edit(X => {
    const appOf = g => APP_GATES.find(k => X.gateMap[k].includes(g));
    for (const r of rows.slice(hi + 1)) {
      const g = (r[c.gate] || "").trim(), tn = (r[c.tgt] || "").trim(), p = (r[c.proc] || "").trim();
      if (!GATE_IDS.includes(g) || !tn || !PROCS.includes(p)) continue;
      const ag = appOf(g); if (!ag) { ohne++; continue; }
      const gn = (r[c.sheet] || "").split("_").slice(1).join("_").trim(); if (gn) X.gates[g] = gn.slice(0, 60);
      let it = X.items.find(i => i.gate === ag && i.name === tn);
      if (!it) { it = {id: "c" + (X.seq++), gate: ag, rg: g, name: tn, kat: "D", spuren: [], stufen: STUFEN.slice(), src: "Renew PEP", lf: "", wv: "", zv: false}; X.items.push(it); neu++; }
      for (const s of X.imp[p] || []) if (!it.spuren.includes(s)) it.spuren.push(s);
      it.quellen = it.quellen || []; const q = {id: (r[c.id] || "").trim(), ms: (r[c.ms] || "").trim(), name: (r[c.name] || "").trim()};
      if (!it.quellen.some(x => x.id === q.id)) { it.quellen.push(q); n++; }
      if ((r[c.kat] || "").trim() === "D") it.kat = "D";
    }
  });
  return {quellen: n, neu, ohne};
}
