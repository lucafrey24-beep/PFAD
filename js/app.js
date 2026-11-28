// PEP-App: Oberfläche, Routing, Ereignisse. Aufbau wie SATZ (ES-Module, Hash-Routing, Ereignis-Delegation über data-act).
import {TODAY, PCS, PH, SPN, SPDESC, STATUS, ROLES, PRESETS, LF, CRK, WP_LIMIT, RG, TSS, RISK, PFK, SPK, LT_WEEKS} from "./data.js";
import {compute, delivs, phaseOf, stepDelivs, fmtD, shares} from "./model.js";
import * as F from "./files.js";
import * as RW from "./rules.js";
import * as S from "./store.js";
import * as C from "./cfg.js";

const VERSION = "1.8.0";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const view = $("#view"), bar = $("#appbar"), tabs = $("#tabs"), dlg = $("#dlg");
const ui = {filter: "all", q: "", wizErr: ""};
const TABS = ["vorhaben", "ideen", "neu", "freigaben", "cockpit", "mehr"];
let toastT;

function toast(m, undo) {
  const t = $("#toast"); t.innerHTML = "<span></span>"; t.firstChild.textContent = m; $("#announcer").textContent = m;
  if (undo) { const b = document.createElement("button"); b.type = "button"; b.textContent = "Rückgängig"; b.onclick = () => { t.hidden = true; undo(); toast("Rückgängig gemacht"); }; t.append(b); }
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, undo ? 30000 : 6000); // 30 s mit Rückgängig (WCAG 2.2.1), sonst 6 s
}
function undoable(fn) { const snap = S.snapshot(), m = fn(); if (m) toast(m, () => { S.restore(snap); render(); }); render(); }
function applyTheme() {
  const st = S.state, light = st.theme === "light" || (st.theme === "auto" && matchMedia("(prefers-color-scheme: light)").matches), r = document.documentElement;
  r.dataset.theme = light ? "light" : "dark"; r.dataset.contrast = st.hc ? "1" : "0"; r.style.fontSize = st.fs === 1 ? "" : (17 * st.fs) + "px";
  $('meta[name="theme-color"]').content = light ? "#ffffff" : "#000000";
}
function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
let opener = null;
function openDlg(html) { opener = document.activeElement; dlg.style.transform = ""; dlg.innerHTML = '<div class="grab" aria-hidden="true"></div><div class="in">' + html + "</div>"; if (!dlg.open) dlg.showModal(); }
function closeDlg() { if (dlg.open) dlg.close(); }
dlg.addEventListener("close", () => { dlg.style.transform = ""; const o = opener; opener = null; setTimeout(() => { if (o && o.isConnected) o.focus(); else { const h = view.querySelector("h1"); h && h.focus({preventScroll: true}); } }, 0); });
dlg.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") { const b = dlg.querySelector("[data-main]"); if (b) { e.preventDefault(); b.click(); } } });
let sy = null; // Sheet nach unten wischen schließt, wenn ganz oben gescrollt
dlg.addEventListener("touchstart", e => { sy = dlg.scrollTop <= 0 ? e.touches[0].clientY : null; }, {passive: true});
dlg.addEventListener("touchmove", e => { if (sy === null) return; const d = e.touches[0].clientY - sy; if (d > 0) dlg.style.transform = "translateY(" + d + "px)"; }, {passive: true});
dlg.addEventListener("touchend", e => { if (sy === null) return; const d = e.changedTouches[0].clientY - sy; sy = null; if (d > 110) closeDlg(); else dlg.style.transform = ""; });
const stBadge = p => { const s = STATUS[p.status]; return '<span class="dot ' + s[1] + '"></span>' + esc(s[0]); };
const pathPill = r => '<span class="pill-path' + (r.ok ? "" : " none") + '">' + esc(r.path) + "</span>";
const seg = (act, items, cur, extra = "") => '<div class="seg" role="group"' + extra + ">" + items.map(([v, l]) => '<button type="button" data-act="' + act + '" data-v="' + esc(v) + '" aria-pressed="' + (String(v) === String(cur)) + '">' + esc(l) + "</button>").join("") + "</div>";
const yn = (act, i, v) => '<div class="seg inl" role="group">' + [[1, "Ja"], [0, "Nein"]].map(([x, l]) => '<button type="button" data-act="' + act + '" data-i="' + i + '" data-v="' + x + '" aria-pressed="' + (!!v === !!x) + '">' + l + "</button>").join("") + "</div>";

