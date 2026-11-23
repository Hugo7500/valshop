// Ticket 4.50 de epic-stats-tableau-de-bord (Stats dessiné par une vue web), phase B : ce qui change d'une page à la suivante.
// La page (traduction-web.ts) porte des morceaux remplaçables (`id`) et une `section data-sous-onglet` par sous-onglet monté
// (contrat de la page). `operations(ancien, neuf)` compare deux traductions de l'onglet (le même traducteur : mêmes classes) et
// rend le moins à envoyer à la page : chaque morceau dont le squelette (son HTML, ses morceaux intérieurs et ses sections mis
// de côté) a changé est remplacé entier ; sinon on descend dans ses morceaux. Une section neuve est ajoutée ; une section
// disparue (données neuves) fait remplacer la pile des sous-onglets ; la section visible changée fait basculer. Un squelette de
// page changé (hors de tout morceau) : la page entière. Module pur, sans Scripting : testé au Mac.
// Ticket 4.50, phase C : le menu du périmètre (Mode, Période) en HTML dans la page (menusWeb, STYLE_MENU, SCRIPT_MENU), ancré
// sous son libellé, à l'allure du menu d'iOS en sombre ; ouvert et fermé par la page seule, chaque choix renvoyé à l'app.
// Ticket 4.51 : les vues de la page (`data-vue` : « stats », l'onglet ; « detail », le Détail d'une partie), une seule montrée,
// les autres `hidden`. Comme les sections : leur `hidden` hors du squelette ; la vue montrée changée : l'opération « vue »
// (l'hôte pousse ou dépile, page-web.tsx) ; un morceau `data-vue` remplacé garde la visibilité de l'ancien (dans l'hôte comme ici).

import { traduire } from "./langue"
import type { VueWeb } from "./rendu"

export type Operation =
  | { genre: "remplacer"; id: string; html: string }
  | { genre: "inserer"; dans: string; apres: string; html: string }
  | { genre: "section"; cle: string; html: string }
  | { genre: "basculer"; cle: string }
  | { genre: "vue"; cle: string }
  | { genre: "page" }

type Noeud = { id: string | null; cle: string | null; vue: string | null; cache: boolean; debut: number; fin: number; enfants: Noeud[] }
export type Decoupe = { html: string; racine: Noeud; parId: Map<string, Noeud>; sections: Map<string, Noeud>; vues: Map<string, Noeud> }

const BALISE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"]|"[^"]*")*?)(\/?)>/g

/** Les morceaux (`id`) et les sections d'une page, imbriqués comme dans le HTML. */
export function decouper(html: string): Decoupe {
  const racine: Noeud = { id: null, cle: null, vue: null, cache: false, debut: 0, fin: html.length, enfants: [] }
  const pile: { balise: string; noeud: Noeud | null }[] = []
  const ouverts: Noeud[] = [racine]
  const parId = new Map<string, Noeud>(), sections = new Map<string, Noeud>(), vues = new Map<string, Noeud>()
  BALISE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BALISE.exec(html)) !== null) {
    const [tout, ferme, balise, attrs, auto] = m
    if (auto === "/") continue
    if (ferme === "/") {
      const haut = pile.pop()
      if (!haut || haut.balise !== balise) throw new Error("HTML mal formé près de " + m.index)
      if (haut.noeud) { haut.noeud.fin = m.index + tout.length; ouverts.pop() }
      continue
    }
    const id = /\sid="([^"]*)"/.exec(attrs)
    const cle = balise === "section" ? /\sdata-sous-onglet="([^"]*)"/.exec(attrs) : null
    const vue = id ? /\sdata-vue="([^"]*)"/.exec(attrs) : null
    let noeud: Noeud | null = null
    if (id || cle) {
      const cache = (cle !== null || vue !== null) && /\shidden(\s|$)/.test(attrs)
      noeud = { id: id ? id[1] : null, cle: cle ? cle[1] : null, vue: vue ? vue[1] : null, cache, debut: m.index, fin: -1, enfants: [] }
      ouverts[ouverts.length - 1].enfants.push(noeud)
      ouverts.push(noeud)
      if (noeud.id !== null) parId.set(noeud.id, noeud)
      if (noeud.cle !== null) sections.set(noeud.cle, noeud)
      if (noeud.vue !== null) vues.set(noeud.vue, noeud)
    }
    pile.push({ balise, noeud })
  }
  if (pile.length > 0) throw new Error("HTML mal formé : balises ouvertes à la fin")
  return { html, racine, parId, sections, vues }
}

