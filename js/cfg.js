// Konfigurator-Ansicht nach dem Vorbild eines Autokonfigurators:
// Zusammenfassungszeile (wie der Fahrzeugpreis), Pfad-Bühne (wie das Fahrzeugbild) und Auswahlkarten,
// die vorab zeigen, was eine Wahl am Pfad ändert (z. B. "+1 Gate", "+2 Liefergegenstände").
// Keine DOM-Zugriffe, nur HTML-Bausteine und Berechnungen.
import {PH} from "./data.js";
import {compute, delivs, phaseOf} from "./model.js";
import {rules} from "./rules.js";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const clone = c => JSON.parse(JSON.stringify(c));
// Regelwerk, mit dem der Konfigurator rechnet: beim Bearbeiten eines laufenden Vorhabens dessen festgeschriebene Fassung
let RR = null;
export const useRules = r => { RR = r || null; };
const cmp = c => compute(c, RR || undefined);
export const ctxRules = () => RR || rules();

// Kennzahlen einer Konfiguration
export function sumOf(c) {
  const r = cmp(c);
  if (!r.ok) return {r, ok: false, gates: 0, rv: 0, dv: 0, path: r.path, marks: [], per: [0, 0, 0, 0, 0], sig: "none"};
  const D = delivs(r), per = D.map(x => x.gone ? 0 : x.items.length);
  const marks = r.order.map(o => "S:" + o.n).concat(r.on.map(m => "M:" + m.id));
  return {r, ok: true, D, per, gates: r.gates.length, rv: r.rv.length, dv: per.reduce((a, b) => a + b, 0), path: r.path, marks,
    sig: r.path + "|" + marks.join(",") + "|" + per.join(",")};
}

// Unterschied zweier Konfigurationen als Hinweise ("+1 Gate")
export function diff(a, b) {
  const out = [];
  if (a.ok !== b.ok) out.push({v: b.ok ? 1 : -1, t: b.ok ? "PEP-pflichtig" : "ohne PEP"});
  const d = (n, one, many) => { if (n) out.push({v: n, t: (n > 0 ? "+" : "−") + Math.abs(n) + " " + (Math.abs(n) === 1 ? one : many)}); };
  d(b.gates - a.gates, "Gate", "Gates");
  d(b.rv - a.rv, "Review", "Reviews");
  d(b.dv - a.dv, "Liefergegenstand", "Liefergegenstände");
  return out;
}
export const newMarks = (a, b) => {
  const s = new Set(b.marks.filter(k => !a.marks.includes(k)));
  b.per.forEach((n, i) => { if (n > (a.per[i] || 0)) s.add("D" + i); });
  return s;
};
export const chips = (list, empty) => list.length
  ? list.map(x => '<span class="dl ' + (x.v > 0 ? "up" : "dn") + '">' + esc(x.t) + "</span>").join("")
  : (empty ? '<span class="dl nc">' + esc(empty) + "</span>" : "");

// Varianten, die eine Karte durchspielt
export const SPUREN = [
  {k: "A", q: [1, 1, 1], t: "Spur A", n: "Device with Software", hw: "wird entwickelt und führt", takt: "Muster, Design Freeze, Serienanlauf"},
  {k: "Bh", q: [1, 1, 0], t: "Spur B", n: "Software on Device, mit Hardware", hw: "wird mitentwickelt", takt: "Sprints plus Muster und Abgleichpunkte"},
  {k: "B", q: [1, 0, 1], t: "Spur B", n: "Software on Device, ohne Hardware", hw: "bestehendes Gerät", takt: "Sprints, Abgleichpunkte, Release-Management"},
  {k: "C", q: [0, 1, 1], t: "Spur C", n: "Software & Data", hw: "kein eigenes Gerät", takt: "Sprints, laufende Releases, Kennzahlen"}
];
export const spurKey = r => r.sp === "B" ? (r.hc ? "Bh" : "B") : r.sp;
// Spurkarte wählen: Vorschlag aus den drei Fragen übernehmen oder abweichend wählen (dann Begründung Pflicht)
export function withSpur(c, s) { const x = clone(c), r0 = cmp(c), k0 = spurKey(r0); if (s.k === r0.pk) delete x.ov; else x.ov = {k: s.k, why: (c.ov && c.ov.why) || ""}; if (spurKey(cmp(x)) !== k0) x.sel = {}; return x; }
export function stufeValue(st) { const T = ctxRules().thr; return st === "Light" ? Math.max(0, T.light - 5) : st === "Full" ? Math.min(100, T.full + 15) : Math.round((T.light + T.full) / 2); }
export function withStufe(c, st) { const x = clone(c), v = stufeValue(st); x.sw = v; if (cmp(c).hc) x.hw = v; return x; }
export function withMod(c, m, on) { const x = clone(c); x.sel = x.sel || {}; x.sel[m.id] = on; return x; }
export function withPreset(c, p) { const x = clone(c); Object.assign(x, {thr: [1, 1, 1], q: [...p.q], hw: p.hw, sw: p.sw, opt: {...p.opt}, sel: {}, ts: [], risk: [0, 0, 0]}); return x; }