/* ---------- Gerüst ---------- */
function route() { const h = (location.hash || "#/vorhaben").replace(/^#\/?/, "").split("/"); return {tab: h[0] || "vorhaben", id: h[1] ? decodeURIComponent(h[1]) : "", raw: h}; }
function setBar(left, title, right) { bar.innerHTML = left + '<div class="ctx"' + (title ? "" : " data-col") + ">" + esc(title) + "</div>" + right; }
function collapse() { const c = bar.querySelector(".ctx[data-col]"), h = view.querySelector("h1"); if (!c || !h) return; c.textContent = h.textContent; c.classList.toggle("on", h.getBoundingClientRect().bottom < bar.getBoundingClientRect().bottom + 4); }
view.addEventListener("scroll", collapse, {passive: true});
const roleBtn = () => '<button class="rolechip" data-act="roledlg" aria-label="Rolle wechseln, aktuell ' + esc(ROLES[S.state.role]) + '">' + esc(ROLES[S.state.role]) + "</button>";
const brand = '<a class="wordmark" href="#/vorhaben" aria-label="PFAD, zu den Vorhaben">PFAD<span>.</span></a>';
const back = (href, label) => '<a class="navbtn strong" href="' + href + '">‹ ' + esc(label) + "</a>";
function badge() { const n = S.todo(S.state.role); const b = $("#tbQ"); b.textContent = n ? String(n) : ""; b.setAttribute("aria-label", n ? n + " warten auf Sie" : ""); }

function render() {
  if (dlg.open) dlg.close();
  const r = route(); badge();
  const wiz = r.tab === "neu", wide = matchMedia("(min-width:900px)").matches; tabs.hidden = wiz && !wide; view.classList.toggle("modal", wiz && !wide); view.classList.toggle("cfgm", wiz); if (wiz && ui.lastTab !== "neu") { ui.cfgPrev = null; ui.delta = null; } ui.lastTab = r.tab;
  const idx = Math.max(0, TABS.indexOf(r.tab === "vorhaben" || TABS.includes(r.tab) ? r.tab : "vorhaben"));
  tabs.querySelector(".pill").style.transform = "translateX(" + idx * 100 + "%)";
  tabs.querySelectorAll("a").forEach((a, i) => i === idx ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  const fn = {vorhaben: r.id ? vDetail : vList, ideen: vIdeas, neu: vWizard, freigaben: vQueue, cockpit: vCockpit, mehr: r.id === "regeln" ? vRules : r.id === "offen" ? vOpen : r.id === "regelwerk" ? vRegel : vMore}[r.tab] || vList;
  fn(r); view.scrollTop = 0;
  const h = view.querySelector("h1"); if (h) { h.tabIndex = -1; h.focus({preventScroll: true}); document.title = h.textContent + " – PFAD"; }
  collapse();
}

/* ---------- Vorhaben ---------- */
function filtered() {
  const q = ui.q.trim().toLowerCase(), f = ui.filter;
  return S.state.P.filter(p => (f === "all" || (f === "pe" && p.status === "pe") || (f === "on" && ["on", "off"].includes(p.status)) || (f === "bl" && ["bl", "re", "ho"].includes(p.status)) || (f === "late" && S.overdue(p)) || (f === "mine" && p.mine)) &&
    (!q || (p.name + " " + p.id + " " + p.pl + " " + p.pc).toLowerCase().includes(q)));
}
function listRows() {
  const L = filtered();
  if (!L.length) return '<div class="empty">' + (S.state.P.length ? "Keine Vorhaben für diese Auswahl. Filter ändern oder die Suche leeren." : "Noch keine Vorhaben. Unter Neu legen Sie das erste an.") + "</div>";
  return '<ul class="group">' + L.map(p => { const r = S.cp(p), pr = S.progress(p), late = S.overdue(p);
    return '<li><a class="row" href="#/vorhaben/' + encodeURIComponent(p.id) + '"><span class="t">' + esc(p.name) + '<span class="s">' + esc(p.id) + " · " + esc(p.pc) + " · " + esc(p.pl) + '</span><span class="s">' + stBadge(p) + (p.status === "pe" ? " · " + esc(subLbl(p)) + ": " + stageTxt(p) : "") + (p.status === "ho" && p.holdUntil ? " · Wiedervorlage " + fmtD(p.holdUntil) : "") + (S.plrDue(p) ? " · Post-Launch-Review fällig" : "") + (late ? " · überfällig" : "") + '</span>' + (pr.total ? '<span class="s">Schritt ' + pr.done + " von " + pr.total + '</span><span class="pb" aria-hidden="true"><i style="width:' + Math.round(pr.done / pr.total * 100) + '%"></i></span>' : "") + '</span><span class="tr">' + pathPill(r) + '</span><span class="chev" aria-hidden="true">›</span></a></li>';
  }).join("") + "</ul>";
}
function vList() {
  setBar(brand, "", roleBtn());
  view.innerHTML = '<h1 class="big">Vorhaben</h1>' + (S.backupDue() ? '<div class="note">Zeit für eine Sicherung. <a href="#/mehr">Unter Mehr exportieren</a>, damit nichts verloren geht.</div>' : "") + '<div class="fg"><label class="f sr" for="q">Suchen</label><input id="q" type="text" inputmode="search" placeholder="Suchen: Name, ID, Projektleitung" value="' + esc(ui.q) + '" autocomplete="off"></div>' +
    seg("filter", [["all", "Alle"], ["pe", "Freigabe offen"], ["on", "Laufend"], ["bl", "Blockiert"], ["late", "Überfällig"], ["mine", "Meine"]], ui.filter) +
    '<div id="listBody">' + listRows() + '</div><p class="foot">' + S.state.P.length + ' Vorhaben. Stand ' + fmtD(TODAY) + '.</p>';
}

function vDetail(r) {
  const p = S.byId(r.id);
  setBar(back("#/vorhaben", "Vorhaben"), "", roleBtn());
  if (!p) { view.innerHTML = '<h1 class="big">Nicht gefunden</h1><div class="empty">Dieses Vorhaben gibt es nicht (mehr).</div>'; return; }
  const c = S.cp(p), act = !["li", "ki", "do"].includes(p.status), pl = S.state.role === "PL";
  let h = '<p class="eyebrow">' + esc(p.id) + " · " + esc(p.pc) + '</p><h1 class="big">' + esc(p.name) + '</h1><p>' + pathPill(c) + " &nbsp;" + stBadge(p) + "</p>";
  h += '<p class="meta">' + (p.rx ? "Regelwerk v" + p.rx.ver + " festgeschrieben" + (p.fix ? " am " + esc(fmtD(p.fix.at)) : "") + (RW.rules().ver !== p.rx.ver ? ". Aktuell gilt v" + RW.rules().ver + ", dieses Vorhaben bleibt bei v" + p.rx.ver + "." : ".") : "Noch kein Go: es gilt das aktuelle Regelwerk v" + RW.rules().ver + ". Beim ersten Go wird es festgeschrieben.") + "</p>";
  if (p.note) h += '<div class="warn">' + esc(p.note) + "</div>";
  if (p.status === "pe") h += '<div class="qitem"><h3>' + esc(stageLong(p)) + '</h3><p class="meta">Zur Freigabe: ' + esc(subLbl(p)) + (p.rec ? ". " + esc(p.rec) : "") + "</p>" + evLine(p) + subInfo(p, true) + actionsFor(p) + "</div>";
  const ps = c.ok ? (S.subStep(p) || S.curStep(p)) : null;
  if (ps && p.status !== "do") {
    h += stepPanel(p, c, ps, S.canEditFiles(p, ps.n));
    if (S.canSubmitStep(p)) h += '<button class="btn primary" data-act="stepsub" data-id="' + esc(p.id) + '">Zur Freigabe einreichen: ' + esc(S.stepLabel(ps)) + "</button>";
  }
  if (p.status === "ho" && p.holdUntil) h += '<div class="note">Hold bis ' + esc(fmtD(p.holdUntil)) + (S.holdDue(p) ? ": <b>Wiedervorlage in der nächsten Wochensitzung</b>" : "") + ".</div>";
  if (p.killReport) h += '<h2 class="sec">Abbruchbericht</h2><ul class="group">' + row("Grund", p.killReport.grund) + row("Lessons Learned", p.killReport.ll) + row("Freigegebene Ressourcen", p.killReport.res) + "</ul>";
  if (p.status === "do") h += plrPanel(p);
  if (c.ok) {
    h += '<h2 class="sec">Ablauf (' + c.n + " Reviews)</h2><ol class=\"tl\">";
    let lastPh = -1;
    c.order.forEach(o => { const ph = phaseOf(o); if (ph !== lastPh) { h += '<li class="ph">' + esc(PH[ph]) + "</li>"; lastPh = ph; }
      const x = S.stepOf(p, o.n); h += '<li class="' + (o.rv ? "rv " : "") + (x.st === "ok" ? "done " : "") + (ps && ps.n === o.n ? "next" : "") + '">' + esc(o.n) + (o.t ? " " + esc(o.t) : "") + (x.st !== "open" || x.files.length ? "<small>" + [STX[x.st] + (x.st === "ok" ? " " + dstr(x.decided) : ""), x.files.length ? x.files.length + " Datei" + (x.files.length > 1 ? "en" : "") : ""].filter(Boolean).join(" · ") + "</small>" : "") + "</li>"; });
    h += "</ol>";
    const olds = c.order.filter(o => (!ps || o.n !== ps.n) && (S.stepOf(p, o.n).files.length || S.stepOf(p, o.n).ans));
    if (olds.length) h += '<h2 class="sec">Nachweise und Angaben je Schritt</h2><div class="group" style="padding-right:0">' + olds.map(o => { const x = S.stepOf(p, o.n); return '<details class="dv"><summary>' + esc(S.stepLabel(o)) + " · " + x.files.length + ' Dateien</summary>' + ansHtml(x) + '<ul class="fl">' + x.files.map(f => fileRow(p, o.n, f, false)).join("") + "</ul></details>"; }).join("") + "</div>";
  } else h += '<div class="note">Unter den Projektschwellen: Roadmap-Eintrag ohne PEP.</div>';
  // Änderungsanträge (Kap. 5.4): Backlog, nächstes Gate oder WP Board
  const crSt = {backlog: "im Backlog der Spur", gate: "am nächsten Gate", pgb: "beim PGB", pgbwp: "beim PGB zur Vorlage an das WP Board", wp: "beim WP Board", ok: "angenommen", rej: "abgelehnt"};
  if (p.crs.length || (pl && act && c.ok)) h += '<h2 class="sec">Änderungsanträge</h2>' + (p.crs.length ? '<ul class="group">' + p.crs.map(x => '<li class="row"><span class="t">' + esc(x.id) + ": " + esc(x.text) + '<span class="s">' + esc(CRK[x.kat] ? CRK[x.kat].t : x.kat) + (x.eur ? " · " + x.eur.toLocaleString("de-DE") + " €" : "") + (x.wk ? " · " + x.wk + " Wochen" : "") + " · " + esc(crSt[x.st] || x.st) + (x.dec ? " (" + esc(x.dec) + ")" : "") + "</span></span></li>").join("") + "</ul>" : "") + (pl && act && c.ok ? '<button class="btn" data-act="crdlg" data-id="' + esc(p.id) + '">Änderungsantrag stellen</button>' : "");
  const sh = c.sh || shares(p.c);
  h += '<h2 class="sec">Konfiguration</h2><ul class="group">' +
    row("Spur", c.ok ? c.sp + " · " + SPN[c.sp] : "–") + row("Generationsstufe", c.ok ? c.st : "–") + row("Neuentwicklungsanteil", (c.hc ? "HW " + sh.hw + " % · " : "") + "SW " + sh.sw + " %" + (sh.hwList || sh.swList ? " (aus Teilsystemen)" : "")) +
    row("Referenzprodukt", p.ref || "–") + (p.idea ? row("Aus Idee", p.idea) : "") + (p.lcOwner ? row("Verantwortung im Lebenszyklus", p.lcOwner) : "") + (p.pred ? row("Vorgänger", p.pred) : "") + (p.succ ? row("Folgegeneration", p.succ) : "") + row("Projektleitung", p.pl) + row("Project Sponsor", p.sponsor || "–") + row("Product Owner", p.po || "–") +
    (p.kpis ? row("Kennzahlen", p.kpis) : "") + row("Zuletzt freigegeben", p.last) + row("Nächster Meilenstein", p.next + (p.date ? " · " + fmtD(p.date) : "")) + row("Konfigurationsversion", String(p.ver || 1)) + "</ul>" +
    (pl && act ? '<div class="card" style="margin-top:12px"><label class="f" for="pdate">Plantermin nächster Meilenstein</label><input id="pdate" type="date" data-pdate data-id="' + esc(p.id) + '" value="' + esc(p.date || "") + '"></div>' : "") + (p.cfgPending ? '<div class="warn">Konfigurationsänderung ' + esc(p.cfgPending.from) + " → " + esc(p.cfgPending.to) + " wartet auf Freigabe am nächsten Gate.</div>" : "");
  if (p.c.ts.length) h += '<h2 class="sec">Teilsysteme</h2><ul class="group">' + p.c.ts.map(t => row(t.n || "ohne Namen", t.d + " · " + (TSS[t.s] || t.s))).join("") + "</ul>";
  const pred = p.pred && S.byId(p.pred);
  if (pred && pred.ll) h += '<div class="note"><b>Lessons Learned aus ' + esc(pred.id) + ":</b> " + esc(pred.ll) + "</div>";
  if (p.ll) h += '<div class="note"><b>Lessons Learned:</b> ' + esc(p.ll) + "</div>";
  if (c.ok) {
    h += '<h2 class="sec">Bausteine</h2><ul class="group">' + c.on.map(m => row(m.t, tyLabel(c, m))).join("") +
      c.ab.map(m => '<li class="row"><span class="t">' + esc(m.t) + ' <span class="lock">abgewählt</span><span class="s">' + esc((p.c.why || {})[m.id] || "") + "</span></span></li>").join("") + "</ul>";
    h += '<h2 class="sec">Liefergegenstände je Phase</h2>' + dvList(c) ;
  }
  if (p.dec.length) h += '<h2 class="sec">Entscheidungen</h2><ul class="group">' + p.dec.map(x => row(x.k + ": " + S.decLabel(x.out), x.by + " · " + dstr(x.at))).join("") + "</ul>";
  if (p.log.length) h += '<h2 class="sec">Verlauf</h2><ul class="logl">' + p.log.slice().reverse().map(l => "<li><small>" + esc(l.t) + " · " + esc(l.who) + "</small><br>" + esc(l.x) + "</li>").join("") + "</ul>";
  h += '<div class="btns">' + (pl && act ? '<button class="btn" data-act="edit" data-id="' + esc(p.id) + '">Konfiguration ändern</button>' : "") + (pl && p.status === "do" && !p.succ ? '<button class="btn primary" data-act="succ" data-id="' + esc(p.id) + '">Folgegeneration anlegen</button>' : "") + mailBtn(p) + '<button class="btn" data-act="nachweis" data-id="' + esc(p.id) + '">Nachweis exportieren</button></div>';
  view.innerHTML = h;
}
// Liefergegenstände: Kern (alle Spuren) und spurspezifisch; in Standard und Light nur für geänderte Teilsysteme
function dvList(r) {
  const part = r.st !== "Full";
  return '<div class="group" style="padding-right:0">' + delivs(r).map(d => d.gone ? "" : '<details class="dv"><summary>' + esc(d.t) + " · " + d.items.length + '</summary><ul>' + (d.items.length ? d.items.map(i => '<li class="' + (i.bs ? "bs" : "") + '">' + esc(i.t) + (i.bs ? " (Baustein)" : i.kern ? " (Kern)" : " (Spur " + r.sp + (part ? ", nur geänderte Teilsysteme" : "") + ")") + (i.kat === "A" ? " (validieren)" : "") + "</li>").join("") : "<li>Keine hinterlegt. Im Regelwerk ergänzen.</li>") + "</ul></details>").join("") + "</div>";
}
const lfQ = k => { const [g, i] = String(k).split(":"); return (LF[g] || [])[+i] || k; };
// Angaben der Projektleitung und Prüfung des Committees zu einem Schritt
function ansHtml(x) {
  const a = x.ans || {}, v = x.rev || {}; let h = "";
  if (a.lf) h += '<ul class="lfl">' + Object.entries(a.lf).map(([k, t]) => "<li><b>" + esc(lfQ(k)) + "</b>" + (v.lf && v.lf[k] ? ' <span class="lock">' + (v.lf[k] === "ok" ? "Committee: beantwortet" : "Committee: offen") + "</span>" : "") + "<br>" + esc(t) + "</li>").join("") + "</ul>";
  const m = [];
  if (a.rg) m.push("Reifegrad HW " + a.rg.hw + ", SW " + a.rg.sw + ", System " + a.rg.sys);
  if (a.sponsor) m.push("Ressourcen bestätigt durch " + a.sponsor.name);
  if (a.kpis) m.push("Kennzahlen: " + a.kpis);
  if (v.at) m.push("Prüfung " + fmtD(v.at) + (v.hw && v.sw ? ", Prüfvermerk HW und SW" : "") + (v.reg ? ", Regulatorik " + ({ja: "erfüllt", nein: "nicht erfüllt", nr: "nicht relevant"}[v.reg]) : ""));
  if (m.length) h += '<p class="meta">' + m.map(esc).join(" · ") + "</p>";
  return h;
}
function subInfo(p, full) {
  const o = S.subStep(p); if (!o) return ""; const x = S.stepOf(p, o.n);
  return full ? ansHtml(x) : "";
}
const subLbl = p => { const o = S.subStep(p); return o ? S.stepLabel(o) : "–"; };
const dstr = iso => iso ? fmtD(iso.slice(0, 10)) : "–";
const STX = {ok: "freigegeben", sub: "eingereicht, Freigabe offen", mod: "Nachbesserung nötig", hold: "Hold", kill: "abgebrochen", open: ""};
function evLine(p) { const o = S.subStep(p); if (!o) return ""; const n = S.stepOf(p, o.n).files.length, m = S.missingDelivs(p, o); return '<p class="meta">Nachweise: ' + n + " Datei" + (n === 1 ? "" : "en") + (m.length ? ", ohne Datei: " + esc(m.join(", ")) : ", alle Liefergegenstände belegt") + "</p>"; }
function fileRow(p, k, f, edit) {
  return '<li class="frow"><span class="t">' + esc(f.name) + '<span class="s">' + F.fmtSize(f.size) + " · " + dstr(f.at) + '</span></span><button class="inline-btn" data-act="dl" data-id="' + esc(p.id) + '" data-k="' + esc(k) + '" data-f="' + esc(f.id) + '" aria-label="' + esc(f.name) + ' herunterladen">Laden</button>' +
    (edit ? '<button class="inline-btn" data-act="fdel" data-id="' + esc(p.id) + '" data-k="' + esc(k) + '" data-f="' + esc(f.id) + '" aria-label="' + esc(f.name) + ' entfernen">Entfernen</button>' : "") + "</li>";
}
function stepPanel(p, c, o, edit) {
  const s = S.stepOf(p, o.n), D = stepDelivs(c, o), k = o.n, n = D.filter(d => s.chk[d]).length;
  let h = '<h2 class="sec">Nachweise: ' + esc(S.stepLabel(o)) + '</h2><div class="card"><p class="meta">' + n + " von " + D.length + " Liefergegenständen abgehakt" + (STX[s.st] ? " · " + STX[s.st] : "") + ".</p>";
  h += D.map((d, i) => '<label class="row" style="padding-left:0"><span class="t">' + esc(d) + (s.chk[d] ? '<span class="s">abgehakt ' + esc(fmtD(s.chk[d])) + "</span>" : "") + '</span><span class="sw"><input type="checkbox" data-chk="' + esc(d) + '" data-id="' + esc(p.id) + '" data-k="' + esc(k) + '"' + (s.chk[d] ? " checked" : "") + (edit ? "" : " disabled") + '><span></span></span></label>').join("");
  return h + '<p class="foot" style="margin:8px 0 0">Konzept: Nachweise werden abgehakt, nicht hochgeladen (später Ablage in SharePoint). Einreichen geht erst, wenn alles abgehakt ist.</p></div>';
}
// E-Mail vorbereiten (mailto): an die Rolle, die als Nächstes handelt
function mailBtn(p) {
  const o = S.subStep(p) || S.curStep(p), who = p.status === "pe" ? (p.stage === "ms" ? "MS Gate Committee" : p.stage === "wp" ? "WP Board" : "PGB") : "Projektleitung " + p.pl;
  const sub = "PFAD " + p.id + ": " + (p.status === "pe" ? "zur Entscheidung " : "Stand ") + (o ? S.stepLabel(o) : p.last);
  const body = "Hallo " + who + ",\n\n" + p.name + " (" + p.id + ", " + S.cp(p).path + ")\nStatus: " + STATUS[p.status][0] + (p.note ? "\n" + p.note : "") + (p.rec ? "\n" + p.rec : "") + "\n\nLink: " + location.href + "\n";
  return '<a class="btn" href="mailto:?subject=' + encodeURIComponent(sub) + "&body=" + encodeURIComponent(body) + '">E-Mail an ' + esc(who) + " vorbereiten</a>";
}
function plrPanel(p) {
  if (p.plr) return '<h2 class="sec">Post-Launch-Review</h2><ul class="group">' + row("Business Case erreicht", p.plr.bc) + row("Erfasst", fmtD(p.plr.at)) + '</ul><div class="note">' + esc(p.plr.text) + "</div>";
  const from = S.plrFrom(p); if (!from) return "";
  return '<h2 class="sec">Post-Launch-Review</h2><div class="card"><p class="meta" style="margin-top:0">Fällig 6 bis 12 Monate nach dem Abschluss, ab ' + esc(fmtD(from)) + (S.plrDue(p) ? ": <b>jetzt fällig</b>" : "") + ".</p>" +
    (S.state.role === "PL" ? '<p class="meta">Business Case erreicht?</p>' + radio("plrbc", [["ja", "ja"], ["teilweise", "teilweise"], ["nein", "nein"]], "") + '<label class="f" for="plrt">Kennzahlen und Erkenntnisse</label><textarea id="plrt" maxlength="800"></textarea><p class="err" id="plrerr" hidden></p><button class="btn" data-act="plrok" data-id="' + esc(p.id) + '">Post-Launch-Review erfassen</button>' : "") + "</div>";
}
const row = (a, b) => '<li class="row"><span class="t">' + esc(a) + '</span><span class="tr">' + esc(b) + "</span></li>";
const stageTxt = p => p.stage === "wp" ? "wartet auf WP Board" : p.stage === "ppb" ? "wartet auf PGB" : "wartet auf MS Gate Committee";
const stageLong = p => p.stage === "wp" ? "Wartet auf Entscheidung des WP Boards (Uneinigkeit im PGB)" : p.stage === "ppb" ? "Wartet auf PGB-Entscheidung" : "Wartet auf Prüfung durch das MS Gate Committee";
function actionsFor(p) {
  const role = S.state.role, id = esc(p.id);
  if (role === "MS" && p.stage === "ms") return '<div class="btns"><button class="btn primary" data-act="msdlg" data-id="' + id + '">Prüfen und empfehlen</button><button class="btn destructive" data-act="rdlg" data-k="ret" data-id="' + id + '">Zurück an PL</button></div>';
  if (S.canDecide(p)) {
    return '<div class="btns"><button class="btn primary" data-act="go" data-id="' + id + '">Go</button><button class="btn" data-act="rdlg" data-k="modify" data-id="' + id + '">Modify</button><button class="btn" data-act="rdlg" data-k="hold" data-id="' + id + '">Hold</button><button class="btn destructive" data-act="rdlg" data-k="kill" data-id="' + id + '">Kill</button>' + (p.stage === "ppb" ? '<button class="btn" data-act="rdlg" data-k="wp" data-id="' + id + '">Uneinig: an WP Board</button>' : "") + "</div>"; }
  return '<p class="foot" style="margin:0">In der Rolle ' + esc(ROLES[role]) + " ist hier keine Aktion möglich (" + esc(stageTxt(p)) + ").</p>";
}

/* ---------- Ideenpool ---------- */
const IST = {neu: "neu", an: "vom PGB angestoßen", ue: "übernommen"};
function vIdeas() {
  setBar(brand, "", roleBtn());
  const role = S.state.role, L = S.state.I;
  let h = '<h1 class="big">Ideen</h1><div class="note">Jeder reicht Ideen ein, bewertet und kommentiert sie. Das PGB stößt Ideen in der Wochensitzung an; eine Projektleitung übernimmt sie und legt daraus ein Vorhaben an.</div>';
  h += '<details class="card"' + (L.length ? "" : " open") + '><summary><b>Idee einreichen</b></summary><label class="f" for="it">Titel</label><input id="it" type="text" maxlength="100"><label class="f" for="ip">Problem oder Chance</label><textarea id="ip" maxlength="600"></textarea><label class="f" for="in">Nutzen (optional)</label><textarea id="in" maxlength="400"></textarea>' +
    '<div class="two"><div><label class="f" for="ipc">Product Center (optional)</label><select id="ipc"><option value="">unbekannt</option>' + PCS.map(x => "<option>" + esc(x) + "</option>").join("") + '</select></div><div><label class="f" for="iby">Eingereicht von</label><input id="iby" type="text" maxlength="60" value="' + esc(ROLES[role]) + '"></div></div><p class="err" id="ierr" hidden></p><button class="btn primary" data-act="iadd">Einreichen</button></details>';
  const grp = (t, list) => list.length ? '<h2 class="sec">' + t + " (" + list.length + ")</h2>" + list.map(ideaCard).join("") : "";
  h += grp("Neu", L.filter(i => i.st === "neu")) + grp("Vom PGB angestoßen", L.filter(i => i.st === "an")) + grp("Übernommen", L.filter(i => i.st === "ue"));
  if (!L.length) h += '<div class="empty">Noch keine Ideen. Unter Mehr lassen sich Beispielvorhaben mit Ideen laden.</div>';
  view.innerHTML = h;
}
function ideaCard(i) {
  const role = S.state.role, mine = (i.rate || {})[role] || 0, id = esc(i.id);
  return '<div class="qitem"><h3>' + esc(i.t) + '</h3><p class="meta">' + id + " · " + esc(IST[i.st]) + (i.pl ? " · PL: " + esc(i.pl) : "") + (i.pc ? " · " + esc(i.pc) : "") + " · " + esc(i.by) + ", " + esc(fmtD(i.at)) + " · Bewertung " + esc(S.ideaScore(i)) + "</p>" +
    "<p>" + esc(i.problem) + "</p>" + (i.nutzen ? '<p class="meta">Nutzen: ' + esc(i.nutzen) + "</p>" : "") + (i.pid ? '<p class="meta">Vorhaben: <a href="#/vorhaben/' + encodeURIComponent(i.pid) + '">' + esc(i.pid) + "</a></p>" : "") +
    '<div class="chips" role="group" aria-label="Bewerten, 1 bis 5">' + [1, 2, 3, 4, 5].map(n => '<button class="chipb" data-act="irate" data-id="' + id + '" data-v="' + n + '" aria-pressed="' + (mine === n) + '">' + n + "</button>").join("") + "</div>" +
    '<details class="dv"><summary>Kommentare (' + i.com.length + ")</summary><ul>" + i.com.map(c => "<li><small>" + esc(c.who) + " · " + esc(fmtD(c.at)) + "</small><br>" + esc(c.t) + "</li>").join("") + '</ul><label class="f sr" for="ic-' + id + '">Kommentar</label><textarea id="ic-' + id + '" maxlength="400" rows="2" placeholder="Kommentar"></textarea><button class="btn small" data-act="icom" data-id="' + id + '">Kommentieren</button></details>' +
    '<div class="btns">' + (role === "PPB" && i.st === "neu" ? '<button class="btn primary" data-act="ipushdlg" data-id="' + id + '">Anstoßen</button>' : "") + (role === "PL" && i.st !== "ue" ? '<button class="btn primary" data-act="itake" data-id="' + id + '">Übernehmen und Vorhaben anlegen</button>' : "") + "</div></div>";
}

/* ---------- Freigaben ---------- */
function vQueue() {
  setBar(brand, "", roleBtn());
  const role = S.state.role, mine = S.mine(role), q = S.queue(), others = q.filter(p => !mine.includes(p)), held = S.state.P.filter(p => p.status === "ho"), D = RW.draft();
  let h = '<h1 class="big">Freigaben</h1>';
  h += {PL: '<div class="note">Als Projektleitung reichen Sie Schritte ein und stellen Änderungsanträge. Prüfen und Entscheiden geht in den anderen Rollen (oben rechts).</div>',
    MS: '<div class="note">Das MS Gate Committee ist das Projektteam. Ab G2 prüft es auf Vollständigkeit: Nachweise, Leitfragen, Regulatorik und in Spur A und B den Stand von Hardware und Software. Fehlt etwas, geht der Schritt zurück. An G1 entscheidet das PGB direkt.</div>',
    PPB: '<div class="note">Das PGB tagt wöchentlich und entscheidet: Go, Modify, Hold oder Kill. Freigabe nur, wenn alles vorliegt. Es stößt Ideen an, entscheidet vorgezogene Arbeiten mit vertraglicher Bindung, legt dem WP Board vor und gibt das Regelwerk frei.</div>',
    WP: '<div class="note">Das WP Board entscheidet nur auf Vorlage des PGB: bei Uneinigkeit im PGB, bei Verschiebung des Liefertermins um mehr als 4 Wochen und bei Budgetänderungen über ' + WP_LIMIT.toLocaleString("de-DE") + ' €.</div>',
    PG: '<div class="note">Product Governance pflegt das Regelwerk. Änderungen werden erst nach Freigabe durch das PGB aktiv. <a href="#/mehr/regelwerk">Zum Regelwerk</a></div>'}[role] || "";
  if (role === "PPB") { const A = S.agenda(), n = A.gates.length + A.holds.length + A.crs.length + A.ideas.length + A.plr.length + (A.rules ? 1 : 0);
    h += '<h2 class="sec">Wochensitzung am ' + esc(fmtD(S.nextMeeting())) + '</h2><div class="card"><p class="meta" style="margin-top:0">' + n + " Punkte: " + A.gates.length + " Gates, " + A.holds.length + " Hold-Wiedervorlagen, " + A.crs.length + " Änderungsanträge, " + A.ideas.length + " neue Ideen, " + A.plr.length + " Post-Launch-Reviews" + (A.rules ? ", 1 Regelwerk-Entwurf" : "") + '.</p><div class="btns"><button class="btn primary" data-act="agtxt">Tagesordnung exportieren (Text)</button><button class="btn" data-act="agcsv">Als CSV</button>' + (A.ideas.length ? '<a class="btn" href="#/ideen">Ideen ansehen</a>' : "") + "</div></div>";
    if (A.crs.length) h += '<h2 class="sec">Änderungsanträge für das PGB (' + A.crs.length + ")</h2>" + A.crs.map(({p, c}) => '<div class="qitem"><a href="#/vorhaben/' + encodeURIComponent(p.id) + '"><h3>' + esc(p.name) + '</h3></a><p class="meta">' + esc(c.id) + " · " + esc(CRK[c.kat].t) + (c.eur ? " · " + c.eur.toLocaleString("de-DE") + " €" : "") + (c.wk ? " · " + c.wk + " Wochen" : "") + "</p><p>" + esc(c.text) + '</p><div class="btns">' + (c.st === "pgbwp" ? '<button class="btn primary" data-act="pgbcr" data-a="fwd" data-id="' + esc(p.id) + '" data-c="' + esc(c.id) + '">Dem WP Board vorlegen</button>' : '<button class="btn primary" data-act="pgbcr" data-a="ok" data-id="' + esc(p.id) + '" data-c="' + esc(c.id) + '">Annehmen</button>') + '<button class="btn destructive" data-act="pgbcr" data-a="rejdlg" data-id="' + esc(p.id) + '" data-c="' + esc(c.id) + '">Ablehnen</button></div></div>').join("");
  }
  if (role === "PPB" && D && D.pending) h += '<h2 class="sec">Regelwerk-Änderung</h2><div class="qitem"><h3>Regelwerk v' + (RW.rules().ver + 1) + ' (Entwurf von Product Governance)</h3><p class="meta">Eingereicht ' + esc(fmtD(D.pending.at)) + '</p><ul class="lfl">' + RW.diffDraft().map(t => "<li>" + esc(t) + "</li>").join("") + '</ul><div class="btns"><button class="btn primary" data-act="rwapprove">Freigeben</button><button class="btn" data-act="rwrejdlg">Ablehnen</button><a class="btn" href="#/mehr/regelwerk">Entwurf ansehen</a></div></div>';
  if (role === "PG" && D && D.rej) h += '<div class="warn"><b>PGB hat den Regelwerk-Entwurf abgelehnt:</b> ' + esc(D.rej) + ' <a href="#/mehr/regelwerk">Überarbeiten</a></div>';
  if (role === "WP") { const L = S.wpCRs(); h += '<h2 class="sec">Rahmenänderungen (' + L.length + ")</h2>" + (L.length ? L.map(({p, c}) => '<div class="qitem"><a href="#/vorhaben/' + encodeURIComponent(p.id) + '"><h3>' + esc(p.name) + "</h3></a><p class=\"meta\">" + esc(c.id) + " · " + esc(CRK[c.kat].t) + (c.eur ? " · " + c.eur.toLocaleString("de-DE") + " €" : "") + " · " + esc(fmtD(c.at)) + "</p><p>" + esc(c.text) + '</p><div class="btns"><button class="btn primary" data-act="crdecdlg" data-ok="1" data-id="' + esc(p.id) + '" data-c="' + esc(c.id) + '">Annehmen</button><button class="btn destructive" data-act="crdecdlg" data-ok="0" data-id="' + esc(p.id) + '" data-c="' + esc(c.id) + '">Ablehnen</button></div></div>').join("") : '<div class="empty">Keine Rahmenänderungen offen.</div>'); }
  const card = p => { const c = S.cp(p); return '<div class="qitem"><a href="#/vorhaben/' + encodeURIComponent(p.id) + '"><h3>' + esc(p.name) + '</h3></a><p class="meta">' + esc(p.id) + " · " + esc(p.pl) + " · eingereicht " + esc(p.submitted || "–") + " · " + pathPill(c) + "</p><p class=\"meta\">Zur Freigabe: " + esc(subLbl(p)) + (p.rec ? ". " + esc(p.rec) : "") + " · wartet seit " + S.waitDays(p) + " Tag(en)</p>" + evLine(p) + subInfo(p, false) + actionsFor(p) + "</div>"; };
  if (["MS", "PPB", "WP"].includes(role)) h += '<h2 class="sec">Wartet auf mich (' + mine.length + ")</h2>" + (mine.length ? mine.map(card).join("") : '<div class="empty">Nichts zu tun. Hier erscheinen Vorhaben, sobald ein Schritt eingereicht ist.</div>');
  if (others.length) h += '<h2 class="sec">Bei anderen (' + others.length + ')</h2><ul class="group">' + others.map(p => '<li><a class="row" href="#/vorhaben/' + encodeURIComponent(p.id) + '"><span class="t">' + esc(p.name) + '<span class="s">' + esc(subLbl(p)) + " · " + esc(stageTxt(p)) + '</span></span><span class="chev">›</span></a></li>').join("") + "</ul>";
  if (held.length) h += '<h2 class="sec">Hold (' + held.length + ')</h2><ul class="group">' + held.map(p => '<li class="row"><span class="t">' + esc(p.name) + '<span class="s">' + esc(p.note) + (S.holdDue(p) ? " · Wiedervorlage fällig" : "") + "</span></span>" + (role === "PPB" ? '<button class="btn small" data-act="resume" data-id="' + esc(p.id) + '">Aufheben</button>' : "") + "</li>").join("") + "</ul>";
  view.innerHTML = h;
}

/* ---------- Cockpit ---------- */
function vCockpit() {
  setBar(brand, "", roleBtn());
  const P = S.state.P, cnt = k => P.filter(p => p.status === k).length, tot = P.filter(p => p.status !== "li" && p.status !== "ki").length;
  const cs = P.map(p => ({p, c: S.cp(p)})), pep = cs.filter(x => x.c.ok);
  if (!P.length) { view.innerHTML = '<h1 class="big">Cockpit</h1><div class="empty">Noch keine Vorhaben erfasst. Das Cockpit füllt sich, sobald unter Neu eine Konfiguration eingereicht wird. Eine Anbindung an den Roadmap Master gibt es noch nicht.</div>'; return; }
  let h = '<h1 class="big">Cockpit</h1><div class="kpis">' +
    '<div class="kpi g"><b>' + tot + '</b><span>Vorhaben mit PEP</span></div><button class="kpi" data-act="goto" data-v="#/freigaben"><b>' + S.queue().length + '</b><span>Freigabe offen</span></button>' +
    '<div class="kpi"><b>' + (cnt("bl") + cnt("off")) + '</b><span>Blockiert oder Off Track</span></div><button class="kpi" data-act="filterlate"><b>' + P.filter(S.overdue).length + '</b><span>Überfällig (Plantermin)</span></button></div>';
  const act = P.filter(p => !["li", "ki"].includes(p.status));
  h += '<h2 class="sec">Fortschritt je Vorhaben</h2>' + (act.length ? '<ul class="group">' + act.map(p => { const pr = S.progress(p); return '<li><a class="row" href="#/vorhaben/' + encodeURIComponent(p.id) + '"><span class="t">' + esc(p.name) + '<span class="s">' + stBadge(p) + " · " + esc(p.next || "–") + (S.overdue(p) ? " · überfällig" : "") + '</span>' + (pr.total ? '<span class="pb" aria-hidden="true"><i style="width:' + Math.round(pr.done / pr.total * 100) + '%"></i></span>' : "") + '</span><span class="tr num">' + (pr.total ? pr.done + "/" + pr.total : "–") + '</span></a></li>'; }).join("") + "</ul>" : '<div class="empty">Keine Vorhaben mit PEP.</div>');
  const wq = S.queue(); if (wq.length) h += '<h2 class="sec">Wartet auf Freigabe</h2><ul class="group">' + wq.map(p => '<li><a class="row" href="#/vorhaben/' + encodeURIComponent(p.id) + '"><span class="t">' + esc(p.name) + '<span class="s">' + esc(subLbl(p)) + " · " + stageTxt(p) + '</span></span><span class="tr num">' + S.waitDays(p) + " Tag(e)</span></a></li>").join("") + "</ul>";
  const gs = S.gateStats(), pct = n => gs.n ? Math.round(n / gs.n * 100) + " %" : "–", dd = v => v === null ? "–" : (Math.round(v * 10) / 10).toLocaleString("de-DE");
  h += '<h2 class="sec">Wirkung der Gates</h2><div class="kpis"><div class="kpi"><b>' + pct(gs.kill) + '</b><span>Kill-Quote</span></div><div class="kpi"><b>' + pct(gs.hold) + '</b><span>Hold-Quote</span></div><div class="kpi"><b>' + pct(gs.modify) + '</b><span>Modify-Quote</span></div><div class="kpi"><b>' + dd(gs.med) + '</b><span>Tage bis zur Entscheidung (Median)</span></div></div>' +
    '<table class="sr"><caption>Entscheidungen von PGB und WP Board</caption><thead><tr><th>Ergebnis</th><th>Anzahl</th></tr></thead><tbody>' + [["Go", gs.go], ["Modify", gs.modify], ["Hold", gs.hold], ["Kill", gs.kill]].map(([a, b]) => "<tr><th>" + a + "</th><td>" + b + "</td></tr>").join("") + "</tbody></table>" +
    '<p class="foot">' + gs.n + " Entscheidungen, davon " + gs.wp + " im WP Board. Durchschnitt " + dd(gs.avg) + " Tage von der Einreichung bis zur Entscheidung. Gates ohne Kill und Hold können auf Gates ohne Wirkung hindeuten (Cooper 2008).</p>";
  h += '<h2 class="sec">Status je Product Center</h2><div class="card">';
  PCS.forEach(pc => { const L = P.filter(p => p.pc === pc && p.status !== "li"), n = L.length || 1;
    h += '<div class="hb" aria-hidden="true"><span>' + esc(pc.replace("PC ", "")) + '</span><div class="tr">' + ["on", "off", "bl", "pe", "re", "ho"].map(k => { const m = L.filter(p => p.status === k).length; return m ? '<div class="' + STATUS[k][1] + '" style="width:' + m / n * 100 + '%" title="' + esc(STATUS[k][0]) + ": " + m + '"></div>' : ""; }).join("") + "</div><b>" + L.length + "</b></div>"; });
  h += '<div class="lgd" aria-hidden="true">' + ["on", "off", "bl", "pe"].map(k => '<span><span class="dot ' + STATUS[k][1] + '"></span>' + esc(STATUS[k][0]) + "</span>").join("") + "</div></div>";
  h += '<table class="sr"><caption>Status je Product Center</caption><thead><tr><th>Product Center</th>' + ["on", "off", "bl", "pe", "re", "ho"].map(k => "<th>" + esc(STATUS[k][0]) + "</th>").join("") + "</tr></thead><tbody>" + PCS.map(pc => "<tr><th>" + esc(pc) + "</th>" + ["on", "off", "bl", "pe", "re", "ho"].map(k => "<td>" + P.filter(p => p.pc === pc && p.status === k).length + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
  h += '<h2 class="sec">Spur × Stufe</h2><table class="sr"><caption>Anzahl Vorhaben je Spur und Stufe</caption><thead><tr><th>Spur</th><th>Full</th><th>Standard</th><th>Light</th></tr></thead><tbody>' + ["A", "B", "C"].map(sp => "<tr><th>" + sp + "</th>" + ["Full", "Standard", "Light"].map(st => "<td>" + pep.filter(x => x.c.sp === sp && x.c.st === st).length + "</td>").join("") + "</tr>").join("") + '</tbody></table><div class="card"><div class="mx" aria-hidden="true"><div class="h"></div>' + ["Full", "Standard", "Light"].map(s => '<div class="h">' + s + "</div>").join("");
  ["A", "B", "C"].forEach(sp => { h += '<div class="h">Spur ' + sp + "</div>" + ["Full", "Standard", "Light"].map(st => { const m = pep.filter(x => x.c.sp === sp && x.c.st === st).length; return '<div class="c" style="' + (m ? "background:var(--tint-soft);border-color:var(--tint)" : "opacity:.45") + '">' + m + "</div>"; }).join(""); });
  h += "</div></div>";
  const hist = {}; pep.forEach(x => hist[x.c.n] = (hist[x.c.n] || 0) + 1); const ks = Object.keys(hist).map(Number).sort((a, b) => a - b), mx = Math.max(1, ...Object.values(hist));
  h += '<h2 class="sec">Verteilung der Review-Anzahl</h2><table class="sr"><caption>Anzahl Vorhaben je Review-Anzahl</caption><thead><tr><th>Reviews</th><th>Vorhaben</th></tr></thead><tbody>' + ks.map(k => "<tr><th>" + k + "</th><td>" + hist[k] + "</td></tr>").join("") + '</tbody></table><div class="card" aria-hidden="true"><div class="hist">' + ks.map(k => '<div style="height:' + hist[k] / mx * 100 + '%"><span>' + hist[k] + "</span></div>").join("") + '</div><div class="histx">' + ks.map(k => "<span>" + k + "</span>").join("") + "</div></div>";
  const lim = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), soon = P.filter(p => p.date && p.status !== "ki" && p.date >= TODAY && p.date <= lim).sort((a, b) => a.date.localeCompare(b.date));
  h += '<h2 class="sec">Nächste Gates (30 Tage)</h2>' + (soon.length ? '<ul class="group">' + soon.map(p => '<li><a class="row" href="#/vorhaben/' + encodeURIComponent(p.id) + '"><span class="t">' + esc(p.name) + '<span class="s">' + esc(p.next) + '</span></span><span class="tr num">' + fmtD(p.date) + "</span></a></li>").join("") + "</ul>" : '<div class="empty">Keine Termine.</div>');
  h += '<div class="btns"><button class="btn" data-act="report">Monatsreport</button><button class="btn" data-act="csv">Roadmap als CSV</button></div><p class="foot">Hinweis zur Ressourcenallokation: Die Review-Last je Pfad ist ein Planungsanhalt. Die Zahlen stammen nur aus den hier erfassten Vorhaben.</p>';
  view.innerHTML = h;
}

/* ---------- Mehr ---------- */
function vMore() {
  setBar(brand, "", roleBtn());
  const st = S.state;
  view.innerHTML = '<h1 class="big">Mehr</h1><ul class="group"><li><a class="row" href="#/mehr/regelwerk"><span class="t">Regelwerk<span class="s">Version ' + RW.rules().ver + (RW.draft() ? (RW.draft().pending ? " · Entwurf beim PGB" : " · Entwurf in Arbeit") : "") + ', Product Governance pflegt, PGB gibt frei</span></span><span class="chev">›</span></a></li><li><button class="row" data-act="demoload"><span class="t">Beispielvorhaben laden<span class="s">14 fiktive Vorhaben in allen Status, mit Nachweisen, zum Ausprobieren</span></span><span class="chev">›</span></button></li>' + (S.hasDemo() ? '<li><button class="row" data-act="demodel"><span class="t">Beispielvorhaben entfernen<span class="s">Eigene Vorhaben bleiben erhalten</span></span><span class="chev">›</span></button></li>' : "") + '<li><button class="row" data-act="reset"><span class="t"><b>Alles zurücksetzen</b><span class="s">Vorhaben, Nachweis-Dateien und Entwurf löschen, App startet leer (z. B. für eine Vorführung)</span></span><span class="chev">›</span></button></li></ul><h2 class="sec">Rolle</h2><div class="card">' + seg("role", Object.entries(ROLES), st.role) + '<p class="foot" style="margin:0">Die Rolle ist ein Umschalter, keine Anmeldung.</p></div>' +
    '<h2 class="sec">Wochensitzung des PGB</h2>' + seg("meet", [[1, "Mo"], [2, "Di"], [3, "Mi"], [4, "Do"], [5, "Fr"]], st.meetDay) + '<p class="foot" style="margin:-6px 16px 12px">Nächste Sitzung: ' + esc(fmtD(S.nextMeeting())) + '. Vorher die Tagesordnung unter Freigaben exportieren.</p>' +
    '<h2 class="sec">Anzeige</h2>' + seg("theme", [["dark", "Dunkel"], ["light", "Hell"], ["auto", "Automatisch"]], st.theme) +
    '<p class="foot" style="margin:-6px 16px 6px">Schriftgröße</p>' + seg("fs", [[1, "A"], [1.15, "A+"], [1.3, "A++"], [1.5, "A+++"]], st.fs) +
    '<ul class="group"><li class="row"><label class="t" for="hc">Kontrast erhöhen<span class="s">Kräftigere Trennlinien und Zusatztexte</span></label><span class="sw"><input id="hc" type="checkbox" data-hc' + (st.hc ? " checked" : "") + '><span></span></span></li></ul>' +
    '<h2 class="sec">Datensicherung</h2><ul class="group"><li><button class="row" data-act="exportjson"><span class="t">Sicherung exportieren (JSON)<span class="s">Ohne Nachweis-Dateien, die bleiben in diesem Browser</span></span><span class="chev">›</span></button></li><li><label class="row" for="imp" style="cursor:pointer"><span class="t">Sicherung laden</span><span class="chev">›</span></label><input id="imp" type="file" accept=".json,application/json" class="sr"></li><li><button class="row" data-act="csv"><span class="t">Roadmap exportieren (CSV)</span><span class="chev">›</span></button></li>' +
    (st.corrupt && S.corruptRaw() ? '<li><button class="row" data-act="defekt"><span class="t">Beschädigte Daten herunterladen<span class="s">Der Speicher war nicht lesbar und wurde beiseitegelegt.</span></span><span class="chev">›</span></button></li>' : "") +
    '</ul>' +
    '<p class="foot">Alle Daten liegen nur in diesem Browser (localStorage). Geräte teilen nichts. Für gemeinsame Nutzung wäre ein Server mit Anmeldung nötig.</p>' +
    '<h2 class="sec">Über</h2><ul class="group"><li><button class="row" data-act="help"><span class="t">Tastenkürzel</span><span class="chev">›</span></button></li><li><a class="row" href="#/mehr/regeln"><span class="t">Regeln und Quellen</span><span class="chev">›</span></a></li><li><a class="row" href="#/mehr/offen"><span class="t">Offene Fragen</span><span class="chev">›</span></a></li>' + row("Version", VERSION) + row("Modell", "Studienarbeit T3100, Kap. 5.7") + "</ul>";
}
function vRules() {
  setBar(back("#/mehr", "Mehr"), "Regeln", roleBtn());
  const T = RW.rules().thr;
  view.innerHTML = '<h1 class="big">Regeln und Quellen</h1><div class="card"><h3>Ideenpool</h3><p class="meta">Jeder reicht Ideen ein, bewertet und kommentiert. Das PGB stößt an, eine Projektleitung übernimmt und legt das Vorhaben an.</p>' +
    '<h3>Einstufung</h3><p class="meta">PEP-pflichtig ab mindestens 2 Monaten Dauer, 2 Abteilungen und je Abteilung 0,3 FTE oder 30 000 € Aufwand, für alle Spuren.</p>' +
    '<h3>Spur</h3><p class="meta">Drei Ja/Nein-Fragen: A (Device with Software), B (Software on Device), C (Software & Data). Das PGB bestätigt die Spur an G1. Ändert sich die Spur, beginnt die Freigabe wieder an G1.</p>' +
    '<h3>Generationsstufe</h3><p class="meta">Full ab ' + T.full + ' %, Light bis ' + T.light + ' % Neuentwicklungsanteil, sonst Standard; mit Hardware zählt der höhere Anteil. Teilsystemliste ab Standard Pflicht. Risiko-Korrektur: neue Zulassung, neue Technologie oder externer Partner heben die Stufe um eine an.</p>' +
    '<h3>Bausteine und Liefergegenstände</h3><p class="meta">Je Spur Pflicht, vorgeschlagen (Abwahl mit Begründung) oder optional; Product Governance pflegt, das PGB gibt frei. Liefergegenstände je Phase und Spur nach Tab. 12.</p>' +
    '<h3>Freigabe</h3><p class="meta">G1: das PGB entscheidet direkt. Ab G2 (und G1+2): das Projektteam (MS Gate Committee) prüft auf Vollständigkeit, in Spur A und B mit Prüfvermerk HW und SW; das PGB entscheidet. Freigabe nur, wenn alles vorliegt, kein Go mit offenen Punkten. Regulatorik nicht erfüllt: Modify. Hold mit Wiedervorlage ≤ 3 Monate, Kill mit Abbruchbericht. WP Board nur auf Vorlage des PGB.</p>' +
    '<h3>Wochensitzung</h3><p class="meta">Das PGB tagt wöchentlich; vorher wird die Tagesordnung exportiert. Entscheidungen gehen per E-Mail an die Projektleitung.</p>' +
    '<h3>Änderungen</h3><p class="meta">Backlog der Spur; nächstes Gate (Systemanforderungen, Hardware, Gate-Termin, Liefertermin bis 4 Wochen, Budget bis ' + WP_LIMIT.toLocaleString("de-DE") + ' €); über das PGB an das WP Board (Liefertermin über 4 Wochen, Budget darüber). Vorgezogene Arbeiten laut Projektplan sind erlaubt, vertragliche Bindungen entscheidet das PGB.</p>' +
    '<h3>Nach G5</h3><p class="meta">Verantwortung im Lebenszyklus benennen; Post-Launch-Review 6 bis 12 Monate nach dem Abschluss.</p>' +
    '<h3>Quelle</h3><p class="meta" style="margin:0">Studienarbeit T3100, Kap. 4.2.3 und 5; Fragenkatalog vom 28.11.2026; Visio PFAD_Prozess_v5. Referenzfälle Tab. 18, geprüft durch tests/referenzfaelle.test.mjs.</p></div>';
}
function vOpen() {
  setBar(back("#/mehr", "Mehr"), "Offene Fragen", roleBtn());
  const Q = ["Was geschieht mit Ideen, die niemand übernimmt?", "Leitfragen: reicht beantwortet / offen (E9 offen geblieben)?", "G1+2 bei Light: läuft sie über das Projektteam (Annahme der App)?", "Gate-Schema G1 bis G5 gegenüber G0 bis G8 im Renew PEP.", "Schwellen 20 % und 60 % an abgeschlossenen Projekten prüfen.", "Später: Anmeldung über Firmenkonten, Nachweise in SharePoint, Benachrichtigung per E-Mail aus dem System.", "Später: Sprint Reviews (V4), Referenzsystem (V7), Takt je Teilsystem (V8), Nutzerfeedback (V9)."];
  view.innerHTML = '<h1 class="big">Offene Fragen</h1><ul class="group">' + Q.map((q, i) => '<li class="row"><span class="t"><span class="s">Frage ' + (i + 1) + "</span>" + esc(q) + "</span></li>").join("") + "</ul>";
}
const roleList = () => '<ul class="group">' + Object.entries(ROLES).map(([k, l]) => '<li><button class="row" data-act="role" data-v="' + k + '" aria-pressed="' + (S.state.role === k) + '"><span class="t">' + esc(l) + '<span class="s">' + esc({PL: "übernimmt Ideen, reicht ein, stellt Änderungsanträge", MS: "Projektteam, prüft ab G2 auf Vollständigkeit", PPB: "Wochensitzung: entscheidet, stößt Ideen an, gibt Regelwerk frei", WP: "nur auf Vorlage des PGB", PG: "pflegt Regelwerk und Bausteine"}[k]) + '</span></span><span class="tr">' + (S.state.role === k ? "✓" : "") + "</span></button></li>").join("") + "</ul>";

/* ---------- Konfigurator (Aufbau wie ein Autokonfigurator) ---------- */
const CSTEPS = ["Schnellstart", "Einstufung", "Spur", "Generationsstufe", "Bausteine", "Zusammenfassung"];
// Merkt den letzten Stand, damit die Zusammenfassung zeigt, was die letzte Wahl geändert hat
function track(s) {
  if (ui.cfgPrev && ui.cfgPrev.sig !== s.sig) { ui.delta = C.diff(ui.cfgPrev, s); ui.newKeys = C.newMarks(ui.cfgPrev, s); ui.fresh = true; }
  else ui.fresh = false;
  ui.cfgPrev = s;
}
function cfgNext(w) {
  return w.step < 5 ? '<button class="btn primary cb-next" data-act="wiznext">Weiter: ' + esc(CSTEPS[w.step + 1]) + " ›</button>"
    : '<button class="btn primary cb-next" data-act="wizsubmit"' + (S.state.role === "PL" ? "" : " disabled") + ">Einreichen</button>";
}
function cfgNav(w) {
  const sub = [["cfg-stufe", "Durch die Stufe"], ["cfg-spur", "Durch die Spur"], ["cfg-opt", "Optional"]];
  return '<nav class="cnav" aria-label="Schritte des Konfigurators"><ol>' + CSTEPS.map((t, i) =>
    '<li><button type="button" data-act="cfggo" data-v="' + i + '"' + (i === w.step ? ' aria-current="step"' : "") + (i < w.step ? ' class="done"' : "") + ">" + esc(t) + "</button>" +
    (i === 4 && w.step === 4 ? '<ul class="csub">' + sub.map(([id, l]) => '<li><button type="button" data-act="cfgjump" data-v="' + id + '">' + l + "</button></li>").join("") + "</ul>" : "") + "</li>").join("") + "</ol></nav>";
}
const cfgDv = s => s.ok ? String(s.dv) : "–";
const cfgAt = s => s.ok ? [["Pfad", s.path], ["Gates", String(s.gates)], ["Reviews", String(s.rv)], ["Liefergegenstände", cfgDv(s)]] : [["Pfad", "ohne PEP"]];
function stufeCards(c, cur) {
  const T = C.ctxRules().thr, lst = cur.ok && (cur.r.sh.swList || (cur.r.hc && cur.r.sh.hwList)), hint = {Light: "bis " + T.light + " % neu", Standard: "über " + T.light + " bis unter " + T.full + " % neu", Full: "ab " + T.full + " % neu"};
  return ["Light", "Standard", "Full"].map(st => {
    const s = C.sumOf(C.withStufe(c, st));
    return C.card({sel: cur.ok && cur.r.st === st, badge: hint[st], title: st, sub: st === "Light" ? "kleiner Pfad, G1 und G2 als Startfreigabe G1+2" : st === "Full" ? "voller Pfad, ohne Abgleich mit Referenzprodukt" : "mittlerer Pfad",
      attrs: [["Gates", String(s.gates)], ["Reviews", String(s.rv)], ["Liefergegenstände", cfgDv(s)]], delta: C.diff(cur, s), act: ' data-act="cfgstufe" data-v="' + st + '"', label: lst ? "aus Teilsystemliste" : "Wählen", dis: !cur.ok || lst});
  }).join("");
}
const tyLabel = (r, m) => ({stufe: "Stufe", pflicht: "Pflicht", spur: "vorgeschlagen", opt: "optional"}[r.ty(m)] || "");
function modCard(m, c, cur, r) {
  const t0 = r.ty(m), on = r.isOn(m), fixed = t0 === "stufe" || t0 === "pflicht", abw = t0 === "spur" && !on, s = C.sumOf(C.withMod(c, m, !on));
  const sw = '<span class="sw"><input type="checkbox" data-mod="' + m.id + '"' + (on ? " checked" : "") + (fixed ? " disabled" : "") + ' aria-label="' + esc(m.t) + '"><span></span></span>';
  return '<article class="ccard mod' + (on ? " sel" : "") + '"><div class="cc-top"><div><span class="cc-ph">' + esc(PH[m.ph]) + "</span><h3>" + esc(m.t) + "</h3></div>" + sw + "</div>" +
    '<dl class="cc-at"><dt>Liefert</dt><dd>' + esc(m.d) + "</dd>" + (m.rv ? "<dt>Review</dt><dd>" + esc(m.rv.n) + "</dd>" : "") + "</dl>" +
    (fixed ? '<p class="cc-sub">Pflicht in Standard und Light, durch die Stufe gesetzt.</p>' :
      '<div class="cc-f"><div class="cc-d"><span class="lab">' + (on ? "Beim Abwählen" : "Beim Hinzufügen") + "</span>" + C.chips(C.diff(cur, s), "keine Änderung am Pfad") + "</div></div>") +
    (abw ? '<div class="why"><label class="f" for="why-' + m.id + '">Begründung der Abwahl (Pflicht)</label><textarea id="why-' + m.id + '" data-why="' + m.id + '" maxlength="300">' + esc(c.why[m.id] || "") + "</textarea></div>" : "") + "</article>";
}
function vWizard() {
  if (!S.state.draft) { S.state.draft = S.newWiz(); S.save(); ui.cfgPrev = null; ui.delta = null; }
  const w = S.state.draft; C.useRules(S.rxOf(w)); const c = w.c, s = C.sumOf(c), r = s.r;
  track(s);
  setBar('<button class="navbtn" data-act="wizleave">Verlassen</button>', "Schritt " + (w.step + 1) + " von 6 · " + CSTEPS[w.step], '<button class="navbtn strong" data-act="wizsum">Übersicht</button>');
  let h = '<div class="cfg">' + cfgNav(w) + '<div class="cmain"><div id="cfgBar">' + C.bar(s, ui.delta, ui.fresh, cfgNext(w)) + '</div><div id="cfgStage">' + C.stage(s, ui.fresh ? ui.newKeys : null) + "</div>";
  h += '<h1 class="big">' + CSTEPS[w.step] + "</h1>";
  if (ui.wizErr) h += '<div class="err" role="alert">' + esc(ui.wizErr) + "</div>";
  if (w.step === 0) {
    if (!w.meta) h += '<p class="meta">Mit einem Referenzfall aus Tab. 16 starten oder Schritt für Schritt selbst konfigurieren.</p><div class="cgrid">' + PRESETS.map((p, i) => {
      const ps = C.sumOf(C.withPreset(c, p));
      return C.card({sel: ps.sig === s.sig, badge: "Referenzfall", title: p.n, sub: p.s, attrs: cfgAt(ps), delta: C.diff(s, ps), act: ' data-act="preset" data-i="' + i + '"', label: "Übernehmen"});
    }).join("") + "</div>";
    const iv = w.idea && S.state.I.find(i => i.id === w.idea);
    if (iv) h += '<div class="note"><b>Aus Idee ' + esc(iv.id) + ":</b> " + esc(iv.t) + ". Beim Anlegen wird die Idee als übernommen markiert.</div>";
    const pv = w.pred && S.byId(w.pred);
    if (pv) h += '<div class="note"><b>Folgegeneration von ' + esc(pv.id) + ' ' + esc(pv.name) + '.</b> Der Vorgänger ist Referenzprodukt, seine Teilsysteme stehen in der Generationsstufe als übernommen.' + (pv.ll ? '<br><b>Lessons Learned:</b> ' + esc(pv.ll) : '') + '</div>';
    h += '<h2 class="sec">Steckbrief</h2><div class="card"><div class="fg"><label class="f" for="w-name">Name des Vorhabens</label><input id="w-name" data-f="name" type="text" value="' + esc(w.name) + '" maxlength="80" autocomplete="off"></div>' +
      '<div class="fg"><label class="f" for="w-pc">Product Center</label><select id="w-pc" data-f="pc">' + PCS.map(x => "<option" + (x === w.pc ? " selected" : "") + ">" + esc(x) + "</option>").join("") + '</select></div>' +
      '<div class="fg"><label class="f" for="w-pl">Projektleitung (Pflicht)</label><input id="w-pl" data-f="pl" type="text" value="' + esc(w.pl) + '" maxlength="60" autocomplete="off"></div>' +
      '<div class="fg"><label class="f" for="w-sp">Project Sponsor (bestätigt vor jedem Gate die Ressourcen)</label><input id="w-sp" data-f="sp" type="text" value="' + esc(w.sp || "") + '" maxlength="60" autocomplete="off"></div>' +
      '<div class="fg"><label class="f" for="w-po">Product Owner (optional)</label><input id="w-po" data-f="po" type="text" value="' + esc(w.po || "") + '" maxlength="60" autocomplete="off"></div>' +
      '<div class="fg"><label class="f" for="w-date">Termin nächster Meilenstein (optional)</label><input id="w-date" data-f="date" type="date" value="' + esc(w.date) + '"></div>' +
      '<div class="fg"><label class="f" for="w-ref">Referenzprodukt (optional)</label><input id="w-ref" data-f="ref" type="text" value="' + esc(w.ref) + '" maxlength="80"></div>' +
      '<div class="fg" style="margin:0"><label class="f" for="w-desc">Kurzbeschreibung (optional)</label><textarea id="w-desc" data-f="desc" maxlength="400">' + esc(w.desc) + "</textarea></div></div>";
  } else if (w.step === 1) {
    const T = ["Dauer mindestens 2 Monate", "Mindestens 2 Abteilungen beteiligt", "Mindestens 0,3 FTE oder 30 000 € Aufwand"];
    h += '<p class="meta">Erst wenn alle drei Schwellen erreicht sind, entsteht ein PEP-Pfad.</p><div class="card" style="padding-top:4px;padding-bottom:4px">' + T.map((t, i) => '<div class="qrow" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding-right:0"><span>' + t + "</span>" + yn("thr", i, c.thr[i]) + "</div>").join("") + "</div>" +
      (r.ok ? '<div class="note">Alle drei Schwellen erreicht: PEP-pflichtig.</div>' : '<div class="warn">Unter den Schwellen: Das Vorhaben wird als Roadmap-Eintrag ohne PEP angelegt.</div>');
  } else if (w.step === 2) {
    const cur = C.spurKey(r);
    h += '<p class="meta">Die Spur legt Takt, Bausteine und den Satz an Liefergegenständen fest. Jede Karte zeigt, was sich am Pfad ändert.</p><div class="cgrid">' + C.SPUREN.map((x, i) => {
      const hs = C.sumOf(C.withSpur(c, x));
      return C.card({sel: cur === x.k, title: x.t, sub: x.n, attrs: [["Hardware", x.hw], ["Takt", x.takt], ["Liefergegenstände", hs.dv + " (Spur " + hs.r.sp + ")"], ["Gates", String(hs.gates)], ["Reviews", String(hs.rv)]],
        delta: C.diff(s, hs), act: ' data-act="cfgspur" data-i="' + i + '"', label: "Auswählen", dis: !r.ok});
    }).join("") + "</div>";
    const Q = ["Läuft das Ergebnis auf einem Gerät?", "Wird die Hardware neu entwickelt oder verändert?", "Führt die Hardware das Vorhaben (Software folgt dem Hardwarestand)?"];
    h += '<details class="card cq"><summary>Mit drei Fragen bestimmen (Entscheidungsbaum)</summary>' + Q.map((t, i) => '<div class="qrow' + (i && !c.q[0] ? " off" : i === 2 && !c.q[1] ? " off" : "") + '" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding-right:0"><span>' + t + "</span>" + yn("q", i, c.q[i]) + "</div>").join("") + "</details>";
  } else if (w.step === 3) {
    h += '<p class="meta">Die Stufe folgt aus dem Anteil der Neuentwicklung. Eine Karte setzt Beispielwerte, die Anteile darunter genau einstellen.</p><div class="cgrid c3" id="cfgStufe">' + stufeCards(c, s) + "</div>";
    h += tsBlock(c, r) + riskBlock(c, r) + '<div class="card">' + stepper("hw", "Hardware-Neuentwicklung", r.sh.hw, !r.hc || r.sh.hwList) + stepper("sw", "Software-Neuentwicklung", r.sh.sw, r.sh.swList) + (r.sh.hwList || r.sh.swList ? '<p class="foot" style="margin:8px 0 0">Werte aus der Teilsystemliste sind gesperrt. Ohne Liste gilt die Schätzung.</p>' : "") +
      (r.hc ? '<p class="foot" style="margin:8px 0 0">Bei Hardwareänderung zählt der höhere Anteil (Annahme).</p>' : '<p class="foot" style="margin:8px 0 0">Ohne Hardwareänderung zählt nur der Softwareanteil.</p>') + "</div>" +
      '<div class="card"><div class="fg" style="margin:0"><label class="f" for="w-ref2">Referenzprodukt</label><input id="w-ref2" data-f="ref" type="text" value="' + esc(w.ref) + '" maxlength="80"><p class="foot" style="margin:6px 0 0">Bei Standard und Light wird der Abgleich mit dem Referenzprodukt als Baustein gesetzt.</p></div></div>';
  } else if (w.step === 4) {
    const all = RW.mods(C.ctxRules()), pool = all.filter(m => r.avail(m)), na = all.filter(m => !r.avail(m));
    const grp = (id, t, list, note) => list.length ? '<h2 class="sec" id="' + id + '">' + t + "</h2>" + (note ? '<p class="foot" style="margin:0 16px 8px">' + note + "</p>" : "") + '<div class="cgrid">' + list.map(m => modCard(m, c, s, r)).join("") + "</div>" : "";
    h += '<p class="meta">Der Pflichtkern ist fest. Jede Karte zeigt, was ein Baustein am Pfad ändert. Vorgeschlagene Bausteine lassen sich nur mit Begründung abwählen.</p>' +
      grp("cfg-stufe", "Pflicht (Stufe oder Regelwerk)", pool.filter(m => ["stufe", "pflicht"].includes(r.ty(m)))) +
      grp("cfg-spur", "Durch die Spur vorgeschlagen", pool.filter(m => r.ty(m) === "spur"), "Abwählen nur mit Begründung.") +
      grp("cfg-opt", "Optional", pool.filter(m => r.ty(m) === "opt")) +
      (na.length ? '<p class="foot">Für diese Spur und Stufe nicht verfügbar: ' + esc(na.map(m => m.t).join(", ")) + "</p>" : "");
  } else {
    h += '<div class="spur"><div class="L">' + r.sp + '</div><div><b>' + esc(r.path) + (r.ok ? " · " + r.n + " Reviews" : "") + "</b><p>" + esc(w.name || "Ohne Namen") + " · " + esc(w.pc) + "</p></div></div>";
    if (r.ok) { let lp = -1; h += '<h2 class="sec">Ablauf</h2><ol class="tl">'; r.order.forEach(o => { const ph = phaseOf(o); if (ph !== lp) { h += '<li class="ph">' + esc(PH[ph]) + "</li>"; lp = ph; } h += '<li class="' + (o.rv ? "rv" : "") + '">' + esc(o.n) + (o.t ? " " + esc(o.t) : "") + "</li>"; }); h += "</ol>";
      h += '<h2 class="sec">Bausteine</h2><ul class="group">' + r.on.map(m => row(m.t, tyLabel(r, m))).join("") + r.ab.map(m => '<li class="row"><span class="t">' + esc(m.t) + ' <span class="lock">abgewählt</span><span class="s">' + esc(c.why[m.id] || "Begründung fehlt") + "</span></span></li>").join("") + "</ul>";
      h += '<h2 class="sec">Liefergegenstände (Spur ' + esc(r.sp) + ', Regelwerk v' + r.ver + ')</h2>' + dvList(r); }
    h += '<p class="foot">' + (S.state.role === "PL" ? "Nach dem Anlegen erarbeitest du Phase 01, hakst die Nachweise ab und reichst G1 ein; das PGB entscheidet direkt in der Wochensitzung." : "Einreichen ist nur in der Rolle Projektleitung möglich.") + "</p>";
  }
  h += '<div class="actionbar">' + (w.step ? '<button class="btn back" data-act="wizprev">Zurück</button>' : "") + (w.step < 5 ? '<button class="btn primary" data-act="wiznext">Weiter</button>' : '<button class="btn primary" data-act="wizsubmit"' + (S.state.role === "PL" ? "" : " disabled") + ">Einreichen</button>") + "</div></div></div>";
  view.innerHTML = h;
}
// Live-Aktualisierung beim Halten der Plus-/Minus-Tasten, ohne die Eingabe neu aufzubauen
function cfgLive() {
  const d = S.state.draft; if (!d) return; const s = C.sumOf(d.c); track(s);
  const b = $("#cfgBar"), st = $("#cfgStage"), k = $("#cfgStufe");
  if (b) b.innerHTML = C.bar(s, ui.delta, ui.fresh, cfgNext(d)); if (st) st.innerHTML = C.stage(s, ui.fresh ? ui.newKeys : null); if (k) k.innerHTML = stufeCards(d.c, s);
  const hw = $("#in-hw"), r = s.r; if (hw) { const x0 = !r.hc || r.sh.hwList; hw.disabled = x0; hw.parentElement.querySelectorAll("button").forEach(x => x.disabled = x0); }
}
// Risiko-Korrektur (Ergänzung V2): hebt die Stufe um eine an, nie ab
function riskBlock(c, r) {
  const R0 = c.risk || [0, 0, 0];
  return '<h2 class="sec">Risiko-Korrektur</h2><div class="card"><p class="meta" style="margin-top:0">Jede Ja-Antwort hebt die Stufe um eine an (Light → Standard → Full), nie ab.' + (r.risk && r.st !== r.st0 ? " <b>Aus " + r.st0 + " wird " + r.st + ".</b>" : "") + "</p>" +
    RISK.map((q, i) => '<label class="row" style="padding-left:0"><span class="t">' + esc(q) + '</span><span class="sw"><input type="checkbox" data-risk="' + i + '"' + (R0[i] ? " checked" : "") + '><span></span></span></label>').join("") + "</div>";
}
// Teilsystemliste (PGE nach Albers): übernommen = Übernahmevariation, angepasst = Gestaltvariation, neu = Prinzipvariation
function tsBlock(c, r) {
  const L = c.ts || [], cnt = d => L.filter(t => t.d === d).length;
  return '<h2 class="sec">Teilsysteme</h2><div class="card"><p class="meta" style="margin-top:0">Abgleich mit dem Referenzprodukt je Teilsystem. Der Neuentwicklungsanteil einer Domäne ist der Anteil angepasster und neuer Teilsysteme (Gestalt- und Prinzipvariation). In Standard und Light gelten die Liefergegenstände der Spur nur für geänderte Teilsysteme.</p>' +
    L.map((t, i) => '<div class="tsrow"><label class="f sr" for="ts-n-' + i + '">Teilsystem</label><input id="ts-n-' + i + '" type="text" maxlength="60" placeholder="Teilsystem" data-ts="n" data-i="' + i + '" value="' + esc(t.n) + '"><label class="f sr" for="ts-d-' + i + '">Domäne</label><select id="ts-d-' + i + '" data-ts="d" data-i="' + i + '">' + ["HW", "SW"].map(x => "<option" + (t.d === x ? " selected" : "") + ">" + x + "</option>").join("") + '</select><label class="f sr" for="ts-s-' + i + '">Status</label><select id="ts-s-' + i + '" data-ts="s" data-i="' + i + '">' + Object.entries(TSS).map(([k, l]) => '<option value="' + k + '"' + (t.s === k ? " selected" : "") + ">" + l + "</option>").join("") + '</select><button type="button" class="inline-btn" data-act="tsdel" data-i="' + i + '" aria-label="Teilsystem entfernen">Entfernen</button></div>').join("") +
    '<div class="btns"><button type="button" class="btn small" data-act="tsadd" data-v="HW"' + (r.hc ? "" : " disabled") + '>Teilsystem Hardware</button><button type="button" class="btn small" data-act="tsadd" data-v="SW">Teilsystem Software</button></div>' +
    (L.length ? '<p class="foot" style="margin:8px 0 0">' + (cnt("HW") ? "Hardware " + r.sh.hw + " % aus " + cnt("HW") + " Teilsystemen. " : "") + (cnt("SW") ? "Software " + r.sh.sw + " % aus " + cnt("SW") + " Teilsystemen. " : "") + "Angepasst und neu zählen gleich (Annahme).</p>" : "") + "</div>";
}
const stepper = (k, l, v, dis) => '<div class="step"><div class="lab">' + l + '</div><div class="ctl"><button type="button" data-hold="' + k + '" data-d="-5" aria-label="' + l + ' verringern"' + (dis ? " disabled" : "") + '>−</button><input type="text" inputmode="numeric" id="in-' + k + '" data-stepin="' + k + '" value="' + v + '" aria-label="' + l + ' in Prozent"' + (dis ? " disabled" : "") + '><b>%</b><button type="button" data-hold="' + k + '" data-d="5" aria-label="' + l + ' erhöhen"' + (dis ? " disabled" : "") + ">+</button></div></div>";
const lvl = r => ["Full", "Standard", "Light"].map(s => '<div class="' + (r.st === s ? "on" : "") + '"><b>' + s + "</b>" + (s === "Full" ? "ab " + C.ctxRules().thr.full + " %" : s === "Light" ? "bis " + C.ctxRules().thr.light + " %" : "dazwischen") + "</div>").join("");
function wizGo(n) { const w = S.state.draft; w.step = n; ui.wizErr = ""; ui.delta = null; S.save(); vWizard(); view.scrollTop = 0; }


/* ---------- Regelwerk ---------- */
ui.rwGate = "G2"; ui.rwPrev = "0";
const chip = (on, act, attrs, l) => '<button type="button" class="chipb" data-act="' + act + '" ' + attrs + ' aria-pressed="' + on + '">' + esc(l) + "</button>";
function vRegel() {
  setBar(back("#/mehr", "Mehr"), "Regelwerk", roleBtn());
  const A = RW.rules(), D = RW.draft(), W = RW.work(), g = ui.rwGate, its = W.items.filter(i => i.gate === g), STU = ["Full", "Standard", "Light"], role = S.state.role;
  const can = role === "PG" && !(D && D.pending), dis = can ? "" : " disabled", gi = +g.slice(1) - 1;
  let h = '<h1 class="big">Regelwerk</h1>';
  // Status und Governance: Product Governance pflegt, PGB gibt frei
  h += '<div class="card"><p class="meta" style="margin-top:0">Aktiv: <b>Version ' + A.ver + "</b>" + (A.at ? " seit " + esc(fmtD(A.at)) + ", freigegeben von " + esc(A.by) : " (Standard aus der Studienarbeit)") + ".</p>";
  if (D) h += '<p class="meta">' + (D.pending ? "<b>Entwurf liegt beim PGB</b> seit " + esc(fmtD(D.pending.at)) + "." : D.rej ? "<b>Entwurf vom PGB abgelehnt:</b> " + esc(D.rej) : "<b>Entwurf in Arbeit</b> (noch nicht aktiv).") + '</p><ul class="lfl">' + RW.diffDraft().map(t => "<li>" + esc(t) + "</li>").join("") + "</ul>";
  if (role === "PG") h += D ? (D.pending ? "" : '<div class="btns"><button class="btn primary" data-act="rwsubmit">Zur Freigabe an das PGB</button><button class="btn" data-act="rwdiscard">Entwurf verwerfen</button></div>') : '<p class="foot" style="margin:0">Jede Änderung landet zuerst in einem Entwurf. Aktiv wird er erst nach Freigabe durch das PGB.</p>';
  else if (role === "PPB" && D && D.pending) h += '<div class="btns"><button class="btn primary" data-act="rwapprove">Freigeben als Version ' + (A.ver + 1) + '</button><button class="btn" data-act="rwrejdlg">Ablehnen</button></div>';
  else h += '<p class="foot" style="margin:0">Nur ansehen: Product Governance pflegt das Regelwerk, das PGB gibt Änderungen frei. Rolle oben rechts wechseln.</p>';
  const old = S.state.P.filter(p => p.rx && p.rx.ver !== A.ver).length;
  h += '<p class="foot" style="margin:8px 0 0">Laufende Vorhaben behalten das Regelwerk ihres ersten Go' + (old ? " (" + old + " Vorhaben auf älteren Versionen)" : "") + ". Neue Fassungen gelten für neue Vorhaben und Vorhaben ohne Go.</p></div>";
  h += '<h2 class="sec">Schwellen Generationsstufe</h2><div class="card"><div class="fg"><label class="f" for="rw-l">Light bis (% Neuentwicklung)</label><input id="rw-l" type="number" min="0" max="99" inputmode="numeric" data-rw="thr" data-k="light" value="' + W.thr.light + '"' + dis + '></div><div class="fg" style="margin:0"><label class="f" for="rw-f">Full ab (% Neuentwicklung)</label><input id="rw-f" type="number" min="1" max="100" inputmode="numeric" data-rw="thr" data-k="full" value="' + W.thr.full + '"' + dis + '></div><p class="foot" style="margin:8px 0 0">Annahme aus der Studienarbeit: 20 % und 60 %.</p></div>';
  const miss = W.items.filter(RW.purposeMissing).length;
  h += '<h2 class="sec">Liefergegenstände je Gate und Spur</h2><p class="foot" style="margin:0 16px 8px">Standard nach Tab. 12. Kern = alle drei Spuren. Regel aus Kap. 5.5: Jeder Liefergegenstand beantwortet eine Leitfrage oder wird in einer späteren Phase weiterverwendet' + (miss ? ". <b>" + miss + " ohne Zuordnung.</b>" : ".") + "</p>" + seg("rwgate", RW.APP_GATES.map(x => [x, x]), g);
  const lfOpts = i => '<option value="">keine Leitfrage</option>' + (LF[g] || []).map((q, n) => '<option value="' + g + ":" + n + '"' + (i.lf === g + ":" + n ? " selected" : "") + ">" + esc(q) + "</option>").join("");
  const wvOpts = i => '<option value="">keine Folgephase</option>' + PH.map((t, n) => n > gi ? '<option value="' + n + '"' + (i.wv === n ? " selected" : "") + ">" + esc(t) + "</option>" : "").join("");
  h += '<div class="card"><p class="meta">' + its.length + " Liefergegenstände an " + g + " (" + esc(PH[gi]) + ")</p>" +
    its.map(i => '<div class="dvrow"><label class="f sr" for="in-' + i.id + '">Name</label><input id="in-' + i.id + '" type="text" maxlength="120" data-rw="iname" data-id="' + i.id + '" value="' + esc(i.name) + '"' + dis + '><div class="chips">' +
      ["A", "B", "C"].map(sp => chip(i.spuren.includes(sp), "rwchip", 'data-id="' + i.id + '" data-k="spuren" data-v="' + sp + '"' + dis, "Spur " + sp)).join("") + STU.map(s => chip(i.stufen.includes(s), "rwchip", 'data-id="' + i.id + '" data-k="stufen" data-v="' + s + '"' + dis, s)).join("") + chip(i.kat === "A", "rwkat", 'data-id="' + i.id + '"' + dis, "Validieren statt neu") + "</div>" +
      '<div class="two"><div><label class="f" for="lf-' + i.id + '">Beantwortet Leitfrage</label><select id="lf-' + i.id + '" data-rw="lf" data-id="' + i.id + '"' + dis + ">" + lfOpts(i) + '</select></div><div><label class="f" for="wv-' + i.id + '">Weiterverwendet in Phase</label><select id="wv-' + i.id + '" data-rw="wv" data-id="' + i.id + '"' + dis + ">" + wvOpts(i) + "</select></div></div>" +
      '<p class="meta">' + (RW.purposeMissing(i) ? '<span class="lock">Zuordnung fehlt</span> ' : i.zv ? '<span class="lock">Zuordnung ist ein Vorschlag</span> ' : "") + esc(i.src || "") + (i.rg ? " · Renew " + esc(i.rg) : "") + (i.quellen ? " · " + i.quellen.length + " Quellzeilen" : "") + "</p>" + (i.quellen ? '<details class="dv"><summary>Quellzeilen anzeigen</summary><ul>' + i.quellen.map(q => "<li>" + esc(q.ms) + ": " + esc(q.name) + " <small>" + esc(q.id) + "</small></li>").join("") + "</ul></details>" : "") +
      (can ? '<button class="inline-btn" data-act="rwdel" data-id="' + i.id + '" aria-label="' + esc(i.name) + ' löschen">Löschen</button>' : "") + "</div>").join("") +
    (can ? '<button class="btn" data-act="rwadd" data-g="' + g + '">Liefergegenstand hinzufügen</button>' : "") + "</div>";
  h += '<h2 class="sec">Zuordnung der Renew-Gates</h2><div class="card"><p class="meta">Welche Gates des Renew PEP (G0 bis G8) fließen beim CSV-Import in welches App-Gate? Die Standardzuordnung ist eine Annahme.</p>' + RW.APP_GATES.map(k => '<div class="dvrow"><div class="dvh"><b>App-Gate ' + k + '</b></div><div class="chips">' + RW.GATE_IDS.map(x => chip(W.gateMap[k].includes(x), "rwmap", 'data-g="' + k + '" data-v="' + x + '" title="' + esc(W.gates[x]) + '"' + dis, x)).join("") + "</div></div>").join("") + "</div>";
  h += '<h2 class="sec">Import: Quellprozess → Spuren</h2><div class="card">' + ["Device", "Digital"].map(pr => '<div class="dvrow"><div class="dvh"><b>' + pr + '</b></div><div class="chips">' + ["A", "B", "C"].map(sp => chip(W.imp[pr].includes(sp), "rwimp", 'data-p="' + pr + '" data-v="' + sp + '"' + dis, "Spur " + sp)).join("") + "</div></div>").join("") + '<p class="foot" style="margin:0">Nur für den CSV-Import. In der App gelten Liefergegenstände je Spur, nicht je Prozess.</p></div>';
  h += '<h2 class="sec">Bausteine</h2><p class="foot" style="margin:0 16px 8px">Je Spur: Pflicht (nicht abwählbar), vorgeschlagen (Abwahl nur mit Begründung), optional oder nicht verfügbar. Product Governance pflegt, das PGB gibt frei.</p><div class="card">' + RW.mods(W).map(m => '<div class="dvrow"><div class="fg"><label class="f" for="rm-t-' + m.id + '">Baustein, ' + esc(PH[m.ph]) + (m.rv ? ", Review " + esc(m.rv.n) : "") + (m.x ? " (eigener)" : "") + '</label><input id="rm-t-' + m.id + '" type="text" maxlength="80" data-rw="' + (m.x ? "xmod" : "mod") + '" data-k="t" data-id="' + m.id + '" value="' + esc(m.t) + '"' + dis + '></div><div class="fg"><label class="f" for="rm-d-' + m.id + '">Liefergegenstand</label><input id="rm-d-' + m.id + '" type="text" maxlength="120" data-rw="' + (m.x ? "xmod" : "mod") + '" data-k="d" data-id="' + m.id + '" value="' + esc(m.d) + '"' + dis + "></div>" +
    (m.ty === "stufe" ? '<p class="meta" style="margin:0">Durch die Stufe gesetzt: Pflicht bei Standard und Light.</p>' : '<div class="two">' + SPK.map(([k, l]) => '<div><label class="f" for="pf-' + m.id + "-" + k + '">' + l + '</label><select id="pf-' + m.id + "-" + k + '" data-rw="pf" data-id="' + m.id + '" data-k="' + k + '"' + dis + ">" + Object.entries(PFK).map(([v, t]) => '<option value="' + v + '"' + ((m.pf || {})[k] === v ? " selected" : "") + ">" + t + "</option>").join("") + "</select></div>").join("") + "</div>") +
    (m.x && can ? '<button class="inline-btn" data-act="rwmoddel" data-id="' + m.id + '">Baustein löschen</button>' : "") + "</div>").join("") +
    (can ? '<div class="dvrow"><b>Neuer Baustein</b><div class="two"><div><label class="f" for="nm-t">Name</label><input id="nm-t" type="text" maxlength="80"></div><div><label class="f" for="nm-ph">Phase</label><select id="nm-ph">' + PH.map((t, n) => '<option value="' + n + '">' + esc(t) + "</option>").join("") + '</select></div></div><label class="f" for="nm-rv">Eigenes Review (optional, Name)</label><input id="nm-rv" type="text" maxlength="40"><button class="btn" data-act="rwmodadd">Baustein anlegen</button></div>' : "") + "</div>";
  const pw = S.wizFromPreset(+ui.rwPrev), pc = compute(pw.c, W);
  h += '<h2 class="sec">Vorschau je Referenzfall' + (D ? " (Entwurf)" : "") + "</h2>" + seg("rwprev", PRESETS.map((p, i) => [i, p.n]), ui.rwPrev) + '<div class="card"><p class="meta">' + esc(pc.path) + " · " + pc.n + " Reviews</p>" + dvList(pc) + "</div>";
  h += '<h2 class="sec">Werkzeuge</h2><ul class="group">' + (can ? '<li><button class="row" data-act="rwpick" data-i="rwcsv"><span class="t">Quell-CSV importieren<span class="s">Product-Governance-Tabelle (G0 bis G8), wird nur im Browser gelesen und landet im Entwurf</span></span><span class="chev">›</span></button></li><li><button class="row" data-act="rwpick" data-i="rwjson"><span class="t">Regelwerk importieren (JSON)<span class="s">Landet im Entwurf</span></span><span class="chev">›</span></button></li>' : "") +
    '<li><button class="row" data-act="rwexp"><span class="t">Regelwerk exportieren (JSON)' + (D ? '<span class="s">Exportiert den Entwurf</span>' : "") + '</span><span class="chev">›</span></button></li>' + (can ? '<li><button class="row" data-act="rwreset"><span class="t"><b>Entwurf auf Standard setzen</b><span class="s">Tab. 12 und Schwellen 20/60 %, Freigabe durch das PGB nötig</span></span><span class="chev">›</span></button></li>' : "") + '</ul><input hidden type="file" id="rwcsv" accept=".csv,text/csv"><input hidden type="file" id="rwjson" accept="application/json,.json">';
  if ((A.hist || []).length) h += '<h2 class="sec">Versionen</h2><ul class="group">' + A.hist.slice().reverse().map(x => '<li class="row"><span class="t">Version ' + x.ver + '<span class="s">' + esc(x.diff.join(" · ")) + '</span></span><span class="tr">' + esc(fmtD(x.at)) + "</span></li>").join("") + "</ul>";
  view.innerHTML = h;
}
const rwRender = () => { const y = view.scrollTop; vRegel(); view.scrollTop = y; };

/* ---------- Ereignisse ---------- */
// Aktion mit Rückgängig; Fehler bleiben im Fenster stehen
function act(fn, errId) { const snap = S.snapshot(), res = fn(); if (!res) return; if (res.error) { const x = errId && document.getElementById(errId); if (x) { x.textContent = res.error; x.hidden = false; } else toast(res.error); return; } closeDlg(); toast(res.msg, () => { S.restore(snap); render(); }); render(); }
function rwEdit(fn) { if (S.state.role !== "PG") { toast("Nur Product Governance pflegt das Regelwerk"); return false; } if (!RW.edit(fn)) { toast("Der Entwurf liegt beim PGB und ist gesperrt"); return false; } return true; }
const radio = (name, opts, cur) => '<div class="rad" role="radiogroup">' + opts.map(([v, l]) => '<label><input type="radio" name="' + name + '" value="' + v + '"' + (cur === v ? " checked" : "") + "> " + esc(l) + "</label>").join("") + "</div>";
const radVal = name => { const x = document.querySelector('input[name="' + name + '"]:checked'); return x ? x.value : ""; };
function subDlg(p) {
  const o = S.curStep(p), m = S.missingDelivs(p, o), nd = S.needs(p, o), prev = S.stepOf(p, o.n).ans || {};
  let h = '<h2 id="dlg-h">Zur Freigabe einreichen</h2><p class="meta">' + esc(S.stepLabel(o)) + " · " + esc(p.name) + "</p>" + (m.length ? '<div class="warn"><b>Noch nicht abgehakt:</b> ' + esc(m.join(", ")) + ". Einreichen geht erst, wenn alles vorliegt.</div>" : '<div class="note">Alle Liefergegenstände sind abgehakt.' + (o.n === "G1" ? " An G1 entscheidet das PGB direkt in der nächsten Wochensitzung." : " Danach prüft das Projektteam auf Vollständigkeit.") + "</div>");
  if (nd.lf.length) h += '<h3>Leitfragen (Freigabekriterien, vorab bekannt)</h3>' + nd.lf.map((q, i) => '<label class="f" for="lf' + i + '">' + esc(q.q) + '</label><textarea id="lf' + i + '" data-lfk="' + q.k + '" maxlength="400" rows="2">' + esc(prev.lf ? prev.lf[q.k] || "" : "") + "</textarea>").join("");
  if (nd.rg) h += '<h3>Reifegrad gegenüber dem Ziel der Phase</h3>' + [["hw", "Hardware"], ["sw", "Software"], ["sys", "System (gemeinsam)"]].map(([k, l]) => '<p class="meta" style="margin:6px 0 0">' + l + "</p>" + radio("rg-" + k, RG.map(x => [x, x]), prev.rg ? prev.rg[k] : "")).join("");
  if (nd.kpis) h += '<label class="f" for="skpi">Kennzahlen (Spur C: an G2 festgelegt, nach jeder Iteration gemessen)</label><textarea id="skpi" maxlength="400" rows="2">' + esc(p.kpis || "") + "</textarea>";
  if (nd.ll) h += '<label class="f" for="sll">Lessons Learned (gehen an die nächste Generation)</label><textarea id="sll" maxlength="600" rows="3">' + esc(p.ll || "") + "</textarea>";
  if (nd.lc) h += '<label class="f" for="slc">Wer verantwortet das Produkt im Lebenszyklus?</label><input id="slc" type="text" maxlength="80" value="' + esc(p.lcOwner || "") + '">';
  if (nd.crs.length) h += '<div class="note"><b>Änderungsanträge zur Entscheidung an diesem Gate:</b><ul>' + nd.crs.map(c => "<li>" + esc(c.id) + ": " + esc(c.text) + "</li>").join("") + "</ul></div>";
  if (nd.sponsor) h += '<label class="row" style="padding-left:0"><span class="t">' + (p.sponsor ? esc(p.sponsor) : "Der Sponsor") + ' hat die Ressourcen für die nächste Phase bestätigt</span><span class="sw"><input id="sspok" type="checkbox"><span></span></span></label>';
  return h + '<label class="f" for="snote">Kommentar (optional)</label><textarea id="snote" maxlength="400"></textarea><p class="err" id="serr" hidden></p><div class="btns"><button class="btn" data-act="close">Abbrechen</button><button class="btn primary" data-main data-act="stepsubok" data-id="' + esc(p.id) + '">Einreichen</button></div>';
}
function msDlg(p) {
  const o = S.subStep(p), x = S.stepOf(p, o.n), nd = S.needs(p, o), r = S.cp(p), a = x.ans || {}, m = S.missingDelivs(p, o);
  let h = '<h2 id="dlg-h">Prüfung durch das Projektteam (MS Gate Committee)</h2><p class="meta">' + esc(S.stepLabel(o)) + " · " + esc(p.name) + "</p>";
  if (nd.lf.length) h += "<h3>Leitfragen</h3>" + nd.lf.map((q, i) => '<p class="meta" style="margin:8px 0 2px"><b>' + esc(q.q) + "</b><br>" + esc(a.lf ? a.lf[q.k] || "keine Antwort" : "keine Antwort") + "</p>" + radio("mlf" + i, [["ok", "beantwortet"], ["offen", "offen"]], "")).join("");
  if (a.rg) h += '<p class="meta">Reifegrad laut PL: Hardware ' + esc(a.rg.hw) + ", Software " + esc(a.rg.sw) + ", System " + esc(a.rg.sys) + "</p>";
  if (r.sp === "A" || r.sp === "B") h += "<h3>Gemeinsamer Stand von Hardware und Software</h3>" + [["mhw", "Prüfvermerk Hardware-Entwicklung"], ["msw", "Prüfvermerk Software-Entwicklung"]].map(([id, l]) => '<label class="row" style="padding-left:0"><span class="t">' + l + '</span><span class="sw"><input id="' + id + '" type="checkbox"><span></span></span></label>').join("");
  h += "<h3>Regulatorische Anforderungen</h3>" + radio("mreg", [["ja", "erfüllt"], ["nein", "nicht erfüllt (Ergebnis Modify)"], ["nr", "nicht relevant"]], "");
  if (m.length) h += '<div class="warn"><b>Nicht abgehakt:</b> ' + esc(m.join(", ")) + ". Nicht vollständig: zurück an die Projektleitung.</div>";
  return h + '<p class="foot">Das Projektteam prüft auf Vollständigkeit. Ist eine Leitfrage offen oder fehlt ein Nachweis, geht der Schritt zurück an die Projektleitung; ein Go mit offenen Punkten gibt es nicht.</p><p class="err" id="merr" hidden></p><div class="btns"><button class="btn" data-act="close">Abbrechen</button><button class="btn primary" data-main data-act="msok" data-id="' + esc(p.id) + '">Empfehlung abgeben</button></div>';
}
const crRouteTxt = (k, eur, wk) => { const t = S.crRoute(k, eur, wk); return t === "backlog" ? "Geht ins Backlog der Spur, kein Gate nötig." : t === "pgbwp" ? "Änderung am Rahmen: das PGB legt sie dem WP Board vor." : t === "pgb" ? "Vertragliche Bindung vor dem Gate: das PGB entscheidet in der nächsten Sitzung." : t === "gate" ? "Wird am nächsten Gate entschieden." : ""; };

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id, d = S.state.draft;
  const done = m => { if (m) toast(m); render(); };
  switch (a) {
    case "rwgate": ui.rwGate = el.dataset.v; rwRender(); break;
    case "rwprev": ui.rwPrev = el.dataset.v; rwRender(); break;
    case "rwmap": rwEdit(R => { const l = R.gateMap[el.dataset.g], v = el.dataset.v; R.gateMap[el.dataset.g] = l.includes(v) ? l.filter(x => x !== v) : [...l, v].sort(); }); rwRender(); break;
    case "rwchip": rwEdit(R => { const i = R.items.find(x => x.id === el.dataset.id); if (!i) return; const l = i[el.dataset.k], v = el.dataset.v; i[el.dataset.k] = l.includes(v) ? l.filter(x => x !== v) : [...l, v]; }); rwRender(); break;
    case "rwkat": rwEdit(R => { const i = R.items.find(x => x.id === el.dataset.id); if (i) i.kat = i.kat === "A" ? "D" : "A"; }); rwRender(); break;
    case "rwadd": { if (S.state.role !== "PG") break; const nid = RW.addItem(el.dataset.g); if (!nid) break; rwRender(); document.getElementById("in-" + nid)?.focus(); document.getElementById("in-" + nid)?.select(); break; }
    case "rwdel": { const W = RW.work(), ix = W.items.findIndex(x => x.id === el.dataset.id), it = ix >= 0 ? JSON.parse(JSON.stringify(W.items[ix])) : null; if (!it || !rwEdit(R => { R.items = R.items.filter(x => x.id !== it.id); })) break; rwRender(); toast("Liefergegenstand gelöscht", () => { RW.edit(R => { R.items.splice(ix, 0, it); }); rwRender(); }); break; }
    case "rwpick": document.getElementById(el.dataset.i)?.click(); break;
    case "rwexp": download("PFAD-Regelwerk-" + TODAY + ".json", RW.exportRules(), "application/json"); toast("Regelwerk exportiert"); break;
    case "rwreset": openDlg('<h2 id="dlg-h">Entwurf auf Standard setzen?</h2><p class="meta">Der Entwurf enthält danach wieder Tab. 12 und die Schwellen 20/60 %. Aktiv wird er erst nach Freigabe durch das PGB. Vorhaben bleiben unverändert.</p><div class="btns"><button class="btn" data-act="close">Abbrechen</button><button class="btn primary" data-main data-act="rwresetok">Zurücksetzen</button></div>'); break;
    case "rwresetok": if (S.state.role === "PG" && RW.draftToStandard()) { closeDlg(); toast("Entwurf auf Standard gesetzt, Freigabe durch das PGB nötig"); rwRender(); } break;
    case "close": closeDlg(); break;
    case "msdlg": openDlg(msDlg(S.byId(id))); break;
    case "msok": { const p = S.byId(id), nd = S.needs(p, S.subStep(p)), lf = {}; nd.lf.forEach((q, i) => { const v = radVal("mlf" + i); if (v) lf[q.k] = v; }); act(() => S.recommend(id, {lf, hw: !!$("#mhw")?.checked, sw: !!$("#msw")?.checked, reg: radVal("mreg")}), "merr"); break; }
    case "go": act(() => S.goDecision(id)); break;
    case "crdlg": openDlg('<h2 id="dlg-h">Änderungsantrag</h2><p class="meta">' + esc(S.byId(id).name) + '</p><label class="f" for="crk">Was ändert sich?</label><select id="crk" data-crk>' + Object.entries(CRK).map(([k, v]) => '<option value="' + k + '">' + esc(v.t) + "</option>").join("") + '</select><div id="creurw" hidden><label class="f" for="creur">Betrag der Budgetänderung in €</label><input id="creur" type="number" min="0" step="1000" inputmode="numeric" data-crk></div><div id="crwkw" hidden><label class="f" for="crwk">Verschiebung in Wochen</label><input id="crwk" type="number" min="0" step="1" inputmode="numeric" data-crk></div><p class="note" id="crroute">' + esc(crRouteTxt("backlog", 0)) + '</p><label class="f" for="crt">Beschreibung</label><textarea id="crt" maxlength="400"></textarea><p class="err" id="crerr" hidden></p><div class="btns"><button class="btn" data-act="close">Abbrechen</button><button class="btn primary" data-main data-act="crok" data-id="' + esc(id) + '">Antrag stellen</button></div>'); break;
    case "crok": act(() => S.addCR(id, $("#crk").value, $("#crt").value, $("#creur").value, $("#crwk").value), "crerr"); break;
    case "crdecdlg": { const ok = el.dataset.ok === "1"; openDlg('<h2 id="dlg-h">' + (ok ? "Änderung annehmen" : "Änderung ablehnen") + '</h2><p class="meta">' + esc(el.dataset.c) + " · " + esc(S.byId(id).name) + '</p><label class="f" for="cdt">' + (ok ? "Kommentar (optional)" : "Begründung (Pflicht)") + '</label><textarea id="cdt" maxlength="400"></textarea><p class="err" id="cderr" hidden></p><div class="btns"><button class="btn" data-act="close">Abbrechen</button><button class="btn primary" data-main data-act="crdecok" data-ok="' + (ok ? 1 : 0) + '" data-id="' + esc(id) + '" data-c="' + esc(el.dataset.c) + '">' + (ok ? "Annehmen" : "Ablehnen") + "</button></div>"); break; }
    case "crdecok": act(() => S.decideCR(id, el.dataset.c, el.dataset.ok === "1", $("#cdt").value), "cderr"); break;
    case "succ": S.state.draft = S.wizFromSuccessor(S.byId(id)); ui.wizErr = ""; S.save(); location.hash = "#/neu"; break;
    case "tsadd": d.c.ts = d.c.ts || []; d.c.ts.push({n: "", d: el.dataset.v, s: "n"}); S.guardSpur(d); S.save(); keepScroll(vWizard); document.getElementById("ts-n-" + (d.c.ts.length - 1))?.focus(); break;
    case "tsdel": d.c.ts.splice(+el.dataset.i, 1); S.guardSpur(d); S.save(); keepScroll(vWizard); break;
    case "rwsubmit": if (S.state.role === "PG" && RW.submitDraft()) { toast("Entwurf an das PGB übergeben"); rwRender(); } break;
    case "rwdiscard": { if (S.state.role !== "PG") break; RW.discardDraft(); toast("Entwurf verworfen, aktiv bleibt Version " + RW.rules().ver); rwRender(); break; }
    case "rwapprove": { if (S.state.role !== "PPB") break; const n = RW.approveDraft("PGB"); if (n) { toast("Regelwerk Version " + n + " ist aktiv"); render(); } break; }
    case "rwrejdlg": openDlg('<h2 id="dlg-h">Regelwerk-Entwurf ablehnen</h2><p class="meta">Product Governance sieht die Begründung und überarbeitet den Entwurf.</p><label class="f" for="rwr">Begründung (Pflicht)</label><textarea id="rwr" maxlength="400"></textarea><p class="err" id="rwrerr" hidden>Bitte eine Begründung eingeben.</p><div class="btns"><button class="btn" data-act="close">Abbrechen</button><button class="btn primary" data-main data-act="rwrejok">Ablehnen</button></div>'); break;
    case "rwrejok": { const t = $("#rwr").value.trim(); if (!t) { $("#rwrerr").hidden = false; break; } if (S.state.role === "PPB" && RW.rejectDraft(t)) { closeDlg(); toast("Entwurf abgelehnt"); render(); } break; }
    case "rwimp": if (rwEdit(R => { const l = R.imp[el.dataset.p], v = el.dataset.v; R.imp[el.dataset.p] = l.includes(v) ? l.filter(x => x !== v) : [...l, v]; })) rwRender(); break;
    case "filterlate": ui.filter = "late"; location.hash = "#/vorhaben"; break;
    case "pick": document.getElementById("fi-" + el.dataset.i)?.click(); break;
    case "plrok": act(() => S.recordPLR(id, radVal("plrbc"), $("#plrt").value), "plrerr"); break;
    case "meet": S.setMeetDay(+el.dataset.v); vMore(); break;
    case "agtxt": download("PGB-Tagesordnung-" + S.nextMeeting() + ".txt", S.agendaText(), "text/plain"); toast("Tagesordnung exportiert"); break;
    case "agcsv": download("PGB-Tagesordnung-" + S.nextMeeting() + ".csv", S.agendaCsv(), "text/csv"); toast("Tagesordnung als CSV exportiert"); break;
    case "pgbcr": { const a = el.dataset.a; if (a === "rejdlg") { openDlg('<h2 id="dlg-h">Änderungsantrag ablehnen</h2><p class="meta">' + esc(el.dataset.c) + " · " + esc(S.byId(id).name) + '</p><label class="f" for="pct">Begründung (Pflicht)</label><textarea id="pct" maxlength="400"></textarea><p class="err" id="pcerr" hidden></p><div class="btns"><button class="btn" data-act="close">Abbrechen</button><button class="btn primary" data-main data-act="pgbcr" data-a="rej" data-id="' + esc(id) + '" data-c="' + esc(el.dataset.c) + '">Ablehnen</button></div>'); break; }
      act(() => S.pgbCR(id, el.dataset.c, a, $("#pct") ? $("#pct").value : ""), "pcerr"); break; }
    case "iadd": act(() => S.addIdea($("#it").value, $("#ip").value, $("#in").value, $("#ipc").value, $("#iby").value), "ierr"); break;
    case "irate": S.rateIdea(id, +el.dataset.v); keepScroll(vIdeas); break;
    case "icom": { const t = document.getElementById("ic-" + id); const r0 = S.commentIdea(id, t ? t.value : ""); if (r0.error) toast(r0.error); else keepScroll(vIdeas); break; }
    case "ipushdlg": openDlg('<h2 id="dlg-h">Idee anstoßen</h2><p class="meta">' + esc(id) + '</p><label class="f" for="ipl">Projektleitung benennen (optional)</label><input id="ipl" type="text" maxlength="60"><p class="err" id="iperr" hidden></p><div class="btns"><button class="btn" data-act="close">Abbrechen</button><button class="btn primary" data-main data-act="ipush" data-id="' + esc(id) + '">Anstoßen</button></div>'); break;
    case "ipush": act(() => S.pushIdea(id, $("#ipl").value), "iperr"); break;
    case "itake": { const w = S.wizFromIdea(id); if (!w) { toast("Übernehmen nur in der Rolle Projektleitung"); break; } S.state.draft = w; ui.wizErr = ""; S.save(); location.hash = "#/neu"; break; }
    case "rwmodpf": break;
    case "rwmodadd": { if (S.state.role !== "PG") break; const nid = RW.addMod($("#nm-t").value.trim(), +$("#nm-ph").value, $("#nm-rv").value.trim()); if (nid) { toast("Baustein im Entwurf angelegt"); rwRender(); } else toast("Der Entwurf liegt beim PGB und ist gesperrt"); break; }
    case "rwmoddel": if (rwEdit(R => { R.xmods = (R.xmods || []).filter(m => m.id !== el.dataset.id); })) rwRender(); break;
    case "stepsub": openDlg(subDlg(S.byId(id))); setTimeout(() => $("#lf0")?.focus(), 50); break;
    case "stepsubok": { const lf = {}; document.querySelectorAll("[data-lfk]").forEach(t => lf[t.dataset.lfk] = t.value); act(() => S.submitStep(id, {lf, rg: {hw: radVal("rg-hw"), sw: radVal("rg-sw"), sys: radVal("rg-sys")}, sponsor: $("#ssp")?.value, sponsorOk: !!$("#sspok")?.checked, kpis: $("#skpi")?.value, ll: $("#sll")?.value, lc: $("#slc")?.value, note: $("#snote").value}), "serr"); break; }
    case "help": openDlg(helpHtml()); break;
    case "filter": ui.filter = el.dataset.v; vList(); break;
    case "role": S.setRole(el.dataset.v); render(); break;
    case "roledlg": openDlg('<h2 id="dlg-h">Rolle wählen</h2><p class="meta">Umschalter, keine Anmeldung.</p>' + roleList() + '<button class="btn" data-act="close">Fertig</button>'); break;
    case "theme": S.setTheme(el.dataset.v); applyTheme(); vMore(); break;
    case "goto": location.hash = el.dataset.v; break;
    case "resume": undoable(() => S.resume(id)); break;
    case "rdlg": { const c = S.REASONS[el.dataset.k]; openDlg('<h2 id="dlg-h">' + esc(c.t) + '</h2><p class="meta">' + esc(c.hint) + '</p><label class="f" for="rtxt">' + (el.dataset.k === "kill" ? "Grund des Abbruchs (Pflicht)" : "Begründung (Pflicht)") + '</label><textarea id="rtxt" maxlength="400" placeholder="' + esc(c.txt) + '"></textarea>' +
      (el.dataset.k === "hold" ? '<label class="f" for="rdate">Wiedervorlage (spätestens in 3 Monaten)</label><input id="rdate" type="date" min="' + TODAY + '" max="' + S.holdMax() + '" value="' + S.holdDefault() + '">' : "") +
      (el.dataset.k === "kill" ? '<label class="f" for="rll">Lessons Learned (Pflicht)</label><textarea id="rll" maxlength="600"></textarea><label class="f" for="rres">Freigegebene Ressourcen (Pflicht)</label><textarea id="rres" maxlength="400"></textarea>' : "") + '<p class="err" id="rerr" hidden></p><div class="btns"><button class="btn" data-act="close">Abbrechen</button><button class="btn primary" data-main data-act="rok" data-k="' + esc(el.dataset.k) + '" data-id="' + esc(id) + '">' + esc(c.ok) + "</button></div>"); setTimeout(() => $("#rtxt")?.focus(), 50); break; }
    case "rok": { const snap = S.snapshot(), res = S.reason(id, el.dataset.k, $("#rtxt").value, {until: $("#rdate")?.value, ll: $("#rll")?.value, res: $("#rres")?.value}); if (res.error) { const x = $("#rerr"); x.textContent = res.error; x.hidden = false; } else { closeDlg(); toast(res.msg, () => { S.restore(snap); render(); }); render(); } break; }
    case "edit": S.state.draft = S.wizFromProject(S.byId(id)); ui.wizErr = ""; S.save(); location.hash = "#/neu"; break;
    case "nachweis": download("PEP-Nachweis-" + id + ".json", JSON.stringify(S.nachweis(S.byId(id)), null, 2), "application/json"); toast("Nachweis exportiert"); break;
    case "csv": download("PEP-Roadmap-" + TODAY + ".csv", S.csvRoadmap(S.state.P), "text/csv;charset=utf-8"); toast("Roadmap exportiert"); break;
    case "exportjson": download("PFAD-Sicherung-" + TODAY + ".json", S.exportJSON(), "application/json"); S.markBackup(); toast("Sicherung exportiert"); break;
    case "defekt": download("PFAD-beschaedigt.json", S.corruptRaw(), "application/json"); break;
    case "fs": S.setFs(+el.dataset.v); applyTheme(); vMore(); break;
    case "demoload": S.loadDemo().then(n => { toast(n + " Beispielvorhaben geladen"); location.hash = "#/vorhaben"; render(); }); break;
    case "demodel": { const n = S.removeDemo(); toast(n + " Beispielvorhaben entfernt"); render(); break; }
    case "reset": openDlg('<h2 id="dlg-h">Alles zurücksetzen?</h2><p class="meta">Alle Vorhaben, hochgeladene Nachweis-Dateien und der Entwurf werden gelöscht. Das lässt sich nicht rückgängig machen.</p><div class="row"><label class="t" for="rr">Regelwerk auch auf Standard setzen (entfernt importierte Inhalte)</label><span class="sw"><input id="rr" type="checkbox"><span></span></span></div><div class="btns"><button class="btn" data-act="close">Abbrechen</button><button class="btn primary" data-main data-act="resetok">Zurücksetzen</button></div>'); break;
    case "resetok": { const rr = $("#rr")?.checked; S.resetAll(); F.clearAll().catch(() => {}); if (rr) RW.resetRules(); applyTheme(); closeDlg(); toast("Zurückgesetzt, die App ist leer"); location.hash = "#/vorhaben"; render(); break; }
    case "wipe": openDlg('<h2 id="dlg-h">Alle Daten löschen?</h2><p class="meta">Alle Vorhaben, der Entwurf und die Einstellungen gehen verloren. Zur Bestätigung LÖSCHEN eintippen.</p><label class="f sr" for="wipe-in">Bestätigung</label><input id="wipe-in" type="text" autocomplete="off" autocapitalize="characters" placeholder="LÖSCHEN"><p class="err" id="werr" hidden>Bitte genau LÖSCHEN eintippen.</p><div class="btns"><button class="btn" data-act="close">Abbrechen</button><button class="btn destructive" data-main data-act="wipeok">Löschen</button></div>'); setTimeout(() => $("#wipe-in")?.focus(), 50); break;
    case "wipeok": if ($("#wipe-in").value.trim() !== "LÖSCHEN") { $("#werr").hidden = false; break; } S.resetAll(); applyTheme(); closeDlg(); toast("Alle Daten gelöscht"); location.hash = "#/vorhaben"; render(); break;
    case "report": openDlg(report()); break;
    case "preset": { const p = PRESETS[+el.dataset.i]; d.c = C.withPreset(d.c, p); d.c.lastSp = null; S.guardSpur(d); ui.wizErr = ""; S.save(); keepScroll(vWizard); break; }
    case "cfggo": wizGo(+el.dataset.v); break;
    case "cfgjump": document.getElementById(el.dataset.v)?.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth", block: "start"}); break;
    case "cfgspur": d.c = C.withSpur(d.c, C.SPUREN[+el.dataset.i]); S.guardSpur(d); S.save(); keepScroll(vWizard); break;
    case "cfgstufe": { const x = C.withStufe(d.c, el.dataset.v); d.c.hw = x.hw; d.c.sw = x.sw; S.save(); keepScroll(vWizard); break; }
    case "thr": d.c.thr[+el.dataset.i] = +el.dataset.v; S.guardSpur(d); S.save(); keepScroll(vWizard); break;
    case "q": d.c.q[+el.dataset.i] = +el.dataset.v; if (!d.c.q[0]) { d.c.q[1] = 1; d.c.q[2] = 1; } S.guardSpur(d); S.save(); keepScroll(vWizard); break;
    case "wiznext": { if (d.step === 0 && (!d.name.trim() || !d.pl.trim())) { ui.wizErr = !d.name.trim() ? "Bitte einen Namen eingeben." : "Bitte die Projektleitung angeben."; vWizard(); break; } wizGo(Math.min(5, d.step + 1)); break; }
    case "wizprev": wizGo(Math.max(0, d.step - 1)); break;
    case "wizsum": { const r = compute(d.c, S.rxOf(d)); openDlg('<h2 id="dlg-h">Übersicht</h2><p class="meta">' + esc(d.name || "Ohne Namen") + " · " + esc(d.pc) + '</p><div class="spur"><div class="L">' + r.sp + "</div><div><b>" + esc(r.path) + (r.ok ? " · " + r.n + " Reviews" : "") + "</b><p>" + r.on.length + " Bausteine aktiv, " + r.ab.length + ' abgewählt</p></div></div><div class="btns"><button class="btn" data-act="close">Weiter bearbeiten</button><button class="btn destructive" data-act="wizdrop">Entwurf verwerfen</button></div>'); break; }
    case "wizleave": location.hash = d.meta ? "#/vorhaben/" + encodeURIComponent(d.meta) : "#/vorhaben"; break;
    case "wizdrop": { const m = d.meta, snap = S.snapshot(); S.state.draft = null; S.save(); closeDlg(); location.hash = m ? "#/vorhaben/" + encodeURIComponent(m) : "#/vorhaben"; toast("Entwurf verworfen", () => { S.restore(snap); location.hash = "#/neu"; }); break; }
    case "wizsubmit": { const snap = S.snapshot(), res = S.submitWiz(d); if (res.error) { ui.wizErr = res.error; if (res.step !== undefined) d.step = res.step; vWizard(); view.scrollTop = 0; } else { ui.wizErr = ""; toast(res.msg, () => { S.restore(snap); location.hash = "#/neu"; render(); }); location.hash = "#/vorhaben/" + encodeURIComponent(res.id); } break; }
  }
});
document.addEventListener("change", e => {
  const t = e.target, d = S.state.draft;
  if (t.dataset.mod && d) { d.c.sel = d.c.sel || {}; d.c.sel[t.dataset.mod] = t.checked; S.save(); keepScroll(vWizard); return; }
  if (t.dataset.risk !== undefined && d) { d.c.risk = d.c.risk || [0, 0, 0]; d.c.risk[+t.dataset.risk] = t.checked ? 1 : 0; S.save(); keepScroll(vWizard); return; }
  if (t.dataset.rw) {
    const k = t.dataset.k, v = t.value, id = t.dataset.id;
    const okE = rwEdit(R => { switch (t.dataset.rw) {
      case "thr": R.thr[k] = +v; break;
      case "lf": { const i = R.items.find(x => x.id === id); if (i) { i.lf = v; i.zv = false; } break; }
      case "pf": { const m0 = RW.mods(R).find(x => x.id === id); if (!m0) break; if (m0.x) { const x = R.xmods.find(y => y.id === id); x.pf = {...x.pf, [k]: v}; } else { R.mods[id] = R.mods[id] || {t: m0.t, d: m0.d}; R.mods[id].pf = {...(m0.pf || {}), [k]: v}; } break; }
      case "xmod": { const x = (R.xmods || []).find(y => y.id === id); if (x) x[k] = v; break; }
      case "wv": { const i = R.items.find(x => x.id === id); if (i) { i.wv = v === "" ? "" : +v; i.zv = false; } break; }
      case "gname": R.gates[t.dataset.g] = v.trim() || R.gates[t.dataset.g]; break;
      case "iname": { const i = R.items.find(x => x.id === id); if (i && v.trim()) i.name = v.trim(); break; }
      case "mod": R.mods[id] = Object.assign({t: RW.mods().find(m => m.id === id).t, d: RW.mods().find(m => m.id === id).d}, R.mods[id] || {}, {[k]: v.trim() || RW.mods().find(m => m.id === id)[k]}); break;
    } });
    if (okE) toast("Im Entwurf gespeichert, aktiv nach Freigabe durch das PGB"); rwRender(); return;
  }
  if (t.id === "rwcsv" && t.files[0]) { t.files[0].arrayBuffer().then(b => { try { const n = RW.importCsv(b); toast(n.quellen + " Quellzeilen in den Entwurf übernommen, " + n.neu + " neue Liefergegenstände" + (n.ohne ? ", " + n.ohne + " Zeilen ohne zugeordnetes App-Gate" : "")); rwRender(); } catch (err) { toast(err.message === "gesperrt" ? "Der Entwurf liegt beim PGB und ist gesperrt" : "CSV nicht lesbar: Spalten passen nicht"); } }); t.value = ""; return; }
  if (t.id === "rwjson" && t.files[0]) { t.files[0].text().then(x => { try { const n = RW.importRules(x); toast(n + " Liefergegenstände in den Entwurf importiert"); rwRender(); } catch (err) { toast(err.message === "gesperrt" ? "Der Entwurf liegt beim PGB und ist gesperrt" : "Import fehlgeschlagen: Datei passt nicht zum Format"); } }); t.value = ""; return; }
  if (t.dataset.pdate !== undefined) { S.setDate(t.dataset.id, t.value); toast("Plantermin gespeichert"); return; }
  if (t.dataset.chk !== undefined) { if (!S.toggleChk(t.dataset.id, t.dataset.k, t.dataset.chk, t.checked)) toast("Abhaken in dieser Rolle oder diesem Status nicht möglich"); keepScroll(vDetail.bind(null, route())); return; }
  if (t.dataset.ts && d) { const x = d.c.ts[+t.dataset.i]; if (x) { x[t.dataset.ts] = t.dataset.ts === "n" ? t.value.slice(0, 60) : t.value; S.guardSpur(d); S.save(); if (t.dataset.ts !== "n") keepScroll(vWizard); } return; }
  if (t.dataset.crk !== undefined) { const k = $("#crk").value; $("#creurw").hidden = k !== "budget"; $("#crwkw").hidden = k !== "lt"; $("#crroute").textContent = crRouteTxt(k, $("#creur").value, $("#crwk").value); return; }
  if (t.dataset.f && d) { d[t.dataset.f] = t.value; S.save(); return; }
  if (t.dataset.stepin && d) { setPct(t.dataset.stepin, parseInt(t.value, 10) || 0, true); return; }
  if (t.dataset.hc !== undefined) { S.setHc(t.checked); applyTheme(); return; }
  if (t.id === "imp" && t.files[0]) { t.files[0].text().then(x => { try { const n = S.importJSON(x); toast(n + " Vorhaben importiert"); render(); } catch (err) { toast("Import fehlgeschlagen: Datei passt nicht zum Format"); } }); t.value = ""; }
});
document.addEventListener("input", e => {
  const t = e.target, d = S.state.draft;
  if (t.id === "q") { ui.q = t.value; $("#listBody").innerHTML = listRows(); return; }
  if (t.dataset.why && d) { d.c.why[t.dataset.why] = t.value; S.save(); return; }
  if (t.dataset.ts === "n" && d) { const x = d.c.ts[+t.dataset.i]; if (x) { x.n = t.value.slice(0, 60); S.save(); } return; }
  if (t.dataset.crk !== undefined && (t.id === "creur" || t.id === "crwk")) { $("#crroute").textContent = crRouteTxt($("#crk").value, $("#creur").value, $("#crwk").value); return; }
  if (t.dataset.f && d) { d[t.dataset.f] = t.value; S.save(); }
});
dlg.addEventListener("click", e => { if (e.target === dlg) closeDlg(); });
/* Stepper: Gedrückt halten lässt den Wert immer schneller laufen */
function setPct(k, v, typed) { const d = S.state.draft; if (!d) return; d.c[k] = Math.max(0, Math.min(100, Math.round(v / (typed ? 1 : 5)) * (typed ? 1 : 5))); S.guardSpur(d); S.save(); const i = $("#in-" + k); if (i) i.value = d.c[k]; cfgLive(); }
let hold = null;
function stopHold() { if (hold) { clearTimeout(hold.t); hold = null; } }
document.addEventListener("pointerdown", e => {
  const b = e.target.closest("[data-hold]"); if (!b || b.disabled || e.button) return;
  const k = b.dataset.hold, dd = +b.dataset.d, d = S.state.draft; let delay = 380, n = 0;
  const tick = () => { setPct(k, d.c[k] + dd * (n > 12 ? 2 : 1), false); n++; delay = Math.max(45, delay * .8); hold.t = setTimeout(tick, delay); };
  setPct(k, d.c[k] + dd, false); hold = {t: setTimeout(tick, delay), fired: true};
});
["pointerup", "pointercancel", "pointerleave", "contextmenu"].forEach(ev => document.addEventListener(ev, stopHold, true));
document.addEventListener("click", e => { const b = e.target.closest("[data-hold]"); if (b && e.detail === 0 && !b.disabled) setPct(b.dataset.hold, S.state.draft.c[b.dataset.hold] + +b.dataset.d, false); }); // Tastatur
function report() {
  const P = S.state.P, n = k => P.filter(p => p.status === k).length, bl = P.filter(p => ["bl", "off"].includes(p.status));
  return '<h2 id="dlg-h">Monatsreport ' + fmtD(TODAY) + '</h2><p class="meta">Aus den hier erfassten Vorhaben erzeugt.</p><ul class="group">' + row("Vorhaben mit PEP", String(P.filter(p => p.status !== "li" && p.status !== "ki").length)) + row("On Track", String(n("on"))) + row("Off Track", String(n("off"))) + row("Blockiert", String(n("bl"))) + row("Freigabe offen", String(n("pe"))) + "</ul>" +
    (bl.length ? '<h2 class="sec">Aufmerksamkeit</h2><ul class="group">' + bl.map(p => '<li class="row"><span class="t">' + esc(p.name) + '<span class="s">' + esc(p.note || STATUS[p.status][0]) + "</span></span></li>").join("") + "</ul>" : "") + '<button class="btn" style="margin-top:16px" data-act="close">Schließen</button>';
}

/* ---------- Nachweis-Dateien ---------- */
function keepScroll(fn) { const y = view.scrollTop; fn(); view.scrollTop = y; }
async function removeFile(id, k, fid) { const f = S.removeFileMeta(id, k, fid); if (f) { try { await F.delFile(fid); } catch (e) { /* Eintrag ist weg, Rest egal */ } toast("Entfernt: " + f.name); keepScroll(() => vDetail(route())); } }

/* ---------- Tastatur (PC) ---------- */
function helpHtml() {
  const K = [["g dann v", "Vorhaben"], ["g dann n oder n", "Neues Vorhaben"], ["g dann f", "Freigaben"], ["g dann c", "Cockpit"], ["g dann m", "Mehr"], ["/", "Suche in Vorhaben"], ["Strg + Enter", "Im Assistenten: Weiter bzw. Einreichen"], ["Esc", "Fenster schließen"], ["Enter", "Hauptaktion im Fenster"], ["Pfeiltasten", "Zwischen Tabs oder Auswahl wechseln"], ["?", "Diese Hilfe"]];
  return '<h2 id="dlg-h">Tastenkürzel</h2><p class="meta">Gelten nicht, solange Sie in ein Textfeld tippen.</p><ul class="keys">' + K.map(([k, t]) => "<li><span>" + esc(t) + "</span><kbd>" + esc(k) + "</kbd></li>").join("") + '</ul><button class="btn" style="margin-top:14px" data-act="close" data-main>Schließen</button>';
}
let gp = false;
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && route().tab === "neu" && !dlg.open) { const b = $("[data-act=wiznext]") || $("[data-act=wizsubmit]:not([disabled])"); if (b) { e.preventDefault(); b.click(); } return; }
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.closest && t.closest("#tabs") && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
    const L = [...tabs.querySelectorAll("a")], i = L.indexOf(t.closest("a")), n = e.key === "Home" ? 0 : e.key === "End" ? L.length - 1 : (i + (["ArrowDown", "ArrowRight"].includes(e.key) ? 1 : -1) + L.length) % L.length;
    e.preventDefault(); L[n].focus(); return;
  }
  if (t.closest && t.closest(".seg") && ["ArrowLeft", "ArrowRight"].includes(e.key)) { const L = [...t.closest(".seg").querySelectorAll("button")], i = L.indexOf(t); if (i >= 0) { e.preventDefault(); L[(i + (e.key === "ArrowRight" ? 1 : -1) + L.length) % L.length].focus(); } return; }
  if (t.matches && t.matches("input:not([type=checkbox]):not([type=file]),textarea,select,[contenteditable]")) return;
  if (dlg.open) return;
  if (e.key === "?") { e.preventDefault(); openDlg(helpHtml()); return; }
  if (e.key === "/") { const q = $("#q"); if (q) { e.preventDefault(); q.focus(); } return; }
  if (gp) { gp = false; const m = {v: "vorhaben", n: "neu", f: "freigaben", c: "cockpit", m: "mehr"}[e.key]; if (m) { e.preventDefault(); location.hash = "#/" + m; } return; }
  if (e.key === "g") { gp = true; setTimeout(() => gp = false, 1500); return; }
  if (e.key === "n") { location.hash = "#/neu"; }
});
tabs.addEventListener("dragstart", e => e.preventDefault());