const morceau = (d: Decoupe, n: Noeud) => d.html.slice(n.debut, n.fin)
/** Le HTML d'un nœud, ses morceaux et sections intérieurs remplacés par leur nom, l'attribut `hidden` des sections et des vues ôté. */
function squelette(d: Decoupe, n: Noeud): string {
  let s = "", i = n.debut
  for (const e of n.enfants) { s += d.html.slice(i, e.debut) + "\u0000" + (e.id ?? "§" + e.cle) + "\u0000"; i = e.fin }
  s += d.html.slice(i, n.fin)
  return n.cle !== null || n.vue !== null ? s.replace(/^(<[a-zA-Z]+\b[^>]*?)\shidden(?=[\s>])/, "$1") : s
}
const visible = (d: Decoupe) => { for (const [cle, n] of d.sections) if (!n.cache) return cle; return null }
/** Ticket 4.51 : la vue montrée (`data-vue` sans `hidden`), null sans vue. */
const vueMontree = (d: Decoupe) => { for (const [cle, n] of d.vues) if (!n.cache) return cle; return null }

/** Les opérations qui font de la page `ancien` la page `neuf` (deux HTML du même traducteur). */
export function operations(ancien: string, neuf: string): Operation[] {
  return comparer(decouper(ancien), neuf).ops
}

/**
 * `operations`, la page d'avant déjà découpée (gardée d'un appui à l'autre : un seul découpage par appui) ; rend aussi le
 * découpage de la page neuve, à garder pour l'appui suivant.
 */
export function comparer(a: Decoupe, neuf: string): { ops: Operation[]; decoupe: Decoupe } {
  if (a.html === neuf) return { ops: [], decoupe: a }
  const b = decouper(neuf)
  return { ops: difference(a, b), decoupe: b }
}

