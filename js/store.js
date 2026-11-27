// Zustand, Speicherung (localStorage), Freigabe-Workflow, Exporte. Alle Daten bleiben auf dem Gerät.
import {TODAY, PCS, STATUS, ROLES, SPN, PRESETS, lfOf, CRK, WP_LIMIT, RG, TSS} from "./data.js";
import {compute, fmtD, stepDelivs, shares} from "./model.js";
import * as RW from "./rules.js";
import {putFile, sha256} from "./files.js";

const LS = "pfad-data";
export const state = {P: [], seq: 1, role: "PL", theme: "dark", draft: null, fs: 1, hc: false, lastBackup: 0, since: 0, corrupt: false};
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
    p.sponsor = p.sponsor || ""; p.po = p.po || "";
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
const plWho = p => "Projektleitung (" + p.pl + ")";

/* ---------- Konfigurator-Entwurf ---------- */
export const emptyC = () => ({thr: [1, 1, 1], q: [1, 1, 1], hw: 60, sw: 50, sel: {}, opt: {}, why: {}, ts: [], lastSp: null});
export const newWiz = () => ({meta: null, name: "", pc: PCS[0], pl: "", sp: "", po: "", typ: "", date: "", desc: "", ref: "", pred: "", step: 0, c: emptyC()});
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
export const stepOf = (p, k) => (p.steps[k] = p.steps[k] || {st: "open", files: []});
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
export function missingDelivs(p, o) { const r = cp(p), s = stepOf(p, o.n); return stepDelivs(r, o).filter(d => !s.files.some(f => f.dv === d)); }
export function addFileMeta(id, k, meta) { const p = byId(id); if (!p) return; const s = stepOf(p, k); s.files.push(meta); if (s.st === "sub") logE(p, plWho(p), "Nachweis ergänzt: " + meta.name); save(); }
export function removeFileMeta(id, k, fid) { const p = byId(id); if (!p) return null; const s = stepOf(p, k), i = s.files.findIndex(f => f.id === fid); if (i < 0) return null; const [f] = s.files.splice(i, 1); if (s.st === "sub") logE(p, plWho(p), "Nachweis entfernt: " + f.name); save(); return f; }
export function setDate(id, d) { const p = byId(id); if (p && state.role === "PL" && (!d || /^\d{4}-\d{2}-\d{2}$/.test(d))) { p.date = d; save(); } }

// Was beim Einreichen eines Schritts anzugeben ist
export function needs(p, o) {
  const r = cp(p), g = isGate(o), hwsw = r.sp === "A" || r.sp === "B";
  return {lf: g ? lfOf(o.n) : [], rg: g && hwsw && ["G2", "G1+2", "G3", "G4"].includes(o.n), sponsor: g, kpis: g && r.sp === "C" && ["G2", "G1+2"].includes(o.n), ll: o.n === "G5", crs: g ? p.crs.filter(c => c.st === "gate") : []};
}
function markSub(p, o, note) {
  const s = stepOf(p, o.n); s.st = "sub"; s.subAt = nowIso(); s.n = (s.n || 0) + 1; delete s.rev; delete s.openPts;
  Object.assign(p, {status: "pe", stage: "ms", rec: "", note: "", next: stepLabel(o), submitted: fmtD(TODAY), subAt: s.subAt, fresh: true});
  const nc = isGate(o) ? p.crs.filter(c => c.st === "gate").length : 0;
  logE(p, plWho(p), stepLabel(o) + " eingereicht (" + s.files.length + " Dateien" + (nc ? ", " + nc + " Änderungsantrag" + (nc > 1 ? "e" : "") : "") + ")" + (p.cfgPending ? ", mit Konfigurationsänderung " + p.cfgPending.from + " → " + p.cfgPending.to : "") + (note ? ": " + note : ""));
}
export function submitStep(id, x = {}) {
  const p = byId(id); if (!p || !canSubmitStep(p)) return {error: "Einreichen ist in dieser Rolle oder diesem Status nicht möglich"};
  const o = curStep(p), nd = needs(p, o), t = v => String(v ?? "").trim(), ans = {};
  if (nd.lf.length) { ans.lf = {}; for (const q of nd.lf) { const a = t(x.lf && x.lf[q.k]); if (!a) return {error: "Bitte jede Leitfrage beantworten (Kap. 5.6)"}; ans.lf[q.k] = a.slice(0, 400); } }
  if (nd.rg) { ans.rg = {}; for (const k of ["hw", "sw", "sys"]) { const v = x.rg && x.rg[k]; if (!RG.includes(v)) return {error: "Bitte den Reifegrad für Hardware, Software und System angeben"}; ans.rg[k] = v; } }
  if (nd.sponsor) {
    const sp = t(x.sponsor) || p.sponsor; if (!sp) return {error: "Bitte den Project Sponsor angeben"};
    if (!x.sponsorOk) return {error: "Der Sponsor muss die Ressourcen für die nächste Phase bestätigt haben"};
    p.sponsor = sp.slice(0, 60); ans.sponsor = {name: p.sponsor, at: TODAY};
  }
  if (nd.kpis) { const k = t(x.kpis); if (!k) return {error: "In Spur C werden die Kennzahlen an G2 festgelegt: bitte angeben"}; p.kpis = k.slice(0, 400); ans.kpis = p.kpis; }
  if (nd.ll) { const l = t(x.ll); if (!l) return {error: "Bitte die Lessons Learned eintragen, sie gehen an die nächste Generation"}; p.ll = l.slice(0, 600); ans.ll = p.ll; }
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
  const pred = w.pred ? byId(w.pred) : null;
  if (pred) { p.pred = pred.id; pred.succ = p.id; logE(pred, plWho(p), "Folgegeneration angelegt: " + p.id); }
  logE(p, plWho(p), (r.ok ? "Vorhaben mit Konfiguration " + r.path + " angelegt" : "Als Roadmap-Eintrag ohne PEP angelegt (unter den Projektschwellen)") + (pred ? ", Folgegeneration von " + pred.id : ""));
  if (r.ok) { syncSteps(p); markSub(p, r.order[0], ""); }
  if (!state.since) state.since = Date.now();
  state.P.unshift(p); state.draft = null; save();
  return {id: p.id, msg: r.ok ? "Angelegt: " + p.id + ". Nachweise im Vorhaben ergänzen, Freigabe läuft" : "Als Roadmap-Eintrag ohne PEP angelegt"};
}

