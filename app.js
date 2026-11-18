import { counts } from "./core.js";
import { load, commit, AuthError, SyncError } from "./github.js";

const TV = new URLSearchParams(location.search).has("tv");
if (TV) document.documentElement.classList.add("tv");
const $ = id => document.getElementById(id);
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
let token = store.get("checklist-token");
let data = null, busy = false, lastItem = {}, gen = 0;

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k.startsWith("on") ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v);
  e.append(...kids.filter(k => k != null));
  return e;
}

function setStatus(text, err = false) { $("status").textContent = text; $("status").classList.toggle("err", err); }

function showAuth(msg = "") {
  $("app").hidden = true; $("auth").hidden = false; $("auth-msg").textContent = msg; $("token").focus();
}

function render() {
  const focusId = document.activeElement?.dataset?.id;
  const rail = $("rail"), list = $("list");
  rail.replaceChildren(); list.replaceChildren();
  for (const s of data.sections) {
    const c = counts(s);
    rail.append(el("button", { class: "rail-btn", type: "button", "data-sec": s.id,
      onclick: () => TV ? focusSection(s.id) : $("sec-" + s.id).scrollIntoView({ behavior: "smooth" }) },
      el("span", { class: "ti" }, s.title), el("span", { class: "ini" }, s.title[0]), el("span", { class: "c" }, `${c.done}/${c.total}`)));

    const sec = el("section", { id: "sec-" + s.id },
      el("div", { class: "head" }, el("h2", {}, s.title), s.tag ? el("span", { class: "tag" }, s.tag) : null),
      el("div", { class: "count" }, `${c.done} / ${c.total} fait${c.done > 1 ? "s" : ""}`),
      el("div", { class: "bar" }, bar(c)));
    for (const g of s.groups) {
      if (g.title) sec.append(el("h3", {}, g.title));
      sec.append(el("ul", {}, ...g.items.map(i => el("li", {},
        el("button", { class: "item", type: "button", role: "checkbox", "aria-checked": String(i.done), "data-id": i.id, "data-sec": s.id,
          onclick: () => act({ type: "toggle", id: i.id, done: !i.done }) },
          el("span", { class: "box", "aria-hidden": "true" }),
          el("span", {}, el("span", { class: "t" }, i.text), i.note ? el("span", { class: "n" }, i.note) : null)),
        TV ? null : el("button", { class: "del", type: "button", "aria-label": "Supprimer « " + i.text + " »",
          onclick: () => confirm(`Supprimer « ${i.text} » ?`) && act({ type: "remove", id: i.id }) }, "🗑")))));
    }
    if (!TV) sec.append(tools(s, c));
    list.append(sec);
  }
  if (focusId) document.querySelector(`.item[data-id="${CSS.escape(focusId)}"]`)?.focus();
}

// CSSOM plutôt qu'un attribut style, autorisé par la CSP.
function bar(c) { const i = el("i"); i.style.width = (c.total ? c.done / c.total * 100 : 0) + "%"; return i; }

// Après une action, garder le focus dans la section touchée (clavier, lecteur d'écran).
function refocus(op, secId) {
  if (document.activeElement && document.activeElement !== document.body) return;
  const sec = secId && $("sec-" + secId);
  (op.type === "add" ? sec?.querySelector(".tools .quiet") : sec?.querySelector(".item"))?.focus();
}

function tools(s, c) {
  const groups = [...new Set(s.groups.map(g => g.title))];
  const dl = el("datalist", { id: "dl-" + s.id }, ...groups.filter(Boolean).map(t => el("option", { value: t })));
  const text = el("input", { placeholder: "Nouvelle tâche", "aria-label": "Nouvelle tâche", required: "" });
  const grp = el("input", { list: "dl-" + s.id, placeholder: "Groupe (facultatif)", "aria-label": "Groupe" });
  grp.value = groups.at(-1) ?? "";
  const form = el("form", { class: "add", hidden: "", onsubmit: e => {
    e.preventDefault();
    const t = text.value.trim();
    if (t) act({ type: "add", sectionId: s.id, groupTitle: grp.value.trim(), text: t });
  } }, text, grp, dl, el("button", { type: "submit" }, "Ajouter"));
  return el("div", { class: "tools" },
    el("button", { class: "quiet", type: "button", onclick: e => { form.hidden = !form.hidden; e.currentTarget.hidden = true; text.focus(); } }, "+ Ajouter une tâche"),
    c.done ? el("button", { class: "quiet", type: "button",
      onclick: () => confirm(`Retirer les ${c.done} tâche(s) cochée(s) de « ${s.title} » ?`) && act({ type: "clearDone", sectionId: s.id }) }, "Vider les cochées") : null,
    form);
}