function difference(a: Decoupe, b: Decoupe): Operation[] {
  if (squelette(a, a.racine) !== squelette(b, b.racine)) return [{ genre: "page" }]
  const ops: Operation[] = []
  const descendre = (na: Noeud, nb: Noeud) => {
    for (let k = 0; k < nb.enfants.length; k++) {
      const eb = nb.enfants[k], ea = na.enfants[k]
      if (morceau(a, ea) === morceau(b, eb)) continue
      if (eb.id === "sous-onglets") { sousOnglets(ea, eb); continue }
      if (squelette(a, ea) === squelette(b, eb)) descendre(ea, eb)
      else if (eb.id !== null && ajout(ea, eb)) { /* lignes ajoutées à la fin d'une liste : insérées seules (ajout) */ }
      else if (eb.id !== null) ops.push({ genre: "remplacer", id: eb.id, html: morceau(b, eb) })
      else { ops.length = 0; ops.push({ genre: "page" }); return }
    }
  }
  /**
   * Ticket 4.50, phase C : une liste qui a gagné des morceaux à la suite de son dernier (« Voir plus » de Parties : les lignes
   * `<liste>~k<partie>`) : si le neuf, ces morceaux et ce qui les sépare ôtés, a le squelette de l'ancien, on insère seulement
   * le passage neuf après le dernier ancien morceau, puis on descend dans les anciens. Sinon faux.
   */
  const ajout = (na: Noeud, nb: Noeud): boolean => {
    const k = na.enfants.length
    if (k === 0 || nb.enfants.length <= k) return false
    for (let i = 0; i < k; i++) if (na.enfants[i].id === null || na.enfants[i].id !== nb.enfants[i].id) return false
    const dernier = nb.enfants[k - 1], fin = nb.enfants[nb.enfants.length - 1].fin
    if (nb.enfants.slice(k).some((e) => e.id === null)) return false
    const passage = b.html.slice(dernier.fin, fin)
    // Relecture C6 : le passage doit être du HTML complet (ses balises ouvertes et fermées en lui) : sinon (lignes d'un autre
    // conteneur, `</div><div>…`), l'insérer après le dernier ancien morceau le mettrait au mauvais endroit : bloc entier.
    try { decouper(passage) } catch { return false }
    // Le squelette du neuf sans le passage inséré : celui de l'ancien.
    const sansAjout: Noeud = { ...nb, enfants: nb.enfants.slice(0, k) }
    const sq = (d: Decoupe, n: Noeud, coupe: [number, number] | null) => {
      let s = "", i = n.debut
      for (const e of n.enfants) { s += d.html.slice(i, e.debut) + "\u0000" + (e.id ?? "§" + e.cle) + "\u0000"; i = e.fin }
      return s + (coupe ? d.html.slice(i, coupe[0]) + d.html.slice(coupe[1], n.fin) : d.html.slice(i, n.fin))
    }
    if (sq(b, sansAjout, [dernier.fin, fin]) !== squelette(a, na)) return false
    ops.push({ genre: "inserer", dans: nb.id!, apres: dernier.id!, html: passage })
    descendre(na, sansAjout)
    return true
  }
  const sousOnglets = (na: Noeud, nb: Noeud) => {
    const cles = (n: Noeud) => n.enfants.map((e) => e.cle)
    const ca = cles(na), cb = cles(nb)
    // Une section disparue ou déplacée : la pile entière (de nouvelles données démontent les sous-onglets cachés).
    if (ca.some((c) => !cb.includes(c)) || cb.filter((c) => ca.includes(c)).join("|") !== ca.join("|")) {
      ops.push({ genre: "remplacer", id: "sous-onglets", html: morceau(b, nb) })
      return
    }
    for (const eb of nb.enfants) {
      const ea = na.enfants.find((e) => e.cle === eb.cle)
      if (!ea) { ops.push({ genre: "section", cle: eb.cle!, html: morceau(b, eb).replace(/^(<section\b[^>]*?)\shidden(?=[\s>])/, "$1") }); continue }
      if (squelette(a, ea) === squelette(b, eb)) descendre(ea, eb)
      // Une section qui porte un identifiant est remplacée seule (telle que la neuve, visibilité comprise) ; sinon la pile entière.
      else if (eb.id !== null && ea.id === eb.id) ops.push({ genre: "remplacer", id: eb.id, html: morceau(b, eb) })
      else { ops.push({ genre: "remplacer", id: "sous-onglets", html: morceau(b, nb) }); return }
    }
  }
  descendre(a.racine, b.racine)
  if (ops.some((o) => o.genre === "page")) return [{ genre: "page" }]
  const vb = visible(b)
  if (vb !== null && vb !== visible(a) && !ops.some((o) => o.genre === "remplacer" && o.id === "sous-onglets")) ops.push({ genre: "basculer", cle: vb })
  // Ticket 4.51 : la vue montrée changée (Détail poussé ou dépilé), en dernier : son contenu est déjà en place.
  const ub = vueMontree(b)
  if (ub !== null && ub !== vueMontree(a)) ops.push({ genre: "vue", cle: ub })
  return ops
}

const sansCache = (tag: string) => tag.replace(/\shidden(?=[\s>])/, "")
const cache = (tag: string) => sansCache(tag).replace(/>$/, " hidden>")

/**
 * La page `ancien` après `ops`, en texte (ce que fait l'hôte dans le DOM) : sert au harnais, qui vérifie qu'elle redevient
 * la traduction neuve (à l'ordre des sections près : `canonique`). Une section ajoutée l'est cachée, à la fin de la pile ;
 * basculer montre la seule section dite.
 */
