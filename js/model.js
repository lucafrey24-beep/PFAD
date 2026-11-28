// Konfigurationslogik (Studienarbeit, Kap. 5.7). Keine DOM-Zugriffe, daher einzeln testbar.
// Jede Berechnung kann ein festgeschriebenes Regelwerk bekommen (rr): Vorhaben nach dem ersten Go rechnen mit ihrer Fassung.
import {PH} from "./data.js";
import {rules, mods, gateItems, asRules} from "./rules.js";

// Neuentwicklungsanteil: aus der Teilsystemliste (angepasst oder neu = Gestalt- oder Prinzipvariation), sonst Schätzwert
export function shares(c) {
  const L = Array.isArray(c.ts) ? c.ts : [], f = d => { const x = L.filter(t => t.d === d); return x.length ? Math.round(x.filter(t => t.s !== "u").length / x.length * 100) : null; };
  const h = f("HW"), s = f("SW");
  return {hw: h ?? c.hw, sw: s ?? c.sw, hwList: h !== null, swList: s !== null};
}
export function compute(c, rr0) {
  const rr = asRules(rr0), ok = c.thr.every(Boolean), MODS = mods(rr), TH = rr.thr, sh = shares(c);
  // Spur: drei Fragen ergeben den Vorschlag (pk); eine Abweichung (c.ov) gilt nur mit Begründung (Prüfung im Assistenten)
  const q = c.q || [], has = v => v === 0 || v === 1 || v === true || v === false;
  const qok = has(q[0]) && (!q[0] || (has(q[1]) && (!q[1] || has(q[2]))));
  const pk = !q[0] ? "C" : (!q[1] ? "B" : (q[2] ? "A" : "Bh"));
  const ov = c.ov && ["A", "Bh", "B", "C"].includes(c.ov.k) && c.ov.k !== pk ? c.ov.k : null;
  const key0 = ov || pk, sp = key0 === "Bh" ? "B" : key0, hc = key0 === "A" || key0 === "Bh";
  const v = hc ? Math.max(sh.hw, sh.sw) : sh.sw; // Annahme: bei Hardwareänderung zählt der höhere Anteil
  const st0 = v >= TH.full ? "Full" : v <= TH.light ? "Light" : "Standard";
  const risk = Array.isArray(c.risk) && c.risk.some(Boolean); // Risiko-Korrektur: eine Stufe höher, nie niedriger
  const st = risk ? (st0 === "Light" ? "Standard" : "Full") : st0;
  const key = key0;
  // Wirksamer Typ eines Bausteins in dieser Spur: stufe, pflicht, spur (vorgeschlagen), opt oder na
  const ty = m => m.ty === "stufe" ? "stufe" : ({p: "pflicht", v: "spur", o: "opt"}[(m.pf && m.pf[key]) || "-"] || "na");
  const avail = m => m.ty === "stufe" ? st !== "Full" : ty(m) !== "na";
  const defOn = m => ["pflicht", "spur"].includes(ty(m));
  const isOn = m => {
    if (!avail(m)) return false;
    const t = ty(m), sel = c.sel && c.sel[m.id] !== undefined ? !!c.sel[m.id] : undefined;
    if (t === "stufe" || t === "pflicht") return true;
    if (t === "spur") return sel !== undefined ? sel : true;
    return sel !== undefined ? sel : !!(c.opt && c.opt[m.id]);
  };
  const light = st === "Light";
  const gates = [];
  if (!light) gates.push({n: "G1", t: "Ideenfreigabe", x: 1});
  gates.push({n: light ? "G1+2" : "G2", t: light ? "Startfreigabe" : "Konzeptfreigabe", x: 2});
  if ((sp === "A" && !light) || (sp === "B" && st === "Full")) gates.push({n: "G3", t: "Entwicklungsreview", x: 3});
  gates.push({n: "G4", t: "Produktfreigabe", x: 4}, {n: "G5", t: "Projektabschluss", x: 5});
  const on = MODS.filter(isOn);
  const ab = MODS.filter(m => ty(m) === "spur" && !isOn(m));
  const rv = on.filter(m => m.rv).map(m => ({n: m.rv.n, t: m.t, x: m.ph + m.rv.p, r: m.rv.r, rv: 1, mid: m.id}));
  const order = [...gates, ...rv].sort((a, b) => a.x - b.x);
  return {ok, qok, pk, ov, ovWhy: ov ? String(c.ov.why || "").trim() : "", sp, hc, st, st0, risk, key, ty, sh, light, avail, defOn, isOn, gates, rv, order, on, ab, rr, ver: rr.ver, n: ok && qok ? order.length : 0, path: !ok ? "ohne PEP" : !qok ? "Spur offen" : sp + "-" + st};
}
export const phaseOf = o => Math.min(4, Math.max(0, Math.ceil(o.x) - 1));

// Liefergegenstände je Phase: Regelwerk (Gate der Phase, Spur, Stufe) plus gewählte Bausteine.
// Gilt in jeder Phase, auch wenn die Phase kein eigenes Gate hat (dann prüft sie das nächste Gate).
const PG = ["G1", "G2", "G3", "G4", "G5"];
export function delivs(r) {
  return PH.map((t, i) => {
    if (r.light && i === 0) return {t, gone: true, items: []};
    const key = r.light && i === 1 ? "G1+2" : PG[i];
    const items = gateItems(key, r.sp, r.st, r.rr).map(x => ({t: x.t, bs: false, kat: x.kat, kern: x.kern, lf: x.lf, wv: x.wv}))
      .concat(r.on.filter(m => m.ph === i || (r.light && i === 1 && m.ph === 0)).map(m => ({t: m.d, bs: true, kat: "D", kern: false})));
    return {t, gone: false, items};
  });
}
// Liefergegenstände eines Schritts: Gate = alle Phasen seit dem letzten Gate; Review-Meilenstein = Baustein, der ihn auslöst
export function stepDelivs(r, o) {
  if (o.mid) { const b = mods(r.rr).find(x => x.id === o.mid); return b ? [b.d] : []; }
  const D = delivs(r), g = r.gates.findIndex(x => x.n === o.n), prev = g > 0 ? phaseOf(r.gates[g - 1]) : -1;
  const out = []; for (let i = prev + 1; i <= phaseOf(o); i++) if (!D[i].gone) D[i].items.forEach(x => { if (!out.includes(x.t)) out.push(x.t); });
  return out;
}
export const scopeOf = (p, r) => r.light ? "G1+2: Spur, Stufe und Bausteine" : (!p.appr.spur ? "G1: Spur" : "G2: Stufe und Bausteine");
export const fmtD = d => d ? d.split("-").reverse().join(".") : "–";
export {rules};
