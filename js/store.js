// Zustand, Speicherung (localStorage), Freigabe-Workflow, Exporte. Alle Daten bleiben auf dem Gerät.
import {TODAY, PCS, STATUS, ROLES, SPN, PRESETS, lfOf, CRK, WP_LIMIT, RG, TSS, LT_WEEKS} from "./data.js";
import {compute, fmtD, stepDelivs, shares} from "./model.js";
import * as RW from "./rules.js";

const LS = "pfad-data";
export const state = {P: [], I: [], seq: 1, iseq: 1, role: "PL", theme: "dark", draft: null, fs: 1, hc: false, lastBackup: 0, since: 0, corrupt: false, meetDay: 4};
const FS = [1, 1.15, 1.3, 1.5];
const hasK = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const nowIso = () => new Date().toISOString();

// Berechnung eines Vorhabens: nach dem ersten Go mit dem dort festgeschriebenen Regelwerk (Konfigurationsnachweis bleibt stabil)
export const cp = p => compute(p.c, p.rx || undefined);
export const isGate = o => !!o && !o.rv;

export function validP(a) {
  return Array.isArray(a) && a.length < 2000 && a.every(p => p && typeof p.id === "string" && /^[\w\-]{1,40}$/.test(p.id) && hasK(STATUS, p.status) &&
    p.c && Array.isArray(p.c.q) && p.c.q.length === 3 && Array.isArray(p.c.thr) && p.c.thr.length === 3 && Number.isFinite(p.c.hw) && Number.isFinite(p.c.sw) &&
    (!p.date || /^\d{4}-\d{2}-\d{2}$/.test(p.date)) && (!p.submitted || /^[\d.]{1,12}$/.test(p.submitted)));
}
function legacySteps(p) {
  if (p.stepsInit || !p.steps || Object.keys(p.steps).length) { p.stepsInit = true; return; }
  p.stepsInit = true; const r = cp(p); if (!r.ok || !p.last || p.last === "–") return;
  const i = r.order.findIndex(o => p.last.startsWith(o.n + " ") || p.last === o.n);
  r.order.forEach((o, j) => { if (j <= i) p.steps[o.n] = {st: "ok", files: []}; });
}
function norm() {
  state.P.forEach(p => {
    p.appr = p.appr || {spur: false, stufe: false}; p.log = Array.isArray(p.log) ? p.log : []; p.versions = Array.isArray(p.versions) ? p.versions : [];
    p.steps = p.steps || {}; p.ver = p.ver || 1; p.stage = ["ppb", "wp"].includes(p.stage) ? p.stage : "ms"; p.rec = p.rec || ""; p.c.sel = p.c.sel || {}; p.c.opt = p.c.opt || {}; p.c.why = p.c.why || {};
    p.c.ts = Array.isArray(p.c.ts) ? p.c.ts : []; p.dec = Array.isArray(p.dec) ? p.dec : []; p.crs = Array.isArray(p.crs) ? p.crs : []; p.open = Array.isArray(p.open) ? p.open : [];
    p.sponsor = p.sponsor || ""; p.po = p.po || ""; p.c.risk = Array.isArray(p.c.risk) ? p.c.risk : [0, 0, 0];
    if (p.rx && !p.rx.thr) delete p.rx;
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
      state.I = validI(s.I) ? s.I.filter(i => !i.ex || true) : []; state.iseq = Number.isFinite(s.iseq) ? s.iseq : 1; state.meetDay = [1, 2, 3, 4, 5].includes(s.meetDay) ? s.meetDay : 4;
      state.fs = FS.includes(s.fs) ? s.fs : 1; state.hc = !!s.hc; state.lastBackup = Number(s.lastBackup) || 0; state.since = Number(s.since) || 0; norm(); return true;
    }
    if (localStorage.getItem(LS)) throw new Error("ungueltig");
  } catch (e) {
    // Beschädigte Daten werden nicht überschrieben, sondern beiseitegelegt (Download unter Mehr).
    try { const raw = localStorage.getItem(LS); if (raw) { localStorage.setItem(LS + "-defekt", raw); state.corrupt = true; } } catch (e2) { /* ignorieren */ }
  }
  state.P = []; norm(); return false;
}
export const snapshot = () => JSON.stringify({P: state.P, I: state.I, seq: state.seq, iseq: state.iseq, draft: state.draft, role: state.role});
export function restore(j) { const s = JSON.parse(j); state.P = s.P; state.I = s.I || []; state.seq = s.seq; state.iseq = s.iseq || 1; state.draft = s.draft; state.role = s.role; norm(); save(); }
function validI(a) { return Array.isArray(a) && a.length < 2000 && a.every(i => i && typeof i.id === "string" && /^[\w\-]{1,20}$/.test(i.id) && typeof i.t === "string" && ["neu", "an", "ue"].includes(i.st)); }
export const corruptRaw = () => { try { return localStorage.getItem(LS + "-defekt") || ""; } catch (e) { return ""; } };
export function setFs(v) { if (FS.includes(v)) { state.fs = v; save(); } }
export function setHc(v) { state.hc = !!v; save(); }
export function markBackup() { state.lastBackup = Date.now(); save(); }
export const backupDue = () => state.P.some(p => p.mine) && Date.now() - (state.lastBackup || state.since || Date.now()) > 14 * 864e5;
export const byId = id => state.P.find(p => p.id === id);
function logE(p, who, x) { p.log.push({t: fmtD(TODAY), who, x}); }
const plWho = p => "Projektleitung (" + p.pl + ")";

/* ---------- Konfigurator-Entwurf ---------- */
export const emptyC = () => ({thr: [1, 1, 1], q: [1, 1, 1], hw: 60, sw: 50, sel: {}, opt: {}, why: {}, ts: [], risk: [0, 0, 0], lastSp: null});
export const newWiz = () => ({meta: null, name: "", pc: PCS[0], pl: "", sp: "", po: "", typ: "", date: "", desc: "", ref: "", pred: "", idea: "", step: 0, c: emptyC()});
export const rxOf = w => (w && w.meta && byId(w.meta) && byId(w.meta).rx) || undefined;
export function guardSpur(w) { const r = compute(w.c, rxOf(w)), k = r.sp + (r.hc ? "h" : ""); if (w.c.lastSp && w.c.lastSp !== k) w.c.sel = {}; w.c.lastSp = k; }
export function wizFromPreset(i) {
  const p = PRESETS[i], w = newWiz();
  Object.assign(w.c, {q: [...p.q], hw: p.hw, sw: p.sw, opt: {...p.opt}}); guardSpur(w); return w;
}
export function wizFromProject(p) {
  const w = newWiz();
  Object.assign(w, {meta: p.id, name: p.name, pc: p.pc, pl: p.pl, sp: p.sponsor || "", po: p.po || "", typ: "", date: p.date || "", ref: p.ref || "", desc: p.desc || "", step: 3, c: JSON.parse(JSON.stringify(p.c))});
  w.c.lastSp = null; guardSpur(w); return w;
}
// Folgegeneration (Kap. 5.8): Vorgänger wird Referenzprodukt, Teilsysteme starten als übernommen, Lessons Learned bleiben sichtbar
export function wizFromSuccessor(p) {
  const w = newWiz();
  Object.assign(w, {name: p.name.replace(/^Beispiel: /, "") + " – Folgegeneration", pc: p.pc, pl: p.pl, sp: p.sponsor || "", po: p.po || "", ref: p.name + " (" + p.id + ")", pred: p.id, step: 0});
  Object.assign(w.c, {q: [...p.c.q], hw: 20, sw: 20, ts: (p.c.ts || []).map(t => ({n: t.n, d: t.d, s: "u"}))});
  guardSpur(w); return w;
}
export function missingWhy(w) { const r = compute(w.c, rxOf(w)); return r.ab.filter(m => !(w.c.why[m.id] || "").trim()); }