export function appliquer(ancien: string, ops: Operation[]): string {
  let html = ancien
  for (const o of ops) {
    const d = decouper(html)
    if (o.genre === "remplacer") {
      const n = d.parId.get(o.id)
      if (!n) throw new Error("morceau absent : " + o.id)
      // Ticket 4.51 : une vue (`data-vue`) remplacée garde la visibilité de l'ancienne (l'opération « vue » la change).
      const neuf = n.vue === null ? o.html : o.html.replace(/^<[^>]*>/, (tag: string) => (n.cache ? cache(tag) : sansCache(tag)))
      html = html.slice(0, n.debut) + neuf + html.slice(n.fin)
    } else if (o.genre === "inserer") {
      const n = o.apres ? d.parId.get(o.apres) : d.parId.get(o.dans)
      if (!n) throw new Error("morceau absent : " + (o.apres || o.dans))
      const ici = o.apres ? n.fin : html.indexOf(">", n.debut) + 1
      html = html.slice(0, ici) + o.html + html.slice(ici)
    } else if (o.genre === "section") {
      const pile = d.parId.get("sous-onglets")
      if (!pile) throw new Error("pile des sous-onglets absente")
      const fin = pile.fin - "</div>".length
      html = html.slice(0, fin) + o.html.replace(/^<section\b[^>]*>/, cache) + html.slice(fin)
    } else if (o.genre === "basculer") {
      html = html.replace(/<section\b[^>]*>/g, (tag: string) => {
        const cle = /\sdata-sous-onglet="([^"]*)"/.exec(tag)
        return cle && cle[1] === o.cle ? sansCache(tag) : cache(tag)
      })
    } else if (o.genre === "vue") {
      if (!d.vues.has(o.cle)) throw new Error("vue absente : " + o.cle)
      for (const n of [...d.vues.values()].sort((x, y) => y.debut - x.debut)) {
        const fin = html.indexOf(">", n.debut) + 1
        const tag = html.slice(n.debut, fin)
        html = html.slice(0, n.debut) + (n.vue === o.cle ? sansCache(tag) : cache(tag)) + html.slice(fin)
      }
    } else throw new Error("page entière : rien à appliquer")
  }
  return html
}

/** La page, les sections de la pile des sous-onglets rangées par clé (l'ordre d'ajout de l'hôte n'y change rien à l'écran). */
export function canonique(html: string): string {
  const d = decouper(html)
  const pile = d.parId.get("sous-onglets")
  if (!pile) return html
  const secs = pile.enfants.filter((e) => e.cle !== null)
  if (secs.length === 0) return html
  const debut = secs[0].debut, fin = secs[secs.length - 1].fin
  const tri = [...secs].sort((x, y) => (x.cle! < y.cle! ? -1 : x.cle! > y.cle! ? 1 : 0)).map((e) => html.slice(e.debut, e.fin)).join("")
  return html.slice(0, debut) + tri + html.slice(fin)
}

// ── Ticket 4.50, phase C : le menu du périmètre dans la page ──

const echapper = (x: unknown) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const texteDe = (v: VueWeb): string => (v.type === "#text" ? v.value || "" : (v.children || []).map(texteDe).join(""))
const COCHE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 6.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/**
 * Les menus de la page (les Menu gardés par la traduction, `menus` : identifiant → Menu rendu) en HTML, cachés, dans
 * `#menus-web` (un morceau : un choix fait ne renvoie qu'eux). Chaque Section du Menu est un groupe titré, chaque Text de
 * son Picker un choix `menuitemradio` (coché : la valeur du Picker) dont `data-action` est rendu avec sa fonction (le
 * `onChanged` du Picker, la valeur de son `tag`). La page les ouvre et les ferme seule (SCRIPT_MENU).
 */
export function menusWeb(menus: Map<string, VueWeb>): { html: string; actions: Map<string, () => void> } {
  const actions = new Map<string, () => void>()
  let html = ""
  for (const [id, menu] of menus) {
    let sections = ""
    let k = 0
    const parcourir = (v: VueWeb, titre: string | null) => {
      if (v.type === "Section") { for (const c of v.children || []) parcourir(c, v.props.title ?? null); return }
      if (v.type !== "Picker") { for (const c of v.children || []) parcourir(c, titre); return }
      const p = v.props
      let choix = ""
      for (const t of v.children || []) {
        if (t.type !== "Text" || t.props.tag === undefined) continue
        const action = `menu:${id}:${k}:${String(t.props.tag)}`
        const onChanged = p.onChanged
        actions.set(action, () => onChanged(t.props.tag))
        const coche = t.props.tag === p.value
        choix += `<button type="button" class="vm-choix" role="menuitemradio" aria-checked="${coche}" data-action="${echapper(action)}">` +
          `<span class="vm-coche">${coche ? COCHE : ""}</span><span class="vm-libelle">${echapper(texteDe(t))}</span></button>`
      }
      const t = titre ?? p.title ?? ""
      sections += `<div class="vm-section" role="group" aria-label="${echapper(t)}"><div class="vm-titre" aria-hidden="true">${echapper(t)}</div>${choix}</div>`
      k++
    }
    for (const c of menu.children || []) parcourir(c, null)
    // Relecture C13 : le panneau dit l'étiquette du Menu, son indice à part ; C2 : modal pour VoiceOver, fond nommé « Fermer ».
    const etiquette = menu.props.accessibilityLabel ?? ""
    const indice = menu.props.accessibilityHint ? ` aria-description="${echapper(menu.props.accessibilityHint)}"` : ""
    html += `<div class="vm" data-menu-pour="${echapper(id)}" hidden><div class="vm-fond" data-menu-fermer="1" role="button" aria-label="${echapper(traduire("Fermer"))}"></div>` +
      `<div class="vm-panneau" role="menu" aria-modal="true" aria-label="${echapper(etiquette)}"${indice}>${sections}</div></div>`
  }
  return { html: `<div id="menus-web">${html}</div>`, actions }
}

