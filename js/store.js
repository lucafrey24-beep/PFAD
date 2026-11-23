// Zustand, Speicherung (localStorage), Freigabe-Workflow, Exporte. Alle Daten bleiben auf dem Gerät.
import {TODAY, PCS, STATUS, ROLES, SPN, PRESETS} from "./data.js";
import {compute, fmtD, stepDelivs} from "./model.js";
import {rules, importRules} from "./rules.js";

const LS = "pfad-data";
export const state = {P: [], seq: 1, role: "PL", theme: "dark", draft: null, fs: 1, hc: false, lastBackup: 0, since: 0, corrupt: false};
const FS = [1, 1.15, 1.3, 1.5];
const hasK = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function validP(a) {
  return Array.isArray(a) && a.length < 2000 && a.every(p => p && typeof p.id === "string" && /^[\w\-]{1,40}$/.test(p.id) && hasK(STATUS, p.status) &&
    p.c && Array.isArray(p.c.q) && p.c.q.length === 3 && Array.isArray(p.c.thr) && p.c.thr.length === 3 && Number.isFinite(p.c.hw) && Number.isFinite(p.c.sw) &&
    (!p.date || /^\d{4}-\d{2}-\d{2}$/.test(p.date)) && (!p.submitted || /^[\d.]{1,12}$/.test(p.submitted)));
}
function legacySteps(p) {
  if (p.stepsInit || !p.steps || Object.keys(p.steps).length) { p.stepsInit = true; return; }
  p.stepsInit = true; const r = compute(p.c); if (!r.ok || !p.last || p.last === "–") return;
  const i = r.order.findIndex(o => p.last.startsWith(o.n + " ") || p.last === o.n);
  r.order.forEach((o, j) => { if (j <= i) p.steps[o.n] = {st: "ok", files: []}; });
}
function norm() {
  state.P.forEach(p => {
    p.appr = p.appr || {spur: false, stufe: false}; p.log = Array.isArray(p.log) ? p.log : []; p.versions = Array.isArray(p.versions) ? p.versions : [];
    p.steps = p.steps || {}; p.ver = p.ver || 1; p.stage = p.stage === "ppb" ? "ppb" : "ms"; p.rec = p.rec || ""; p.c.sel = p.c.sel || {}; p.c.opt = p.c.opt || {}; p.c.why = p.c.why || {};
    legacySteps(p); if (p.status !== "li") syncSteps(p);
  });
}
export function save() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { /* Speicher voll oder gesperrt */ } }
export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(LS) || "null");
    if (s && validP(s.P)) {
      state.P = s.P.filter(p => !p.demo); state.seq = Number.isFinite(s.seq) ? s.seq : 1; // frühere Demo-Vorhaben werden verworfen
      state.role = hasK(ROLES, s.role) ? s.role : "PL"; state.theme = ["dark", "light", "auto"].includes(s.theme) ? s.theme : "dark";
      state.draft = s.draft && s.draft.c && Array.isArray(s.draft.c.q) ? s.draft : null;
      state.fs = FS.includes(s.fs) ? s.fs : 1; state.hc = !!s.hc; state.lastBackup = Number(s.lastBackup) || 0; state.since = Number(s.since) || 0; norm(); return true;
    }
    if (localStorage.getItem(LS)) throw new Error("ungueltig");
  } catch (e) {
    // Beschädigte Daten werden nicht überschrieben, sondern beiseitegelegt (Download unter Mehr).
    try { const raw = localStorage.getItem(LS); if (raw) { localStorage.setItem(LS + "-defekt", raw); state.corrupt = true; } } catch (e2) { /* ignorieren */ }
  }
  state.P = []; norm(); return false;
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
export const newWiz = () => ({meta: null, name: "", pc: PCS[0], pl: "", typ: "", date: "", desc: "", ref: "", step: 0, c: emptyC()});
export function guardSpur(w) { const r = compute(w.c), k = r.sp + (r.hc ? "h" : ""); if (w.c.lastSp && w.c.lastSp !== k) w.c.sel = {}; w.c.lastSp = k; }
export function wizFromPreset(i) {
  const p = PRESETS[i], w = newWiz();
  Object.assign(w.c, {q: [...p.q], hw: p.hw, sw: p.sw, opt: {...p.opt}}); guardSpur(w); return w;
}
export function wizFromProject(p) {
  const w = newWiz();
  Object.assign(w, {meta: p.id, name: p.name, pc: p.pc, pl: p.pl, typ: "", date: p.date || "", ref: p.ref || "", desc: p.desc || "", step: 3, c: JSON.parse(JSON.stringify(p.c))});
  w.c.lastSp = null; guardSpur(w); return w;
}
export function missingWhy(w) { const r = compute(w.c); return r.ab.filter(m => !(w.c.why[m.id] || "").trim()); }

