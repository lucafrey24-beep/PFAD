// PEP-App: Oberfläche, Routing, Ereignisse. Aufbau wie SATZ (ES-Module, Hash-Routing, Ereignis-Delegation über data-act).
import {TODAY, PCS, PH, SPN, SPDESC, STATUS, ROLES, PRESETS} from "./data.js";
import {compute, delivs, phaseOf, stepDelivs, fmtD} from "./model.js";
import * as F from "./files.js";
import * as RW from "./rules.js";
import * as S from "./store.js";
import * as C from "./cfg.js";

const VERSION = "1.6.1";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const view = $("#view"), bar = $("#appbar"), tabs = $("#tabs"), dlg = $("#dlg");
const ui = {filter: "all", q: "", wizErr: ""};
const TABS = ["vorhaben", "neu", "freigaben", "cockpit", "mehr"];
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
function badge() { const n = S.mine(S.state.role).length; const b = $("#tbQ"); b.textContent = n ? String(n) : ""; b.setAttribute("aria-label", n ? n + " warten auf Sie" : ""); }

function render() {
  if (dlg.open) dlg.close();
  const r = route(); badge();
  const wiz = r.tab === "neu", wide = matchMedia("(min-width:900px)").matches; tabs.hidden = wiz && !wide; view.classList.toggle("modal", wiz && !wide); view.classList.toggle("cfgm", wiz); if (wiz && ui.lastTab !== "neu") { ui.cfgPrev = null; ui.delta = null; } ui.lastTab = r.tab;
  const idx = Math.max(0, TABS.indexOf(r.tab === "vorhaben" || TABS.includes(r.tab) ? r.tab : "vorhaben"));
  tabs.querySelector(".pill").style.transform = "translateX(" + idx * 100 + "%)";
  tabs.querySelectorAll("a").forEach((a, i) => i === idx ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  const fn = {vorhaben: r.id ? vDetail : vList, neu: vWizard, freigaben: vQueue, cockpit: vCockpit, mehr: r.id === "regeln" ? vRules : r.id === "offen" ? vOpen : r.id === "regelwerk" ? vRegel : vMore}[r.tab] || vList;
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
  return '<ul class="group">' + L.map(p => { const r = compute(p.c), pr = S.progress(p), late = S.overdue(p);
    return '<li><a class="row" href="#/vorhaben/' + encodeURIComponent(p.id) + '"><span class="t">' + esc(p.name) + '<span class="s">' + esc(p.id) + " · " + esc(p.pc) + " · " + esc(p.pl) + '</span><span class="s">' + stBadge(p) + (p.status === "pe" ? " · " + esc(subLbl(p)) + ": " + (p.stage === "ppb" ? "wartet auf PPB" : "wartet auf MS Gate Committee") : "") + (late ? " · überfällig" : "") + '</span>' + (pr.total ? '<span class="s">Schritt ' + pr.done + " von " + pr.total + '</span><span class="pb" aria-hidden="true"><i style="width:' + Math.round(pr.done / pr.total * 100) + '%"></i></span>' : "") + '</span><span class="tr">' + pathPill(r) + '</span><span class="chev" aria-hidden="true">›</span></a></li>';
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
  const c = compute(p.c);
  let h = '<p class="eyebrow">' + esc(p.id) + " · " + esc(p.pc) + '</p><h1 class="big">' + esc(p.name) + '</h1><p>' + pathPill(c) + " &nbsp;" + stBadge(p) + "</p>";
  if (p.note) h += '<div class="warn">' + esc(p.note) + "</div>";
  if (p.status === "pe") {
    h += '<div class="qitem"><h3>' + (p.stage === "ppb" ? "Wartet auf PPB-Entscheidung" : "Wartet auf Prüfung durch das MS Gate Committee") + '</h3><p class="meta">Zur Freigabe: ' + esc(subLbl(p)) + (p.rec ? ". " + esc(p.rec) : "") + "</p>" + evLine(p) + actionsFor(p) + "</div>";
  }
  const ps = c.ok ? (S.subStep(p) || S.curStep(p)) : null;
  if (ps && p.status !== "do") {
    h += stepPanel(p, c, ps, S.canEditFiles(p, ps.n));
    if (S.canSubmitStep(p)) h += '<button class="btn primary" data-act="stepsub" data-id="' + esc(p.id) + '">Zur Freigabe einreichen: ' + esc(S.stepLabel(ps)) + "</button>";
  }
  if (c.ok) {
    h += '<h2 class="sec">Ablauf (' + c.n + " Reviews)</h2><ol class=\"tl\">";
    let lastPh = -1;
    c.order.forEach((o, i) => { const ph = phaseOf(o); if (ph !== lastPh) { h += '<li class="ph">' + esc(PH[ph]) + "</li>"; lastPh = ph; }
      const x = S.stepOf(p, o.n); h += '<li class="' + (o.rv ? "rv " : "") + (x.st === "ok" ? "done " : "") + (ps && ps.n === o.n ? "next" : "") + '">' + esc(o.n) + (o.t ? " " + esc(o.t) : "") + (x.st !== "open" || x.files.length ? "<small>" + [STX[x.st] + (x.st === "ok" ? " " + dstr(x.decided) : ""), x.files.length ? x.files.length + " Datei" + (x.files.length > 1 ? "en" : "") : ""].filter(Boolean).join(" · ") + "</small>" : "") + "</li>"; });
    h += "</ol>";
    const olds = c.order.filter(o => (!ps || o.n !== ps.n) && S.stepOf(p, o.n).files.length);
    if (olds.length) h += '<h2 class="sec">Nachweise je Schritt</h2><div class="group" style="padding-right:0">' + olds.map(o => '<details class="dv"><summary>' + esc(S.stepLabel(o)) + " · " + S.stepOf(p, o.n).files.length + '</summary><ul class="fl">' + S.stepOf(p, o.n).files.map(f => fileRow(p, o.n, f, false)).join("") + "</ul></details>").join("") + "</div>";
  } else h += '<div class="note">Unter den Projektschwellen: Roadmap-Eintrag ohne PEP.</div>';
  h += '<h2 class="sec">Konfiguration</h2><ul class="group">' +
    row("Spur", c.ok ? c.sp + " · " + SPN[c.sp] : "–") + row("Generationsstufe", c.ok ? c.st : "–") + row("Neuentwicklungsanteil", (c.hc ? "HW " + p.c.hw + " % · " : "") + "SW " + p.c.sw + " %") +
    row("Referenzprodukt", p.ref || "–") + row("Projektleitung", p.pl) + row("Zuletzt freigegeben", p.last) + row("Nächster Meilenstein", p.next + (p.date ? " · " + fmtD(p.date) : "")) + row("Konfigurationsversion", String(p.ver || 1)) + "</ul>" + (S.state.role === "PL" && !["li", "ki", "do"].includes(p.status) ? '<div class="card" style="margin-top:12px"><label class="f" for="pdate">Plantermin nächster Meilenstein</label><input id="pdate" type="date" data-pdate data-id="' + esc(p.id) + '" value="' + esc(p.date || "") + '"></div>' : "") + (p.cfgPending ? '<div class="warn">Konfigurationsänderung ' + esc(p.cfgPending.from) + " → " + esc(p.cfgPending.to) + " wartet auf Freigabe am nächsten Gate.</div>" : "");
  if (c.ok) {
    h += '<h2 class="sec">Bausteine</h2><ul class="group">' + c.on.map(m => row(m.t, m.ty === "stufe" ? "Stufe" : m.ty === "spur" ? "Spur" : "Optional")).join("") +
      c.ab.map(m => '<li class="row"><span class="t">' + esc(m.t) + ' <span class="lock">abgewählt</span><span class="s">' + esc((p.c.why || {})[m.id] || "") + "</span></span></li>").join("") + "</ul>";
    h += '<h2 class="sec">Liefergegenstände je Phase</h2><div class="group" style="padding-right:0">' + delivs(c).map(d => d.gone ? "" : '<details class="dv"><summary>' + esc(d.t) + '</summary><ul>' + d.items.map(i => '<li class="' + (i.bs ? "bs" : "") + '">' + esc(i.t) + (i.bs ? " (Baustein)" : i.kat === "A" ? " (validieren)" : "") + "</li>").join("") + "</ul></details>").join("") + "</div>";
  }
  if (p.log.length) h += '<h2 class="sec">Verlauf</h2><ul class="logl">' + p.log.slice().reverse().map(l => "<li><small>" + esc(l.t) + " · " + esc(l.who) + "</small><br>" + esc(l.x) + "</li>").join("") + "</ul>";
  h += '<div class="btns">' + (S.state.role === "PL" ? '<button class="btn" data-act="edit" data-id="' + esc(p.id) + '">Konfiguration ändern</button>' : "") + '<button class="btn" data-act="nachweis" data-id="' + esc(p.id) + '">Nachweis exportieren</button></div>';
  view.innerHTML = h;
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
  const s = S.stepOf(p, o.n), D = stepDelivs(c, o), k = o.n, id = esc(p.id), other = s.files.filter(f => !D.includes(f.dv)), withF = D.filter(d => s.files.some(f => f.dv === d)).length;
  const add = (i, dv, label) => '<button type="button" class="btn small" data-act="pick" data-i="' + i + '">' + label + '</button><input hidden type="file" multiple id="fi-' + i + '" data-fileinput data-id="' + id + '" data-k="' + esc(k) + '" data-dv="' + esc(dv) + '">';
  let h = '<h2 class="sec">Nachweise: ' + esc(S.stepLabel(o)) + '</h2><div class="card"><p class="meta">' + withF + " von " + D.length + " Liefergegenständen mit Datei" + (STX[s.st] ? " · " + STX[s.st] : "") + ".</p>";
  h += D.map((d, i) => { const L = s.files.filter(f => f.dv === d); return '<div class="dvrow"><div class="dvh"><b>' + esc(d) + '</b><span class="meta">' + (L.length ? L.length + " Datei" + (L.length > 1 ? "en" : "") : "keine Datei") + "</span></div>" + (L.length ? '<ul class="fl">' + L.map(f => fileRow(p, k, f, edit)).join("") + "</ul>" : "") + (edit ? add(i, d, "Datei hinzufügen") : "") + "</div>"; }).join("");
  if (other.length || edit) h += '<div class="dvrow"><div class="dvh"><b>Weitere Nachweise</b><span class="meta">' + (other.length || "keine") + "</span></div>" + (other.length ? '<ul class="fl">' + other.map(f => fileRow(p, k, f, edit)).join("") + "</ul>" : "") + (edit ? add(D.length, "", "Datei hinzufügen") : "") + "</div>";
  return h + '<p class="foot" style="margin:8px 0 0">Dateien liegen nur in diesem Browser, bis 25 MB je Datei.</p></div>';
}
const row = (a, b) => '<li class="row"><span class="t">' + esc(a) + '</span><span class="tr">' + esc(b) + "</span></li>";
function actionsFor(p) {
  const role = S.state.role, id = esc(p.id);
  if (role === "MS" && p.stage === "ms") return '<div class="btns"><button class="btn primary" data-act="recommend" data-id="' + id + '">Prüfung ok, an PPB empfehlen</button><button class="btn destructive" data-act="rdlg" data-k="ret" data-id="' + id + '">Zurück an PL</button></div>';
  if (role === "PPB" && p.stage === "ppb") return '<div class="btns"><button class="btn primary" data-act="go" data-id="' + id + '">Go</button><button class="btn" data-act="rdlg" data-k="modify" data-id="' + id + '">Modify</button><button class="btn" data-act="rdlg" data-k="hold" data-id="' + id + '">Hold</button><button class="btn destructive" data-act="rdlg" data-k="kill" data-id="' + id + '">Kill</button></div>';
  return '<p class="foot" style="margin:0">In der Rolle ' + esc(ROLES[role]) + " ist hier keine Aktion möglich" + (role !== "PL" && p.stage === "ppb" && role === "MS" ? " (liegt beim PPB)" : "") + ".</p>";
}

/* ---------- Freigaben ---------- */
function vQueue() {
  setBar(brand, "", roleBtn());
  const role = S.state.role, mine = S.mine(role), q = S.queue(), others = q.filter(p => !mine.includes(p)), held = S.state.P.filter(p => p.status === "ho");
  let h = '<h1 class="big">Freigaben</h1>';
  h += role === "PL" ? '<div class="note">Als Projektleitung reichen Sie Konfigurationen ein. Prüfen und Entscheiden geht in den Rollen MS Gate Committee und PPB (Rolle oben rechts).</div>'
    : '<div class="note">Zweistufig: Das MS Gate Committee prüft und empfiehlt, das PPB entscheidet (Go, Modify, Hold, Kill). Spur wird an G1, Stufe und Bausteine an G2 freigegeben. Bei Light zusammen an G1+2.</div>';
  const card = p => { const c = compute(p.c); return '<div class="qitem"><a href="#/vorhaben/' + encodeURIComponent(p.id) + '"><h3>' + esc(p.name) + '</h3></a><p class="meta">' + esc(p.id) + " · " + esc(p.pl) + " · eingereicht " + esc(p.submitted || "–") + " · " + pathPill(c) + "</p><p class=\"meta\">Zur Freigabe: " + esc(subLbl(p)) + (p.rec ? ". " + esc(p.rec) : "") + " · wartet seit " + S.waitDays(p) + " Tag(en)</p>" + evLine(p) + actionsFor(p) + "</div>"; };
  h += '<h2 class="sec">Wartet auf mich (' + mine.length + ")</h2>" + (mine.length ? mine.map(card).join("") : '<div class="empty">Nichts zu tun. Hier erscheinen Vorhaben, sobald eine Konfiguration eingereicht ist.</div>');
  if (others.length) h += '<h2 class="sec">Bei anderen (' + others.length + ')</h2><ul class="group">' + others.map(p => '<li><a class="row" href="#/vorhaben/' + encodeURIComponent(p.id) + '"><span class="t">' + esc(p.name) + '<span class="s">' + (p.stage === "ppb" ? "wartet auf PPB" : "wartet auf MS Gate Committee") + '</span></span><span class="chev">›</span></a></li>').join("") + "</ul>";
  if (held.length) h += '<h2 class="sec">Hold (' + held.length + ')</h2><ul class="group">' + held.map(p => '<li class="row"><span class="t">' + esc(p.name) + '<span class="s">' + esc(p.note) + "</span></span>" + (role === "PPB" ? '<button class="btn small" data-act="resume" data-id="' + esc(p.id) + '">Aufheben</button>' : "") + "</li>").join("") + "</ul>";
  view.innerHTML = h;
}

/* ---------- Cockpit ---------- */
function vCockpit() {
  setBar(brand, "", roleBtn());
  const P = S.state.P, cnt = k => P.filter(p => p.status === k).length, tot = P.filter(p => p.status !== "li" && p.status !== "ki").length;
  const cs = P.map(p => ({p, c: compute(p.c)})), pep = cs.filter(x => x.c.ok);
  if (!P.length) { view.innerHTML = '<h1 class="big">Cockpit</h1><div class="empty">Noch keine Vorhaben erfasst. Das Cockpit füllt sich, sobald unter Neu eine Konfiguration eingereicht wird. Eine Anbindung an den Roadmap Master gibt es noch nicht.</div>'; return; }
  let h = '<h1 class="big">Cockpit</h1><div class="kpis">' +
    '<div class="kpi g"><b>' + tot + '</b><span>Vorhaben mit PEP</span></div><button class="kpi" data-act="goto" data-v="#/freigaben"><b>' + S.queue().length + '</b><span>Freigabe offen</span></button>' +
    '<div class="kpi"><b>' + (cnt("bl") + cnt("off")) + '</b><span>Blockiert oder Off Track</span></div><button class="kpi" data-act="filterlate"><b>' + P.filter(S.overdue).length + '</b><span>Überfällig (Plantermin)</span></button></div>';
  const act = P.filter(p => !["li", "ki"].includes(p.status));
  h += '<h2 class="sec">Fortschritt je Vorhaben</h2>' + (act.length ? '<ul class="group">' + act.map(p => { const pr = S.progress(p); return '<li><a class="row" href="#/vorhaben/' + encodeURIComponent(p.id) + '"><span class="t">' + esc(p.name) + '<span class="s">' + stBadge(p) + " · " + esc(p.next || "–") + (S.overdue(p) ? " · überfällig" : "") + '</span>' + (pr.total ? '<span class="pb" aria-hidden="true"><i style="width:' + Math.round(pr.done / pr.total * 100) + '%"></i></span>' : "") + '</span><span class="tr num">' + (pr.total ? pr.done + "/" + pr.total : "–") + '</span></a></li>'; }).join("") + "</ul>" : '<div class="empty">Keine Vorhaben mit PEP.</div>');
  const wq = S.queue(); if (wq.length) h += '<h2 class="sec">Wartet auf Freigabe</h2><ul class="group">' + wq.map(p => '<li><a class="row" href="#/vorhaben/' + encodeURIComponent(p.id) + '"><span class="t">' + esc(p.name) + '<span class="s">' + esc(subLbl(p)) + " · " + (p.stage === "ppb" ? "beim PPB" : "beim MS Gate Committee") + '</span></span><span class="tr num">' + S.waitDays(p) + " Tag(e)</span></a></li>").join("") + "</ul>";
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
  view.innerHTML = '<h1 class="big">Mehr</h1><ul class="group"><li><a class="row" href="#/mehr/regelwerk"><span class="t">Regelwerk<span class="s">Gates, Liefergegenstände, Schwellen und Bausteine selbst hinterlegen' + (RW.isDefault() ? "" : " · angepasst") + '</span></span><span class="chev">›</span></a></li><li><button class="row" data-act="demoload"><span class="t">Beispielvorhaben laden<span class="s">14 fiktive Vorhaben in allen Status, mit Nachweisen, zum Ausprobieren</span></span><span class="chev">›</span></button></li>' + (S.hasDemo() ? '<li><button class="row" data-act="demodel"><span class="t">Beispielvorhaben entfernen<span class="s">Eigene Vorhaben bleiben erhalten</span></span><span class="chev">›</span></button></li>' : "") + '<li><button class="row" data-act="reset"><span class="t"><b>Alles zurücksetzen</b><span class="s">Vorhaben, Nachweis-Dateien und Entwurf löschen, App startet leer (z. B. für eine Vorführung)</span></span><span class="chev">›</span></button></li></ul><h2 class="sec">Rolle</h2><div class="card">' + seg("role", Object.entries(ROLES), st.role) + '<p class="foot" style="margin:0">Die Rolle ist ein Umschalter, keine Anmeldung.</p></div>' +
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
  view.innerHTML = '<h1 class="big">Regeln und Quellen</h1><div class="card"><h3>Einstufung</h3><p class="meta">PEP-pflichtig ab mindestens 2 Monaten Dauer, 2 Abteilungen und 0,3 FTE oder 30 000 € Aufwand.</p><h3>Spur</h3><p class="meta">Drei Ja/Nein-Fragen: A (Device with Software), B (Software on Device), C (Software & Data).</p><h3>Generationsstufe</h3><p class="meta">Full ab 60 % Neuentwicklungsanteil, Light bis 20 %, sonst Standard. Bei Hardwareänderung zählt der höhere Anteil von HW und SW.</p><p class="warn">Die Schwellen 20 % und 60 % sowie die Max-Regel sind Annahmen, nicht abgestimmt.</p><h3>Bausteine</h3><p class="meta">Pflichtkern plus Bausteinpool. Vorgeschlagene Bausteine können nur mit Begründung abgewählt werden.</p><h3>Freigabe</h3><p class="meta">MS Gate Committee prüft, PPB entscheidet. Spur an G1, Stufe und Bausteine an G2, Light gemeinsam an G1+2.</p><h3>Quelle</h3><p class="meta" style="margin:0">Studienarbeit T3100, Kap. 5.7 und Tab. 16 (A-Full 8, B-Standard 5, B-Light 3, C-Full 5 Reviews).</p></div>';
}
function vOpen() {
  setBar(back("#/mehr", "Mehr"), "Offene Fragen", roleBtn());
  const Q = ["Gate-Schema: Der Renew PEP nutzt G0 bis G8, diese App G1 bis G5. Welches gilt für die Anzeige?", "Schwellen 20 % und 60 % für die Generationsstufe bestätigen.", "Max-Regel bei Hardware und Software bestätigen.", "Wer entscheidet im PPB, und wie wird der Entscheid dokumentiert?", "Wo liegen die Daten produktiv (gemeinsamer Speicher, Anmeldung)?", "Wie werden Reviews je Pfad für die Ressourcenplanung gezählt?", "Wer entscheidet bei Review-Meilensteinen (Design Freeze, Serienfreigabe, Pilotfreigabe)? Die App nutzt wie bei Gates: MS Gate Committee prüft, PPB entscheidet.", "Welche Nachweise sind je Liefergegenstand Pflicht, und wo liegen die Dateien produktiv? Aktuell nur lokal im Browser.", "Bleiben Gate-Termine in der App oder kommen sie aus der Roadmap?"];
  view.innerHTML = '<h1 class="big">Offene Fragen</h1><ul class="group">' + Q.map((q, i) => '<li class="row"><span class="t"><span class="s">Frage ' + (i + 1) + "</span>" + esc(q) + "</span></li>").join("") + "</ul>";
}

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
  const T = RW.rules().thr, hint = {Light: "bis " + T.light + " % neu", Standard: "über " + T.light + " bis unter " + T.full + " % neu", Full: "ab " + T.full + " % neu"};
  return ["Light", "Standard", "Full"].map(st => {
    const s = C.sumOf(C.withStufe(c, st));
    return C.card({sel: cur.ok && cur.r.st === st, badge: hint[st], title: st, sub: st === "Light" ? "kleiner Pfad, G1 und G2 als Startfreigabe G1+2" : st === "Full" ? "voller Pfad, ohne Abgleich mit Referenzprodukt" : "mittlerer Pfad",
      attrs: [["Gates", String(s.gates)], ["Reviews", String(s.rv)], ["Liefergegenstände", cfgDv(s)]], delta: C.diff(cur, s), act: ' data-act="cfgstufe" data-v="' + st + '"', label: "Wählen", dis: !cur.ok});
  }).join("");
}
function modCard(m, c, cur, r) {
  const on = r.isOn(m), fixed = m.ty === "stufe", abw = m.ty === "spur" && r.defOn(m) && !on, s = C.sumOf(C.withMod(c, m, !on));
  const sw = '<span class="sw"><input type="checkbox" data-mod="' + m.id + '"' + (on ? " checked" : "") + (fixed ? " disabled" : "") + ' aria-label="' + esc(m.t) + '"><span></span></span>';
  return '<article class="ccard mod' + (on ? " sel" : "") + '"><div class="cc-top"><div><span class="cc-ph">' + esc(PH[m.ph]) + "</span><h3>" + esc(m.t) + "</h3></div>" + sw + "</div>" +
    '<dl class="cc-at"><dt>Liefert</dt><dd>' + esc(m.d) + "</dd>" + (m.rv ? "<dt>Review</dt><dd>" + esc(m.rv.n) + "</dd>" : "") + "</dl>" +
    (fixed ? '<p class="cc-sub">Pflicht in Standard und Light, durch die Stufe gesetzt.</p>' :
      '<div class="cc-f"><div class="cc-d"><span class="lab">' + (on ? "Beim Abwählen" : "Beim Hinzufügen") + "</span>" + C.chips(C.diff(cur, s), "keine Änderung am Pfad") + "</div></div>") +
    (abw ? '<div class="why"><label class="f" for="why-' + m.id + '">Begründung der Abwahl (Pflicht)</label><textarea id="why-' + m.id + '" data-why="' + m.id + '" maxlength="300">' + esc(c.why[m.id] || "") + "</textarea></div>" : "") + "</article>";
}
function vWizard() {
  if (!S.state.draft) { S.state.draft = S.newWiz(); S.save(); ui.cfgPrev = null; ui.delta = null; }
  const w = S.state.draft, c = w.c, s = C.sumOf(c), r = s.r;
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
    h += '<h2 class="sec">Steckbrief</h2><div class="card"><div class="fg"><label class="f" for="w-name">Name des Vorhabens</label><input id="w-name" data-f="name" type="text" value="' + esc(w.name) + '" maxlength="80" autocomplete="off"></div>' +
      '<div class="fg"><label class="f" for="w-pc">Product Center</label><select id="w-pc" data-f="pc">' + PCS.map(x => "<option" + (x === w.pc ? " selected" : "") + ">" + esc(x) + "</option>").join("") + '</select></div>' +
      '<div class="fg"><label class="f" for="w-pl">Projektleitung (Pflicht)</label><input id="w-pl" data-f="pl" type="text" value="' + esc(w.pl) + '" maxlength="60" autocomplete="off"></div>' +
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
      return C.card({sel: cur === x.k, title: x.t, sub: x.n, attrs: [["Hardware", x.hw], ["Takt", x.takt], ["Liefergegenstände", "PEP " + hs.r.proc], ["Gates", String(hs.gates)], ["Reviews", String(hs.rv)]],
        delta: C.diff(s, hs), act: ' data-act="cfgspur" data-i="' + i + '"', label: "Auswählen", dis: !r.ok});
    }).join("") + "</div>";
    const Q = ["Läuft das Ergebnis auf einem Gerät?", "Wird die Hardware neu entwickelt oder verändert?", "Führt die Hardware das Vorhaben (Software folgt dem Hardwarestand)?"];
    h += '<details class="card cq"><summary>Mit drei Fragen bestimmen (Entscheidungsbaum)</summary>' + Q.map((t, i) => '<div class="qrow' + (i && !c.q[0] ? " off" : i === 2 && !c.q[1] ? " off" : "") + '" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding-right:0"><span>' + t + "</span>" + yn("q", i, c.q[i]) + "</div>").join("") + "</details>";
  } else if (w.step === 3) {
    h += '<p class="meta">Die Stufe folgt aus dem Anteil der Neuentwicklung. Eine Karte setzt Beispielwerte, die Anteile darunter genau einstellen.</p><div class="cgrid c3" id="cfgStufe">' + stufeCards(c, s) + "</div>";
    h += '<div class="card">' + stepper("hw", "Hardware-Neuentwicklung", c.hw, !r.hc) + stepper("sw", "Software-Neuentwicklung", c.sw, false) +
      (r.hc ? '<p class="foot" style="margin:8px 0 0">Bei Hardwareänderung zählt der höhere Anteil (Annahme).</p>' : '<p class="foot" style="margin:8px 0 0">Ohne Hardwareänderung zählt nur der Softwareanteil.</p>') + "</div>" +
      '<div class="card"><div class="fg" style="margin:0"><label class="f" for="w-ref2">Referenzprodukt</label><input id="w-ref2" data-f="ref" type="text" value="' + esc(w.ref) + '" maxlength="80"><p class="foot" style="margin:6px 0 0">Bei Standard und Light wird der Abgleich mit dem Referenzprodukt als Baustein gesetzt.</p></div></div>';
  } else if (w.step === 4) {
    const all = RW.mods(), pool = all.filter(m => r.avail(m)), na = all.filter(m => !r.avail(m));
    const grp = (id, t, list, note) => list.length ? '<h2 class="sec" id="' + id + '">' + t + "</h2>" + (note ? '<p class="foot" style="margin:0 16px 8px">' + note + "</p>" : "") + '<div class="cgrid">' + list.map(m => modCard(m, c, s, r)).join("") + "</div>" : "";
    h += '<p class="meta">Der Pflichtkern ist fest. Jede Karte zeigt, was ein Baustein am Pfad ändert. Vorgeschlagene Bausteine lassen sich nur mit Begründung abwählen.</p>' +
      grp("cfg-stufe", "Durch die Stufe gesetzt", pool.filter(m => m.ty === "stufe")) +
      grp("cfg-spur", "Durch die Spur vorgeschlagen", pool.filter(m => m.ty === "spur"), "Abwählen nur mit Begründung.") +
      grp("cfg-opt", "Optional", pool.filter(m => m.ty === "opt")) +
      (na.length ? '<p class="foot">Für diese Spur und Stufe nicht verfügbar: ' + esc(na.map(m => m.t).join(", ")) + "</p>" : "");
  } else {
    h += '<div class="spur"><div class="L">' + r.sp + '</div><div><b>' + esc(r.path) + (r.ok ? " · " + r.n + " Reviews" : "") + "</b><p>" + esc(w.name || "Ohne Namen") + " · " + esc(w.pc) + "</p></div></div>";
    if (r.ok) { let lp = -1; h += '<h2 class="sec">Ablauf</h2><ol class="tl">'; r.order.forEach(o => { const ph = phaseOf(o); if (ph !== lp) { h += '<li class="ph">' + esc(PH[ph]) + "</li>"; lp = ph; } h += '<li class="' + (o.rv ? "rv" : "") + '">' + esc(o.n) + (o.t ? " " + esc(o.t) : "") + "</li>"; }); h += "</ol>";
      h += '<h2 class="sec">Bausteine</h2><ul class="group">' + r.on.map(m => row(m.t, m.ty === "stufe" ? "Stufe" : m.ty === "spur" ? "Spur" : "Optional")).join("") + r.ab.map(m => '<li class="row"><span class="t">' + esc(m.t) + ' <span class="lock">abgewählt</span><span class="s">' + esc(c.why[m.id] || "Begründung fehlt") + "</span></span></li>").join("") + "</ul>";
      h += '<h2 class="sec">Liefergegenstände (' + esc(r.proc) + ')</h2><div class="group" style="padding-right:0">' + delivs(r).map(x => x.gone ? "" : '<details class="dv"><summary>' + esc(x.t) + " · " + x.items.length + '</summary><ul>' + (x.items.length ? x.items.map(i => "<li>" + esc(i.t) + (i.bs ? " (Baustein)" : i.kat === "A" ? " (validieren)" : "") + "</li>").join("") : "<li>Keine hinterlegt. Im Regelwerk ergänzen.</li>") + "</ul></details>").join("") + "</div>"; }
    h += '<p class="foot">' + (S.state.role === "PL" ? "Nach dem Einreichen prüft das MS Gate Committee, das PPB entscheidet." : "Einreichen ist nur in der Rolle Projektleitung möglich.") + "</p>";
  }
  h += '<div class="actionbar">' + (w.step ? '<button class="btn back" data-act="wizprev">Zurück</button>' : "") + (w.step < 5 ? '<button class="btn primary" data-act="wiznext">Weiter</button>' : '<button class="btn primary" data-act="wizsubmit"' + (S.state.role === "PL" ? "" : " disabled") + ">Einreichen</button>") + "</div></div></div>";
  view.innerHTML = h;
}
// Live-Aktualisierung beim Halten der Plus-/Minus-Tasten, ohne die Eingabe neu aufzubauen
function cfgLive() {
  const d = S.state.draft; if (!d) return; const s = C.sumOf(d.c); track(s);
  const b = $("#cfgBar"), st = $("#cfgStage"), k = $("#cfgStufe");
  if (b) b.innerHTML = C.bar(s, ui.delta, ui.fresh, cfgNext(d)); if (st) st.innerHTML = C.stage(s, ui.fresh ? ui.newKeys : null); if (k) k.innerHTML = stufeCards(d.c, s);
  const hw = $("#in-hw"), r = s.r; if (hw) { hw.disabled = !r.hc; hw.parentElement.querySelectorAll("button").forEach(x => x.disabled = !r.hc); }
}
const stepper = (k, l, v, dis) => '<div class="step"><div class="lab">' + l + '</div><div class="ctl"><button type="button" data-hold="' + k + '" data-d="-5" aria-label="' + l + ' verringern"' + (dis ? " disabled" : "") + '>−</button><input type="text" inputmode="numeric" id="in-' + k + '" data-stepin="' + k + '" value="' + v + '" aria-label="' + l + ' in Prozent"' + (dis ? " disabled" : "") + '><b>%</b><button type="button" data-hold="' + k + '" data-d="5" aria-label="' + l + ' erhöhen"' + (dis ? " disabled" : "") + ">+</button></div></div>";
const lvl = r => ["Full", "Standard", "Light"].map(s => '<div class="' + (r.st === s ? "on" : "") + '"><b>' + s + "</b>" + (s === "Full" ? "ab " + RW.rules().thr.full + " %" : s === "Light" ? "bis " + RW.rules().thr.light + " %" : "dazwischen") + "</div>").join("");
function wizGo(n) { const w = S.state.draft; w.step = n; ui.wizErr = ""; ui.delta = null; S.save(); vWizard(); view.scrollTop = 0; }


