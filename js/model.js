// Konfigurationslogik (Studienarbeit, Kap. 5.7). Keine DOM-Zugriffe, daher einzeln testbar.
import {PH} from "./data.js";
import {rules, mods, procOf, gateItems} from "./rules.js";

export function compute(c) {
  const ok = c.thr.every(Boolean), MODS = mods(), TH = rules().thr;
  const sp = !c.q[0] ? "C" : (!c.q[1] ? "B" : (c.q[2] ? "A" : "B"));
  const hc = !!(c.q[0] && c.q[1]);
  const v = hc ? Math.max(c.hw, c.sw) : c.sw; // Annahme: bei Hardwareänderung zählt der höhere Anteil
  const st = v >= TH.full ? "Full" : v <= TH.light ? "Light" : "Standard";
  const avail = m => {
    if (m.id === "r1") return st !== "Full";
    if (["s1", "s2", "s3"].includes(m.id)) return sp === "A" || (sp === "B" && hc);
    if (m.id === "s4") return sp === "A";
    return true;
  };
  const defOn = m => m.ty !== "spur" ? false : (m.id === "s5" ? sp !== "A" : avail(m));
  const isOn = m => {
    if (!avail(m)) return false;
    if (m.ty === "stufe") return true;
    if (m.ty === "spur") return (c.sel && c.sel[m.id] !== undefined) ? c.sel[m.id] : defOn(m);
    return !!(c.opt && c.opt[m.id]);
  };
  const light = st === "Light";
  const gates = [];
  if (!light) gates.push({n: "G1", t: "Ideenfreigabe", x: 1});
  gates.push({n: light ? "G1+2" : "G2", t: light ? "Startfreigabe" : "Konzeptfreigabe", x: 2});
  if ((sp === "A" && !light) || (sp === "B" && st === "Full")) gates.push({n: "G3", t: "Entwicklungsreview", x: 3});
  gates.push({n: "G4", t: "Produktfreigabe", x: 4}, {n: "G5", t: "Projektabschluss", x: 5});
  const on = MODS.filter(isOn);
  const ab = MODS.filter(m => m.ty === "spur" && avail(m) && defOn(m) && !isOn(m));
  const rv = on.filter(m => m.rv).map(m => ({n: m.rv.n, t: m.t, x: m.ph + m.rv.p, r: m.rv.r, rv: 1, mid: m.id}));
  const order = [...gates, ...rv].sort((a, b) => a.x - b.x);
  return {ok, sp, hc, st, proc: procOf(sp, hc), light, avail, defOn, isOn, gates, rv, order, on, ab, n: ok ? order.length : 0, path: ok ? sp + "-" + st : "ohne PEP"};
}
// Liefergegenstände eines Schritts: bei Gates die der Phase, bei Review-Meilensteinen der Baustein, der den Review auslöst
export function stepDelivs(r, o) {
  if (o.mid) { const b = mods().find(x => x.id === o.mid); return b ? [b.d] : []; }
  const d = delivs(r)[phaseOf(o)]; return d && !d.gone ? d.items.map(i => i.t) : [];
}
export const phaseOf = o => Math.min(4, Math.max(0, Math.ceil(o.x) - 1));

// Liefergegenstände je Phase: Regelwerk (Gate, Prozess, Stufe) plus gewählte Bausteine
const PG = ["G1", "G2", "G3", "G4", "G5"];
export function delivs(r) {
  return PH.map((t, i) => {
    if (r.light && i === 0) return {t, gone: true, items: []};
    const has = r.gates.some(g => g.n === PG[i] || (i === 1 && g.n === "G1+2"));
    const key = r.light && i === 1 ? "G1+2" : PG[i];
    const items = (has ? gateItems(key, r.proc, r.st) : []).map(x => ({t: x.t, bs: false, kat: x.kat}))
      .concat(r.on.filter(m => m.ph === i).map(m => ({t: m.d, bs: true, kat: "D"})));
    return {t, gone: false, items};
  });
}
export const scopeOf = (p, r) => r.light ? "G1+2: Spur, Stufe und Bausteine" : (!p.appr.spur ? "G1: Spur" : "G2: Stufe und Bausteine");
export const fmtD = d => d ? d.split("-").reverse().join(".") : "–";