/* ---------- Schritte und Nachweise ---------- */
export const stepOf = (p, k) => { const s = (p.steps[k] = p.steps[k] || {st: "open", files: []}); s.files = s.files || []; s.chk = s.chk || {}; return s; };
export const stepLabel = o => o.n + (o.t ? " " + o.t : "");
export function syncSteps(p) {
  const r = cp(p); if (!r.ok) return;
  r.order.forEach(o => stepOf(p, o.n));
  const fix = (k, v) => { if (r.order.some(o => o.n === k)) { const s = stepOf(p, k); if (v) s.st = "ok"; else if (s.st === "ok") s.st = "open"; } };
  fix("G1", p.appr.spur); fix("G2", p.appr.stufe); fix("G1+2", p.appr.stufe);
}
export const curStep = p => { const r = cp(p); return r.ok ? r.order.find(o => stepOf(p, o.n).st !== "ok") || null : null; };
export const subStep = p => { const r = cp(p); return r.ok ? r.order.find(o => stepOf(p, o.n).st === "sub") || null : null; };
export const nextGate = p => { const r = cp(p); return r.ok ? r.order.find(o => isGate(o) && stepOf(p, o.n).st !== "ok") || null : null; };
export function progress(p) { const r = cp(p); return r.ok ? {done: r.order.filter(o => stepOf(p, o.n).st === "ok").length, total: r.order.length} : {done: 0, total: 0}; }
export const overdue = p => !!p.date && p.date < TODAY && ["on", "off", "bl", "re", "pe", "ho"].includes(p.status);
export const waitDays = p => p.subAt ? Math.max(0, Math.floor((Date.now() - Date.parse(p.subAt)) / 864e5)) : 0;
export function canSubmitStep(p) { const o = curStep(p); return state.role === "PL" && ["on", "off", "bl", "re"].includes(p.status) && !!o && ["open", "mod"].includes(stepOf(p, o.n).st); }
export function canEditFiles(p, k) { const s = stepOf(p, k); return state.role === "PL" && !["ki", "do", "li"].includes(p.status) && (["open", "mod"].includes(s.st) || (s.st === "sub" && p.status === "pe" && p.stage === "ms")); }
// Nachweise werden im Konzept abgehakt (später Ablage in SharePoint)
export function missingDelivs(p, o) { const r = cp(p), s = stepOf(p, o.n); return stepDelivs(r, o).filter(d => !(s.chk && s.chk[d])); }
export function toggleChk(id, k, d, on) { const p = byId(id); if (!p || !canEditFiles(p, k)) return false; const s = stepOf(p, k); s.chk = s.chk || {}; if (on) s.chk[d] = TODAY; else delete s.chk[d]; save(); return true; }
export function addFileMeta(id, k, meta) { const p = byId(id); if (!p) return; const s = stepOf(p, k); s.files.push(meta); if (s.st === "sub") logE(p, plWho(p), "Nachweis ergänzt: " + meta.name); save(); }
export function removeFileMeta(id, k, fid) { const p = byId(id); if (!p) return null; const s = stepOf(p, k), i = s.files.findIndex(f => f.id === fid); if (i < 0) return null; const [f] = s.files.splice(i, 1); if (s.st === "sub") logE(p, plWho(p), "Nachweis entfernt: " + f.name); save(); return f; }
export function setDate(id, d) { const p = byId(id); if (p && state.role === "PL" && (!d || /^\d{4}-\d{2}-\d{2}$/.test(d))) { p.date = d; save(); } }

// Was beim Einreichen eines Schritts anzugeben ist
export function needs(p, o) {
  const r = cp(p), g = isGate(o), hwsw = r.sp === "A" || r.sp === "B";
  return {lf: g ? lfOf(o.n) : [], rg: g && hwsw && ["G2", "G1+2", "G3", "G4"].includes(o.n), sponsor: g, kpis: g && r.sp === "C" && ["G2", "G1+2"].includes(o.n), ll: o.n === "G5", lc: o.n === "G5", crs: g ? p.crs.filter(c => c.st === "gate") : []};
}
function markSub(p, o, note) {
  const s = stepOf(p, o.n); s.st = "sub"; s.subAt = nowIso(); s.n = (s.n || 0) + 1; delete s.rev; delete s.openPts;
  const direct = o.n === "G1"; // an G1 gibt es noch kein Projektteam: das PGB entscheidet direkt
  Object.assign(p, {status: "pe", stage: direct ? "ppb" : "ms", rec: direct ? "G1: Entscheidung direkt durch das PGB" : "", note: "", next: stepLabel(o), submitted: fmtD(TODAY), subAt: s.subAt, fresh: true});
  const nc = isGate(o) ? p.crs.filter(c => c.st === "gate").length : 0;
  logE(p, plWho(p), stepLabel(o) + " eingereicht (" + Object.keys(s.chk || {}).length + " Nachweise abgehakt" + (nc ? ", " + nc + " Änderungsantrag" + (nc > 1 ? "e" : "") : "") + ")" + (p.cfgPending ? ", mit Konfigurationsänderung " + p.cfgPending.from + " → " + p.cfgPending.to : "") + (note ? ": " + note : ""));
}
export function submitStep(id, x = {}) {
  const p = byId(id); if (!p || !canSubmitStep(p)) return {error: "Einreichen ist in dieser Rolle oder diesem Status nicht möglich"};
  const o = curStep(p), nd = needs(p, o), t = v => String(v ?? "").trim(), ans = {};
  const miss = missingDelivs(p, o); if (miss.length) return {error: "Freigabe nur bei Vollständigkeit: bitte alle Liefergegenstände abhaken (" + miss.length + " offen)"};
  if (nd.lf.length) { ans.lf = {}; for (const q of nd.lf) { const a = t(x.lf && x.lf[q.k]); if (!a) return {error: "Bitte jede Leitfrage beantworten (Kap. 5.6)"}; ans.lf[q.k] = a.slice(0, 400); } }
  if (nd.rg) { ans.rg = {}; for (const k of ["hw", "sw", "sys"]) { const v = x.rg && x.rg[k]; if (!RG.includes(v)) return {error: "Bitte den Reifegrad für Hardware, Software und System angeben"}; ans.rg[k] = v; } }
  if (nd.sponsor) {
    if (!x.sponsorOk) return {error: "Der Sponsor muss die Ressourcen für die nächste Phase bestätigt haben"};
    if (t(x.sponsor)) p.sponsor = t(x.sponsor).slice(0, 60); ans.sponsor = {name: p.sponsor || "Sponsor", at: TODAY};
  }
  if (nd.kpis) { const k = t(x.kpis); if (!k) return {error: "In Spur C werden die Kennzahlen an G2 festgelegt: bitte angeben"}; p.kpis = k.slice(0, 400); ans.kpis = p.kpis; }
  if (nd.ll) { const l = t(x.ll); if (!l) return {error: "Bitte die Lessons Learned eintragen, sie gehen an die nächste Generation"}; p.ll = l.slice(0, 600); ans.ll = p.ll; }
  if (nd.lc) { const l = t(x.lc); if (!l) return {error: "Bitte benennen, wer das Produkt im Lebenszyklus verantwortet"}; p.lcOwner = l.slice(0, 80); ans.lc = p.lcOwner; }
  if (nd.crs.length) ans.crs = nd.crs.map(c => c.id);
  stepOf(p, o.n).ans = ans; markSub(p, o, t(x.note)); save(); return {msg: stepLabel(o) + " eingereicht: " + p.name};
}
const sig = r => r.sp + "|" + r.st + "|" + r.on.map(m => m.id).sort().join(",");