/* ---------- Schritte und Nachweise ---------- */
export const stepOf = (p, k) => (p.steps[k] = p.steps[k] || {st: "open", files: []});
export const stepLabel = o => o.n + (o.t ? " " + o.t : "");
export function syncSteps(p) {
  const r = compute(p.c); if (!r.ok) return;
  r.order.forEach(o => stepOf(p, o.n));
  const fix = (k, v) => { if (r.order.some(o => o.n === k)) { const s = stepOf(p, k); if (v) s.st = "ok"; else if (s.st === "ok") s.st = "open"; } };
  fix("G1", p.appr.spur); fix("G2", p.appr.stufe); fix("G1+2", p.appr.stufe);
}
export const curStep = p => { const r = compute(p.c); return r.ok ? r.order.find(o => stepOf(p, o.n).st !== "ok") || null : null; };
export const subStep = p => { const r = compute(p.c); return r.ok ? r.order.find(o => stepOf(p, o.n).st === "sub") || null : null; };
export function progress(p) { const r = compute(p.c); return r.ok ? {done: r.order.filter(o => stepOf(p, o.n).st === "ok").length, total: r.order.length} : {done: 0, total: 0}; }
export const overdue = p => !!p.date && p.date < TODAY && ["on", "off", "bl", "re", "pe", "ho"].includes(p.status);
export const waitDays = p => p.subAt ? Math.max(0, Math.floor((Date.now() - Date.parse(p.subAt)) / 864e5)) : 0;
export function canSubmitStep(p) { const o = curStep(p); return state.role === "PL" && ["on", "off", "bl", "re"].includes(p.status) && !!o && ["open", "mod"].includes(stepOf(p, o.n).st); }
export function canEditFiles(p, k) { const s = stepOf(p, k); return state.role === "PL" && !["ki", "do", "li"].includes(p.status) && (["open", "mod"].includes(s.st) || (s.st === "sub" && p.status === "pe" && p.stage === "ms")); }
export function missingDelivs(p, o) { const r = compute(p.c), s = stepOf(p, o.n); return stepDelivs(r, o).filter(d => !s.files.some(f => f.dv === d)); }
export function addFileMeta(id, k, meta) { const p = byId(id); if (!p) return; const s = stepOf(p, k); s.files.push(meta); if (s.st === "sub") logE(p, "Projektleitung (" + p.pl + ")", "Nachweis ergänzt: " + meta.name); save(); }
export function removeFileMeta(id, k, fid) { const p = byId(id); if (!p) return null; const s = stepOf(p, k), i = s.files.findIndex(f => f.id === fid); if (i < 0) return null; const [f] = s.files.splice(i, 1); if (s.st === "sub") logE(p, "Projektleitung (" + p.pl + ")", "Nachweis entfernt: " + f.name); save(); return f; }
export function setDate(id, d) { const p = byId(id); if (p && state.role === "PL" && (!d || /^\d{4}-\d{2}-\d{2}$/.test(d))) { p.date = d; save(); } }
function markSub(p, o, note) {
  const s = stepOf(p, o.n); s.st = "sub"; s.subAt = new Date().toISOString(); s.n = (s.n || 0) + 1;
  Object.assign(p, {status: "pe", stage: "ms", rec: "", note: "", next: stepLabel(o), submitted: fmtD(TODAY), subAt: s.subAt, fresh: true});
  logE(p, "Projektleitung (" + p.pl + ")", stepLabel(o) + " eingereicht (" + s.files.length + " Dateien)" + (p.cfgPending ? ", mit Konfigurationsänderung " + p.cfgPending.from + " → " + p.cfgPending.to : "") + (note ? ": " + note : ""));
}
export function submitStep(id, note) {
  const p = byId(id); if (!p || !canSubmitStep(p)) return {error: "Einreichen ist in dieser Rolle oder diesem Status nicht möglich"};
  const o = curStep(p); markSub(p, o, (note || "").trim()); save(); return {msg: stepLabel(o) + " eingereicht: " + p.name};
}
const sig = r => r.sp + "|" + r.st + "|" + r.on.map(m => m.id).sort().join(",");