/** L'allure du menu d'iOS en sombre : panneau flou arrondi, choix de 44 points, coche en tête, titres de section discrets. */
export const STYLE_MENU = `.vm{position:fixed;inset:0;z-index:50}
.vm-fond{position:absolute;inset:0;background:transparent}
.vm-panneau{position:fixed;width:calc(250px * var(--echelle-texte, 1));max-width:calc(100vw - 16px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;border-radius:13px;background:#232325;-webkit-backdrop-filter:blur(30px) saturate(1.8);backdrop-filter:blur(30px) saturate(1.8);box-shadow:0 12px 40px rgba(0,0,0,.55),0 0 0 .5px rgba(255,255,255,.08);transform-origin:top left;animation:vm-ouvre .14s ease-out;color:#fff;font:400 calc(17px * var(--echelle-texte, 1))/1.3 var(--sf, -apple-system, system-ui, sans-serif)}
@keyframes vm-ouvre{from{transform:scale(.94)}to{transform:none}}
.vm-section+.vm-section{border-top:8px solid rgba(0,0,0,.28)}
.vm-titre{padding:8px 16px 4px;font-size:calc(13px * var(--echelle-texte, 1));color:rgba(235,235,245,.6)}
.vm-choix{display:flex;align-items:center;gap:6px;width:100%;min-height:44px;padding:11px 16px 11px 10px;border:0;background:none;color:inherit;font:inherit;text-align:left;-webkit-tap-highlight-color:transparent}
.vm-choix+.vm-choix{box-shadow:inset 0 .5px 0 rgba(255,255,255,.15)}
.vm-choix:active,.vm-choix[data-appuye]{background:rgba(255,255,255,.1)}
.vm-choix:focus{outline:none}
.vm-choix:focus-visible{background:rgba(255,255,255,.08)}
.vm-coche{flex:none;width:calc(18px * var(--echelle-texte, 1));height:calc(18px * var(--echelle-texte, 1));display:flex}
.vm-coche svg{width:100%;height:100%}
`

/**
 * Le script du menu (dans la page) : un appui sur le libellé d'un Menu (`data-action="menu"`, `data-valeur` = son
 * identifiant) ouvre son panneau sous lui (au-dessus s'il manque la place), le focus au choix coché (VoiceOver) ; un
 * appui ailleurs, Échap ou le défilement le ferment sans rien toucher dessous ; un choix le ferme aussitôt (l'app,
 * prévenue par l'hôte, applique le choix et renvoie la page).
 */