export function submitWiz(w) {
  if (state.role !== "PL") return {error: "Einreichen nur in der Rolle Projektleitung"};
  if (!w.name.trim()) return {error: "Bitte einen Namen eingeben", step: 0};
  if (!w.pl.trim()) return {error: "Bitte die Projektleitung angeben", step: 0};
  const miss = missingWhy(w);
  if (miss.length) return {error: "Begründung fehlt für: " + miss.map(m => m.t).join(", "), step: 4};
  const p0 = w.meta ? byId(w.meta) : null, r = compute(w.c, p0 && p0.rx ? p0.rx : undefined), snap = JSON.parse(JSON.stringify(w.c)); snap.lastSp = null;
  if (r.ok && r.st0 !== "Full" && !(w.c.ts || []).length) return {error: "Ab Stufe Standard ist die Teilsystemliste Pflicht (Schritt Generationsstufe)", step: 3};
  const meta = {name: w.name.trim(), pc: w.pc, pl: w.pl.trim(), sponsor: (w.sp || "").trim(), po: (w.po || "").trim(), ref: w.ref.trim(), desc: w.desc.trim()};
  if (p0) {
    const old = cp(p0);
    Object.assign(p0, meta, {c: snap, date: w.date || ""});
    p0.ver++; p0.versions.push({ver: p0.ver, date: fmtD(TODAY), path: r.path}); state.draft = null;
    if (!r.ok) { p0.status = "li"; p0.next = "–"; p0.note = "unter den Projektschwellen"; save(); return {id: p0.id, msg: "Gespeichert: unter den Projektschwellen, kein PEP"}; }
    syncSteps(p0);
    if (!p0.appr.spur && !p0.appr.stufe) { markSub(p0, r.order[0], "Konfiguration " + r.path + " (Version " + p0.ver + ")"); save(); return {id: p0.id, msg: "Eingereicht: " + p0.id + " (Version " + p0.ver + ")"}; }
    if (old.ok && sig(r) !== sig(old)) {
      if (old.sp !== r.sp) { p0.appr.spur = false; p0.appr.stufe = false; syncSteps(p0); logE(p0, plWho(p0), "Spur geändert " + old.path + " → " + r.path + ", Neufreigabe ab G1 erforderlich (die Spur wird an G1 entschieden)"); save(); return {id: p0.id, msg: "Spur geändert: Neufreigabe ab G1, bitte erneut einreichen"}; }
      if (p0.appr.stufe) { p0.cfgPending = {from: old.path, to: r.path}; const c = nextGate(p0); logE(p0, plWho(p0), "Konfigurationsänderung " + old.path + " → " + r.path + ", Freigabe am nächsten Gate" + (c ? " (" + stepLabel(c) + ")" : "")); save(); return {id: p0.id, msg: "Gespeichert: Änderung wird am nächsten Gate mit freigegeben"}; }
      logE(p0, plWho(p0), "Konfiguration " + r.path + " angepasst (Version " + p0.ver + ")"); save(); return {id: p0.id, msg: "Gespeichert: Stufe und Bausteine folgen an G2"};
    }
    save(); return {id: p0.id, msg: "Gespeichert"};
  }
  const p = Object.assign({id: "V-" + String(state.seq++).padStart(3, "0")}, meta, {c: snap,
    status: r.ok ? "pe" : "li", last: "–", next: "–", date: w.date || "", note: r.ok ? "" : "unter den Projektschwellen",
    mine: true, fresh: true, appr: {spur: false, stufe: false}, steps: {}, stage: "ms", rec: "", ver: 1, versions: [{ver: 1, date: fmtD(TODAY), path: r.path}], log: [], dec: [], crs: [], open: []});
  const pred = w.pred ? byId(w.pred) : null, idea = w.idea ? state.I.find(i => i.id === w.idea) : null;
  if (idea) { p.idea = idea.id; idea.st = "ue"; idea.pid = p.id; idea.log.push({t: fmtD(TODAY), x: "Übernommen als " + p.id + " durch " + p.pl}); }
  if (pred) { p.pred = pred.id; pred.succ = p.id; logE(pred, plWho(p), "Folgegeneration angelegt: " + p.id); }
  logE(p, plWho(p), (r.ok ? "Vorhaben mit Konfiguration " + r.path + " angelegt" : "Als Roadmap-Eintrag ohne PEP angelegt (unter den Projektschwellen)") + (pred ? ", Folgegeneration von " + pred.id : ""));
  if (r.ok) { syncSteps(p); markSub(p, r.order[0], ""); }
  if (!state.since) state.since = Date.now();
  state.P.unshift(p); state.draft = null; save();
  return {id: p.id, msg: r.ok ? "Angelegt: " + p.id + ". Nachweise im Vorhaben ergänzen, Freigabe läuft" : "Als Roadmap-Eintrag ohne PEP angelegt"};
}

/* ---------- Änderungsanträge (Kap. 5.4, Rahmenänderungen nach 4.2.3) ---------- */
// Rahmenänderungen gehen nur über das PGB an das WP Board (pgbwp); vorgezogene Arbeit mit Bindung entscheidet das PGB (pgb)
export function crRoute(kat, eur, weeks) { const k = CRK[kat]; if (!k) return null; if (kat === "budget" && Number(eur) > WP_LIMIT) return "pgbwp"; if (kat === "lt" && Number(weeks) > LT_WEEKS) return "pgbwp"; return k.to; }
export function addCR(id, kat, text, eur, weeks) {
  const p = byId(id); if (!p || state.role !== "PL" || ["ki", "do", "li"].includes(p.status)) return {error: "Änderungsantrag in dieser Rolle oder diesem Status nicht möglich"};
  const t = String(text || "").trim(), to = crRoute(kat, eur, weeks); if (!to) return {error: "Bitte eine Kategorie wählen"}; if (!t) return {error: "Bitte die Änderung beschreiben"};
  if (kat === "budget" && !(Number(eur) > 0)) return {error: "Bitte den Betrag der Budgetänderung angeben"};
  if (kat === "lt" && !(Number(weeks) > 0)) return {error: "Bitte angeben, um wie viele Wochen sich der Liefertermin verschiebt"};
  const cr = {id: "CR-" + (p.crs.length + 1), kat, text: t.slice(0, 400), eur: kat === "budget" ? Math.round(Number(eur)) : null, wk: kat === "lt" ? Math.round(Number(weeks)) : null, at: TODAY, st: to};
  p.crs.push(cr); const ng = nextGate(p);
  const where = crWhere(cr, ng);
  logE(p, plWho(p), "Änderungsantrag " + cr.id + " (" + CRK[kat].t + (cr.eur ? ", " + cr.eur.toLocaleString("de-DE") + " €" : "") + (cr.wk ? ", " + cr.wk + " Wochen" : "") + "): " + cr.text + ". " + where);
  save(); return {msg: cr.id + ": " + where};
}
export function decideCR(id, crid, ok, text) {
  const p = byId(id), cr = p && p.crs.find(c => c.id === crid); if (!cr || state.role !== "WP" || cr.st !== "wp") return {error: "Entscheidung in dieser Rolle nicht möglich"};
  const t = String(text || "").trim(); if (!ok && !t) return {error: "Bitte die Ablehnung begründen"};
  cr.st = ok ? "ok" : "rej"; cr.dec = "WP Board, " + fmtD(TODAY) + (t ? ": " + t : "");
  logE(p, "WP Board", "Änderungsantrag " + cr.id + (ok ? " angenommen" : " abgelehnt") + (t ? ": " + t : "")); save(); return {msg: cr.id + (ok ? " angenommen" : " abgelehnt")};
}
export const wpCRs = () => state.P.flatMap(p => p.crs.filter(c => c.st === "wp").map(c => ({p, c})));
export const pgbCRs = () => state.P.flatMap(p => p.crs.filter(c => ["pgb", "pgbwp"].includes(c.st)).map(c => ({p, c})));
export const crWhere = (cr, ng) => ({backlog: "im Backlog der Spur, kein Gate nötig", pgb: "Entscheidung des PGB in der nächsten Sitzung", pgbwp: "PGB legt dem WP Board vor", wp: "Entscheidung im WP Board", ok: "angenommen", rej: "abgelehnt"}[cr.st] || ("Entscheidung am nächsten Gate" + (ng ? " (" + stepLabel(ng) + ")" : "")));
// PGB: vorgezogene Arbeit annehmen/ablehnen, Rahmenänderung an das WP Board vorlegen oder ablehnen
export function pgbCR(id, crid, act, text) {
  const p = byId(id), cr = p && p.crs.find(c => c.id === crid); if (!cr || state.role !== "PPB" || !["pgb", "pgbwp"].includes(cr.st)) return {error: "Entscheidung in dieser Rolle nicht möglich"};
  const t = String(text || "").trim(); if (act === "rej" && !t) return {error: "Bitte die Ablehnung begründen"};
  if (act === "fwd" && cr.st === "pgbwp") { cr.st = "wp"; cr.dec = "PGB legt vor, " + fmtD(TODAY); logE(p, "PGB", "Änderungsantrag " + cr.id + " dem WP Board vorgelegt" + (t ? ": " + t : "")); save(); return {msg: cr.id + " dem WP Board vorgelegt"}; }
  if (act === "ok" && cr.st === "pgb") { cr.st = "ok"; cr.dec = "PGB, " + fmtD(TODAY) + (t ? ": " + t : ""); logE(p, "PGB", "Änderungsantrag " + cr.id + " angenommen" + (t ? ": " + t : "")); save(); return {msg: cr.id + " angenommen"}; }
  if (act === "rej") { cr.st = "rej"; cr.dec = "PGB, " + fmtD(TODAY) + ": " + t; logE(p, "PGB", "Änderungsantrag " + cr.id + " abgelehnt: " + t); save(); return {msg: cr.id + " abgelehnt"}; }
  return {error: "Aktion nicht möglich"};
}