export function submitWiz(w) {
  if (state.role !== "PL") return {error: "Einreichen nur in der Rolle Projektleitung"};
  if (!w.name.trim()) return {error: "Bitte einen Namen eingeben", step: 0};
  if (!w.pl.trim()) return {error: "Bitte die Projektleitung angeben", step: 0};
  const miss = missingWhy(w);
  if (miss.length) return {error: "Begründung fehlt für: " + miss.map(m => m.t).join(", "), step: 4};
  const r = compute(w.c), snap = JSON.parse(JSON.stringify(w.c)); snap.lastSp = null;
  const p0 = w.meta ? byId(w.meta) : null, who = n => "Projektleitung (" + n + ")";
  if (p0) {
    const old = compute(p0.c);
    Object.assign(p0, {name: w.name.trim(), pc: w.pc, pl: w.pl.trim(), ref: w.ref.trim(), desc: w.desc.trim(), c: snap, date: w.date || ""});
    p0.ver++; p0.versions.push({ver: p0.ver, date: fmtD(TODAY), path: r.path}); state.draft = null;
    if (!r.ok) { p0.status = "li"; p0.next = "–"; p0.note = "unter den Projektschwellen"; save(); return {id: p0.id, msg: "Gespeichert: unter den Projektschwellen, kein PEP"}; }
    syncSteps(p0);
    if (!p0.appr.spur && !p0.appr.stufe) { markSub(p0, r.order[0], "Konfiguration " + r.path + " (Version " + p0.ver + ")"); save(); return {id: p0.id, msg: "Eingereicht: " + p0.id + " (Version " + p0.ver + ")"}; }
    if (old.ok && sig(r) !== sig(old)) {
      if (old.sp !== r.sp) { p0.appr.spur = false; p0.appr.stufe = false; syncSteps(p0); logE(p0, who(p0.pl), "Spur geändert " + old.path + " → " + r.path + ", Neufreigabe ab G1 erforderlich"); save(); return {id: p0.id, msg: "Spur geändert: Neufreigabe ab G1, bitte erneut einreichen"}; }
      if (p0.appr.stufe) { p0.cfgPending = {from: old.path, to: r.path}; const c = curStep(p0); logE(p0, who(p0.pl), "Konfigurationsänderung " + old.path + " → " + r.path + ", Freigabe am nächsten Gate" + (c ? " (" + stepLabel(c) + ")" : "")); save(); return {id: p0.id, msg: "Gespeichert: Änderung wird am nächsten Gate mit freigegeben"}; }
      logE(p0, who(p0.pl), "Konfiguration " + r.path + " angepasst (Version " + p0.ver + ")"); save(); return {id: p0.id, msg: "Gespeichert: Stufe und Bausteine folgen an G2"};
    }
    save(); return {id: p0.id, msg: "Gespeichert"};
  }
  const p = {id: "V-" + String(state.seq++).padStart(3, "0"), name: w.name.trim(), pc: w.pc, pl: w.pl.trim(), ref: w.ref.trim(), desc: w.desc.trim(), c: snap,
    status: r.ok ? "pe" : "li", last: "–", next: "–", date: w.date || "", note: r.ok ? "" : "unter den Projektschwellen",
    mine: true, fresh: true, appr: {spur: false, stufe: false}, steps: {}, stage: "ms", rec: "", ver: 1, versions: [{ver: 1, date: fmtD(TODAY), path: r.path}], log: []};
  logE(p, who(p.pl), r.ok ? "Vorhaben mit Konfiguration " + r.path + " angelegt" : "Als Roadmap-Eintrag ohne PEP angelegt (unter den Projektschwellen)");
  if (r.ok) { syncSteps(p); markSub(p, r.order[0], ""); }
  if (!state.since) state.since = Date.now();
  state.P.unshift(p); state.draft = null; save();
  return {id: p.id, msg: r.ok ? "Angelegt: " + p.id + ". Nachweise im Vorhaben ergänzen, Freigabe läuft" : "Als Roadmap-Eintrag ohne PEP angelegt"};
}