/* ---------- Start ---------- */
S.load(); applyTheme();
$("#splashVer").textContent = "Version " + VERSION;
addEventListener("hashchange", () => { render(); tryReload(); });
matchMedia("(min-width:900px)").addEventListener?.("change", render);
matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", applyTheme);
render();
// Ladebildschirm: 2 s, nur beim ersten Öffnen, nicht während eines Entwurfs; Tippen überspringt
const splash = $("#splash"); let seen = false;
try { seen = !!sessionStorage.getItem("pfad-seen"); sessionStorage.setItem("pfad-seen", "1"); } catch (e) { /* ohne Speicher immer zeigen */ }
const hideSplash = () => { splash.classList.add("out"); setTimeout(() => splash.remove(), 400); };
if (seen || route().tab === "neu") splash.remove(); else { splash.addEventListener("click", hideSplash); setTimeout(hideSplash, 2000); }
// Tab-Bar: Pille seitlich ziehen
{
  const pill = tabs.querySelector(".pill"); let dr = null, moved = false;
  tabs.addEventListener("pointerdown", e => { if (e.button === 0 || e.pointerType === "touch") dr = {x0: e.clientX, r: tabs.getBoundingClientRect(), idx: -1}; });
  tabs.addEventListener("pointermove", e => {
    if (!dr) return;
    if (!moved && Math.abs(e.clientX - dr.x0) > 10) { moved = true; tabs.classList.add("drag"); try { tabs.setPointerCapture(e.pointerId); } catch (x) { /* egal */ } }
    if (moved) { const w = (dr.r.width - 8) / TABS.length, x = Math.max(0, Math.min((TABS.length - 1) * w, e.clientX - dr.r.left - 4 - w / 2)); pill.style.transform = "translateX(" + x / w * 100 + "%)"; dr.idx = Math.round(x / w); }
  });
  const end = () => { if (!dr) return; const i = dr.idx; tabs.classList.remove("drag"); dr = null; if (moved) { setTimeout(() => moved = false, 0); if (i >= 0) { const h = "#/" + TABS[i]; if (location.hash === h) render(); else location.hash = h; } } };
  tabs.addEventListener("pointerup", end); tabs.addEventListener("pointercancel", end);
  tabs.addEventListener("click", e => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
}
// Updates: neue Version lädt die App einmal neu, aber nie mitten im Entwurf
let pend = false;
function tryReload() { if (pend && route().tab !== "neu") location.reload(); }
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (had) { pend = true; tryReload(); } });
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