export const SCRIPT_MENU = String.raw`(() => {
  if (window.__vmPose) return
  window.__vmPose = true
  let ouvert = null, declencheur = null
  const page = () => document.getElementById("stats")
  /** Relecture C2 : tant qu'un menu est ouvert, la page derrière est inerte (VoiceOver ne la parcourt pas, rien ne s'y touche). */
  function inerte(v) {
    const p = page()
    if (!p) return
    if (v) { p.setAttribute("inert", ""); p.setAttribute("aria-hidden", "true") }
    else { p.removeAttribute("inert"); p.removeAttribute("aria-hidden") }
  }
  function fermer(rendreFocus) {
    if (!ouvert) return
    if (ouvert.isConnected) ouvert.hidden = true
    inerte(false)
    if (declencheur) {
      declencheur.setAttribute("aria-expanded", "false")
      if (rendreFocus && declencheur.isConnected) try { declencheur.focus({ preventScroll: true }) } catch (e) {}
    }
    ouvert = null; declencheur = null
  }
  function ouvrir(b) {
    const id = b.getAttribute("data-valeur")
    const m = document.querySelector('.vm[data-menu-pour="' + CSS.escape(id || "") + '"]')
    if (!m) return
    fermer(false)
    m.hidden = false
    ouvert = m; declencheur = b
    b.setAttribute("aria-haspopup", "menu"); b.setAttribute("aria-expanded", "true")
    inerte(true)
    const p = m.querySelector(".vm-panneau")
    // Relecture C7 : du côté où il y a le plus de place ; au moins MIN de haut, sinon tout ce qu'il y a ; défilement dedans.
    const r = b.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, MARGE = 8, ECART = 6, MIN = 200
    p.style.maxHeight = ""; p.style.top = "0px"; p.style.left = "0px"
    const w = p.offsetWidth, h = p.offsetHeight
    const dessous = vh - r.bottom - ECART - MARGE, dessus = r.top - ECART - MARGE
    const enBas = h <= dessous || dessous >= dessus
    const place = Math.max(Math.min(enBas ? dessous : dessus, vh - 2 * MARGE), Math.min(MIN, vh - 2 * MARGE))
    const haut = Math.min(h, place)
    p.style.maxHeight = haut + "px"
    const top = enBas ? Math.min(r.bottom + ECART, vh - MARGE - haut) : Math.max(MARGE, r.top - ECART - haut)
    p.style.left = Math.max(MARGE, Math.min(r.left, vw - w - MARGE)) + "px"
    p.style.top = top + "px"
    p.style.transformOrigin = enBas ? "top left" : "bottom left"
    const cible = m.querySelector('.vm-choix[aria-checked="true"]') || m.querySelector(".vm-choix")
    if (cible) try { cible.focus({ preventScroll: true }) } catch (e) {}
  }
  document.addEventListener("click", (e) => {
    const t = e.target && e.target.closest ? e.target : null
    if (!t) return
    // Un menu ouvert : tout appui hors de son panneau le ferme, sans toucher ce qu'il y a dessous.
    if (ouvert && !t.closest(".vm-panneau")) { e.preventDefault(); e.stopPropagation(); fermer(true); return }
    const choix = t.closest(".vm-choix")
    if (choix) {
      // Relecture C1 : le libellé du menu sera remplacé (le choix renvoie la page) ; le focus y revient après (vs.observer).
      const id = ouvert ? ouvert.getAttribute("data-menu-pour") : null
      if (id) window.__vmRetour = { id, t: Date.now() }
      setTimeout(() => fermer(true), 0)
      return
    }
    const b = t.closest('[data-action="menu"]')
    if (b) ouvrir(b)
  }, true)
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermer(true) })
  window.addEventListener("scroll", () => fermer(false), { passive: true })
  window.addEventListener("resize", () => fermer(false))
  // Relecture C2 : l'onglet caché (Boutique, Détail : vs.cacher, appelé par l'app) ferme le menu.
  window.vs = window.vs || {}
  window.vs.fermerMenus = () => fermer(false)
  // Relecture C1 : après un remplacement, le focus rendu au libellé neuf du menu choisi (dans les 3 s du choix).
  const observer = window.vs.observer
  window.vs.observer = (racine) => {
    if (typeof observer === "function") observer(racine)
    const r = window.__vmRetour
    if (!r || Date.now() - r.t > 3000 || !racine || !racine.querySelectorAll) return
    const neuf = racine.querySelector('[data-action="menu"][data-valeur="' + CSS.escape(r.id) + '"]') ||
      (racine.matches && racine.matches('[data-action="menu"]') && racine.getAttribute("data-valeur") === r.id ? racine : null)
    if (neuf) { window.__vmRetour = null; try { neuf.focus({ preventScroll: true }) } catch (e) {} }
  }
})();
`