/* ---------- Freigabe-Workflow: MS Gate Committee prüft, PGB entscheidet, WP Board bei Uneinigkeit ---------- */
export const deciderOf = p => p.stage === "wp" ? "WP" : "PPB";
export const whoOf = p => p.stage === "wp" ? "WP Board" : "PGB";
export const canDecide = p => !!p && p.status === "pe" && ((p.stage === "ppb" && state.role === "PPB") || (p.stage === "wp" && state.role === "WP"));
const decPush = (p, o, out, by) => { const s = stepOf(p, o.n); p.dec.push({k: o.n, out, by, sub: s.subAt || null, at: nowIso()}); };

// Prüfung durch das MS Gate Committee (= Projektteam): Vollständigkeit, in Spur A und B Prüfvermerk HW und SW, Regulatorik.
// Freigabe nur bei Vollständigkeit: es gibt kein Go mit offenen Punkten.
export function recommend(id, rev = {}) {
  const p = byId(id), o = p && subStep(p); if (!p || !o || state.role !== "MS" || p.status !== "pe" || p.stage !== "ms") return {error: "Prüfung in dieser Rolle oder diesem Status nicht möglich"};
  const r = cp(p), s = stepOf(p, o.n), nd = needs(p, o), lf = rev.lf || {};
  if (!["ja", "nein", "nr"].includes(rev.reg)) return {error: "Bitte angeben, ob die regulatorischen Anforderungen erfüllt sind"};
  if (rev.reg === "nein") { // Guideline: dann lautet das Ergebnis Modify, unabhängig vom Decision Board
    s.st = "mod"; s.rev = {...rev, at: TODAY}; decPush(p, o, "modify", "Regel");
    Object.assign(p, {status: "re", stage: "ms", rec: "", next: "Überarbeiten und erneut einreichen", fresh: true, note: "Modify: regulatorische Anforderungen nicht erfüllt. Ergebnis unabhängig vom PGB."});
    logE(p, "MS Gate Committee", stepLabel(o) + ": regulatorische Anforderungen nicht erfüllt, Ergebnis Modify"); save(); return {msg: "Modify: regulatorische Anforderungen nicht erfüllt"};
  }
  if (missingDelivs(p, o).length) return {error: "Nicht vollständig: Liefergegenstände fehlen. Bitte zurück an die Projektleitung"};
  if (nd.lf.some(q => lf[q.k] !== "ok")) return {error: "Freigabe nur bei Vollständigkeit: ist eine Leitfrage offen, geht der Schritt zurück an die Projektleitung"};
  if ((r.sp === "A" || r.sp === "B") && !(rev.hw && rev.sw)) return {error: "In Spur " + r.sp + " braucht die Empfehlung einen Prüfvermerk von Hardware und Software"};
  s.rev = {lf, hw: !!rev.hw, sw: !!rev.sw, reg: rev.reg, at: TODAY};
  p.stage = "ppb"; p.rec = "Vollständig, empfohlen (Projektteam, " + fmtD(TODAY) + ")";
  logE(p, "MS Gate Committee", stepLabel(o) + ": vollständig" + ((r.sp === "A" || r.sp === "B") ? ", Prüfvermerk HW und SW" : "") + ", Empfehlung an PGB");
  save(); return {msg: p.name + ": Empfehlung an PGB übergeben"};
}
export function goDecision(id) {
  const p = byId(id), o = p && subStep(p); if (!o || !canDecide(p)) return {error: "Entscheidung in dieser Rolle oder diesem Status nicht möglich"};
  if (missingDelivs(p, o).length) return {error: "Freigabe nur bei Vollständigkeit: es fehlen Liefergegenstände"};
  const r = cp(p), s = stepOf(p, o.n), who = whoOf(p);
  s.st = "ok"; s.decided = nowIso(); decPush(p, o, "go", who);
  if (o.n === "G1") p.appr.spur = true; else if (o.n === "G2" || o.n === "G1+2") { p.appr.spur = true; p.appr.stufe = true; }
  let fx = "";
  if (!p.rx) { p.rx = RW.freeze(); p.fix = {ver: p.rx.ver, at: TODAY, path: r.path, order: r.order.map(x => x.n)}; fx = ", Konfiguration " + r.path + " mit Regelwerk v" + p.rx.ver + " festgeschrieben"; }
  let crx = ""; if (isGate(o)) { const L = p.crs.filter(c => c.st === "gate"); L.forEach(c => { c.st = "ok"; c.dec = who + " an " + o.n + ", " + fmtD(TODAY); }); if (L.length) crx = ", " + L.length + " Änderungsantrag" + (L.length > 1 ? "e" : "") + " angenommen"; }
  const had = p.cfgPending; delete p.cfgPending;
  p.last = stepLabel(o); const nx = curStep(p); p.next = nx ? stepLabel(nx) : "–"; p.date = "";
  p.status = nx ? "on" : "do"; p.stage = "ms"; p.rec = ""; p.note = ""; p.fresh = true;
  if (!nx) p.doneAt = TODAY;
  logE(p, who, "Go: " + stepLabel(o) + " freigegeben" + (o.n === "G1" ? " (Spur " + r.sp + ")" : "") + (had ? ", Konfigurationsänderung " + had.from + " → " + had.to + " freigegeben" : "") + crx + fx);
  save(); return {msg: p.name + ": " + stepLabel(o) + " freigegeben" + (nx ? "" : ", Vorhaben abgeschlossen")};
}
export const REASONS = {
  ret: {t: "Zurück an die Projektleitung", role: "MS", st: "re", ss: "mod", log: "Zurück an PL", txt: "Was fehlt oder ist unklar?", next: "Überarbeiten und erneut einreichen", ok: "Zurücksenden", hint: "Die Projektleitung sieht den Kommentar im Vorhaben."},
  modify: {t: "Modify: Nachbesserung", role: "D", st: "re", ss: "mod", log: "Modify", txt: "", next: "Überarbeiten und erneut einreichen", ok: "Modify entscheiden", hint: "Die Projektleitung bessert nach und reicht erneut ein."},
  hold: {t: "Hold: Vorhaben pausieren", role: "D", st: "ho", ss: "hold", log: "Hold", txt: "", next: "Hold, Wiedervorlage im PGB", ok: "Hold entscheiden", hint: "Wiedervorlage spätestens nach 3 Monaten in der Wochensitzung."},
  kill: {t: "Kill: Vorhaben abbrechen", role: "D", st: "ki", ss: "kill", log: "Kill", txt: "", next: "abgebrochen", ok: "Kill entscheiden", hint: "Zum Abbruch gehört ein kurzer Bericht."},
  wp: {t: "An das WP Board: Uneinigkeit im PGB", role: "PGB", log: "An WP Board", txt: "Worin ist sich das PGB uneinig?", ok: "An WP Board geben", hint: "Das WP Board entscheidet nur auf Vorlage des PGB."}
};
export const HOLD_MAX = 92; // Tage
const addDays = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
export const holdDefault = () => addDays(TODAY, 91);
export const holdMax = () => addDays(TODAY, HOLD_MAX);
export function reason(id, k, text, x = {}) {
  const p = byId(id), c = REASONS[k], t = (text || "").trim(), o = p && subStep(p);
  if (!p || !c || !o) return {error: "Aktion nicht möglich"};
  const okRole = c.role === "MS" ? state.role === "MS" && p.status === "pe" && p.stage === "ms" : c.role === "PGB" ? state.role === "PPB" && p.status === "pe" && p.stage === "ppb" : canDecide(p);
  if (!okRole) return {error: "Aktion in dieser Rolle oder diesem Status nicht möglich"};
  if (!t) return {error: "Bitte eine Begründung eingeben"};
  if (k === "hold" && (!/^\d{4}-\d{2}-\d{2}$/.test(x.until || "") || x.until <= TODAY || x.until > holdMax())) return {error: "Bitte eine Wiedervorlage innerhalb der nächsten 3 Monate angeben"};
  if (k === "kill" && !(String(x.ll || "").trim() && String(x.res || "").trim())) return {error: "Zum Abbruchbericht gehören Lessons Learned und die freigegebenen Ressourcen"};
  if (k === "wp") { p.stage = "wp"; p.rec = (p.rec ? p.rec + " · " : "") + "PGB uneinig: " + t; p.fresh = true; logE(p, "PGB", stepLabel(o) + ", Uneinigkeit, Vorlage an WP Board: " + t); save(); return {msg: p.name + ": dem WP Board vorgelegt"}; }
  const who = c.role === "MS" ? "MS Gate Committee" : whoOf(p);
  if (c.role !== "MS") decPush(p, o, k, who);
  if (k === "hold") p.holdUntil = x.until;
  if (k === "kill") p.killReport = {grund: t, ll: String(x.ll).trim().slice(0, 600), res: String(x.res).trim().slice(0, 400), at: TODAY};
  stepOf(p, o.n).st = c.ss; p.status = c.st; p.note = who + " " + c.log + ": " + t + (k === "hold" ? " (Wiedervorlage " + fmtD(x.until) + ")" : ""); p.next = c.next; p.stage = "ms"; p.rec = ""; p.fresh = true;
  logE(p, who, stepLabel(o) + ", " + c.log + ": " + t + (k === "hold" ? ", Wiedervorlage " + fmtD(x.until) : "") + (k === "kill" ? ", Abbruchbericht erfasst" : "")); save();
  return {msg: c.log + ": " + p.name};
}
export function resume(id) {
  const p = byId(id); if (!p || state.role !== "PPB" || p.status !== "ho") return null;
  const o = r2(p); if (o) stepOf(p, o.n).st = "sub";
  p.status = "pe"; p.stage = "ppb"; p.note = ""; delete p.holdUntil; p.fresh = true; logE(p, "PGB", "Hold aufgehoben, erneute Entscheidung"); save(); return "Hold aufgehoben: " + p.name;
}
function r2(p) { const r = cp(p); return r.ok ? r.order.find(o => stepOf(p, o.n).st === "hold") || null : null; }
export const holdDue = p => p.status === "ho" && !!p.holdUntil && p.holdUntil <= addDays(nextMeeting(), 0);
export function setRole(r) { if (hasK(ROLES, r)) { state.role = r; save(); } }
export function setTheme(t) { if (["dark", "light", "auto"].includes(t)) { state.theme = t; save(); } }
export function setMeetDay(d) { if ([1, 2, 3, 4, 5].includes(d)) { state.meetDay = d; save(); } }
export function queue() { return state.P.filter(p => p.status === "pe"); }
export const mine = role => { const q = queue(); return role === "MS" ? q.filter(p => p.stage === "ms") : role === "PPB" ? q.filter(p => p.stage === "ppb") : role === "WP" ? q.filter(p => p.stage === "wp") : []; };
export const todo = role => mine(role).length + (role === "PPB" ? (RW.draft() && RW.draft().pending ? 1 : 0) + pgbCRs().length + state.P.filter(holdDue).length : 0) + (role === "WP" ? wpCRs().length : 0) + (role === "PG" && RW.draft() && RW.draft().rej ? 1 : 0);