function setData(d) { data = d; store.set("checklist-cache", JSON.stringify(d)); render(); }

function fail(e) {
  if (e instanceof AuthError) { token = null; store.set("checklist-token", null); showAuth("Jeton refusé ou expiré. Colle un nouveau jeton."); return; }
  const cached = store.get("checklist-cache");
  if (!data && cached) { try { data = JSON.parse(cached); render(); } catch { store.set("checklist-cache", null); } }
  setStatus(e instanceof SyncError ? `Hors ligne : ${e.message}. Rien n'a été enregistré.` : String(e), true);
}

async function refresh() {
  // Ne pas effacer une saisie en cours.
  if (!token || busy || document.activeElement?.closest("form.add")) return;
  const g = gen;
  try {
    const d = (await load(token)).data;
    if (g !== gen) return; // une écriture plus récente a eu lieu pendant la lecture
    setData(d); setStatus("À jour à " + new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })); }
  catch (e) { fail(e); }
}

async function act(op) {
  if (busy) return;
  const secId = document.activeElement?.closest("section")?.id.slice(4);
  busy = true; gen++; $("list").classList.add("busy"); $("list").setAttribute("aria-busy", "true"); setStatus("Enregistrement…");
  try { setData((await commit(token, op)).data); setStatus("Enregistré"); refocus(op, secId); }
  catch (e) { fail(e); }
  finally { busy = false; $("list").classList.remove("busy"); $("list").removeAttribute("aria-busy"); }
}

// ----- Navigation TV au pavé directionnel -----
function focusSection(secId) {
  const items = [...document.querySelectorAll(`.item[data-sec="${CSS.escape(secId)}"]`)];
  (items.find(i => i.dataset.id === lastItem[secId]) || items[0])?.focus();
}
function moveIn(nodes, cur, d) {
  const n = nodes[Math.max(0, Math.min(nodes.length - 1, nodes.indexOf(cur) + d))];
  n?.focus(); n?.scrollIntoView({ block: "center" });
}
if (TV) {
  document.addEventListener("focusin", e => {
    document.documentElement.classList.toggle("rail-open", !!e.target.closest("#rail"));
    if (e.target.classList.contains("item")) lastItem[e.target.dataset.sec] = e.target.dataset.id;
  });
  document.addEventListener("keydown", e => {
    const a = document.activeElement, inRail = !!a?.closest("#rail");
    const zone = inRail ? [...document.querySelectorAll(".rail-btn")] : [...document.querySelectorAll(".item")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") moveIn(zone, a, e.key === "ArrowDown" ? 1 : -1);
    else if (e.key === "ArrowLeft" && !inRail) (document.querySelector(`.rail-btn[data-sec="${CSS.escape(a?.dataset.sec ?? "")}"]`) || document.querySelector(".rail-btn"))?.focus();
    else if (e.key === "ArrowRight" && inRail) focusSection(a.dataset.sec);
    else return;
    e.preventDefault();
  });
}
// Appelés par l'app Android.
window.checklistRefresh = refresh;
window.checklistBack = () => {
  const a = document.activeElement;
  if (a?.classList.contains("item")) { document.querySelector(`.rail-btn[data-sec="${CSS.escape(a.dataset.sec)}"]`)?.focus(); return true; }
  return false;
};

// ----- Démarrage -----
$("auth-form").addEventListener("submit", async e => {
  e.preventDefault();
  const t = $("token").value.trim();
  $("auth-msg").textContent = "Test…";
  try {
    const { data: d } = await load(t);
    token = t; store.set("checklist-token", t); $("token").value = "";
    $("auth").hidden = true; $("app").hidden = false; setData(d); setStatus("Connecté");
    if (TV) document.querySelector(".item")?.focus();
  } catch (err) {
    $("auth-msg").textContent = err instanceof AuthError ? "Ce jeton est refusé : vérifie qu'il a accès à checklist-data en lecture et écriture."
      : "Impossible de joindre GitHub : " + err.message;
  }
});
$("logout").addEventListener("click", () => { token = null; store.set("checklist-token", null); showAuth(); });

if (!token) showAuth();
else {
  $("app").hidden = false;
  await refresh();
  if (TV) document.querySelector(".item")?.focus();
}
setInterval(refresh, 60_000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