/* ---------- Regelwerk ---------- */
ui.rwGate = "G2"; ui.rwPrev = "0";
const chip = (on, act, attrs, l) => '<button type="button" class="chipb" data-act="' + act + '" ' + attrs + ' aria-pressed="' + on + '">' + esc(l) + "</button>";
function vRegel() {
  setBar(back("#/mehr", "Mehr"), "Regelwerk", roleBtn());
  const R = RW.rules(), g = ui.rwGate, its = R.items.filter(i => i.gate === g), STU = ["Full", "Standard", "Light"], SPS = [["A", "Spur A"], ["Bh", "Spur B mit Hardware"], ["B", "Spur B ohne Hardware"], ["C", "Spur C"]];
  let h = '<h1 class="big">Regelwerk</h1><div class="note">Hier legst du fest, welche Liefergegenstände je Gate gelten. Änderungen wirken sofort auf alle Vorhaben und gelten nur in diesem Browser.</div>' + (R.items.some(i => i.src === "Renew PEP") ? "" : '<div class="warn">Es sind nur die Kernpunkte der Studienarbeit hinterlegt. Unter Werkzeuge die Product-Governance-CSV importieren oder Liefergegenstände selbst anlegen.</div>');
  h += '<h2 class="sec">Schwellen Generationsstufe</h2><div class="card"><div class="fg"><label class="f" for="rw-l">Light bis (% Neuentwicklung)</label><input id="rw-l" type="number" min="0" max="99" inputmode="numeric" data-rw="thr" data-k="light" value="' + R.thr.light + '"></div><div class="fg" style="margin:0"><label class="f" for="rw-f">Full ab (% Neuentwicklung)</label><input id="rw-f" type="number" min="1" max="100" inputmode="numeric" data-rw="thr" data-k="full" value="' + R.thr.full + '"></div><p class="foot" style="margin:8px 0 0">Annahme aus der Studienarbeit: 20 % und 60 %.</p></div>';
  h += '<h2 class="sec">Prozess je Spur</h2><div class="card">' + SPS.map(([k, l]) => '<div class="fg"><label class="f" for="rw-p' + k + '">' + l + '</label><select id="rw-p' + k + '" data-rw="proc" data-k="' + k + '">' + ["Device", "Digital"].map(p => '<option' + (R.proc[k] === p ? " selected" : "") + ">" + p + "</option>").join("") + "</select></div>").join("") + '<p class="foot" style="margin:0">Bestimmt, ob die Device- oder die Digital-Liefergegenstände gelten.</p></div>';
  h += '<h2 class="sec">Gates der App und ihre Quelle</h2><div class="card"><p class="meta">Welche Gates des Renew PEP (G1 bis G8) fließen in welches App-Gate ein?</p>' + ["G1", "G2", "G3", "G4", "G5"].map(k => '<div class="dvrow"><div class="dvh"><b>App-Gate ' + k + '</b></div><div class="chips">' + RW.GATE_IDS.map(x => chip(R.gateMap[k].includes(x), "rwmap", 'data-g="' + k + '" data-v="' + x + '"', x)).join("") + "</div></div>").join("") + "</div>";
  h += '<h2 class="sec">Liefergegenstände je Renew-Gate</h2>' + seg("rwgate", RW.GATE_IDS.map(x => [x, x]), g);
  h += '<div class="card"><div class="fg"><label class="f" for="rw-gn">Name von ' + g + '</label><input id="rw-gn" type="text" maxlength="60" data-rw="gname" data-g="' + g + '" value="' + esc(R.gates[g]) + '"></div><p class="meta">' + its.length + " Liefergegenstände in " + g + "</p>" +
    its.map(i => '<div class="dvrow"><label class="f sr" for="in-' + i.id + '">Name</label><input id="in-' + i.id + '" type="text" maxlength="120" data-rw="iname" data-id="' + i.id + '" value="' + esc(i.name) + '"><div class="chips">' +
      ["Device", "Digital"].map(p => chip(i.proc.includes(p), "rwchip", 'data-id="' + i.id + '" data-k="proc" data-v="' + p + '"', p)).join("") + STU.map(s => chip(i.stufen.includes(s), "rwchip", 'data-id="' + i.id + '" data-k="stufen" data-v="' + s + '"', s)).join("") + chip(i.kat === "A", "rwkat", 'data-id="' + i.id + '"', "Validieren statt neu") +
      '</div><p class="meta">' + esc(i.src || "") + (i.quellen ? " · " + i.quellen.length + " Quellzeilen" : "") + '</p>' + (i.quellen ? '<details class="dv"><summary>Quellzeilen anzeigen</summary><ul>' + i.quellen.map(q => "<li>" + esc(q.ms) + ": " + esc(q.name) + " <small>" + esc(q.id) + "</small></li>").join("") + "</ul></details>" : "") +
      '<button class="inline-btn" data-act="rwdel" data-id="' + i.id + '" aria-label="' + esc(i.name) + ' löschen">Löschen</button></div>').join("") +
    '<button class="btn" data-act="rwadd" data-g="' + g + '">Liefergegenstand hinzufügen</button></div>';
  h += '<h2 class="sec">Bausteine</h2><div class="card">' + RW.mods().map(m => '<div class="dvrow"><div class="fg"><label class="f" for="rm-t-' + m.id + '">Baustein, ' + esc(PH[m.ph]) + '</label><input id="rm-t-' + m.id + '" type="text" maxlength="80" data-rw="mod" data-k="t" data-id="' + m.id + '" value="' + esc(m.t) + '"></div><div class="fg" style="margin:0"><label class="f" for="rm-d-' + m.id + '">Liefergegenstand</label><input id="rm-d-' + m.id + '" type="text" maxlength="120" data-rw="mod" data-k="d" data-id="' + m.id + '" value="' + esc(m.d) + '"></div></div>').join("") + "</div>";
  const pr = PRESETS[+ui.rwPrev], pw = S.wizFromPreset(+ui.rwPrev), pc = compute(pw.c), dv = delivs(pc);
  h += '<h2 class="sec">Vorschau je Referenzfall</h2>' + seg("rwprev", PRESETS.map((p, i) => [i, p.n]), ui.rwPrev) + '<div class="card"><p class="meta">' + esc(pc.path) + " · Prozess " + esc(pc.proc) + " · " + pc.n + " Reviews</p>" + dv.map(x => x.gone ? "" : '<details class="dv"><summary>' + esc(x.t) + " · " + x.items.length + "</summary><ul>" + (x.items.length ? x.items.map(i => "<li>" + esc(i.t) + (i.bs ? " (Baustein)" : i.kat === "A" ? " (validieren)" : "") + "</li>").join("") : "<li>Keine hinterlegt</li>") + "</ul></details>").join("") + "</div>";
  h += '<h2 class="sec">Werkzeuge</h2><ul class="group"><li><button class="row" data-act="rwpick" data-i="rwcsv"><span class="t">Quell-CSV importieren<span class="s">Product-Governance-Tabelle, wird nur im Browser gelesen und ergänzt Quellzeilen</span></span><span class="chev">›</span></button></li>' +
    '<li><button class="row" data-act="rwexp"><span class="t">Regelwerk exportieren (JSON)</span><span class="chev">›</span></button></li><li><button class="row" data-act="rwpick" data-i="rwjson"><span class="t">Regelwerk importieren (JSON)</span><span class="chev">›</span></button></li>' +
    '<li><button class="row" data-act="rwreset"><span class="t"><b>Regelwerk auf Standard zurücksetzen</b></span><span class="chev">›</span></button></li></ul><input hidden type="file" id="rwcsv" accept=".csv,text/csv"><input hidden type="file" id="rwjson" accept="application/json,.json">';
  view.innerHTML = h;
}
const rwRender = () => { const y = view.scrollTop; vRegel(); view.scrollTop = y; };