// Wochensitzung des PGB: nächster Sitzungstag und Tagesordnung
export function nextMeeting() { const d = new Date(TODAY + "T12:00:00"); let w = d.getDay(); let n = (state.meetDay - w + 7) % 7; d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
export function agenda() {
  return {gates: queue().filter(p => p.stage === "ppb"), holds: state.P.filter(holdDue), crs: pgbCRs(), ideas: state.I.filter(i => i.st === "neu"), rules: RW.draft() && RW.draft().pending ? RW.diffDraft() : null, plr: state.P.filter(plrDue)};
}
export function agendaText() {
  const A = agenda(), L = ["Tagesordnung PGB, Sitzung am " + fmtD(nextMeeting()), ""];
  L.push("1. Entscheidungen an Gates und Review-Meilensteinen (" + A.gates.length + ")");
  A.gates.forEach(p => { const o = subStep(p); L.push("   - " + p.id + " " + p.name + " · " + (o ? stepLabel(o) : "") + " · " + cp(p).path + " · " + (p.rec || "")); });
  L.push("2. Hold-Wiedervorlagen (" + A.holds.length + ")"); A.holds.forEach(p => L.push("   - " + p.id + " " + p.name + " · Wiedervorlage " + fmtD(p.holdUntil)));
  L.push("3. Änderungsanträge für das PGB (" + A.crs.length + ")"); A.crs.forEach(({p, c}) => L.push("   - " + p.id + " " + c.id + " · " + CRK[c.kat].t + " · " + c.text + (c.st === "pgbwp" ? " · Vorlage an WP Board" : "")));
  L.push("4. Neue Ideen zum Anstoßen (" + A.ideas.length + ")"); A.ideas.forEach(i => L.push("   - " + i.id + " " + i.t + " · Bewertung " + ideaScore(i)));
  L.push("5. Post-Launch-Reviews fällig (" + A.plr.length + ")"); A.plr.forEach(p => L.push("   - " + p.id + " " + p.name));
  L.push("6. Regelwerk-Entwurf: " + (A.rules ? A.rules.join("; ") : "keiner"));
  return L.join("\r\n");
}
export function agendaCsv() {
  const A = agenda(), rows = [["Punkt", "ID", "Titel", "Gegenstand", "Hinweis"]];
  A.gates.forEach(p => { const o = subStep(p); rows.push(["Gate", p.id, p.name, o ? stepLabel(o) : "", p.rec || ""]); });
  A.holds.forEach(p => rows.push(["Hold-Wiedervorlage", p.id, p.name, "Wiedervorlage " + fmtD(p.holdUntil), p.note || ""]));
  A.crs.forEach(({p, c}) => rows.push(["Änderungsantrag", p.id + " " + c.id, p.name, CRK[c.kat].t, c.text]));
  A.ideas.forEach(i => rows.push(["Idee", i.id, i.t, "anstoßen?", "Bewertung " + ideaScore(i)]));
  A.plr.forEach(p => rows.push(["Post-Launch-Review", p.id, p.name, "fällig", ""]));
  if (A.rules) rows.push(["Regelwerk", "", "Entwurf", "", A.rules.join("; ")]);
  return "﻿" + rows.map(r => r.map(cell).join(";")).join("\r\n");
}

// Post-Launch-Review (Ergänzung V6): 6 bis 12 Monate nach Abschluss
export const plrFrom = p => p.doneAt ? addDays(p.doneAt, 182) : null;
export const plrDue = p => p.status === "do" && !p.plr && !!p.doneAt && plrFrom(p) <= TODAY;
export function recordPLR(id, bc, text) {
  const p = byId(id); if (!p || state.role !== "PL" || p.status !== "do") return {error: "Nur die Projektleitung erfasst das Post-Launch-Review"};
  if (!["ja", "teilweise", "nein"].includes(bc)) return {error: "Bitte angeben, ob der Business Case erreicht wurde"};
  const t = String(text || "").trim(); if (!t) return {error: "Bitte Kennzahlen und Erkenntnisse eintragen"};
  p.plr = {bc, text: t.slice(0, 800), at: TODAY}; logE(p, plWho(p), "Post-Launch-Review: Business Case " + bc); save(); return {msg: "Post-Launch-Review erfasst"};
}

/* ---------- Ideenpool ---------- */
export const ideaScore = i => { const L = Object.values(i.rate || {}); return L.length ? (Math.round(L.reduce((a, b) => a + b, 0) / L.length * 10) / 10).toLocaleString("de-DE") + " (" + L.length + ")" : "keine"; };
export function addIdea(t, problem, nutzen, pc, by) {
  const T = String(t || "").trim(); if (!T) return {error: "Bitte einen Titel eingeben"};
  if (!String(problem || "").trim()) return {error: "Bitte das Problem oder die Chance beschreiben"};
  const i = {id: "I-" + String(state.iseq++).padStart(3, "0"), t: T.slice(0, 100), problem: String(problem).trim().slice(0, 600), nutzen: String(nutzen || "").trim().slice(0, 400), pc: PCS.includes(pc) ? pc : "", by: String(by || ROLES[state.role]).trim().slice(0, 60), at: TODAY, st: "neu", rate: {}, com: [], log: [{t: fmtD(TODAY), x: "Eingereicht"}]};
  state.I.unshift(i); save(); return {msg: "Idee " + i.id + " im Pool", id: i.id};
}
export function rateIdea(id, n) { const i = state.I.find(x => x.id === id); if (!i || ![1, 2, 3, 4, 5].includes(n)) return; i.rate = i.rate || {}; i.rate[state.role] = n; save(); }
export function commentIdea(id, text) { const i = state.I.find(x => x.id === id), t = String(text || "").trim(); if (!i || !t) return {error: "Bitte einen Kommentar eingeben"}; i.com.push({who: ROLES[state.role], t: t.slice(0, 400), at: TODAY}); save(); return {msg: "Kommentar gespeichert"}; }
export function pushIdea(id, pl) { const i = state.I.find(x => x.id === id); if (!i || state.role !== "PPB" || i.st !== "neu") return {error: "Anstoßen nur durch das PGB bei neuen Ideen"}; i.st = "an"; i.pl = String(pl || "").trim().slice(0, 60); i.log.push({t: fmtD(TODAY), x: "Vom PGB angestoßen" + (i.pl ? ", PL: " + i.pl : "")}); save(); return {msg: i.id + " angestoßen"}; }
export function wizFromIdea(id) {
  const i = state.I.find(x => x.id === id); if (!i || state.role !== "PL" || i.st === "ue") return null;
  const w = newWiz(); Object.assign(w, {name: i.t, desc: [i.problem, i.nutzen].filter(Boolean).join(" · Nutzen: "), pc: i.pc || PCS[0], pl: i.pl || "", idea: i.id, step: 0}); guardSpur(w); return w;
}

// Wirkung der Gates (Cooper 2008: Gates ohne Wirkung; K1: zeitnah): Quoten und Tage bis zur Entscheidung
export function gateStats() {
  const D = state.P.flatMap(p => p.dec || []).filter(d => ["PGB", "WP Board", "Regel"].includes(d.by)), n = D.length, c = k => D.filter(d => d.out === k).length;
  const days = D.filter(d => d.sub && d.at).map(d => Math.max(0, (Date.parse(d.at) - Date.parse(d.sub)) / 864e5)).sort((a, b) => a - b);
  const med = days.length ? (days.length % 2 ? days[(days.length - 1) / 2] : (days[days.length / 2 - 1] + days[days.length / 2]) / 2) : null;
  return {n, go: c("go"), modify: c("modify"), hold: c("hold"), kill: c("kill"), med, avg: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null, wp: D.filter(d => d.by === "WP Board").length};
}

/* ---------- Beispielvorhaben (fiktiv, nur auf Wunsch geladen und als Beispiel gekennzeichnet) ---------- */
const iso = d => { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString(); };
const dat = d => { const x = new Date(TODAY + "T12:00:00"); x.setDate(x.getDate() + d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
const TS_A = [["Gehäuse", "HW", "n"], ["Hauptplatine", "HW", "n"], ["Netzteil", "HW", "u"], ["Firmware", "SW", "n"], ["Bedienoberfläche", "SW", "a"]];
const TS_B = [["Gerät (Bestand)", "HW", "u"], ["Messkopf", "HW", "a"], ["Firmware", "SW", "a"], ["Auswertung", "SW", "n"], ["App", "SW", "u"]];
const TS_S = [["Backend", "SW", "a"], ["Oberfläche", "SW", "u"], ["Schnittstelle", "SW", "n"], ["Datenbank", "SW", "u"]];
const DEMO = [
  {n: "Diagnosegerät Alpha", pc: 0, pl: "Muster, A.", q: [1, 1, 1], hw: 80, sw: 60, opt: {o1: 1}, done: 3, st: "on", date: 21, chk: 3, ts: TS_A, crs: [["sys", "Zusätzliche Schnittstelle CAN FD in den Systemanforderungen", 0, 0], ["pre", "Messe-Flyer drucken lassen, bevor G4 entschieden ist", 0, 0]]},
  {n: "Messmodul Bravo", pc: 1, pl: "Beispiel, B.", q: [1, 1, 1], hw: 70, sw: 40, opt: {}, done: 1, st: "pe", stage: "ms", wait: 3, ts: TS_A},
  {n: "Kalibrier-Tool Charlie", pc: 1, pl: "Muster, C.", q: [1, 1, 0], hw: 30, sw: 50, opt: {}, done: 2, st: "off", date: -12, chk: 1, ts: TS_B, crs: [["backlog", "Exportformat für Messprotokolle ergänzen", 0, 0]]},
  {n: "App-Update Delta", pc: 2, pl: "Beispiel, D.", q: [0, 1, 1], hw: 0, sw: 75, opt: {o1: 1}, done: 2, st: "pe", stage: "ppb", wait: 6},
  {n: "Schnittstelle Echo", pc: 0, pl: "Muster, E.", q: [1, 0, 1], hw: 0, sw: 15, opt: {}, done: 0, st: "pe", stage: "ms", wait: 1, ts: TS_S},
  {n: "Datenportal Foxtrot", pc: 2, pl: "Beispiel, F.", q: [0, 1, 1], hw: 0, sw: 40, opt: {}, done: 1, st: "bl", date: -5, chk: 0, ts: TS_S, note: "Wartet auf Freigabe der Schnittstellenspezifikation"},
  {n: "Sensorik Golf", pc: 1, pl: "Muster, G.", q: [1, 1, 0], hw: 45, sw: 30, opt: {}, done: 1, st: "re", chk: 2, ts: TS_B, note: "MS Gate Committee Zurück an PL: Risikoanalyse ist unvollständig"},
  {n: "Update-Service Hotel", pc: 2, pl: "Beispiel, H.", q: [0, 1, 1], hw: 0, sw: 10, opt: {}, done: 0, st: "ho", ts: TS_S, hold: 5, note: "PGB Hold: Priorität neu bewerten"},
  {n: "Adapter India", pc: 0, pl: "Muster, I.", q: [1, 1, 1], hw: 90, sw: 20, opt: {}, done: 2, st: "ki", note: "PGB Kill: Markt entfällt"},
  {n: "Cloud-Backend Juliett", pc: 2, pl: "Beispiel, J.", q: [0, 1, 1], hw: 0, sw: 65, opt: {}, done: 99, st: "do", ll: "Kennzahlen früher mit dem Vertrieb abstimmen; Pilotkunden schon in der Konzeptphase einbinden.", doneAgo: 200},
  {n: "Zubehör Kilo", pc: 0, pl: "Muster, K.", q: [1, 0, 0], hw: 0, sw: 8, opt: {}, done: 0, st: "li", thr: [1, 0, 0]},
  {n: "Gerät Lima", pc: 1, pl: "Beispiel, L.", q: [1, 1, 0], hw: 70, sw: 40, opt: {}, done: 4, st: "on", date: 9, chk: 2},
  {n: "Plattform Mike", pc: 2, pl: "Muster, M.", q: [0, 1, 1], hw: 0, sw: 35, opt: {}, done: 1, st: "on", date: 40, chk: 1, ts: TS_S, crs: [["lt", "Liefertermin verschiebt sich wegen Lieferantenwechsel", 0, 12], ["budget", "Mehraufwand Lizenzen und Hosting", 65000, 0]]},
  {n: "Diagnoseupdate November", pc: 0, pl: "Beispiel, N.", q: [1, 0, 1], hw: 0, sw: 45, opt: {}, done: 1, st: "pe", stage: "wp", wait: 12, ts: TS_S, wpWhy: "Priorität gegenüber dem Gerät Lima strittig"},
  {n: "Ladegerät Oscar", pc: 0, pl: "Muster, O.", q: [1, 1, 1], hw: 75, sw: 30, opt: {}, done: 0, st: "pe", stage: "ppb", wait: 2, idea: 0}
];
const IDEAS = [
  {t: "Ladegerät mit Statusanzeige", problem: "Werkstätten sehen nicht, ob das Diagnosegerät vollständig geladen ist.", nutzen: "Weniger Ausfälle am Fahrzeug", pc: 0, st: "ue", rate: {PL: 4, PPB: 5, MS: 4}, com: [["PGB", "Bitte mit Zubehörstrategie abgleichen"]]},
  {t: "Fehlercode-Erklärung per KI", problem: "Fehlercodes sind für Mechaniker oft schwer zu deuten.", nutzen: "Schnellere Reparatur, weniger Hotline-Anrufe", pc: 2, st: "an", pl: "Beispiel, P.", rate: {PL: 5, PG: 4}, com: [["Projektleitung", "Datenschutz früh klären"], ["PGB", "Angestoßen, PL benannt"]]},
  {t: "Kalibrierprotokoll als PDF", problem: "Kunden wollen das Protokoll direkt aus dem Gerät versenden.", nutzen: "Weniger Nacharbeit", pc: 1, st: "neu", rate: {MS: 3}, com: []},
  {t: "Leihgeräte-Pool für Messen", problem: "Vorführgeräte fehlen regelmäßig.", nutzen: "", pc: 0, st: "neu", rate: {}, com: [["Product Governance", "Unter den Projektschwellen? Bitte prüfen"]]}
];
const DO = {go: "Go", modify: "Modify", hold: "Hold", kill: "Kill"};
export const decLabel = k => DO[k] || (k === "go-op" ? "Go mit offenen Punkten" : k);
export const hasDemo = () => state.P.some(p => p.ex) || state.I.some(i => i.ex);
export function removeDemo() { const n = state.P.filter(p => p.ex).length; state.P = state.P.filter(p => !p.ex); state.I = state.I.filter(i => !i.ex); save(); return n; }
export async function loadDemo() {
  if (state.role !== "PL") state.role = "PL";
  removeDemo();
  // Ideen (fiktiv)
  const ids = IDEAS.map((d, k) => { const i = {id: "IB-" + String(k + 1).padStart(2, "0"), t: "Beispiel: " + d.t, problem: d.problem, nutzen: d.nutzen, pc: PCS[d.pc], by: "Beispiel", at: dat(-30 + k * 5), st: d.st, rate: {...d.rate}, com: d.com.map(([who, t]) => ({who, t, at: dat(-20 + k)})), log: [{t: fmtD(dat(-30 + k * 5)), x: "Eingereicht"}], ex: true}; if (d.pl) i.pl = d.pl; if (d.st !== "neu") i.log.push({t: fmtD(dat(-12)), x: "Vom PGB angestoßen" + (d.pl ? ", PL: " + d.pl : "")}); return i; });
  state.I = ids.concat(state.I);
  let seq = 1;
  for (const d of DEMO) {
    const c = emptyC(); Object.assign(c, {q: [...d.q], hw: d.hw, sw: d.sw, opt: {...d.opt}}); if (d.thr) c.thr = [...d.thr]; if (d.ts) c.ts = d.ts.map(([n, dm, s]) => ({n, d: dm, s}));
    guardSpur({c}); const r = compute(c);
    const p = {id: "B-" + String(seq++).padStart(2, "0"), name: "Beispiel: " + d.n, pc: PCS[d.pc], pl: d.pl, sponsor: "Sponsor, " + d.pl.slice(-2), po: "Owner, " + d.pl.slice(-2), ref: "", desc: "Fiktives Beispielvorhaben zur Vorführung", c, ex: true, status: d.st, last: "–", next: "–", date: d.date !== undefined ? dat(d.date) : "", note: d.note || "",
      mine: false, fresh: false, appr: {spur: false, stufe: false}, steps: {}, stage: d.stage || "ms", rec: "", ver: 1, versions: [{ver: 1, date: fmtD(TODAY), path: r.path}], log: [], dec: [], crs: [], open: []};
    const lg = (ago, who, x) => { p.log.push({t: fmtD(dat(-ago)), who, x}); };
    if (d.idea !== undefined) { const i = ids[d.idea]; p.idea = i.id; i.pid = p.id; i.log.push({t: fmtD(dat(-10)), x: "Übernommen als " + p.id}); lg(10, plWho(p), "Aus Idee " + i.id + " übernommen"); }
    lg(60, plWho(p), "Vorhaben mit Konfiguration " + r.path + " angelegt");
    if (!r.ok) { p.note = "unter den Projektschwellen"; p.next = "–"; state.P.push(p); continue; }
    const ord = r.order, nDone = Math.min(d.done, ord.length), allChk = o => { const s = stepOf(p, o.n); s.chk = {}; stepDelivs(r, o).forEach(x => s.chk[x] = TODAY); };
    const ans = o => { const nd = needs(p, o), a = {}; if (nd.lf.length) { a.lf = {}; nd.lf.forEach(q => a.lf[q.k] = "Beispielantwort zur Vorführung"); } if (nd.rg) a.rg = {hw: "teilweise", sw: "erreicht", sys: "teilweise"}; if (nd.sponsor) a.sponsor = {name: p.sponsor, at: TODAY}; return a; };
    ord.forEach((o, i) => { if (i >= nDone) return; const s = stepOf(p, o.n), sub = iso(55 - i * 8), at = iso(50 - i * 8 - (i % 3)); s.st = "ok"; s.decided = at; s.subAt = sub; s.n = 1; s.ans = ans(o); allChk(o);
      if (o.n === "G1" || o.n === "G1+2") p.appr.spur = true; if (o.n === "G2" || o.n === "G1+2") { p.appr.spur = true; p.appr.stufe = true; }
      p.dec.push({k: o.n, out: "go", by: "PGB", sub, at});
      lg(50 - i * 8, "PGB", "Go: " + stepLabel(o) + " freigegeben" + (i === 0 ? ", Konfiguration " + r.path + " mit Regelwerk v" + RW.rules().ver + " festgeschrieben" : "")); });
    if (nDone) { p.rx = RW.freeze(); p.fix = {ver: p.rx.ver, at: TODAY, path: r.path, order: ord.map(x => x.n)}; }
    if (d.ll) { p.ll = d.ll; p.lcOwner = "Product Management Software"; }
    if (r.sp === "C" && nDone >= 2) p.kpis = "Aktive Nutzer pro Monat, Abbruchquote, Ticketzahl je Release";
    const cs = ord[nDone] || null;
    p.last = nDone ? stepLabel(ord[nDone - 1]) : "–"; p.next = cs ? stepLabel(cs) : "–";
    if (cs && d.chk !== undefined) { const s = stepOf(p, cs.n), dv = stepDelivs(r, cs); s.chk = {}; dv.slice(0, Math.min(d.chk, dv.length)).forEach(x => s.chk[x] = TODAY); }
    if (d.st === "pe" && cs) {
      const s = stepOf(p, cs.n); s.st = "sub"; s.subAt = iso(d.wait); s.n = 1; s.ans = ans(cs); allChk(cs); p.subAt = s.subAt; p.submitted = fmtD(dat(-d.wait)); p.date = "";
      lg(d.wait, plWho(p), stepLabel(cs) + " eingereicht");
      if (p.stage === "ppb" && cs.n === "G1") p.rec = "G1: Entscheidung direkt durch das PGB";
      else if (p.stage !== "ms") { s.rev = {lf: {}, hw: true, sw: true, reg: "ja", at: dat(-Math.max(0, d.wait - 2))}; needs(p, cs).lf.forEach(q => s.rev.lf[q.k] = "ok");
        p.rec = "Vollständig, empfohlen (Projektteam, " + fmtD(dat(-Math.max(0, d.wait - 2))) + ")"; lg(Math.max(0, d.wait - 2), "MS Gate Committee", stepLabel(cs) + ": vollständig, Empfehlung an PGB"); }
      if (p.stage === "wp") { p.rec += " · PGB uneinig: " + d.wpWhy; lg(Math.max(0, d.wait - 5), "PGB", stepLabel(cs) + ", Uneinigkeit, Vorlage an WP Board: " + d.wpWhy); }
    }
    if (d.st === "re" && cs) { stepOf(p, cs.n).st = "mod"; lg(4, "MS Gate Committee", stepLabel(cs) + ", Zurück an PL: " + d.note.replace(/^.*?: /, "")); }
    if (d.st === "ho" && cs) { const s = stepOf(p, cs.n); s.st = "hold"; s.subAt = iso(14); allChk(cs); p.holdUntil = dat(d.hold || 30); p.note += " (Wiedervorlage " + fmtD(p.holdUntil) + ")"; p.dec.push({k: cs.n, out: "hold", by: "PGB", sub: iso(14), at: iso(8)}); lg(8, "PGB", stepLabel(cs) + ", Hold: " + d.note.replace(/^.*?: /, "") + ", Wiedervorlage " + fmtD(p.holdUntil)); }
    if (d.st === "ki" && cs) { const s = stepOf(p, cs.n); s.st = "kill"; s.subAt = iso(15); allChk(cs); p.dec.push({k: cs.n, out: "kill", by: "PGB", sub: iso(15), at: iso(10)}); p.next = "abgebrochen"; p.killReport = {grund: "Markt entfällt", ll: "Marktanalyse vor G2 mit Vertrieb gegenprüfen", res: "2 Entwickler ab sofort für Gerät Lima", at: dat(-10)}; lg(10, "PGB", stepLabel(cs) + ", Kill: Markt entfällt, Abbruchbericht erfasst"); }
    if (d.st === "do") { p.status = "do"; p.next = "–"; p.date = ""; p.doneAt = dat(-(d.doneAgo || 30)); }
    (d.crs || []).forEach(([kat, text, eur, wk], j) => { const to = crRoute(kat, eur, wk); p.crs.push({id: "CR-" + (j + 1), kat, text, eur: eur || null, wk: wk || null, at: dat(-6 + j), st: to}); lg(6 - j, plWho(p), "Änderungsantrag CR-" + (j + 1) + ": " + text); });
    state.P.push(p);
  }
  if (!state.since) state.since = Date.now();
  state.seq = Math.max(state.seq, 1); norm(); save(); return state.P.filter(p => p.ex).length;
}

/* ---------- Daten ---------- */
export function resetAll() { state.P = []; state.I = []; state.iseq = 1; state.seq = 1; state.role = "PL"; state.draft = null; state.since = 0; state.lastBackup = 0; norm(); save(); }
export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || !validP(s.P)) throw new Error("format");
  state.P = s.P; state.seq = Number.isFinite(s.seq) ? s.seq : state.seq; if (validI(s.I)) { state.I = s.I; state.iseq = Number.isFinite(s.iseq) ? s.iseq : state.iseq; } state.draft = null; norm(); save(); if (s.rules) { try { RW.restoreActive(s.rules); } catch (e) { /* Regelwerk ungültig, Vorhaben trotzdem importiert */ } } return state.P.length;
}
export const exportJSON = () => JSON.stringify({version: 4, P: state.P, I: state.I, seq: state.seq, iseq: state.iseq, rules: RW.rules(), rulesDraft: RW.draft()}, null, 2);
function cell(v) { v = String(v ?? ""); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
export function csvRoadmap(list) {
  const hd = ["ID", "Vorhaben", "Product Center", "Projektleitung", "Project Sponsor", "Product Owner", "zugeordneter PEP-Pfad", "Reviews", "zuletzt freigegebener Meilenstein", "nächster geplanter Meilenstein", "Termin", "Status", "Änderungskommentar", "Konfigurationsversion", "Regelwerk-Version", "Schritte erledigt", "Schritte gesamt", "Nachweise abgehakt", "Offene Änderungsanträge"];
  const rows = list.map(p => { const r = cp(p); return [p.id, p.name, p.pc, p.pl, p.sponsor, p.po, r.path, r.ok ? r.n : "", p.last, p.next, p.date || "", STATUS[p.status][0], p.note || "", p.ver || 1, p.rx ? "v" + p.rx.ver + " (festgeschrieben)" : "v" + RW.rules().ver + " (aktuell)", progress(p).done, progress(p).total, Object.values(p.steps || {}).reduce((a, x) => a + Object.keys(x.chk || {}).length, 0), p.crs.filter(c => ["gate", "pgb", "pgbwp", "wp"].includes(c.st)).length]; });
  return "﻿" + [hd, ...rows].map(r => r.map(cell).join(";")).join("\r\n");
}
export function nachweis(p) {
  const r = cp(p), sh = shares(p.c);
  return {id: p.id, vorhaben: p.name, productCenter: p.pc, projektleitung: p.pl, projectSponsor: p.sponsor || null, productOwner: p.po || null, pepPfad: r.path, spur: r.ok ? r.sp + " " + SPN[r.sp] : null, stufe: r.ok ? r.st : null,
    regelwerk: p.rx ? {version: p.rx.ver, festgeschrieben: p.fix ? p.fix.at : null, schwellen: p.rx.thr} : {version: RW.rules().ver, festgeschrieben: null, hinweis: "noch kein Go, es gilt das aktuelle Regelwerk"},
    neuentwicklungsanteil: {hardware: r.hc ? sh.hw : null, software: sh.sw, ausTeilsystemliste: {hardware: sh.hwList, software: sh.swList}},
    teilsysteme: (p.c.ts || []).map(t => ({name: t.n, domaene: t.d, status: TSS[t.s] || t.s})), referenzprodukt: p.ref || null, vorgaenger: p.pred || null, nachfolger: p.succ || null,
    reviews: r.ok ? r.order.map(o => o.n) : [], bausteine: r.ok ? r.on.map(m => m.t) : [],
    abgewaehlt: r.ok ? r.ab.map(m => ({baustein: m.t, begruendung: (p.c.why || {})[m.id] || null})) : [],
    freigabe: {spurFreigegeben: !!p.appr.spur, stufeUndBausteineFreigegeben: !!p.appr.stufe, zuletztFreigegeben: p.last, naechsterMeilenstein: p.next, termin: p.date || null},
    konfigurationsversion: p.ver || 1, kennzahlen: p.kpis || null, lessonsLearned: p.ll || null, rolleImLebenszyklus: p.lcOwner || null, idee: p.idea || null,
    holdWiedervorlage: p.holdUntil || null, abbruchbericht: p.killReport || null, postLaunchReview: p.plr || null, aenderungsantraege: p.crs, entscheidungen: p.dec,
    schritte: r.ok ? r.order.map(o => { const x = stepOf(p, o.n); return {schritt: stepLabel(o), status: x.st, eingereicht: x.subAt || null, entschieden: x.decided || null, angaben: x.ans || null, pruefung: x.rev || null, nachweiseAbgehakt: Object.entries(x.chk || {}).map(([d, at]) => ({liefergegenstand: d, abgehakt: at}))}; }) : [],
    verlauf: p.log, datenstand: TODAY, hinweis: "Gate-Kürzel G1 bis G5 nach Studienarbeit; Abgleich mit dem Gate-Schema des Renew PEP offen."};
}
