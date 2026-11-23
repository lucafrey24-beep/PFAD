// Zustand, Speicherung (localStorage), Freigabe-Workflow, Exporte. Alle Daten bleiben auf dem Gerät.
import {TODAY, PCS, STATUS, ROLES, SPN, PRESETS, seedProjects} from "./data.js";
import {compute, fmtD} from "./model.js";

const LS = "pfad-data";
export const state = {P: [], seq: 119, role: "PL", theme: "dark", draft: null, fs: 1, hc: false, lastBackup: 0, since: 0, corrupt: false};
const FS = [1, 1.15, 1.3, 1.5];
const hasK = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function validP(a) {
  return Array.isArray(a) && a.length > 0 && a.length < 2000 && a.every(p => p && typeof p.id === "string" && /^[\w\-]{1,40}$/.test(p.id) && hasK(STATUS, p.status) &&
    p.c && Array.isArray(p.c.q) && p.c.q.length === 3 && Array.isArray(p.c.thr) && p.c.thr.length === 3 && Number.isFinite(p.c.hw) && Number.isFinite(p.c.sw) &&
    (!p.date || /^\d{4}-\d{2}-\d{2}$/.test(p.date)) && (!p.submitted || /^[\d.]{1,12}$/.test(p.submitted)));
}
function norm() {
  state.P.forEach(p => {
    p.appr = p.appr || {spur: false, stufe: false}; p.log = Array.isArray(p.log) ? p.log : []; p.versions = Array.isArray(p.versions) ? p.versions : [];
    p.ver = p.ver || 1; p.stage = p.stage === "ppb" ? "ppb" : "ms"; p.rec = p.rec || ""; p.c.sel = p.c.sel || {}; p.c.opt = p.c.opt || {}; p.c.why = p.c.why || {};
  });
}
export function save() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { /* Speicher voll oder gesperrt */ } }
export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(LS) || "null");
    if (s && validP(s.P)) {
      state.P = s.P; state.seq = Number.isFinite(s.seq) ? s.seq : 119;
      state.role = hasK(ROLES, s.role) ? s.role : "PL"; state.theme = ["dark", "light", "auto"].includes(s.theme) ? s.theme : "dark";
      state.draft = s.draft && s.draft.c && Array.isArray(s.draft.c.q) ? s.draft : null;
      state.fs = FS.includes(s.fs) ? s.fs : 1; state.hc = !!s.hc; state.lastBackup = Number(s.lastBackup) || 0; state.since = Number(s.since) || 0; norm(); return true;
    }
    if (localStorage.getItem(LS)) throw new Error("ungueltig");
  } catch (e) {
    // Beschädigte Daten werden nicht überschrieben, sondern beiseitegelegt (Download unter Mehr).
    try { const raw = localStorage.getItem(LS); if (raw) { localStorage.setItem(LS + "-defekt", raw); state.corrupt = true; } } catch (e2) { /* ignorieren */ }
  }
  state.P = seedProjects(); norm(); return false;
}
export const snapshot = () => JSON.stringify({P: state.P, seq: state.seq, draft: state.draft, role: state.role});
export function restore(j) { const s = JSON.parse(j); state.P = s.P; state.seq = s.seq; state.draft = s.draft; state.role = s.role; norm(); save(); }
export const corruptRaw = () => { try { return localStorage.getItem(LS + "-defekt") || ""; } catch (e) { return ""; } };
export function setFs(v) { if (FS.includes(v)) { state.fs = v; save(); } }
export function setHc(v) { state.hc = !!v; save(); }
export function markBackup() { state.lastBackup = Date.now(); save(); }
export const backupDue = () => state.P.some(p => p.mine) && Date.now() - (state.lastBackup || state.since || Date.now()) > 14 * 864e5;
export const byId = id => state.P.find(p => p.id === id);
function logE(p, who, x) { p.log.push({t: fmtD(TODAY), who, x}); }