// Zusammenfassungszeile oben (entspricht Fahrzeugpreis und Leasingrate)
export function bar(s, delta, fresh, next) {
  const k = (l, v) => '<div class="cb-k"><span class="lab">' + l + '</span><b class="num">' + v + "</b></div>";
  return '<div class="cbar" role="status" aria-live="polite">' +
    '<div class="cb-k cb-path"><span class="lab">Pfad</span><b>' + esc(s.path) + "</b></div>" +
    k("Gates", s.gates) + k("Reviews", s.rv) + k("Liefergegenstände", s.dv) +
    '<div class="cb-d' + (fresh ? " fresh" : "") + '">' + chips(delta || []) + "</div>" + next + "</div>";
}

// Pfad-Bühne: Gesamtprozess über die fünf Phasen (entspricht dem Fahrzeugbild)
export function stage(s, nw) {
  if (!s.ok) return '<section class="stage none" aria-label="Pfad"><b>Kein PEP-Pfad</b><p>Unter den Projektschwellen: Das Vorhaben wird als Roadmap-Eintrag ohne PEP geführt.</p></section>';
  const r = s.r, isNew = k => nw && nw.has(k) ? " new" : "";
  const cols = PH.map((t, i) => {
    const gone = s.D[i].gone;
    const steps = r.order.filter(o => phaseOf(o) === i).map(o =>
      '<li class="mk' + (o.rv ? " rv" : "") + isNew("S:" + o.n) + '"><i aria-hidden="true"></i><span>' + esc(o.n) + (o.rv ? "" : "<small>" + esc(o.t) + "</small>") + "</span></li>").join("");
    const tags = r.on.filter(m => m.ph === i).map(m => '<span class="st-tag' + isNew("M:" + m.id) + '">' + esc(m.t) + "</span>").join("");
    return '<div class="st-col' + (gone ? " gone" : "") + '"><div class="st-ph">' + esc(t) + "</div>" +
      (gone ? '<p class="st-gone">entfällt, zusammengefasst in G1+2</p>' : '<ul class="st-mk">' + steps + "</ul>" + (tags ? '<div class="st-tags">' + tags + "</div>" : "") +
      '<div class="st-dv' + isNew("D" + i) + '"><b class="num">' + s.per[i] + "</b>Liefergegenstände</div>") + "</div>";
  }).join("");
  return '<section class="stage" aria-label="Pfad über die fünf Phasen"><div class="st-h"><b>Gesamtprozess ' + esc(s.path) + "</b>" +
    '<span class="st-lg"><span><i class="g"></i>Gate</span><span><i class="r"></i>Review-Meilenstein</span></span></div><div class="st-cols">' + cols + "</div></section>";
}

// Auswahlkarte (entspricht einer Motorisierung)
export function card({sel, badge, title, sub, attrs, delta, act, label, extra = "", dis}) {
  return '<article class="ccard' + (sel ? " sel" : "") + (dis ? " dis" : "") + '">' +
    '<div class="cc-badges">' + (sel ? '<span class="bdg on">Ausgewählt</span>' : "") + (badge ? '<span class="bdg">' + esc(badge) + "</span>" : "") + "</div>" +
    "<h3>" + esc(title) + "</h3>" + (sub ? '<p class="cc-sub">' + esc(sub) + "</p>" : "") +
    (attrs && attrs.length ? '<dl class="cc-at">' + attrs.map(([a, b]) => "<dt>" + esc(a) + "</dt><dd>" + esc(b) + "</dd>").join("") + "</dl>" : "") + extra +
    '<div class="cc-f"><div class="cc-d">' + (sel ? "" : chips(delta, "keine Änderung am Pfad")) + "</div>" +
    (act ? '<button type="button" class="cbtn"' + act + (sel || dis ? " disabled" : "") + ">" + esc(sel ? "Ausgewählt" : label) + "</button>" : "") + "</div></article>";
}