/* ---------- Änderungsanträge (Kap. 5.4, Rahmenänderungen nach 4.2.3) ---------- */
export function crRoute(kat, eur) { const k = CRK[kat]; if (!k) return null; return kat === "budget" && Number(eur) > WP_LIMIT ? "wp" : k.to; }
export function addCR(id, kat, text, eur) {
  const p = byId(id); if (!p || state.role !== "PL" || ["ki", "do", "li"].includes(p.status)) return {error: "Änderungsantrag in dieser Rolle oder diesem Status nicht möglich"};
  const t = String(text || "").trim(), to = crRoute(kat, eur); if (!to) return {error: "Bitte eine Kategorie wählen"}; if (!t) return {error: "Bitte die Änderung beschreiben"};
  if (kat === "budget" && !(Number(eur) > 0)) return {error: "Bitte den Betrag der Budgetänderung angeben"};
  const cr = {id: "CR-" + (p.crs.length + 1), kat, text: t.slice(0, 400), eur: kat === "budget" ? Math.round(Number(eur)) : null, at: TODAY, st: to};
  p.crs.push(cr); const ng = nextGate(p);
  const where = to === "backlog" ? "im Backlog der Spur, kein Gate nötig" : to === "wp" ? "Entscheidung im WP Board" : "Entscheidung am nächsten Gate" + (ng ? " (" + stepLabel(ng) + ")" : "");
  logE(p, plWho(p), "Änderungsantrag " + cr.id + " (" + CRK[kat].t + (cr.eur ? ", " + cr.eur.toLocaleString("de-DE") + " €" : "") + "): " + cr.text + ". " + where);
  save(); return {msg: cr.id + ": " + where};
}
export function decideCR(id, crid, ok, text) {
  const p = byId(id), cr = p && p.crs.find(c => c.id === crid); if (!cr || state.role !== "WP" || cr.st !== "wp") return {error: "Entscheidung in dieser Rolle nicht möglich"};
  const t = String(text || "").trim(); if (!ok && !t) return {error: "Bitte die Ablehnung begründen"};
  cr.st = ok ? "ok" : "rej"; cr.dec = "WP Board, " + fmtD(TODAY) + (t ? ": " + t : "");
  logE(p, "WP Board", "Änderungsantrag " + cr.id + (ok ? " angenommen" : " abgelehnt") + (t ? ": " + t : "")); save(); return {msg: cr.id + (ok ? " angenommen" : " abgelehnt")};
}
export const wpCRs = () => state.P.flatMap(p => p.crs.filter(c => c.st === "wp").map(c => ({p, c})));