/* ---------- Konfigurator-Entwurf ---------- */
export const emptyC = () => ({thr: [1, 1, 1], q: [1, 1, 1], hw: 60, sw: 50, sel: {}, opt: {}, why: {}, lastSp: null});
export const newWiz = () => ({meta: null, name: "", pc: PCS[0], pl: "L. Frey", typ: "Product Roadmap", start: "2026-12", desc: "", ref: "", step: 0, c: emptyC()});
export function guardSpur(w) { const r = compute(w.c), k = r.sp + (r.hc ? "h" : ""); if (w.c.lastSp && w.c.lastSp !== k) w.c.sel = {}; w.c.lastSp = k; }
export function wizFromPreset(i) {
  const p = PRESETS[i], w = newWiz();
  Object.assign(w, {name: p.name, pc: PCS[p.pc], ref: p.ref, desc: "Beispielvorhaben für die Demo."});
  Object.assign(w.c, {q: [...p.q], hw: p.hw, sw: p.sw, opt: {...p.opt}}); guardSpur(w); return w;
}
export function wizFromProject(p) {
  const w = newWiz();
  Object.assign(w, {meta: p.id, name: p.name, pc: p.pc, pl: p.pl, typ: p.typ || "Product Roadmap", ref: p.ref || "", desc: p.desc || "", step: 3, c: JSON.parse(JSON.stringify(p.c))});
  w.c.lastSp = null; guardSpur(w); return w;
}
export function missingWhy(w) { const r = compute(w.c); return r.ab.filter(m => !(w.c.why[m.id] || "").trim()); }

export function submitWiz(w) {
  if (state.role !== "PL") return {error: "Einreichen nur in der Rolle Projektleitung"};
  if (!w.name.trim()) return {error: "Bitte einen Namen eingeben", step: 0};
  const miss = missingWhy(w);
  if (miss.length) return {error: "Begründung fehlt für: " + miss.map(m => m.t).join(", "), step: 4};
  const r = compute(w.c), snap = JSON.parse(JSON.stringify(w.c)); snap.lastSp = null;
  const p0 = w.meta ? byId(w.meta) : null;
  if (p0) {
    const old = compute(p0.c), wasStufe = !!p0.appr.stufe;
    Object.assign(p0, {name: w.name.trim(), pc: w.pc, pl: w.pl.trim() || p0.pl, typ: w.typ, ref: w.ref.trim(), desc: w.desc.trim(), c: snap,
      status: r.ok ? "pe" : "li", next: r.ok ? "Konfiguration" : "–", note: "", submitted: fmtD(TODAY), fresh: true, stage: "ms", rec: ""});
    p0.ver++; p0.versions.push({ver: p0.ver, date: fmtD(TODAY), path: r.path});
    const who = "Projektleitung (" + p0.pl + ")";
    if (old.path !== r.path && (p0.appr.spur || wasStufe)) {
      if (old.sp !== r.sp) p0.appr.spur = false; p0.appr.stufe = false;
      logE(p0, who, "Konfigurationsänderung " + old.path + " → " + r.path + ", Neufreigabe erforderlich");
    } else logE(p0, who, "Konfiguration " + r.path + " (Version " + p0.ver + ") eingereicht");
    state.draft = null; save(); return {id: p0.id, msg: "Eingereicht: " + p0.id + " (Version " + p0.ver + ")"};
  }
  const p = {id: "RM-2026-" + (state.seq++), name: w.name.trim(), pc: w.pc, pl: w.pl.trim() || "L. Frey", typ: w.typ, ref: w.ref.trim(), desc: w.desc.trim(), c: snap,
    status: r.ok ? "pe" : "li", last: "–", next: r.ok ? "Konfiguration" : "–", date: r.ok ? "2026-11-30" : "", upd: true, note: r.ok ? "" : "unter den Projektschwellen",
    mine: true, submitted: fmtD(TODAY), fresh: true, appr: {spur: false, stufe: false}, stage: "ms", rec: "", ver: 1, versions: [{ver: 1, date: fmtD(TODAY), path: r.path}], log: []};
  logE(p, "Projektleitung (" + p.pl + ")", r.ok ? "Konfiguration " + r.path + " eingereicht" : "Als Roadmap-Eintrag ohne PEP angelegt (unter den Projektschwellen)");
  if (!state.since) state.since = Date.now();
  state.P.unshift(p); state.draft = null; save();
  return {id: p.id, msg: r.ok ? "Eingereicht: " + p.id + " liegt in der Freigabe-Warteschlange" : "Als Roadmap-Eintrag ohne PEP angelegt"};
}

