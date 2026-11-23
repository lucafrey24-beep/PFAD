// Regelwerk: hinterlegt, welche Liefergegenstände je Gate, Prozess (Device/Digital) und Generationsstufe gelten.
// Die Logik (Prozess, Gate-Zuordnung, Stufen, Validieren statt neu) ist im Code, die internen Inhalte nicht:
// Die Product-Governance-CSV (Bestands-PEP Device und Digital zu G1 bis G8) wird in der App importiert und bleibt im Browser.
// Im Repo liegen nur die eigenen Kernpunkte aus der Studienarbeit.
// Alles ist in der App unter Mehr > Regelwerk änderbar und wird nur in diesem Browser gespeichert.
import {MODS} from "./data.js";

const KEY = "pfad-rules", STUFEN = ["Full", "Standard", "Light"], PROCS = ["Device", "Digital"];
export const GATE_IDS = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"];
const SEED = [["G1", "Idee / Problem", "D", ["Device", "Digital"], "Studienarbeit"], ["G1", "Strategie-Fit", "D", ["Device", "Digital"], "Studienarbeit"], ["G1", "Spur gewählt", "D", ["Device", "Digital"], "Studienarbeit"], ["G2", "Business Case", "D", ["Device", "Digital"], "Studienarbeit"], ["G2", "Projektplan", "D", ["Device", "Digital"], "Studienarbeit"], ["G2", "Risikoanalyse", "D", ["Device", "Digital"], "Studienarbeit"], ["G2", "Konfiguration", "D", ["Device", "Digital"], "Studienarbeit"], ["G3", "Statusbericht", "D", ["Device", "Digital"], "Studienarbeit"], ["G3", "Risiken aktualisiert", "D", ["Device", "Digital"], "Studienarbeit"], ["G4", "Produktinformation", "D", ["Device", "Digital"], "Studienarbeit"], ["G4", "Freigabeempfehlung", "D", ["Device", "Digital"], "Studienarbeit"], ["G6", "Abschlussbericht", "D", ["Device", "Digital"], "Studienarbeit"], ["G6", "Lessons Learned", "D", ["Device", "Digital"], "Studienarbeit"], ["G6", "Rollen im Lebenszyklus", "D", ["Device", "Digital"], "Studienarbeit"]];
const mk = () => ({
  v: 1,
  thr: {light: 20, full: 60},
  proc: {A: "Device", Bh: "Device", B: "Digital", C: "Digital"},
  gates: {G1: "Gate 1", G2: "Gate 2", G3: "Gate 3", G4: "Gate 4", G5: "Gate 5", G6: "Gate 6", G7: "Gate 7", G8: "Gate 8"},
  gateMap: {G1: ["G1"], G2: ["G2"], G3: ["G3"], G4: ["G4", "G5"], G5: ["G6", "G7", "G8"]},
  items: SEED.map((x, i) => ({id: "i" + (i + 1), gate: x[0], name: x[1], kat: x[2], proc: x[3].slice(), stufen: STUFEN.slice(), src: x[4]})),
  mods: {}, seq: SEED.length + 1
});
const str = (v, n) => String(v ?? "").slice(0, n);
function clean(x) {
  const d = mk(); if (!x || typeof x !== "object") return d;
  const num = (v, a, b, f) => Number.isFinite(+v) && +v >= a && +v <= b ? Math.round(+v) : f;
  d.thr.light = num(x.thr?.light, 0, 99, d.thr.light); d.thr.full = num(x.thr?.full, 1, 100, d.thr.full); if (d.thr.light >= d.thr.full) { d.thr.light = 20; d.thr.full = 60; }
  for (const k of Object.keys(d.proc)) if (PROCS.includes(x.proc?.[k])) d.proc[k] = x.proc[k];
  if (x.gates && typeof x.gates === "object") for (const g of GATE_IDS) if (typeof x.gates[g] === "string") d.gates[g] = str(x.gates[g], 60);
  if (x.gateMap && typeof x.gateMap === "object") for (const g of Object.keys(d.gateMap)) if (Array.isArray(x.gateMap[g])) d.gateMap[g] = x.gateMap[g].filter(y => GATE_IDS.includes(y));
  if (Array.isArray(x.items)) {
    d.items = x.items.filter(i => i && GATE_IDS.includes(i.gate) && typeof i.name === "string" && i.name.trim()).slice(0, 400).map((i, n) => ({
      id: /^[\w\-]{1,20}$/.test(i.id || "") ? i.id : "i" + (n + 1), gate: i.gate, name: str(i.name, 120), kat: i.kat === "A" ? "A" : "D",
      proc: PROCS.filter(p => (i.proc || []).includes(p)), stufen: STUFEN.filter(s => (i.stufen || []).includes(s)), src: str(i.src, 30),
      ...(Array.isArray(i.quellen) ? {quellen: i.quellen.slice(0, 40).map(q => ({id: str(q.id, 80), ms: str(q.ms, 80), name: str(q.name, 120)}))} : {})}));
    const used = new Set(); d.items.forEach(i => { while (used.has(i.id)) i.id += "x"; used.add(i.id); });
  }
  if (x.mods && typeof x.mods === "object") for (const m of MODS) { const o = x.mods[m.id]; if (o && typeof o === "object") d.mods[m.id] = {t: str(o.t || m.t, 80), d: str(o.d || m.d, 120)}; }
  d.seq = d.items.length + 1000;
  return d;
}
let R;
function load() { try { R = clean(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { R = mk(); } }
load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(R)); } catch (e) { /* Speicher voll */ } };
export const rules = () => R;
export const isDefault = () => JSON.stringify(R) === JSON.stringify(mk());
export function edit(fn) { fn(R); R = clean(R); save(); }
export function resetRules() { R = mk(); try { localStorage.removeItem(KEY); } catch (e) { /* egal */ } }
export const exportRules = () => JSON.stringify(R, null, 2);
export function importRules(text) { const x = JSON.parse(text); if (!x || typeof x !== "object" || !Array.isArray(x.items)) throw new Error("format"); R = clean(x); save(); return R.items.length; }
export const mods = () => MODS.map(m => R.mods[m.id] ? {...m, t: R.mods[m.id].t, d: R.mods[m.id].d} : m);
export function addItem(gate) { R.items.push({id: "n" + (R.seq++), gate, name: "Neuer Liefergegenstand", kat: "D", proc: PROCS.slice(), stufen: STUFEN.slice(), src: "eigene"}); R = clean(R); save(); return R.items[R.items.length - 1].id; }