/* ---------- Freigabe-Workflow: MS Gate Committee prüft, PPB entscheidet ---------- */
export function recommend(id) {
  const p = byId(id), o = p && subStep(p); if (!p || !o || state.role !== "MS" || p.status !== "pe" || p.stage !== "ms") return null;
  p.stage = "ppb"; p.rec = "Empfohlen (MS Gate Committee, " + fmtD(TODAY) + ")"; logE(p, "MS Gate Committee", stepLabel(o) + ": Prüfung abgeschlossen, Empfehlung an PPB");
  save(); return p.name + ": Empfehlung an PPB übergeben";
}
export function goDecision(id) {
  const p = byId(id), o = p && subStep(p); if (!p || !o || state.role !== "PPB" || p.status !== "pe" || p.stage !== "ppb") return null;
  const r = compute(p.c), s = stepOf(p, o.n); s.st = "ok"; s.decided = new Date().toISOString();
  if (o.n === "G1") p.appr.spur = true; else if (o.n === "G2" || o.n === "G1+2") { p.appr.spur = true; p.appr.stufe = true; }
  const had = p.cfgPending; delete p.cfgPending;
  p.last = stepLabel(o); const nx = curStep(p); p.next = nx ? stepLabel(nx) : "–"; p.date = "";
  p.status = nx ? "on" : "do"; p.stage = "ms"; p.rec = ""; p.note = ""; p.fresh = true;
  logE(p, "PPB", "Go: " + stepLabel(o) + " freigegeben" + (o.n === "G1" ? " (Spur " + r.sp + ")" : "") + (had ? ", Konfigurationsänderung " + had.from + " → " + had.to + " freigegeben" : ""));
  save(); return p.name + ": " + stepLabel(o) + " freigegeben" + (nx ? "" : ", Vorhaben abgeschlossen");
}
export const REASONS = {
  ret: {t: "Zurück an die Projektleitung", role: "MS", st: "re", ss: "mod", who: "MS Gate Committee", pre: "MS Gate Committee: ", log: "Zurück an PL", txt: "Was fehlt oder ist unklar?", next: "Überarbeiten und erneut einreichen", ok: "Zurücksenden", hint: "Die Projektleitung sieht den Kommentar im Vorhaben."},
  modify: {t: "Modify: Nachbesserung", role: "PPB", st: "re", ss: "mod", who: "PPB", pre: "PPB Modify: ", log: "Modify", txt: "", next: "Überarbeiten und erneut einreichen", ok: "Modify entscheiden", hint: "Die Projektleitung bessert nach und reicht erneut ein."},
  hold: {t: "Hold: Vorhaben pausieren", role: "PPB", st: "ho", ss: "hold", who: "PPB", pre: "PPB Hold: ", log: "Hold", txt: "", next: "Hold, Wiederaufnahme durch PPB", ok: "Hold entscheiden", hint: "Das PPB kann den Hold später aufheben."},
  kill: {t: "Kill: Vorhaben abbrechen", role: "PPB", st: "ki", ss: "kill", who: "PPB", pre: "PPB Kill: ", log: "Kill", txt: "", next: "abgebrochen", ok: "Kill entscheiden", hint: "Das Vorhaben wird beendet."}
};
export function reason(id, k, text) {
  const p = byId(id), c = REASONS[k], t = (text || "").trim(), o = p && subStep(p);
  if (!p || !c || !o || state.role !== c.role || p.status !== "pe" || p.stage !== (c.role === "MS" ? "ms" : "ppb")) return {error: "Aktion in dieser Rolle oder diesem Status nicht möglich"};
  if (!t) return {error: "Bitte eine Begründung eingeben"};
  stepOf(p, o.n).st = c.ss; p.status = c.st; p.note = c.pre + t; p.next = c.next; p.stage = "ms"; p.rec = ""; p.fresh = true; logE(p, c.who, stepLabel(o) + ", " + c.log + ": " + t); save();
  return {msg: c.log + ": " + p.name};
}
export function resume(id) {
  const p = byId(id); if (!p || state.role !== "PPB" || p.status !== "ho") return null;
  const o = r2(p); if (o) stepOf(p, o.n).st = "sub";
  p.status = "pe"; p.stage = "ppb"; p.note = ""; p.fresh = true; logE(p, "PPB", "Hold aufgehoben, erneute Entscheidung"); save(); return "Hold aufgehoben: " + p.name;
}
function r2(p) { const r = compute(p.c); return r.ok ? r.order.find(o => stepOf(p, o.n).st === "hold") || null : null; }
export function setRole(r) { if (hasK(ROLES, r)) { state.role = r; save(); } }
export function setTheme(t) { if (["dark", "light", "auto"].includes(t)) { state.theme = t; save(); } }
export function queue() { return state.P.filter(p => p.status === "pe"); }
export const mine = role => { const q = queue(); return role === "MS" ? q.filter(p => p.stage === "ms") : role === "PPB" ? q.filter(p => p.stage === "ppb") : []; };