/* ---------- Freigabe-Workflow: MS Gate Committee prüft, PPB entscheidet ---------- */
export function recommend(id) {
  const p = byId(id); if (!p || state.role !== "MS" || p.status !== "pe" || p.stage !== "ms") return null;
  p.stage = "ppb"; p.rec = "Empfohlen (MS Gate Committee, " + fmtD(TODAY) + ")"; logE(p, "MS Gate Committee", "Prüfung abgeschlossen, Empfehlung an PPB");
  save(); return p.name + ": Empfehlung an PPB übergeben";
}
export function goDecision(id) {
  const p = byId(id); if (!p || state.role !== "PPB" || p.status !== "pe" || p.stage !== "ppb") return null;
  const r = compute(p.c), sc = r.light ? "both" : (!p.appr.spur ? "spur" : "stufe");
  if (sc === "spur") { p.appr.spur = true; p.last = "G1 Ideenfreigabe (Spur " + r.sp + ")"; p.next = "G2 Stufe und Bausteine"; p.date = "2026-12-14"; }
  else {
    p.appr.spur = p.appr.stufe = true; p.last = r.light ? "G1+2 Startfreigabe" : "G2 Konzeptfreigabe (Stufe, Bausteine)";
    const n = r.order.find(o => o.x > 2); p.next = n ? (n.rv ? n.n : n.n + " " + n.t) : "G5 Projektabschluss"; p.date = p.mine ? "2027-01-15" : "2026-12-14";
  }
  p.status = "on"; p.stage = "ms"; p.rec = ""; p.note = ""; p.fresh = true;
  logE(p, "PPB", "Go: " + (sc === "spur" ? "Spur " + r.sp + " an G1 freigegeben" : "Stufe " + r.st + " und Bausteine freigegeben (" + r.path + ")"));
  save(); return sc === "spur" ? p.name + ": Spur " + r.sp + " freigegeben, Stufe und Bausteine folgen an G2" : p.name + ": Konfiguration " + r.path + " freigegeben";
}
export const REASONS = {
  ret: {t: "Zurück an die Projektleitung", role: "MS", st: "re", who: "MS Gate Committee", pre: "MS Gate Committee: ", log: "Zurück an PL", txt: "Bitte die Generationsstufe begründen: Welche Teilsysteme werden vom Referenzprodukt übernommen?", next: "Konfiguration überarbeiten", ok: "Zurücksenden", hint: "Die Projektleitung sieht den Kommentar im Vorhaben."},
  modify: {t: "Modify: Nachbesserung", role: "PPB", st: "re", who: "PPB", pre: "PPB Modify: ", log: "Modify", txt: "", next: "Konfiguration überarbeiten", ok: "Modify entscheiden", hint: "Die Projektleitung bessert nach und reicht erneut ein."},
  hold: {t: "Hold: Vorhaben pausieren", role: "PPB", st: "ho", who: "PPB", pre: "PPB Hold: ", log: "Hold", txt: "", next: "Hold, Wiederaufnahme durch PPB", ok: "Hold entscheiden", hint: "Das PPB kann den Hold später aufheben."},
  kill: {t: "Kill: Vorhaben abbrechen", role: "PPB", st: "ki", who: "PPB", pre: "PPB Kill: ", log: "Kill", txt: "", next: "abgebrochen", ok: "Kill entscheiden", hint: "Das Vorhaben wird beendet."}
};
export function reason(id, k, text) {
  const p = byId(id), c = REASONS[k], t = (text || "").trim();
  if (!p || !c || state.role !== c.role || p.status !== "pe" || p.stage !== (c.role === "MS" ? "ms" : "ppb")) return {error: "Aktion in dieser Rolle oder diesem Status nicht möglich"};
  if (!t) return {error: "Bitte eine Begründung eingeben"};
  p.status = c.st; p.note = c.pre + t; p.next = c.next; p.stage = "ms"; p.rec = ""; p.fresh = true; logE(p, c.who, c.log + ": " + t); save();
  return {msg: c.log + ": " + p.name};
}
export function resume(id) {
  const p = byId(id); if (!p || state.role !== "PPB" || p.status !== "ho") return null;
  p.status = "pe"; p.stage = "ppb"; p.note = ""; p.fresh = true; logE(p, "PPB", "Hold aufgehoben, erneute Entscheidung"); save(); return "Hold aufgehoben: " + p.name;
}
export function setRole(r) { if (hasK(ROLES, r)) { state.role = r; save(); } }
export function setTheme(t) { if (["dark", "light", "auto"].includes(t)) { state.theme = t; save(); } }
export function queue() { return state.P.filter(p => p.status === "pe"); }
export const mine = role => { const q = queue(); return role === "MS" ? q.filter(p => p.stage === "ms") : role === "PPB" ? q.filter(p => p.stage === "ppb") : []; };