// Regel: Welcher Prozess gilt für die Spur (Device bei Hardwareanteil, sonst Digital)
export const procOf = (sp, hc) => R.proc[sp === "B" && hc ? "Bh" : sp];
export const gatesOf = n => (n === "G1+2" ? [...R.gateMap.G1, ...R.gateMap.G2] : R.gateMap[n] || []);
// Liefergegenstände eines Gates für Prozess und Stufe, je Name einmal (Erstellen vor Validieren)
export function gateItems(n, proc, st) {
  const ids = gatesOf(n), out = [];
  for (const g of ids) for (const i of R.items) {
    if (i.gate !== g || !i.proc.includes(proc) || !i.stufen.includes(st)) continue;
    const f = out.find(o => o.t === i.name); if (f) { if (i.kat === "D") f.kat = "D"; continue; }
    out.push({t: i.name, kat: i.kat, gate: g});
  }
  return out;
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
  const t = new TextDecoder("windows-1252").decode(buf), rows = parseCsv(t), hi = rows.findIndex(r => (r[0] || "").trim() === "Trace ID");
  if (hi < 0) throw new Error("format");
  const H = rows[hi].map(x => x.replace(/\s+/g, " ").trim()), col = n => H.findIndex(h => h.startsWith(n));
  const c = {id: col("Trace ID"), proc: col("Source Process"), ms: col("Source Milestone"), name: col("Original Deliverable Name"), kat: col("Source Category"), gate: col("Target Gate G0"), sheet: col("Target Gate Sheet"), tgt: col("Related Target Deliverable")};
  if (Object.values(c).some(v => v < 0)) throw new Error("format");
  let n = 0, neu = 0;
  for (const r of rows.slice(hi + 1)) {
    const g = (r[c.gate] || "").trim(), tn = (r[c.tgt] || "").trim(), p = (r[c.proc] || "").trim();
    if (!GATE_IDS.includes(g) || !tn || !PROCS.includes(p)) continue;
    const gn = (r[c.sheet] || "").split("_").slice(1).join("_").trim(); if (gn) R.gates[g] = gn.slice(0, 60);
    let it = R.items.find(i => i.gate === g && i.name === tn);
    if (!it) { it = {id: "c" + (R.seq++), gate: g, name: tn, kat: "D", proc: [], stufen: STUFEN.slice(), src: "Renew PEP"}; R.items.push(it); neu++; }
    if (!it.proc.includes(p)) it.proc.push(p);
    it.quellen = it.quellen || []; const q = {id: (r[c.id] || "").trim(), ms: (r[c.ms] || "").trim(), name: (r[c.name] || "").trim()};
    if (!it.quellen.some(x => x.id === q.id)) { it.quellen.push(q); n++; }
    if ((r[c.kat] || "").trim() === "D") it.kat = "D";
  }
  R = clean(R); save(); return {quellen: n, neu};
}