/* ---------- Freigabe-Workflow: MS Gate Committee prüft, PGB entscheidet, WP Board bei Uneinigkeit ---------- */
export const deciderOf = p => p.stage === "wp" ? "WP" : "PPB";
export const whoOf = p => p.stage === "wp" ? "WP Board" : "PGB";
export const canDecide = p => !!p && p.status === "pe" && ((p.stage === "ppb" && state.role === "PPB") || (p.stage === "wp" && state.role === "WP"));
const decPush = (p, o, out, by) => { const s = stepOf(p, o.n); p.dec.push({k: o.n, out, by, sub: s.subAt || null, at: nowIso()}); };

// Prüfung des MS Gate Committee: Leitfragen bewerten, in Spur A und B je ein Prüfvermerk HW und SW, Regulatorik
export function recommend(id, rev = {}) {
  const p = byId(id), o = p && subStep(p); if (!p || !o || state.role !== "MS" || p.status !== "pe" || p.stage !== "ms") return {error: "Prüfung in dieser Rolle oder diesem Status nicht möglich"};
  const r = cp(p), s = stepOf(p, o.n), nd = needs(p, o), lf = rev.lf || {};
  if (!["ja", "nein", "nr"].includes(rev.reg)) return {error: "Bitte angeben, ob die regulatorischen Anforderungen erfüllt sind"};
  if (rev.reg === "nein") { // Guideline: dann lautet das Ergebnis Modify, unabhängig vom Decision Board
    s.st = "mod"; s.rev = {...rev, at: TODAY}; decPush(p, o, "modify", "Regel");
    Object.assign(p, {status: "re", stage: "ms", rec: "", next: "Überarbeiten und erneut einreichen", fresh: true, note: "Modify: regulatorische Anforderungen nicht erfüllt" + (rev.open ? " (" + String(rev.open).trim() + ")" : "") + ". Ergebnis unabhängig vom PGB."});
    logE(p, "MS Gate Committee", stepLabel(o) + ": regulatorische Anforderungen nicht erfüllt, Ergebnis Modify"); save(); return {msg: "Modify: regulatorische Anforderungen nicht erfüllt"};
  }
  if ((r.sp === "A" || r.sp === "B") && !(rev.hw && rev.sw)) return {error: "In Spur " + r.sp + " braucht die Empfehlung einen Prüfvermerk von Hardware und Software"};
  if (nd.lf.some(q => !["ok", "offen"].includes(lf[q.k]))) return {error: "Bitte jede Leitfrage bewerten"};
  const open = nd.lf.filter(q => lf[q.k] === "offen").map(q => "Leitfrage offen: " + q.q).concat(missingDelivs(p, o).map(d => "Ohne Nachweis: " + d))
    .concat(String(rev.open || "").split("\n").map(x => x.trim()).filter(Boolean));
  s.rev = {lf, hw: !!rev.hw, sw: !!rev.sw, reg: rev.reg, at: TODAY}; s.openPts = open;
  p.stage = "ppb"; p.rec = open.length ? "Empfohlen: Go mit " + open.length + " offenen Punkt" + (open.length > 1 ? "en" : "") + " (MS Gate Committee, " + fmtD(TODAY) + ")" : "Empfohlen: Go (MS Gate Committee, " + fmtD(TODAY) + ")";
  logE(p, "MS Gate Committee", stepLabel(o) + ": Prüfung abgeschlossen" + ((r.sp === "A" || r.sp === "B") ? ", Prüfvermerk HW und SW" : "") + ", Empfehlung an PGB" + (open.length ? " (Go mit offenen Punkten)" : ""));
  save(); return {msg: p.name + ": Empfehlung an PGB übergeben"};
}
export function goDecision(id, openOk) {
  const p = byId(id), o = p && subStep(p); if (!o || !canDecide(p)) return {error: "Entscheidung in dieser Rolle oder diesem Status nicht möglich"};
  const r = cp(p), s = stepOf(p, o.n), who = whoOf(p), op = s.openPts || [];
  if (op.length && !openOk) return {error: "Go mit offenen Punkten braucht die ausdrückliche Zustimmung"};
  s.st = "ok"; s.decided = nowIso(); decPush(p, o, op.length ? "go-op" : "go", who);
  if (o.n === "G1") p.appr.spur = true; else if (o.n === "G2" || o.n === "G1+2") { p.appr.spur = true; p.appr.stufe = true; }
  let fx = "";
  if (!p.rx) { p.rx = RW.freeze(); p.fix = {ver: p.rx.ver, at: TODAY, path: r.path, order: r.order.map(x => x.n)}; fx = ", Konfiguration " + r.path + " mit Regelwerk v" + p.rx.ver + " festgeschrieben"; }
  if (op.length) op.forEach(t => p.open.push({k: o.n, t, at: TODAY}));
  let crx = ""; if (isGate(o)) { const L = p.crs.filter(c => c.st === "gate"); L.forEach(c => { c.st = "ok"; c.dec = who + " an " + o.n + ", " + fmtD(TODAY); }); if (L.length) crx = ", " + L.length + " Änderungsantrag" + (L.length > 1 ? "e" : "") + " angenommen"; }
  const had = p.cfgPending; delete p.cfgPending;
  p.last = stepLabel(o); const nx = curStep(p); p.next = nx ? stepLabel(nx) : "–"; p.date = "";
  p.status = nx ? "on" : "do"; p.stage = "ms"; p.rec = ""; p.note = ""; p.fresh = true;
  logE(p, who, (op.length ? "Go mit offenen Punkten: " : "Go: ") + stepLabel(o) + " freigegeben" + (o.n === "G1" ? " (Spur " + r.sp + ")" : "") + (had ? ", Konfigurationsänderung " + had.from + " → " + had.to + " freigegeben" : "") + crx + fx);
  save(); return {msg: p.name + ": " + stepLabel(o) + " freigegeben" + (nx ? "" : ", Vorhaben abgeschlossen")};
}
export const REASONS = {
  ret: {t: "Zurück an die Projektleitung", role: "MS", st: "re", ss: "mod", log: "Zurück an PL", txt: "Was fehlt oder ist unklar?", next: "Überarbeiten und erneut einreichen", ok: "Zurücksenden", hint: "Die Projektleitung sieht den Kommentar im Vorhaben."},
  modify: {t: "Modify: Nachbesserung", role: "D", st: "re", ss: "mod", log: "Modify", txt: "", next: "Überarbeiten und erneut einreichen", ok: "Modify entscheiden", hint: "Die Projektleitung bessert nach und reicht erneut ein."},
  hold: {t: "Hold: Vorhaben pausieren", role: "D", st: "ho", ss: "hold", log: "Hold", txt: "", next: "Hold, Wiederaufnahme durch PGB", ok: "Hold entscheiden", hint: "Das PGB kann den Hold später aufheben."},
  kill: {t: "Kill: Vorhaben abbrechen", role: "D", st: "ki", ss: "kill", log: "Kill", txt: "", next: "abgebrochen", ok: "Kill entscheiden", hint: "Das Vorhaben wird beendet."},
  wp: {t: "An das WP Board: Uneinigkeit im PGB", role: "PGB", log: "An WP Board", txt: "Worin ist sich das PGB uneinig?", ok: "An WP Board geben", hint: "Bei Uneinigkeit im PGB entscheidet das WP Board (Guideline)."}
};
export function reason(id, k, text) {
  const p = byId(id), c = REASONS[k], t = (text || "").trim(), o = p && subStep(p);
  if (!p || !c || !o) return {error: "Aktion nicht möglich"};
  const okRole = c.role === "MS" ? state.role === "MS" && p.status === "pe" && p.stage === "ms" : c.role === "PGB" ? state.role === "PPB" && p.status === "pe" && p.stage === "ppb" : canDecide(p);
  if (!okRole) return {error: "Aktion in dieser Rolle oder diesem Status nicht möglich"};
  if (!t) return {error: "Bitte eine Begründung eingeben"};
  if (k === "wp") { p.stage = "wp"; p.rec = (p.rec ? p.rec + " · " : "") + "PGB uneinig: " + t; p.fresh = true; logE(p, "PGB", stepLabel(o) + ", Uneinigkeit, an WP Board: " + t); save(); return {msg: p.name + ": an WP Board übergeben"}; }
  const who = c.role === "MS" ? "MS Gate Committee" : whoOf(p);
  if (c.role !== "MS") decPush(p, o, k, who);
  stepOf(p, o.n).st = c.ss; p.status = c.st; p.note = who + " " + c.log + ": " + t; p.next = c.next; p.stage = "ms"; p.rec = ""; p.fresh = true; logE(p, who, stepLabel(o) + ", " + c.log + ": " + t); save();
  return {msg: c.log + ": " + p.name};
}
export function resume(id) {
  const p = byId(id); if (!p || state.role !== "PPB" || p.status !== "ho") return null;
  const o = r2(p); if (o) stepOf(p, o.n).st = "sub";
  p.status = "pe"; p.stage = "ppb"; p.note = ""; p.fresh = true; logE(p, "PGB", "Hold aufgehoben, erneute Entscheidung"); save(); return "Hold aufgehoben: " + p.name;
}
function r2(p) { const r = cp(p); return r.ok ? r.order.find(o => stepOf(p, o.n).st === "hold") || null : null; }
export function setRole(r) { if (hasK(ROLES, r)) { state.role = r; save(); } }
export function setTheme(t) { if (["dark", "light", "auto"].includes(t)) { state.theme = t; save(); } }
export function queue() { return state.P.filter(p => p.status === "pe"); }
export const mine = role => { const q = queue(); return role === "MS" ? q.filter(p => p.stage === "ms") : role === "PPB" ? q.filter(p => p.stage === "ppb") : role === "WP" ? q.filter(p => p.stage === "wp") : []; };
// Aufgaben je Rolle inklusive Regelwerk-Freigabe (PGB) und Rahmenänderungen (WP Board)
export const todo = role => mine(role).length + (role === "PPB" && RW.draft() && RW.draft().pending ? 1 : 0) + (role === "WP" ? wpCRs().length : 0) + (role === "PG" && RW.draft() && RW.draft().rej ? 1 : 0);