/* ---------- Daten ---------- */
export function resetAll() { state.P = []; state.seq = 1; state.role = "PL"; state.draft = null; state.since = 0; state.lastBackup = 0; norm(); save(); }
export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || !validP(s.P)) throw new Error("format");
  state.P = s.P; state.seq = Number.isFinite(s.seq) ? s.seq : state.seq; state.draft = null; norm(); save(); if (s.rules) { try { importRules(JSON.stringify(s.rules)); } catch (e) { /* Regelwerk ungültig, Vorhaben trotzdem importiert */ } } return state.P.length;
}
export const exportJSON = () => JSON.stringify({version: 2, P: state.P, seq: state.seq, rules: rules()}, null, 2);
function cell(v) { v = String(v ?? ""); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
export function csvRoadmap(list) {
  const hd = ["ID", "Vorhaben", "Product Center", "Projektleitung", "zugeordneter PEP-Pfad", "Reviews", "zuletzt freigegebener Meilenstein", "nächster geplanter Meilenstein", "Termin", "Status", "Änderungskommentar", "Konfigurationsversion", "Schritte erledigt", "Schritte gesamt", "Nachweis-Dateien"];
  const rows = list.map(p => { const r = compute(p.c); return [p.id, p.name, p.pc, p.pl, r.path, r.ok ? r.n : "", p.last, p.next, p.date || "", STATUS[p.status][0], p.note || "", p.ver || 1, progress(p).done, progress(p).total, Object.values(p.steps || {}).reduce((a, x) => a + x.files.length, 0)]; });
  return "﻿" + [hd, ...rows].map(r => r.map(cell).join(";")).join("\r\n");
}
export function nachweis(p) {
  const r = compute(p.c);
  return {id: p.id, vorhaben: p.name, productCenter: p.pc, projektleitung: p.pl, pepPfad: r.path, spur: r.ok ? r.sp + " " + SPN[r.sp] : null, stufe: r.ok ? r.st : null,
    neuentwicklungsanteil: {hardware: r.hc ? p.c.hw : null, software: p.c.sw}, referenzprodukt: p.ref || null, reviews: r.ok ? r.order.map(o => o.n) : [], bausteine: r.ok ? r.on.map(m => m.t) : [],
    abgewaehlt: r.ok ? r.ab.map(m => ({baustein: m.t, begruendung: (p.c.why || {})[m.id] || null})) : [],
    freigabe: {spurFreigegeben: !!p.appr.spur, stufeUndBausteineFreigegeben: !!p.appr.stufe, zuletztFreigegeben: p.last, naechsterMeilenstein: p.next, termin: p.date || null},
    konfigurationsversion: p.ver || 1,
    schritte: r.ok ? r.order.map(o => { const x = stepOf(p, o.n); return {schritt: stepLabel(o), status: x.st, eingereicht: x.subAt || null, entschieden: x.decided || null, nachweise: x.files.map(f => ({name: f.name, liefergegenstand: f.dv || null, groesse: f.size, sha256: f.sha, hinzugefuegt: f.at}))}; }) : [],
    verlauf: p.log, datenstand: TODAY, hinweis: "Gate-Kürzel G1 bis G5 nach Studienarbeit; Abgleich mit dem Gate-Schema des Renew PEP offen."};
}