/* ---------- Daten ---------- */
export function resetDemo() { state.P = seedProjects(); state.seq = 119; state.role = "PL"; state.draft = null; state.since = 0; state.lastBackup = 0; norm(); save(); }
export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || !validP(s.P)) throw new Error("format");
  state.P = s.P; state.seq = Number.isFinite(s.seq) ? s.seq : state.seq; state.draft = null; norm(); save(); return state.P.length;
}
export const exportJSON = () => JSON.stringify({version: 1, P: state.P, seq: state.seq}, null, 2);
function cell(v) { v = String(v ?? ""); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
export function csvRoadmap(list) {
  const hd = ["ID", "Vorhaben", "Product Center", "Projektleitung", "zugeordneter PEP-Pfad", "Reviews", "zuletzt freigegebener Meilenstein", "nächster geplanter Meilenstein", "Termin", "Status", "Änderungskommentar", "Konfigurationsversion"];
  const rows = list.map(p => { const r = compute(p.c); return [p.id, p.name, p.pc, p.pl, r.path, r.ok ? r.n : "", p.last, p.next, p.date || "", STATUS[p.status][0], p.note || "", p.ver || 1]; });
  return "﻿" + [hd, ...rows].map(r => r.map(cell).join(";")).join("\r\n");
}
export function nachweis(p) {
  const r = compute(p.c);
  return {id: p.id, vorhaben: p.name, productCenter: p.pc, projektleitung: p.pl, pepPfad: r.path, spur: r.ok ? r.sp + " " + SPN[r.sp] : null, stufe: r.ok ? r.st : null,
    neuentwicklungsanteil: {hardware: r.hc ? p.c.hw : null, software: p.c.sw}, referenzprodukt: p.ref || null, reviews: r.ok ? r.order.map(o => o.n) : [], bausteine: r.ok ? r.on.map(m => m.t) : [],
    abgewaehlt: r.ok ? r.ab.map(m => ({baustein: m.t, begruendung: (p.c.why || {})[m.id] || null})) : [],
    freigabe: {spurFreigegeben: !!p.appr.spur, stufeUndBausteineFreigegeben: !!p.appr.stufe, zuletztFreigegeben: p.last, naechsterMeilenstein: p.next, termin: p.date || null},
    konfigurationsversion: p.ver || 1, verlauf: p.log, datenstand: TODAY, hinweis: "Gate-Kürzel G1 bis G5 nach Studienarbeit; Abgleich mit dem Gate-Schema des Renew PEP offen."};
}