/* ---------- Ereignisse ---------- */
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id, d = S.state.draft;
  const done = m => { if (m) toast(m); render(); };
  switch (a) {
    case "rwgate": ui.rwGate = el.dataset.v; rwRender(); break;
    case "rwprev": ui.rwPrev = el.dataset.v; rwRender(); break;
    case "rwmap": RW.edit(R => { const l = R.gateMap[el.dataset.g], v = el.dataset.v; R.gateMap[el.dataset.g] = l.includes(v) ? l.filter(x => x !== v) : [...l, v].sort(); }); rwRender(); break;
    case "rwchip": RW.edit(R => { const i = R.items.find(x => x.id === el.dataset.id); if (!i) return; const l = i[el.dataset.k], v = el.dataset.v; i[el.dataset.k] = l.includes(v) ? l.filter(x => x !== v) : [...l, v]; }); rwRender(); break;
    case "rwkat": RW.edit(R => { const i = R.items.find(x => x.id === el.dataset.id); if (i) i.kat = i.kat === "A" ? "D" : "A"; }); rwRender(); break;
    case "rwadd": { const nid = RW.addItem(el.dataset.g); rwRender(); document.getElementById("in-" + nid)?.focus(); document.getElementById("in-" + nid)?.select(); break; }
    case "rwdel": { const snap = JSON.stringify(RW.rules()); RW.edit(R => { R.items = R.items.filter(x => x.id !== el.dataset.id); }); rwRender(); toast("Liefergegenstand gelöscht", () => { RW.importRules(snap); rwRender(); }); break; }
    case "rwpick": document.getElementById(el.dataset.i)?.click(); break;
    case "rwexp": download("PFAD-Regelwerk-" + TODAY + ".json", RW.exportRules(), "application/json"); toast("Regelwerk exportiert"); break;
    case "rwreset": openDlg('<h2 id="dlg-h">Regelwerk zurücksetzen?</h2><p class="meta">Alle eigenen Änderungen an Schwellen, Gates, Liefergegenständen und Bausteinen gehen verloren. Vorhaben bleiben erhalten.</p><div class="btns"><button class="btn" data-act="close">Abbrechen</button><button class="btn primary" data-main data-act="rwresetok">Zurücksetzen</button></div>'); break;
    case "rwresetok": RW.resetRules(); closeDlg(); toast("Regelwerk auf Standard"); rwRender(); break;
    case "close": closeDlg(); break;
    case "filterlate": ui.filter = "late"; location.hash = "#/vorhaben"; break;
    case "pick": document.getElementById("fi-" + el.dataset.i)?.click(); break;
    case "dl": getBlob(el.dataset.f, el.dataset.id, el.dataset.k); break;
    case "fdel": removeFile(el.dataset.id, el.dataset.k, el.dataset.f); break;
    case "stepsub": { const p = S.byId(id), o = S.curStep(p), m = S.missingDelivs(p, o); openDlg('<h2 id="dlg-h">Zur Freigabe einreichen</h2><p class="meta">' + esc(S.stepLabel(o)) + " · " + esc(p.name) + "</p>" + (m.length ? '<div class="warn"><b>Ohne Datei:</b> ' + esc(m.join(", ")) + ". Das MS Gate Committee sieht diese Lücke.</div>" : '<div class="note">Alle Liefergegenstände haben mindestens eine Datei.</div>') + '<label class="f" for="snote">Kommentar an das MS Gate Committee (optional)</label><textarea id="snote" maxlength="400"></textarea><div class="btns"><button class="btn" data-act="close">Abbrechen</button><button class="btn primary" data-main data-act="stepsubok" data-id="' + esc(id) + '">Einreichen</button></div>'); break; }
    case "stepsubok": { const snap = S.snapshot(), res = S.submitStep(id, $("#snote").value); closeDlg(); if (res.error) toast(res.error); else { toast(res.msg, () => { S.restore(snap); render(); }); render(); } break; }
    case "help": openDlg(helpHtml()); break;
    case "filter": ui.filter = el.dataset.v; vList(); break;
    case "role": S.setRole(el.dataset.v); render(); break;
    case "roledlg": openDlg('<h2 id="dlg-h">Rolle wählen</h2><p class="meta">Umschalter, keine Anmeldung.</p>' + seg("role", Object.entries(ROLES), S.state.role) + '<button class="btn" data-act="close">Fertig</button>'); break;
    case "theme": S.setTheme(el.dataset.v); applyTheme(); vMore(); break;
    case "goto": location.hash = el.dataset.v; break;
    case "recommend": undoable(() => S.recommend(id)); break;
    case "go": undoable(() => S.goDecision(id)); break;
    case "resume": undoable(() => S.resume(id)); break;
    case "rdlg": { const c = S.REASONS[el.dataset.k]; openDlg('<h2 id="dlg-h">' + esc(c.t) + '</h2><p class="meta">' + esc(c.hint) + '</p><label class="f" for="rtxt">Begründung (Pflicht)</label><textarea id="rtxt" maxlength="400" placeholder="' + esc(c.txt) + '"></textarea><p class="err" id="rerr" hidden></p><div class="btns"><button class="btn" data-act="close">Abbrechen</button><button class="btn primary" data-main data-act="rok" data-k="' + esc(el.dataset.k) + '" data-id="' + esc(id) + '">' + esc(c.ok) + "</button></div>"); setTimeout(() => $("#rtxt")?.focus(), 50); break; }
    case "rok": { const snap = S.snapshot(), res = S.reason(id, el.dataset.k, $("#rtxt").value); if (res.error) { const x = $("#rerr"); x.textContent = res.error; x.hidden = false; } else { closeDlg(); toast(res.msg, () => { S.restore(snap); render(); }); render(); } break; }
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
    case "wizsum": { const r = compute(d.c); openDlg('<h2 id="dlg-h">Übersicht</h2><p class="meta">' + esc(d.name || "Ohne Namen") + " · " + esc(d.pc) + '</p><div class="spur"><div class="L">' + r.sp + "</div><div><b>" + esc(r.path) + (r.ok ? " · " + r.n + " Reviews" : "") + "</b><p>" + r.on.length + " Bausteine aktiv, " + r.ab.length + ' abgewählt</p></div></div><div class="btns"><button class="btn" data-act="close">Weiter bearbeiten</button><button class="btn destructive" data-act="wizdrop">Entwurf verwerfen</button></div>'); break; }
    case "wizleave": location.hash = d.meta ? "#/vorhaben/" + encodeURIComponent(d.meta) : "#/vorhaben"; break;
    case "wizdrop": { const m = d.meta, snap = S.snapshot(); S.state.draft = null; S.save(); closeDlg(); location.hash = m ? "#/vorhaben/" + encodeURIComponent(m) : "#/vorhaben"; toast("Entwurf verworfen", () => { S.restore(snap); location.hash = "#/neu"; }); break; }
    case "wizsubmit": { const snap = S.snapshot(), res = S.submitWiz(d); if (res.error) { ui.wizErr = res.error; if (res.step !== undefined) d.step = res.step; vWizard(); view.scrollTop = 0; } else { ui.wizErr = ""; toast(res.msg, () => { S.restore(snap); location.hash = "#/neu"; render(); }); location.hash = "#/vorhaben/" + encodeURIComponent(res.id); } break; }
  }
});
document.addEventListener("change", e => {
  const t = e.target, d = S.state.draft;
  if (t.dataset.mod && d) { const m = RW.mods().find(x => x.id === t.dataset.mod), r = compute(d.c); if (m.ty === "spur") { d.c.sel = d.c.sel || {}; d.c.sel[m.id] = t.checked; } else d.c.opt[m.id] = t.checked ? 1 : 0; S.save(); keepScroll(vWizard); return; }
  if (t.dataset.rw) {
    const k = t.dataset.k, v = t.value, id = t.dataset.id;
    RW.edit(R => { switch (t.dataset.rw) {
      case "thr": R.thr[k] = +v; break;
      case "proc": R.proc[k] = v; break;
      case "gname": R.gates[t.dataset.g] = v.trim() || R.gates[t.dataset.g]; break;
      case "iname": { const i = R.items.find(x => x.id === id); if (i && v.trim()) i.name = v.trim(); break; }
      case "mod": R.mods[id] = Object.assign({t: RW.mods().find(m => m.id === id).t, d: RW.mods().find(m => m.id === id).d}, R.mods[id] || {}, {[k]: v.trim() || RW.mods().find(m => m.id === id)[k]}); break;
    } });
    toast("Regelwerk gespeichert"); if (t.dataset.rw === "thr" || t.dataset.rw === "proc") rwRender(); return;
  }
  if (t.id === "rwcsv" && t.files[0]) { t.files[0].arrayBuffer().then(b => { try { const n = RW.importCsv(b); toast(n.quellen + " Quellzeilen übernommen, " + n.neu + " neue Liefergegenstände"); rwRender(); } catch (err) { toast("CSV nicht lesbar: Spalten passen nicht"); } }); t.value = ""; return; }
  if (t.id === "rwjson" && t.files[0]) { t.files[0].text().then(x => { try { const n = RW.importRules(x); toast(n + " Liefergegenstände importiert"); rwRender(); } catch (err) { toast("Import fehlgeschlagen: Datei passt nicht zum Format"); } }); t.value = ""; return; }
  if (t.dataset.pdate !== undefined) { S.setDate(t.dataset.id, t.value); toast("Plantermin gespeichert"); return; }
  if (t.dataset.fileinput !== undefined) { addFiles(t); return; }
  if (t.dataset.f && d) { d[t.dataset.f] = t.value; S.save(); return; }
  if (t.dataset.stepin && d) { setPct(t.dataset.stepin, parseInt(t.value, 10) || 0, true); return; }
  if (t.dataset.hc !== undefined) { S.setHc(t.checked); applyTheme(); return; }
  if (t.id === "imp" && t.files[0]) { t.files[0].text().then(x => { try { const n = S.importJSON(x); toast(n + " Vorhaben importiert"); render(); } catch (err) { toast("Import fehlgeschlagen: Datei passt nicht zum Format"); } }); t.value = ""; }
});
document.addEventListener("input", e => {
  const t = e.target, d = S.state.draft;
  if (t.id === "q") { ui.q = t.value; $("#listBody").innerHTML = listRows(); return; }
  if (t.dataset.why && d) { d.c.why[t.dataset.why] = t.value; S.save(); return; }
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
async function addFiles(inp) {
  const id = inp.dataset.id, k = inp.dataset.k, dv = inp.dataset.dv, files = [...inp.files]; inp.value = ""; let n = 0, err = "";
  for (const f of files) {
    if (f.size > F.MAX) { err = f.name + " ist größer als 25 MB"; continue; }
    try { const fid = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)), sha = await F.sha256(f); await F.putFile(fid, f); S.addFileMeta(id, k, {id: fid, name: f.name.slice(0, 120), size: f.size, type: f.type || "", at: new Date().toISOString(), dv, sha}); n++; }
    catch (e) { err = "Datei konnte nicht gespeichert werden (Speicher voll oder gesperrt)"; }
  }
  toast(err ? (n ? n + " gespeichert. " : "") + err : n + (n === 1 ? " Datei hinzugefügt" : " Dateien hinzugefügt"));
  keepScroll(() => vDetail(route()));
}
async function getBlob(fid, id, k) {
  try { const b = await F.getFile(fid); const m = S.byId(id)?.steps[k]?.files.find(f => f.id === fid); if (!b) { toast("Die Datei liegt nicht in diesem Browser (andere Geräte oder Sicherung sehen nur den Eintrag)."); return; } const u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = m ? m.name : "nachweis"; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  catch (e) { toast("Datei konnte nicht gelesen werden"); }
}
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
    if (moved) { const w = (dr.r.width - 8) / 5, x = Math.max(0, Math.min(4 * w, e.clientX - dr.r.left - 4 - w / 2)); pill.style.transform = "translateX(" + x / w * 100 + "%)"; dr.idx = Math.round(x / w); }
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