// Wirkung der Gates (Cooper 2008: Gates ohne Wirkung; K1: zeitnah): Quoten und Tage bis zur Entscheidung
export function gateStats() {
  const D = state.P.flatMap(p => p.dec || []).filter(d => ["PGB", "WP Board", "Regel"].includes(d.by)), n = D.length, c = k => D.filter(d => d.out === k).length;
  const days = D.filter(d => d.sub && d.at).map(d => Math.max(0, (Date.parse(d.at) - Date.parse(d.sub)) / 864e5)).sort((a, b) => a - b);
  const med = days.length ? (days.length % 2 ? days[(days.length - 1) / 2] : (days[days.length / 2 - 1] + days[days.length / 2]) / 2) : null;
  return {n, go: c("go"), goOp: c("go-op"), modify: c("modify"), hold: c("hold"), kill: c("kill"), med, avg: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null, wp: D.filter(d => d.by === "WP Board").length};
}

/* ---------- Beispielvorhaben (fiktiv, nur auf Wunsch geladen und als Beispiel gekennzeichnet) ---------- */
const iso = d => { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString(); };
const dat = d => { const x = new Date(TODAY + "T12:00:00"); x.setDate(x.getDate() + d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
const TS_A = [["Gehäuse", "HW", "n"], ["Hauptplatine", "HW", "n"], ["Netzteil", "HW", "u"], ["Firmware", "SW", "n"], ["Bedienoberfläche", "SW", "a"]];
const DEMO = [
  {n: "Diagnosegerät Alpha", pc: 0, pl: "Muster, A.", q: [1, 1, 1], hw: 80, sw: 60, opt: {o1: 1}, done: 3, st: "on", date: 21, files: 4, ts: TS_A, crs: [["sys", "Zusätzliche Schnittstelle CAN FD in den Systemanforderungen", 0]]},
  {n: "Messmodul Bravo", pc: 1, pl: "Beispiel, B.", q: [1, 1, 1], hw: 70, sw: 40, opt: {}, done: 1, st: "pe", stage: "ms", wait: 3, files: 3},
  {n: "Kalibrier-Tool Charlie", pc: 1, pl: "Muster, C.", q: [1, 1, 0], hw: 30, sw: 50, opt: {}, done: 2, st: "off", date: -12, files: 2, crs: [["backlog", "Exportformat für Messprotokolle ergänzen", 0]]},
  {n: "App-Update Delta", pc: 2, pl: "Beispiel, D.", q: [0, 1, 1], hw: 0, sw: 75, opt: {o1: 1}, done: 2, st: "pe", stage: "ppb", wait: 6, files: 3, open: ["Pilotbericht: Rückmeldung von zwei Pilotkunden steht noch aus"]},
  {n: "Schnittstelle Echo", pc: 0, pl: "Muster, E.", q: [1, 0, 1], hw: 0, sw: 15, opt: {}, done: 0, st: "pe", stage: "ms", wait: 1, files: 1},
  {n: "Datenportal Foxtrot", pc: 2, pl: "Beispiel, F.", q: [0, 1, 1], hw: 0, sw: 40, opt: {}, done: 1, st: "bl", date: -5, files: 0, note: "Wartet auf Freigabe der Schnittstellenspezifikation"},
  {n: "Sensorik Golf", pc: 1, pl: "Muster, G.", q: [1, 1, 0], hw: 45, sw: 30, opt: {}, done: 1, st: "re", files: 2, note: "MS Gate Committee Zurück an PL: Risikoanalyse ist unvollständig"},
  {n: "Update-Service Hotel", pc: 2, pl: "Beispiel, H.", q: [0, 1, 1], hw: 0, sw: 10, opt: {}, done: 0, st: "ho", files: 0, note: "PGB Hold: Priorität neu bewerten"},
  {n: "Adapter India", pc: 0, pl: "Muster, I.", q: [1, 1, 1], hw: 90, sw: 20, opt: {}, done: 2, st: "ki", files: 1, note: "PGB Kill: Markt entfällt"},
  {n: "Cloud-Backend Juliett", pc: 2, pl: "Beispiel, J.", q: [0, 1, 1], hw: 0, sw: 65, opt: {}, done: 99, st: "do", files: 5, ll: "Kennzahlen früher mit dem Vertrieb abstimmen; Pilotkunden schon in der Konzeptphase einbinden."},
  {n: "Zubehör Kilo", pc: 0, pl: "Muster, K.", q: [1, 0, 0], hw: 0, sw: 8, opt: {}, done: 0, st: "li", files: 0, thr: [1, 0, 0]},
  {n: "Gerät Lima", pc: 1, pl: "Beispiel, L.", q: [1, 1, 0], hw: 70, sw: 40, opt: {}, done: 4, st: "on", date: 9, files: 6, goOp: ["Ohne Nachweis: Design Verification Plan (bis G4 nachreichen)"]},
  {n: "Plattform Mike", pc: 2, pl: "Muster, M.", q: [0, 1, 1], hw: 0, sw: 35, opt: {}, done: 1, st: "on", date: 40, files: 1, crs: [["lt", "Liefertermin verschiebt sich um ein Quartal wegen Lieferantenwechsel", 0], ["budget", "Mehraufwand Lizenzen und Hosting", 65000]]},
  {n: "Diagnoseupdate November", pc: 0, pl: "Beispiel, N.", q: [1, 0, 1], hw: 0, sw: 45, opt: {}, done: 1, st: "pe", stage: "wp", wait: 12, files: 2, wpWhy: "Priorität gegenüber dem Gerät Lima strittig"}
];
const DO = {go: "Go", "go-op": "Go mit offenen Punkten", modify: "Modify", hold: "Hold", kill: "Kill"};
export const decLabel = k => DO[k] || k;
export const hasDemo = () => state.P.some(p => p.ex);
export function removeDemo() { const n = state.P.filter(p => p.ex).length; state.P = state.P.filter(p => !p.ex); save(); return n; }
export async function loadDemo() {
  if (state.role !== "PL") state.role = "PL";
  removeDemo();
  let seq = 1;
  for (const d of DEMO) {
    const c = emptyC(); Object.assign(c, {q: [...d.q], hw: d.hw, sw: d.sw, opt: {...d.opt}}); if (d.thr) c.thr = [...d.thr]; if (d.ts) c.ts = d.ts.map(([n, dm, s]) => ({n, d: dm, s}));
    guardSpur({c}); const r = compute(c);
    const p = {id: "B-" + String(seq++).padStart(2, "0"), name: "Beispiel: " + d.n, pc: PCS[d.pc], pl: d.pl, sponsor: "Sponsor, " + d.pl.slice(-2), po: "Owner, " + d.pl.slice(-2), ref: "", desc: "Fiktives Beispielvorhaben zur Vorführung", c, ex: true, status: d.st, last: "–", next: "–", date: d.date !== undefined ? dat(d.date) : "", note: d.note || "",
      mine: false, fresh: false, appr: {spur: false, stufe: false}, steps: {}, stage: d.stage || "ms", rec: "", ver: 1, versions: [{ver: 1, date: fmtD(TODAY), path: r.path}], log: [], dec: [], crs: [], open: []};
    const lg = (ago, who, x) => { const t = new Date(TODAY + "T12:00:00"); t.setDate(t.getDate() - ago); p.log.push({t: fmtD(t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0")), who, x}); };
    lg(60, plWho(p), "Vorhaben mit Konfiguration " + r.path + " angelegt");
    if (!r.ok) { p.note = "unter den Projektschwellen"; p.next = "–"; state.P.push(p); continue; }
    const ord = r.order, nDone = Math.min(d.done, ord.length), ans = o => { const nd = needs(p, o), a = {}; if (nd.lf.length) { a.lf = {}; nd.lf.forEach(q => a.lf[q.k] = "Beispielantwort zur Vorführung"); } if (nd.rg) a.rg = {hw: "teilweise", sw: "erreicht", sys: "teilweise"}; if (nd.sponsor) a.sponsor = {name: p.sponsor, at: TODAY}; return a; };
    ord.forEach((o, i) => { if (i >= nDone) return; const s = stepOf(p, o.n), sub = iso(55 - i * 8), at = iso(50 - i * 8 - (i % 3)); s.st = "ok"; s.decided = at; s.subAt = sub; s.n = 1; s.ans = ans(o);
      if (o.n === "G1" || o.n === "G1+2") p.appr.spur = true; if (o.n === "G2" || o.n === "G1+2") { p.appr.spur = true; p.appr.stufe = true; }
      const op = d.goOp && i === nDone - 1 ? d.goOp : null; p.dec.push({k: o.n, out: op ? "go-op" : "go", by: "PGB", sub, at});
      if (op) op.forEach(t => p.open.push({k: o.n, t, at: TODAY}));
      lg(50 - i * 8, "PGB", (op ? "Go mit offenen Punkten: " : "Go: ") + stepLabel(o) + " freigegeben" + (i === 0 ? ", Konfiguration " + r.path + " mit Regelwerk v" + RW.rules().ver + " festgeschrieben" : "")); });
    if (nDone) { p.rx = RW.freeze(); p.fix = {ver: p.rx.ver, at: TODAY, path: r.path, order: ord.map(x => x.n)}; }
    if (d.ll) p.ll = d.ll; if (r.sp === "C" && nDone >= 2) p.kpis = "Aktive Nutzer pro Monat, Abbruchquote, Ticketzahl je Release";
    const cs = ord[nDone] || null;
    p.last = nDone ? stepLabel(ord[nDone - 1]) : "–"; p.next = cs ? stepLabel(cs) : "–";
    if (d.st === "pe" && cs) {
      const s = stepOf(p, cs.n); s.st = "sub"; s.subAt = iso(d.wait); s.n = 1; s.ans = ans(cs); p.subAt = s.subAt; p.submitted = fmtD(dat(-d.wait)); p.date = "";
      lg(d.wait, plWho(p), stepLabel(cs) + " eingereicht");
      if (p.stage !== "ms") { s.openPts = d.open || []; s.rev = {lf: {}, hw: true, sw: true, reg: "ja", at: dat(-Math.max(0, d.wait - 2))}; needs(p, cs).lf.forEach(q => s.rev.lf[q.k] = "ok");
        p.rec = (s.openPts.length ? "Empfohlen: Go mit " + s.openPts.length + " offenen Punkt" : "Empfohlen: Go") + " (MS Gate Committee, " + fmtD(dat(-Math.max(0, d.wait - 2))) + ")";
        lg(Math.max(0, d.wait - 2), "MS Gate Committee", stepLabel(cs) + ": Prüfung abgeschlossen, Empfehlung an PGB"); }
      if (p.stage === "wp") { p.rec += " · PGB uneinig: " + d.wpWhy; lg(Math.max(0, d.wait - 5), "PGB", stepLabel(cs) + ", Uneinigkeit, an WP Board: " + d.wpWhy); }
    }
    if (d.st === "re" && cs) { stepOf(p, cs.n).st = "mod"; lg(4, "MS Gate Committee", stepLabel(cs) + ", Zurück an PL: " + d.note.replace(/^.*?: /, "")); }
    if (d.st === "ho" && cs) { const s = stepOf(p, cs.n); s.st = "hold"; s.subAt = iso(14); p.dec.push({k: cs.n, out: "hold", by: "PGB", sub: iso(14), at: iso(8)}); lg(8, "PGB", stepLabel(cs) + ", Hold: " + d.note.replace(/^.*?: /, "")); }
    if (d.st === "ki" && cs) { const s = stepOf(p, cs.n); s.st = "kill"; s.subAt = iso(15); p.dec.push({k: cs.n, out: "kill", by: "PGB", sub: iso(15), at: iso(10)}); p.next = "abgebrochen"; lg(10, "PGB", stepLabel(cs) + ", Kill: " + d.note.replace(/^.*?: /, "")); }
    if (d.st === "do") { p.status = "do"; p.next = "–"; p.date = ""; }
    (d.crs || []).forEach(([kat, text, eur], j) => { const to = crRoute(kat, eur); p.crs.push({id: "CR-" + (j + 1), kat, text, eur: eur || null, at: dat(-6 + j), st: to}); lg(6 - j, plWho(p), "Änderungsantrag CR-" + (j + 1) + ": " + text); });
    // Nachweis-Dateien (kleine Textdateien im Browser-Speicher), verteilt auf erledigte und laufende Schritte
    const hold = ord.slice(0, Math.min(ord.length, nDone + 1));
    for (let k = 0; k < d.files && hold.length; k++) {
      const o = hold[k % hold.length], dv = stepDelivs(r, o), name = (dv[k % Math.max(1, dv.length)] || "Nachweis").replace(/[^\wäöüÄÖÜß\- ]/g, "").trim().replace(/ +/g, "_") + "_" + (k + 1) + ".txt";
      const blob = new Blob(["Beispiel-Nachweis für " + p.name + "\nSchritt: " + stepLabel(o) + "\nFiktiv, nur für die Vorführung.\n"], {type: "text/plain"}), fid = "demo-" + p.id + "-" + k;
      try { const sha = await sha256(blob); await putFile(fid, blob); stepOf(p, o.n).files.push({id: fid, name, size: blob.size, type: "text/plain", at: iso(20 - k), dv: dv.length ? dv[k % dv.length] : "", sha}); } catch (e) { /* Speicher gesperrt: Beispiel ohne Datei */ }
    }
    state.P.push(p);
  }
  if (!state.since) state.since = Date.now();
  state.seq = Math.max(state.seq, 1); norm(); save(); return state.P.filter(p => p.ex).length;
}

/* ---------- Daten ---------- */
export function resetAll() { state.P = []; state.seq = 1; state.role = "PL"; state.draft = null; state.since = 0; state.lastBackup = 0; norm(); save(); }
export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || !validP(s.P)) throw new Error("format");
  state.P = s.P; state.seq = Number.isFinite(s.seq) ? s.seq : state.seq; state.draft = null; norm(); save(); if (s.rules) { try { RW.restoreActive(s.rules); } catch (e) { /* Regelwerk ungültig, Vorhaben trotzdem importiert */ } } return state.P.length;
}
export const exportJSON = () => JSON.stringify({version: 3, P: state.P, seq: state.seq, rules: RW.rules(), rulesDraft: RW.draft()}, null, 2);
function cell(v) { v = String(v ?? ""); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
export function csvRoadmap(list) {
  const hd = ["ID", "Vorhaben", "Product Center", "Projektleitung", "Project Sponsor", "Product Owner", "zugeordneter PEP-Pfad", "Reviews", "zuletzt freigegebener Meilenstein", "nächster geplanter Meilenstein", "Termin", "Status", "Änderungskommentar", "Konfigurationsversion", "Regelwerk-Version", "Schritte erledigt", "Schritte gesamt", "Nachweis-Dateien", "Offene Punkte", "Offene Änderungsanträge"];
  const rows = list.map(p => { const r = cp(p); return [p.id, p.name, p.pc, p.pl, p.sponsor, p.po, r.path, r.ok ? r.n : "", p.last, p.next, p.date || "", STATUS[p.status][0], p.note || "", p.ver || 1, p.rx ? "v" + p.rx.ver + " (festgeschrieben)" : "v" + RW.rules().ver + " (aktuell)", progress(p).done, progress(p).total, Object.values(p.steps || {}).reduce((a, x) => a + x.files.length, 0), p.open.length, p.crs.filter(c => ["gate", "wp"].includes(c.st)).length]; });
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
    konfigurationsversion: p.ver || 1, kennzahlen: p.kpis || null, lessonsLearned: p.ll || null,
    offenePunkte: p.open, aenderungsantraege: p.crs, entscheidungen: p.dec,
    schritte: r.ok ? r.order.map(o => { const x = stepOf(p, o.n); return {schritt: stepLabel(o), status: x.st, eingereicht: x.subAt || null, entschieden: x.decided || null, angaben: x.ans || null, pruefung: x.rev || null, offenePunkte: x.openPts || [], nachweise: x.files.map(f => ({name: f.name, liefergegenstand: f.dv || null, groesse: f.size, sha256: f.sha, hinzugefuegt: f.at}))}; }) : [],
    verlauf: p.log, datenstand: TODAY, hinweis: "Gate-Kürzel G1 bis G5 nach Studienarbeit; Abgleich mit dem Gate-Schema des Renew PEP offen."};
}
