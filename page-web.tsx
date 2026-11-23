import { langue } from "./langue"
import {
  EnvironmentValuesReader, Rectangle, VStack, WebView, ZStack, useEffect, useRef, useState,
  type ColorSchemeContrast, type DynamicTypeSize,
} from "scripting"
import { LIGNES_DE_MESURE_AU_JOURNAL, SEUIL_JOURNAL_MS, couleurs } from "./design"
import { messageHote } from "./historique"
import { CSP_STATS, metaCsp, navigationAdmise } from "./securite"
import { note } from "./valshop"



















































/** Noms des deux messages de la page vers l'app (window.webkit.messageHandlers). */
export const PONT_ACTION = "valshopAction"
export const PONT_PAGE = "valshopPage"





export const DELAI_PAGE_PRETE_MS = 4000
/** Retour d'appui gardé au moins ce temps dans la page, même pour un toucher bref (une image au moins à 60 Hz). */
export const APPUI_VISIBLE_MS = 100
/** Un appui sans changement de la page dans ce délai (menu natif, rien à faire) n'est pas mesuré. */
export const APPUI_PERIME_MS = 10_000
/** Ticket 4.51 : durée d'une poussée ou d'un retour de vue dans la page (celle de la pile de navigation d'iOS, ≈ 0,35 s). */
export const DUREE_VUE_MS = 350
/** Ticket 4.51 : largeur (points) de la bande du bord gauche d'où part le geste de retour (celle du geste d'iOS, ≈ 20). */
export const BORD_RETOUR_PX = 20
/** Taille du corps d'iOS (points) à chaque taille de texte (Dynamic Type, de xSmall à accessibility5) ; 17 à « large ». */
export const CORPS_PAR_TAILLE: Record<DynamicTypeSize, number> = {
  xSmall: 14, small: 15, medium: 16, large: 17, xLarge: 19, xxLarge: 21, xxxLarge: 23,
  accessibility1: 28, accessibility2: 33, accessibility3: 40, accessibility4: 47, accessibility5: 53,
}

/** L'échelle du texte de la page à cette taille : corps ÷ 17, au millième ; 1 si la taille manque ou est inconnue. */
export function echelleTexte(taille: DynamicTypeSize | undefined): number {
  const corps = taille !== undefined ? CORPS_PAR_TAILLE[taille] : undefined
  return corps === undefined ? 1 : Math.round((corps / 17) * 1000) / 1000
}

/**
 * Une chaîne en littéral JavaScript sûr pour `evaluateJavaScript` : JSON (guillemets, barres obliques inverses, sauts de
 * ligne échappés), plus U+2028 et U+2029 (fins de ligne pour un moteur d'avant ES2019) et « < » (aucun `</script>` si le
 * code finit dans une page).
 */
export function litteral(s: string): string {
  return JSON.stringify(String(s)).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029").replace(/</g, "\\u003c")
}

/** Une page : sa tête (avant la balise <body>, "" pour un morceau) et son corps (contenu de <body>, ou le morceau entier). */
export type PageDecoupee = { tete: string; corps: string; document: boolean }

/** Découpe une page complète (une balise <body>) en tête et corps ; un morceau sans <body> est tout corps. */
export function decouper(html: string): PageDecoupee {
  const ouverture = /<body\b[^>]*>/i.exec(html)
  if (ouverture === null) return { tete: "", corps: html, document: false }
  const debut = ouverture.index + ouverture[0].length
  const fin = html.toLowerCase().lastIndexOf("</body>")
  return { tete: html.slice(0, ouverture.index), corps: html.slice(debut, fin >= debut ? fin : html.length), document: true }
}

const STYLE_EN_TETE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi

/** Les feuilles `<style>` d'une tête, leur contenu, dans l'ordre. */
export function stylesDeTete(tete: string): string[] {
  const out: string[] = []
  for (const m of tete.matchAll(STYLE_EN_TETE)) out.push(m[1])
  return out
}

/** La tête sans ses feuilles de style : ce qui, s'il change, demande un nouveau chargement (scripts, méta, liens). */
export function cleDeTete(tete: string): string {
  return tete.replace(STYLE_EN_TETE, "")
}

/** Feuille de l'hôte, avant celles de la page (qui l'emportent) : retour d'appui et toucher sans délai. */
export const STYLE_HOTE = `[data-action]{touch-action:manipulation;-webkit-tap-highlight-color:transparent;cursor:pointer}
[data-action][data-appuye]{opacity:.6}
[hidden]{display:none!important}
[data-focus-vue]:focus{outline:none}
.vs-bord{position:fixed;left:0;top:0;bottom:0;width:${BORD_RETOUR_PX}px;z-index:40;touch-action:pan-y;-webkit-tap-highlight-color:transparent}`

/**
 * Le script de l'hôte dans la page, le premier de sa tête. Pose `--echelle-texte` et `data-taille-texte` sur <html> avant
 * le premier rendu (options de `window.__pageWebOptions`), la délégation des appuis, la mesure de l'appui à l'image,
 * `window.pageWeb` (remplacer, basculer, corps, taille) et le signal « prête ». Contrat avec le script de la traduction :
 * après chaque morceau inséré, `window.vs.observer(racine)` s'il existe (tracés et textes ajustés à la taille réelle).
 * Pas de `${` ici : chaîne brute.
 */
export const SCRIPT_HOTE = String.raw`(() => {
  if (window.pageWeb) return
  const O = window.__pageWebOptions || {}
  const R = document.documentElement
  R.setAttribute("data-taille-texte", O.taille || "large")
  R.style.setProperty("--echelle-texte", String(O.echelle || 1))
  const H = window.webkit && window.webkit.messageHandlers
  function poster(nom, corps) {
    try {
      const h = H && H[nom]
      if (!h) return
      const p = h.postMessage(corps)
      if (p && typeof p.catch === "function") p.catch(() => {})
    } catch (e) {}
  }
  const ACTION = O.pontAction, PAGE = O.pontPage, VISIBLE = O.appuiVisible || 100, PERIME = O.appuiPerime || 10000
  const image = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn))
  // Ticket 4.50, phase C : la mesure d'un appui s'arrête à la peinture de l'image qui suit le dernier changement (rAF, puis une
  // tâche : elle passe après le style, la mise en page et la peinture de cette image), sans l'image de plus du double rAF.
  const peinte = (fn) => requestAnimationFrame(() => {
    if (typeof MessageChannel !== "function") { setTimeout(fn, 0); return }
    const c = new MessageChannel()
    c.port1.onmessage = () => fn()
    c.port2.postMessage(0)
  })
  // Mesure : l'appui en cours (action, heure) ; chaque changement relance l'attente de l'image, la dernière seule compte.
  let appui = null, generation = 0
  // Ticket 4.51 : un changement dans une vue cachée (le Détail rempli avant d'être poussé) ne se voit pas : il ne clôt rien.
  // Relecture 10 : seul un changement dans la vue montrée clôt la mesure (rien sous un parent caché ou en coulisse : section
  // ajoutée cachée, vue cachée remplie).
  function apresChangement(racine) {
    const a = appui
    if (!a) return
    if (racine && racine.closest && racine.closest("[hidden],[data-coulisse]")) return
    const g = ++generation
    peinte(() => {
      if (g !== generation || appui !== a) return
      appui = null
      const ms = performance.now() - a.t0
      if (ms <= PERIME) poster(PAGE, { genre: "mesure", type: a.vue ? "→ " + a.vue : a.genre, ms: Math.round(ms) })
    })
  }
  // Relecture 1 : le genre d'un appui, seul dit au journal (jamais son identifiant, qui peut porter la clé d'une partie).
  function genreDe(b, action) {
    if (action.startsWith("menu:")) return "menu"
    if (b.closest("#barre") || b.closest('[id^="ajustable~"]')) return "sous-onglet"
    if (b.closest('[data-vue="detail"]')) return "detail"
    return "action"
  }
  // L'identifiant du dernier élément touché (relecture 6 : le focus lui revient au retour d'une vue qu'il a poussée).
  let dernierAppui = null
  // Retour d'appui : data-appuye dès le pointerdown, retiré au relâcher, gardé au moins VISIBLE ms.
  const cible = (e) => (e.target && e.target.closest ? e.target.closest("[data-action]") : null)
  const inactif = (b) => b.getAttribute("aria-disabled") === "true" || b.disabled === true
  let appuye = null, depuis = 0
  function relacher() {
    const b = appuye
    if (!b) return
    appuye = null
    const reste = VISIBLE - (performance.now() - depuis)
    if (reste > 0) setTimeout(() => { if (appuye !== b) b.removeAttribute("data-appuye") }, reste)
    else b.removeAttribute("data-appuye")
  }
  const passif = { passive: true, capture: true }
  document.addEventListener("pointerdown", (e) => {
    const b = cible(e)
    if (appuye) { appuye.removeAttribute("data-appuye"); appuye = null }
    if (!b || inactif(b)) return
    b.setAttribute("data-appuye", "")
    appuye = b; depuis = performance.now()
  }, passif)
  for (const t of ["pointerup", "pointercancel"]) document.addEventListener(t, relacher, passif)
  document.addEventListener("scroll", relacher, passif)
  // :active sur iOS ne vient qu'avec un écouteur de toucher.
  document.addEventListener("touchstart", (e) => { if (e.touches && e.touches.length > 1 && geste) secondDoigt() }, passif)
  document.addEventListener("click", (e) => {
    const b = cible(e)
    if (!b) return
    e.preventDefault()
    if (inactif(b)) return
    const action = b.getAttribute("data-action")
    if (!action) return
    // Relecture C8 : « menu », « date », « lien » n'attendent rien de l'app (menu ouvert par la page, feuille ou Safari natifs) :
    // pas de mesure (elle courrait jusqu'à l'appui suivant) ; le choix fait dans le menu, lui, est mesuré.
    if (action !== "menu" && action !== "date" && action !== "lien") { appui = { genre: genreDe(b, action), t0: performance.now() }; generation++ }
    dernierAppui = action
    poster(ACTION, { action, valeur: b.getAttribute("data-valeur") })
  }, true)
  // Un morceau inséré : ses scripts rejoués (innerHTML ne les lance pas), puis la traduction le dessine.
  function activer(racine) {
    for (const s of Array.from(racine.querySelectorAll("script"))) {
      const n = document.createElement("script")
      for (const a of Array.from(s.attributes)) n.setAttribute(a.name, a.value)
      n.text = s.text
      s.replaceWith(n)
    }
    try { if (window.vs && typeof window.vs.observer === "function") window.vs.observer(racine) } catch (e) {}
  }
  // Classes neuves d'un morceau : ajoutées à la dernière feuille de la page (celle de la traduction), une neuve s'il n'y en a pas.
  function ajouterCss(css) {
    if (!css) return
    const fs = document.head.querySelectorAll("style:not([data-hote])")
    if (fs.length) fs[fs.length - 1].append(css)
    else { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s) }
  }
  const BLOC = { top: "start", center: "center", bottom: "end" }
  // ── Ticket 4.51 : les vues de la page ([data-vue]) : pousser, dépiler, geste de retour ──
  const DUREE = O.dureeVue || 350, COURBE = "cubic-bezier(.32,.72,0,1)", RECUL = 0.3
  const vues = () => Array.from(document.querySelectorAll("[data-vue]"))
  // Relecture 7 : une vue à pousser (data-retour), remplie cachée, attend « en coulisse » : mise en page hors de l'écran,
  // invisible (ni appui ni focus) et cachée à VoiceOver ; la poussée n'a plus ni textes à ajuster ni mise en page à faire.
  const enCoulisse = (v) => v.hasAttribute("data-coulisse")
  const visible = (v) => !v.hidden && !enCoulisse(v)
  const montree = () => vues().find(visible) || null
  function versCoulisse(v) {
    v.setAttribute("data-coulisse", "")
    v.setAttribute("aria-hidden", "true")
    Object.assign(v.style, { position: "fixed", left: "0", right: "0", top: "0", visibility: "hidden", transform: "translateX(200%)" })
    v.hidden = false
  }
  function horsCoulisse(v) {
    if (!enCoulisse(v)) return
    v.removeAttribute("data-coulisse")
    v.removeAttribute("aria-hidden")
    liberer(v)
  }
  // Une vue cachée (ou montrée) pour de bon, sortie de la coulisse.
  function cacher(v, oui) { horsCoulisse(v); v.hidden = oui }
  const parCle = (cle) => vues().find((v) => v.getAttribute("data-vue") === cle) || null
  const defilements = new Map()
  // Relecture 6 : l'action qui a poussé chaque vue (un identifiant de la page, gardé ici, jamais au journal) : au retour, le
  // focus revient à son élément (la ligne de la partie ouverte).
  const pousseePar = new Map()
  // Relecture 2 : la vue que l'app croit montrée (dernier « montrer », sinon celle du document).
  let voulue = null
  // L'animation en cours : { cible, fin } ; « fin » la termine dans son état d'arrivée.
  let anim = null
  const PROPS = ["position", "left", "right", "top", "zIndex", "background", "minHeight", "transform", "transition", "boxShadow", "willChange", "pointerEvents", "visibility"]
  const liberer = (v) => { for (const k of PROPS) v.style[k] = "" }
  // La vue posée par-dessus la page, telle qu'à l'écran défilée de y (son fond couvre l'écran), sous le voile.
  function figer(v, y) {
    Object.assign(v.style, { position: "fixed", left: "0", right: "0", top: (-y) + "px", zIndex: "20", minHeight: "calc(100vh + " + y + "px)",
      background: getComputedStyle(document.body).backgroundColor, boxShadow: "-8px 0 24px rgba(0,0,0,.35)", willChange: "transform" })
    voiler(true)
  }
  // Relecture 1 : pendant une glissée (poussée, retour, geste), un voile transparent au-dessus des deux vues prend les
  // appuis : rien ne se touche dessous, comme une pile native en transition (un seul élément : rien à recalculer dans les vues).
  let voile = null
  function voiler(oui) {
    if (!voile || !voile.isConnected) {
      if (!oui) return
      voile = document.createElement("div")
      voile.setAttribute("aria-hidden", "true")
      voile.style.cssText = "position:fixed;inset:0;z-index:30;background:transparent;touch-action:none"
      document.body.appendChild(voile)
    }
    voile.hidden = !oui
  }
  // p : 0, la vue d'en dessous montrée ; 1, la vue poussée montrée.
  function poser(haut, bas, p) {
    const w = innerWidth
    haut.style.transform = "translateX(" + ((1 - p) * w) + "px)"
    bas.style.transform = p > 0 ? "translateX(" + (-RECUL * w * p) + "px)" : ""
  }
  function animer(haut, bas, p, ms, fin) {
    for (const v of [haut, bas]) v.style.transition = "transform " + ms + "ms " + COURBE
    poser(haut, bas, p)
    const a = { cible: null, fin: () => { for (const v of [haut, bas]) v.style.transition = ""; voiler(false); fin(); garantirVue() } }
    setTimeout(() => { if (anim === a) { anim = null; a.fin() } }, ms + 30)
    return a
  }
  function finirVue() { const a = anim; anim = null; if (a) a.fin() }
  // Les textes ajustés d'une section ou d'une vue qui vient d'être montrée, à sa taille réelle (traduction-web.ts) ; relecture 7 :
  // seulement ceux qui ne l'ont pas encore été (posés cachés).
  function ajusterTextes(el) { try { if (window.vs && typeof window.vs.ajusterTextes === "function") window.vs.ajusterTextes(el) } catch (e) {} }
  // Relecture 7 : une vue cachée qui reçoit du contenu est mise en page hors de l'écran, invisible, le temps d'ajuster ses
  // textes : la poussée qui suit n'a plus rien à mesurer (aucun à-coup au début de la glissée).
  function preajuster(v, racine) {
    if (!v || visible(v)) return
    if (v.getAttribute("data-retour")) { if (!enCoulisse(v)) versCoulisse(v); ajusterTextes(racine || v); return }
    Object.assign(v.style, { position: "fixed", left: "0", right: "0", top: "0", visibility: "hidden", transform: "translateX(200%)" })
    v.hidden = false
    ajusterTextes(racine || v)
    v.hidden = true
    for (const k of ["position", "left", "right", "top", "visibility", "transform"]) v.style[k] = ""
  }
  // VoiceOver mené sur un élément, sans anneau de focus dessiné.
  function focusSansAnneau(f) {
    f.setAttribute("data-focus-vue", "")
    f.addEventListener("blur", () => f.removeAttribute("data-focus-vue"), { once: true })
    try { f.focus({ preventScroll: true }) } catch (e) {}
  }
  // Relecture 6 : à la poussée, VoiceOver sur l'élément nommé par la vue (data-focus : le Lien retour), sinon son titre,
  // jamais sur l'En-tête qui défile avec elle.
  function focusPousse(v) {
    const nom = v.getAttribute("data-focus")
    const f = (nom && Array.from(v.querySelectorAll("[aria-label]")).find((x) => x.getAttribute("aria-label") === nom)) || v.querySelector('[role="heading"]')
    if (f) { if (!f.hasAttribute("tabindex") && !/^(BUTTON|A|INPUT)$/.test(f.tagName)) f.setAttribute("tabindex", "-1"); focusSansAnneau(f) }
  }
  // Dépiler commence : la vue du dessus figée telle qu'à l'écran, celle d'en dessous montrée à son défilement gardé, reculée.
  // Relecture 2, point 3 : au doigt (« auDoigt »), celle d'en dessous est figée elle aussi, à son défilement gardé, et le
  // document n'a plus rien à faire défiler : l'inertie d'un glissé en diagonale ne la déplace pas ; son défilement n'est
  // rendu qu'à la fin (finRetour). Rend [défilement de la vue du dessus, défilement gardé de celle d'en dessous].
  function preparerRetour(haut, bas, auDoigt) {
    const y = scrollY
    const yb = defilements.get(bas.getAttribute("data-vue")) || 0
    figer(haut, y)
    cacher(bas, false)
    ajusterTextes(bas)
    if (auDoigt) Object.assign(bas.style, { position: "fixed", left: "0", right: "0", top: (-yb) + "px", zIndex: "10" })
    poser(haut, bas, 1)
    if (!auDoigt) scrollTo(0, yb)
    haut.getBoundingClientRect()
    return [y, yb]
  }
  function finRetour(haut, bas, yb) {
    cacher(haut, true); liberer(haut); liberer(bas)
    if (yb !== undefined) scrollTo(0, yb)
    const a = pousseePar.get(haut.getAttribute("data-vue"))
    const f = a ? Array.from(bas.querySelectorAll("[data-action]")).find((x) => x.getAttribute("data-action") === a) : null
    if (f) focusSansAnneau(f)
    majBord()
  }
  // Relecture 2 et 5 : un geste au doigt arrêté net, sans animation : la vue du dessus remise en place, comme avant le geste.
  function arreterGeste() {
    const g = geste
    geste = null
    if (!g) return
    if (g.appuye) g.appuye.removeAttribute("data-appuye")
    if (!g.parti) return
    voiler(false)
    cacher(g.bas, true)
    liberer(g.bas); liberer(g.haut)
    cacher(g.haut, false)
    scrollTo(0, g.y)
  }
  // Relecture 3 : un geste au doigt annulé en glissant (second doigt, toucher interrompu) : la vue du dessus revient.
  function annulerGeste(g, p) {
    const { haut, bas } = g
    anim = animer(haut, bas, 1, Math.max(120, Math.round(DUREE * p)), () => { cacher(bas, true); liberer(bas); liberer(haut); scrollTo(0, g.y); majBord() })
    anim.cible = haut
  }
  // Relecture 2 : garde-fou après toute opération, hors animation et geste : exactement une vue visible, sans transformation ;
  // aucune ou deux : celle que l'app croit montrée.
  function garantirVue() {
    if (anim || (geste && geste.parti)) return
    voiler(false)
    const vs = vues()
    if (vs.length === 0) return
    const visibles = vs.filter(visible)
    if (visibles.length === 1 && !visibles[0].style.transform) return
    const c = (voulue && parCle(voulue)) || visibles[0] || vs[0]
    for (const v of vs) { if (v === c || !enCoulisse(v)) { cacher(v, v !== c); liberer(v) } }
    majBord()
  }
  function montrerVue(cle) {
    const vise = parCle(cle)
    if (!vise) return false
    voulue = cle
    if (appui) appui.vue = cle
    if (anim && anim.cible === vise) { apresChangement(vise); return true }
    // Relecture 2 : un geste au doigt en cours est arrêté net avant d'obéir à l'app.
    if (geste) arreterGeste()
    finirVue()
    const avant = montree()
    if (avant === vise || avant === null) {
      for (const v of vues()) { cacher(v, v !== vise); liberer(v) }
      ajusterTextes(vise)
      majBord(); apresChangement(vise); return true
    }
    if (cle !== "stats") {
      // Pousser : la vue entre par la droite, par-dessus ; celle d'avant recule ; à la fin, la vue poussée à son début.
      defilements.set(avant.getAttribute("data-vue"), scrollY)
      if (dernierAppui) pousseePar.set(cle, dernierAppui)
      cacher(vise, false)
      figer(vise, 0)
      ajusterTextes(vise)
      poser(vise, avant, 0)
      vise.getBoundingClientRect()
      anim = animer(vise, avant, 1, DUREE, () => { cacher(avant, true); liberer(avant); liberer(vise); scrollTo(0, 0); focusPousse(vise); majBord() })
    } else {
      preparerRetour(avant, vise)
      anim = animer(avant, vise, 0, DUREE, () => finRetour(avant, vise))
    }
    anim.cible = vise
    apresChangement(vise)
    return true
  }
  // La bande du bord gauche, présente quand la vue montrée se dépile (data-retour) : elle prend le geste ; un appui bref est
  // rendu à ce qu'elle couvre (le Lien retour y commence). Relecture 8 : « touch-action: pan-y » : un mouvement d'abord vertical
  // fait défiler la page ; seul un mouvement d'abord horizontal devient le geste (écouteur non passif sur la bande seule).
  let bord = null, geste = null
  function majBord() {
    const v = montree()
    const retour = v && v.getAttribute("data-retour")
    if (!retour) { if (bord) bord.hidden = true; return }
    if (!bord || !bord.isConnected) {
      bord = document.createElement("div")
      bord.className = "vs-bord"
      bord.setAttribute("aria-hidden", "true")
      bord.addEventListener("touchstart", debutGeste, { passive: true })
      bord.addEventListener("touchmove", suiteGeste, { passive: false })
      // Non passif : un appui bref rendu à ce qu'elle couvre ne doit pas être suivi du clic que le système en tirerait.
      bord.addEventListener("touchend", finGeste, { passive: false })
      bord.addEventListener("touchcancel", finGeste, { passive: true })
      document.body.appendChild(bord)
    }
    bord.hidden = false
  }
  const sous = (x, y) => { bord.style.pointerEvents = "none"; const e = document.elementFromPoint(x, y); bord.style.pointerEvents = ""; return e }
  function debutGeste(e) {
    // Relecture 3 : un second doigt termine proprement le geste en cours.
    if (e.touches.length !== 1) { secondDoigt(); return }
    if (anim) { geste = null; return }
    const t = e.touches[0]
    geste = { x0: t.clientX, y0: t.clientY, dx: 0, parti: false, abandon: false, haut: montree(), bas: null, y: 0, suivis: [[performance.now(), 0]] }
    const b = cible({ target: sous(t.clientX, t.clientY) })
    if (b && !inactif(b)) { b.setAttribute("data-appuye", ""); geste.appuye = b }
  }
  function secondDoigt() {
    const g = geste
    if (!g) return
    geste = null
    if (g.appuye) g.appuye.removeAttribute("data-appuye")
    if (g.parti) annulerGeste(g, Math.min(1, g.dx / innerWidth))
  }
  function suiteGeste(e) {
    const g = geste
    if (!g || g.abandon) return
    if (e.touches.length !== 1) { secondDoigt(); return }
    const t = e.touches[0]
    const dx = t.clientX - g.x0, dy = t.clientY - g.y0
    if (!g.parti) {
      // D'abord vertical : la page défile (pan-y), plus de geste.
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { g.abandon = true; if (g.appuye) g.appuye.removeAttribute("data-appuye"); return }
      if (dx < 8 || dx < Math.abs(dy)) return
      const bas = parCle("stats")
      if (!bas || bas === g.haut) { g.abandon = true; return }
      if (g.appuye) g.appuye.removeAttribute("data-appuye")
      g.parti = true; g.bas = bas
      const [y, yb] = preparerRetour(g.haut, bas, true)
      g.y = y; g.ybas = yb
    }
    if (e.cancelable) e.preventDefault()
    g.dx = Math.max(0, dx)
    g.suivis.push([performance.now(), g.dx])
    if (g.suivis.length > 6) g.suivis.shift()
    poser(g.haut, g.bas, 1 - Math.min(1, g.dx / innerWidth))
  }
  function finGeste(e) {
    const g = geste
    geste = null
    if (!g) return
    if (g.appuye) setTimeout(() => g.appuye.removeAttribute("data-appuye"), VISIBLE)
    if (!g.parti) {
      // Un appui bref sur la bande : rendu à ce qu'elle couvre (délégation des appuis, comme un toucher direct).
      if (!g.abandon && e.type === "touchend" && e.changedTouches.length === 1) {
        const t = e.changedTouches[0]
        const b = cible({ target: sous(t.clientX, t.clientY) })
        if (b) { if (e.cancelable) e.preventDefault(); b.click() }
      }
      return
    }
    const w = innerWidth, p = Math.min(1, g.dx / w)
    const [ta, xa] = g.suivis[0], [tb, xb] = g.suivis[g.suivis.length - 1]
    const vitesse = tb > ta ? (xb - xa) / (tb - ta) : 0
    const { haut, bas } = g
    // Relecture 9 : comme iOS, le sens de la vitesse compte : un geste vif vers la droite dépile ; au-delà de la moitié, il
    // dépile sauf s'il repart vers la gauche.
    if (e.type === "touchend" && (vitesse > 0.4 || (p > 0.5 && vitesse > -0.05))) {
      const t0 = performance.now()
      voulue = bas.getAttribute("data-vue")
      anim = animer(haut, bas, 0, Math.max(120, Math.round(DUREE * (1 - p))), () => finRetour(haut, bas, g.ybas))
      anim.cible = bas
      peinte(() => poster(PAGE, { genre: "mesure", type: "geste retour → " + bas.getAttribute("data-vue"), ms: Math.round(performance.now() - t0) }))
      poster(ACTION, { action: haut.getAttribute("data-retour"), valeur: null })
    } else annulerGeste(g, p)
  }
  window.pageWeb = {
    // « html » : l'élément entier (un seul élément de même id : il prend sa place) ou son contenu.
    remplacer(id, html, css) {
      const el = document.getElementById(id)
      if (!el) return false
      ajouterCss(css)
      const t = document.createElement("template")
      t.innerHTML = html
      const seul = t.content.childElementCount === 1 && t.content.firstElementChild
      let racine = el
      if (seul && seul.id === id && !Array.from(t.content.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim() !== "")) {
        racine = seul
        // Ticket 4.51 : une vue remplacée garde sa visibilité (l'opération « vue » la change) ; relecture 5 : le geste au doigt et
        // l'animation en cours terminés d'abord.
        if (el.hasAttribute("data-vue")) { arreterGeste(); finirVue(); seul.hidden = !visible(el) }
        el.replaceWith(t.content)
      } else el.innerHTML = html
      activer(racine)
      // Relecture 7 : posé dans une vue cachée, ajusté tout de suite, hors de l'écran.
      const v = racine.closest ? racine.closest("[data-vue]") : null
      if (v && !visible(v)) preajuster(v, racine)
      apresChangement(racine)
      garantirVue()
      return true
    },
    // Une section de sous-onglet ajoutée (ou mise à la place de celle de même clé, qui garde sa visibilité), sans toucher
    // aux autres ; « html » est la section entière (data-sous-onglet) ou son contenu, alors mis dans une section cachée.
    ajouterSection(cle, html, css) {
      ajouterCss(css)
      const t = document.createElement("template")
      t.innerHTML = html
      let s = t.content.firstElementChild
      if (!s || t.content.childElementCount !== 1 || s.getAttribute("data-sous-onglet") !== cle) {
        s = document.createElement("section")
        s.setAttribute("data-sous-onglet", cle)
        s.hidden = true
        s.append(t.content)
      }
      const ss = Array.from(document.querySelectorAll("[data-sous-onglet]"))
      const avant = ss.find((x) => x.getAttribute("data-sous-onglet") === cle)
      if (avant) { s.hidden = avant.hidden; avant.replaceWith(s) }
      else (document.getElementById("sous-onglets") || (ss.length ? ss[ss.length - 1].parentElement : null) || document.body).appendChild(s)
      activer(s)
      apresChangement(s)
      garantirVue()
      return true
    },
    // Ticket 4.50, phase C : « html » (un ou plusieurs éléments) inséré juste après #apres (lignes neuves d'une liste, « Voir
    // plus »), ou au début de #dans si « apres » est vide ; classes neuves ajoutées ; chaque élément inséré dessiné.
    inserer(dans, apres, html, css) {
      const parent = document.getElementById(dans)
      const ref = apres ? document.getElementById(apres) : null
      if (!parent || (apres && (!ref || !parent.contains(ref)))) return false
      ajouterCss(css)
      const t = document.createElement("template")
      t.innerHTML = html
      const neufs = Array.from(t.content.children)
      if (ref) ref.after(t.content)
      else parent.prepend(t.content)
      for (const n of neufs) activer(n)
      if (neufs.length) apresChangement(neufs[0])
      garantirVue()
      return true
    },
    // Défilement jusqu'à [data-cle=cle] (ScrollViewReader natif) : ancre top (défaut), center ou bottom, sur les deux axes.
    defiler(cle, ancre) {
      const el = Array.from(document.querySelectorAll("[data-cle]")).find((x) => x.getAttribute("data-cle") === cle)
      if (!el) return false
      const b = BLOC[ancre] || "start"
      el.scrollIntoView({ block: b, inline: b })
      apresChangement(el)
      return true
    },
    basculer(cle) {
      const ss = Array.from(document.querySelectorAll("[data-sous-onglet]"))
      const c = ss.find((s) => s.getAttribute("data-sous-onglet") === cle)
      if (!c) return false
      const change = c.hidden
      for (const s of ss) s.hidden = s !== c
      // Ticket 4.51 : ses textes ajustés à sa taille réelle (ajoutée cachée, ils n'avaient pas de mesure).
      if (change) ajusterTextes(c)
      // Comme le natif (app.tsx) : chaque ouverture d'un sous-onglet ramène le contenu à son début.
      if (change) window.scrollTo(0, 0)
      apresChangement(c)
      garantirVue()
      return true
    },
    // Ticket 4.51 : la vue « cle » montrée, en poussant ou en dépilant (voir montrerVue) ; vrai si elle existe.
    montrer(cle) { return montrerVue(cle) },
    corps(styles, html) {
      arreterGeste()
      finirVue()
      for (const s of Array.from(document.head.querySelectorAll("style:not([data-hote])"))) s.remove()
      for (const t of styles) { const s = document.createElement("style"); s.textContent = t; document.head.appendChild(s) }
      document.body.innerHTML = html
      activer(document.body)
      // La vue montrée par le document neuf est celle que l'app veut.
      const m = montree()
      voulue = m ? m.getAttribute("data-vue") : null
      majBord()
      apresChangement(document.body)
      garantirVue()
      return true
    },
    taille(nom, echelle) {
      R.setAttribute("data-taille-texte", nom)
      R.style.setProperty("--echelle-texte", String(echelle))
      return true
    },
  }
  addEventListener("error", (e) => poster(PAGE, { genre: "erreur", message: String(e.message || e).slice(0, 300) }))
  // Prête : après la première image qui suit le DOM lu, ou au plus tard 150 ms après (image retenue tant que la vue est
  // invisible : jamais d'attente sans fin).
  let dite = false
  const dire = () => { if (!dite) { dite = true; poster(PAGE, { genre: "prete", jeton: O.jeton }) } }
  const pret = () => { const m = montree(); voulue = m ? m.getAttribute("data-vue") : null; majBord(); image(dire); setTimeout(dire, 150) }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pret, { once: true })
  else pret()
})();`

/** Ce que l'hôte ajoute à une page : options, puis son style et son script, en tête de <head>. */
function blocHote(jeton: number, taille: DynamicTypeSize | undefined, fond: string): string {
  const options = JSON.stringify({
    jeton, taille: taille ?? "large", echelle: echelleTexte(taille), pontAction: PONT_ACTION, pontPage: PONT_PAGE,
    appuiVisible: APPUI_VISIBLE_MS, appuiPerime: APPUI_PERIME_MS, dureeVue: DUREE_VUE_MS,
  }).replace(/</g, "\\u003c")
  // Ticket 7.8 (M2) : la politique de contenu de Stats (securite.ts, CSP_STATS) en tête, avant tout script ou style de la page.
  return `<meta charset="utf-8">${metaCsp(CSP_STATS)}<meta name="color-scheme" content="dark">` +
    `<style data-hote>html{background-color:${fond}}\n${STYLE_HOTE}</style>` +
    `<script data-hote>window.__pageWebOptions=${options};\n${SCRIPT_HOTE}</script>`
}

const VIEWPORT = `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`

/**
 * Le document chargé : une page complète reçoit le bloc de l'hôte au début de <head> (et la méta viewport si elle manque :
 * sans elle, WebKit garde le délai de 300 ms) ; un morceau est mis dans une page de l'hôte (fond, viewport, français).
 * `jeton` : le numéro de ce chargement, que la page renvoie en se disant prête (un signal d'une page remplacée est ignoré).
 */
export function documentHote(html: string, jeton: number, taille: DynamicTypeSize | undefined, fond: string): string {
  const bloc = blocHote(jeton, taille, fond)
  const { tete, document } = decouper(html)
  if (!document) {
    return `<!doctype html><html lang="${langue()}"><head>${bloc}${VIEWPORT}</head><body style="background-color:${fond}">${html}</body></html>`
  }
  const viewport = /<meta\b[^>]*name=["']?viewport/i.test(tete) ? "" : VIEWPORT
  const head = /<head\b[^>]*>/i.exec(tete)
  if (head !== null) {
    const i = head.index + head[0].length
    return html.slice(0, i) + bloc + viewport + html.slice(i)
  }
  // Sans <head> : une tête neuve, juste avant <body>.
  return html.slice(0, tete.length) + `<head>${bloc}${viewport}</head>` + html.slice(tete.length)
}

/** Code `evaluateJavaScript` : `#id` remplacé (élément entier ou contenu), ses classes neuves ajoutées ; vrai s'il existe. */
export function codeRemplacer(id: string, html: string, css?: string): string {
  return `return window.pageWeb ? window.pageWeb.remplacer(${litteral(id)}, ${litteral(html)}, ${litteral(css ?? "")}) : false`
}
/** Code `evaluateJavaScript` (ticket 4.50, phase C) : `html` inséré après `#apres` dans `#dans` (au début si `apres` est vide). */
export function codeInserer(dans: string, apres: string, html: string, css?: string): string {
  return `return window.pageWeb ? window.pageWeb.inserer(${litteral(dans)}, ${litteral(apres)}, ${litteral(html)}, ${litteral(css ?? "")}) : false`
}
/** Code `evaluateJavaScript` : une section de sous-onglet ajoutée ou remise, ses classes neuves ajoutées. */
export function codeAjouterSection(cle: string, html: string, css?: string): string {
  return `return window.pageWeb ? window.pageWeb.ajouterSection(${litteral(cle)}, ${litteral(html)}, ${litteral(css ?? "")}) : false`
}
/**
 * Code `evaluateJavaScript` : la page défile jusqu'à `[data-cle=cle]`, ancre de `scrollTo(id, ancre)` du ScrollViewReader
 * natif (`top`, `center`, `bottom` ; une autre vaut `top`) ; vrai s'il existe.
 */
export function codeDefiler(cle: string, ancre?: string): string {
  return `return window.pageWeb ? window.pageWeb.defiler(${litteral(cle)}, ${litteral(ancre ?? "top")}) : false`
}
/** Code `evaluateJavaScript` : la section du sous-onglet montrée, les autres cachées ; vrai si elle existe. */
export function codeBasculer(sousOnglet: string): string {
  return `return window.pageWeb ? window.pageWeb.basculer(${litteral(sousOnglet)}) : false`
}
/** Code `evaluateJavaScript` (ticket 4.51) : la vue `cle` de la page montrée, en poussant ou en dépilant ; vrai si elle existe. */
export function codeMontrer(cle: string): string {
  return `return window.pageWeb ? window.pageWeb.montrer(${litteral(cle)}) : false`
}
/** Code `evaluateJavaScript` : styles de tête et corps d'une nouvelle page mis en place, sans chargement. */
export function codeCorps(styles: string[], corps: string): string {
  return `return window.pageWeb ? window.pageWeb.corps([${styles.map(litteral).join(",")}], ${litteral(corps)}) : false`
}
/** Code `evaluateJavaScript` : la taille du texte d'iOS donnée à la page. */
export function codeTaille(taille: DynamicTypeSize | undefined): string {
  return `return window.pageWeb ? window.pageWeb.taille(${litteral(taille ?? "large")}, ${echelleTexte(taille)}) : false`
}

// ───────── État de la session : un contrôleur, une page ─────────

type Statut = "aucune" | "chargement" | "prete" | "echec"
type Rappels = { onAction: (action: string, valeur?: string) => void; onEchec: () => void; onRecharge?: () => string }

/** Ce que l'hôte sait de la page, pour toute la session (un seul contrôleur). */
const etat = {
  controleur: null as WebViewController | null,
  /** Messages, réglages et écoute du processus posés une fois : la promesse de cette pose. */
  pont: null as Promise<boolean> | null,
  statut: "aucune" as Statut,
  /** La dernière demande d'affichage (chaque `html` reçu), et la dernière réglée (page prête ou mise en place). */
  demande: 0,
  reglee: 0,
  /** La demande dont l'échec a été dit (une seule fois chacune). */
  echecDit: 0,
  /** Le chargement en cours ou fait (jeton de la page attendue) et son heure de départ. */
  jeton: 0,
  depuis: 0,
  /** La tête de la page chargée, styles ôtés : une nouvelle page de même clé se met en place par le DOM. */
  cle: null as string | null,
  /** La page s'est montrée au moins une fois (le WebView reste visible pendant un rechargement, jusqu'à un échec). */
  vue: false,
  taille: undefined as DynamicTypeSize | undefined,
  tailleAppliquee: undefined as DynamicTypeSize | undefined,
  fond: couleurs(undefined).fond as string,
  /** Les `remplacer`/`basculer` en attente d'une page prête. */
  attentes: [] as Array<(ok: boolean) => void>,
  /** Les hôtes montés, prévenus quand la page se montre ou échoue. */
  abonnes: new Set<(vue: boolean) => void>(),
  /** Relecture 2 : ce qui attend la page montrée une première fois (quandPagePrete). */
  pretes: new Set<() => void>(),
  rappels: null as Rappels | null,
  /** Relecture C3 : arrêts du processus WebContent dans la session ; le dernier document affiché (repli d'un rechargement). */
  arrets: 0,
  html: "",
  /** Relecture C9 : la page cachée (Détail poussé, autre onglet) : pas de garde de DELAI_PAGE_PRETE_MS tant qu'elle l'est. */
  cachee: false,
  /** Ticket 4.55b : rechargements pour une page pas prête (CHIEN_MS) dans la session ; numéro du dernier demandé. */
  remontages: 0,
  cleVue: 0,
  /** Ticket 4.55b : les hôtes montés, prévenus d'un rechargement demandé par le chien de garde. */
  remonteurs: new Set<(cle: number) => void>(),
}
/** Relecture C3 : au-delà de ces arrêts du processus WebContent dans une session, retour au natif. */
export const ARRETS_MAX = 3

/** Lignes de mesure de la page web déjà données au journal dans cette exécution (la borne de design.tsx, compteur à part). */
let lignesAuJournal = 0

/**
 * Une ligne de mesure de la page, d'une durée de `duree` ms : au journal si elle se voit (SEUIL_JOURNAL_MS) et tant que la
 * borne le permet, la dernière disant la suite tue ; sinon à la console. Même règle que `direMesure` de design.tsx, non
 * exportée. Jamais d'erreur.
 */
function direMesureWeb(ligne: string, duree: number) {
  if (duree >= SEUIL_JOURNAL_MS && lignesAuJournal < LIGNES_DE_MESURE_AU_JOURNAL) {
    lignesAuJournal++
    const texte = lignesAuJournal < LIGNES_DE_MESURE_AU_JOURNAL ? ligne
      : `[mesure] ${LIGNES_DE_MESURE_AU_JOURNAL - 1} lignes de mesure web au journal : la suite à la console seulement`
    try {
      note(texte).catch(() => {})
      if (texte === ligne) return
    } catch { /* journal indisponible : la console */ }
  }
  try {
    console.log(ligne)
  } catch { /* console indisponible : rien */ }
}

/** Ticket 7.8 (E1-a) : le contrôleur de Stats créé éphémère (reglerPageWeb, depuis INTERRUPTEURS.statsEphemere d'app.tsx). */
let controleurEphemere: () => boolean = () => false
/** Ticket 7.8 (M2) : la garde de navigation des vues web posée (reglerPageWeb, depuis INTERRUPTEURS.navigationGardee d'app.tsx). */
let gardeActive: () => boolean = () => true
/** Ticket 7.8 : une navigation refusée déjà dite au journal dans cette exécution (une ligne, jamais l'adresse). */
let navigationRefuseeDite = false

/**
 * Ticket 7.8 (E1-a) : règle la création du contrôleur de Stats (app.tsx, au chargement ; lu à chaque création) : `ephemere`
 * vrai, un magasin de données éphémère, sans cookie ni donnée de site gardés sur l'appareil ni partagés avec les autres vues web.
 * La vue, ses modificateurs et son cache ne changent pas.
 */
export function reglerPageWeb(o: { ephemere: () => boolean; garde?: () => boolean }): void {
  controleurEphemere = o.ephemere
  if (o.garde) gardeActive = o.garde
}

/**
 * Ticket 7.8 (M2) : la garde de navigation d'un contrôleur : seuls les chargements de l'hôte (`loadHTML`, `about:blank`) et les
 * ancres de la page passent (securite.ts, navigationAdmise) ; toute autre navigation est refusée, une ligne au journal, une fois,
 * sans l'adresse. Partagée avec le Catalogue (catalogue-web.tsx).
 */
export function garderNavigation(c: WebViewController, nom: string): void {
  let active = true
  try { active = gardeActive() !== false } catch { /* réglage illisible : garde posée */ }
  if (!active) return
  try {
    c.shouldAllowRequest = async (req: any) => {
      const ok = navigationAdmise(req?.url)
      if (!ok && !navigationRefuseeDite) {
        navigationRefuseeDite = true
        try { note(`[${nom}] navigation refusée : la page ne mène nulle part ailleurs`).catch(() => {}) } catch { /* rien */ }
      }
      return ok
    }
  } catch { /* propriété refusée par l'hôte : la CSP reste */ }
}

/** Ticket 7.8 : pour le harnais seulement : la ligne « navigation refusée » de nouveau à dire (une par exécution sinon). */
export function oublierNavigationRefusee(): void {
  navigationRefuseeDite = false
}

/** Le contrôleur de la session, créé au premier appel, jamais recréé tant que `fermerPageWeb` ne l'a pas libéré. */
function controleur(): WebViewController {
  if (etat.controleur === null) {
    let c: WebViewController | null = null
    let ephemere = false
    try { ephemere = controleurEphemere() === true } catch { /* réglage illisible : contrôleur ordinaire */ }
    if (ephemere) {
      try {
        c = new WebViewController({ ephemeral: true })
      } catch (e) {
        try { note(`[page web] contrôleur éphémère refusé (${messageHote(String(e), [])}) : contrôleur ordinaire`).catch(() => {}) } catch { /* rien */ }
      }
    }
    if (c === null) c = new WebViewController()
    garderNavigation(c, "page web")
    etat.controleur = c
  }
  return etat.controleur
}

/**
 * Relecture 2 (ticket 4.51) : `f` appelée une fois, dès que la page s'est montrée (tout de suite si c'est déjà fait) ; rend de
 * quoi s'en désabonner. L'app y monte la Boutique en arrière-plan, après coup.
 */
export function quandPagePrete(f: () => void): () => void {
  if (etat.vue) { f(); return () => {} }
  etat.pretes.add(f)
  return () => { etat.pretes.delete(f) }
}

function prevenir(vue: boolean) {
  if (vue) { const fs = [...etat.pretes]; etat.pretes.clear(); for (const f of fs) { try { f() } catch { /* rien */ } } }
  etat.vue = vue
  for (const f of [...etat.abonnes]) {
    try { f(vue) } catch { /* hôte démonté entre-temps : rien */ }
  }
}

function regler(ok: boolean) {
  const attentes = etat.attentes
  etat.attentes = []
  for (const f of attentes) f(ok)
}

/** La demande `n` a échoué : retour au natif, une fois, et la raison au journal. */
function echouer(n: number, raison: string) {
  if (n !== etat.demande || etat.echecDit >= n) return
  etat.echecDit = n
  etat.statut = "echec"
  etat.cle = null
  regler(false)
  prevenir(false)
  // Ticket 7.8 (F1) : la raison masquée (une erreur de l'hôte peut porter un chemin) avant le journal.
  note(`[page web] retour à l'affichage natif : ${messageHote(raison, [])}`).catch(() => {})
  try {
    if (etat.rappels !== null) etat.rappels.onEchec()
  } catch (e) {
    try { console.log("[page web] onEchec a levé : " + String(e)) } catch { /* rien */ }
  }
}

/** La demande `n` est réglée : la page est prête (chargée ou mise en place). */
function marquerPrete(n: number) {
  if (n !== etat.demande || etat.reglee >= n) return
  etat.reglee = n
  etat.statut = "prete"
  regler(true)
  if (!etat.vue) prevenir(true)
}

/**
 * Relecture 1 (ticket 4.51) : les genres d'appui qu'une ligne de mesure peut dire. Rien d'autre ne va au journal, et jamais un
 * identifiant d'action (il peut porter la clé d'une partie) : un genre inconnu s'écrit « action ».
 */
export const GENRES_MESURE: readonly string[] = ["sous-onglet", "menu", "detail", "action", "→ detail", "→ stats", "geste retour → stats"]

/**
 * La ligne de mesure d'un signal de la page (`{ genre: "mesure", type, ms }`), ou null s'il est mal formé : « [mesure] web
 * <genre> : de l'appui à l'image peinte N ms », le genre pris dans GENRES_MESURE, « action » sinon. Pure : le harnais la
 * balaie sur chaque action de la page.
 */
export function ligneDeMesure(corps: any): string | null {
  if (corps === null || typeof corps !== "object") return null
  const ms = corps.ms
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null
  const genre = typeof corps.type === "string" && GENRES_MESURE.includes(corps.type) ? corps.type : "action"
  return `[mesure] web ${genre} : de l'appui à l'image peinte ${Math.round(ms)} ms`
}

/** Message d'un appui (`{ action, valeur }`) : à l'app. Un message mal formé est ignoré. */
function recevoirAction(corps?: any) {
  if (corps === null || typeof corps !== "object" || typeof corps.action !== "string" || corps.action === "") return
  const valeur = typeof corps.valeur === "string" ? corps.valeur : undefined
  try {
    if (etat.rappels !== null) etat.rappels.onAction(corps.action, valeur)
  } catch (e) {
    try { console.log("[page web] onAction a levé : " + String(e)) } catch { /* rien */ }
  }
}

/** Signaux de la page : prête (jeton du chargement), mesure d'un appui, erreur de script (console). */
function recevoirPage(corps?: any) {
  if (corps === null || typeof corps !== "object") return
  if (corps.genre === "prete") {
    if (corps.jeton !== etat.jeton || etat.statut !== "chargement") return
    const n = etat.jeton
    marquerPrete(n)
    if (etat.reglee === n) direMesureWeb(`[mesure] web chargement : du loadHTML à la page prête ${Date.now() - etat.depuis} ms`, Date.now() - etat.depuis)
    // Ticket 4.55b : la première page prête de l'exécution, toujours au journal (même sous SEUIL_JOURNAL_MS), et après combien de rechargements.
    if (etat.reglee === n && !premierePreteDite) {
      premierePreteDite = true
      const apres = etat.remontages > 0 ? ` après ${etat.remontages} rechargement${etat.remontages > 1 ? "s" : ""}` : ""
      try { note(`[page web] première page prête en ${Date.now() - etat.depuis} ms${apres}`).catch(() => {}) } catch { /* rien */ }
    }
  } else if (corps.genre === "mesure") {
    const ligne = ligneDeMesure(corps)
    if (ligne !== null) direMesureWeb(ligne, Math.round(corps.ms))
  } else if (corps.genre === "erreur") {
    try { console.log("[page web] erreur dans la page : " + String(corps.message).slice(0, 300)) } catch { /* rien */ }
  }
}

/**
 * Messages, réglages et écoute du processus, posés une fois sur le contrôleur, avant le premier chargement. Rend faux si
 * les messages n'ont pu être posés (la page ne pourrait rien dire : retour au natif). Réglages et écoute sont de la doc
 * de Scripting, pas du dts : cherchés, et leur absence ou leur refus n'empêchent rien (le WebView reste caché jusqu'à la
 * page prête).
 */
function installerPont(c: WebViewController): Promise<boolean> {
  if (etat.pont !== null) return etat.pont
  etat.pont = (async () => {
    try {
      await c.addScriptMessageHandler(PONT_ACTION, recevoirAction)
      await c.addScriptMessageHandler(PONT_PAGE, recevoirPage)
    } catch (e) {
      try { console.log("[page web] messages non posés : " + String(e)) } catch { /* rien */ }
      return false
    }
    const x: any = c
    if (typeof x.setSettings === "function") {
      try {
        await x.setSettings({ isOpaque: false, backgroundColor: etat.fond, underPageBackgroundColor: etat.fond, allowsLinkPreview: false })
      } catch (e) {
        try { console.log("[page web] réglages du WebView refusés : " + String(e)) } catch { /* rien */ }
      }
    }
    if (typeof x.addEventListener === "function") {
      try {
        await x.addEventListener("webContentProcessTerminated", () => surArret())
      } catch { /* écoute impossible : le délai reste */ }
    }
    return true
  })()
  return etat.pont
}

/**
 * Relecture C3 : le processus WebContent s'est arrêté (iOS le tue sous la pression mémoire, page en arrière-plan…) : la page
 * rechargée (`loadHTML`) avec le document courant de l'app (`onRecharge`, sinon le dernier reçu), une ligne au journal à
 * chaque fois ; au ARRETS_MAX-ième arrêt de la session, ou si le rechargement échoue, retour au natif.
 */
function surArret() {
  etat.arrets++
  if (etat.arrets >= ARRETS_MAX) {
    echouer(etat.demande, `le processus de WebKit s'est arrêté ${etat.arrets} fois dans la session`)
    return
  }
  try { note(`[page web] le processus de WebKit s'est arrêté (${etat.arrets} sur ${ARRETS_MAX}) : page rechargée`).catch(() => {}) } catch { /* rien */ }
  let html = etat.html
  try { if (etat.rappels !== null && etat.rappels.onRecharge) html = etat.rappels.onRecharge() } catch { /* le dernier reçu */ }
  etat.html = html
  const n = ++etat.demande
  etat.statut = "chargement"
  etat.cle = null
  armerGarde(n)
  charger(n, html, cleDeTete(decouper(html).tete))
}

/** Relecture C9 : la garde de la demande `n`, seulement page visible (sinon armée au retour, `montrer`). */
let garde: ReturnType<typeof setTimeout> | null = null
function armerGarde(n: number) {
  if (garde !== null) { clearTimeout(garde); garde = null }
  armerChien(n)
  if (etat.cachee || etat.reglee >= n) return
  garde = setTimeout(() => { garde = null; surDelai(n) }, DELAI_PAGE_PRETE_MS)
}







export const CHIEN_MS = 400
export const REMONTAGES_MAX = 2
/** Ticket 4.55b : relances du chien tant que le `loadHTML` de la demande n'est pas parti (pont, attache), au plus. */
const RELANCES_CHIEN_MAX = 20
let chien: ReturnType<typeof setTimeout> | null = null
let relancesChien = 0
/** Ticket 4.55b : lignes de diagnostic dites une fois par exécution (jamais remises à zéro). */
let etatVueDit = false
let premierePreteDite = false
/** Ticket 4.55c : « cache retiré » déjà dit dans cette exécution. */
let cacheRetireDit = false

/** Ticket 4.55b : le chien de garde de la demande `n`, seulement page visible et pas encore réglée. */
function armerChien(n: number) {
  if (chien !== null) { clearTimeout(chien); chien = null }
  relancesChien = 0
  if (etat.cachee || etat.reglee >= n) return
  chien = setTimeout(() => surChien(n), CHIEN_MS)
}

/**
 * Ticket 4.55b : la demande `n` n'est pas prête CHIEN_MS après son `loadHTML` : une ligne au journal, la page rechargée par les
 * hôtes (`recharger`, ticket 4.55c : sans remonter la vue web) ; au-delà de REMONTAGES_MAX rechargements dans la session,
 * retour au natif.
 */
function surChien(n: number) {
  chien = null
  if (n !== etat.demande || etat.reglee >= n || etat.statut === "echec" || etat.cachee) return
  const ecoule = Date.now() - etat.depuis
  if (etat.statut !== "chargement" || etat.jeton !== n || ecoule < CHIEN_MS) {
    // Le chargement de `n` n'est pas encore parti (pont, attache), ou depuis moins de CHIEN_MS : attendre encore.
    if (relancesChien++ < RELANCES_CHIEN_MAX) chien = setTimeout(() => surChien(n), etat.jeton === n ? Math.max(1, CHIEN_MS - ecoule) : CHIEN_MS)
    return
  }
  if (!etatVueDit && etat.controleur !== null) {
    const c = etat.controleur
    lireEtatVue(c).then((apres) => direEtatVue(etatAvantChargement, `${apres} (page pas prête après ${CHIEN_MS} ms)`), () => {})
  }
  if (etat.remontages >= REMONTAGES_MAX) {
    echouer(n, `page pas prête après ${REMONTAGES_MAX} rechargements`)
    return
  }
  etat.remontages++
  try { note(`[page web] page pas prête après ${ecoule} ms : page rechargée (essai ${etat.remontages})`).catch(() => {}) } catch { /* rien */ }
  etat.cleVue++
  for (const f of [...etat.remonteurs]) {
    try { f(etat.cleVue) } catch { /* hôte démonté entre-temps : rien */ }
  }
}

/**
 * Ticket 4.55b : la page rechargée à la demande du chien de garde (l'effet de l'hôte) : le document courant de l'app
 * (`onRecharge`, sinon le dernier reçu), une nouvelle demande ; rend son numéro (pour la garde).
 */
function recharger(): number {
  let html = etat.html
  try { if (etat.rappels !== null && etat.rappels.onRecharge) html = etat.rappels.onRecharge() } catch { /* le dernier reçu */ }
  etat.html = html
  const n = ++etat.demande
  etat.statut = "chargement"
  etat.cle = null
  charger(n, html, cleDeTete(decouper(html).tete))
  return n
}





export async function lireEtatVue(c: WebViewController): Promise<string> {
  const x: any = c
  if (typeof x.getState !== "function") return "getState absent"
  try {
    const s = await x.getState()
    if (s === null || typeof s !== "object") return "illisible"
    const champs = Object.keys(s).sort().filter((k) => typeof s[k] === "boolean" || (typeof s[k] === "number" && Number.isFinite(s[k])))
      .map((k) => `${k} ${typeof s[k] === "boolean" ? (s[k] ? "oui" : "non") : Math.round(s[k] * 100) / 100}`)
    return champs.length === 0 ? "aucun champ" : champs.join(", ")
  } catch (e) {
    return "en erreur"
  }
}
/** Ticket 4.55b : l'état de la vue lu avant le premier `loadHTML` de l'exécution (null : pas encore lu). */
let etatAvantChargement: string | null = null
/** Ticket 4.55b : une ligne au journal par exécution : l'état de la vue web avant le `loadHTML`, puis après. */
function direEtatVue(avant: string | null, apres: string) {
  if (etatVueDit) return
  etatVueDit = true
  try { note(`[page web] état de la vue web : avant loadHTML ${avant ?? "non lu"} ; après ${apres}`).catch(() => {}) } catch { /* rien */ }
}

/** Ticket 4.55 : attente au plus de l'attache de la vue web à l'écran, en essais espacés de ATTACHE_PAS_MS, avant un chargement. */
export const ATTACHE_PAS_MS = 30
export const ATTACHE_ESSAIS = 10

/**
 * Ticket 4.55 : attend que la vue web du contrôleur soit attachée à l'écran (`getState().isAttached` de Scripting) avant de lui
 * charger une page : une page chargée avant l'attache, au premier montage de la vue (Stats ouvert à froid, Catalogue au premier
 * appui), restait blanche ; un remontage l'affichait. Rend vrai une fois attachée ; faux sans réponse lisible (getState absent,
 * en erreur, sans `isAttached`, contrôleur libéré) ou au bout de ATTACHE_ESSAIS essais (300 ms) : la page se charge alors comme
 * avant. Vue déjà attachée : une seule lecture de l'état, aucune attente. Partagée avec le Catalogue (catalogue-web.tsx). Jamais d'erreur.
 */
export async function attendreAttache(c: WebViewController): Promise<boolean> {
  const x: any = c
  if (typeof x.getState !== "function") return false
  for (let essai = 0; ; essai++) {
    let s: any
    try { s = await x.getState() } catch { return false }
    if (s === null || typeof s !== "object" || typeof s.isAttached !== "boolean" || s.isDisposed === true) return false
    if (s.isAttached) return true
    if (essai + 1 >= ATTACHE_ESSAIS) return false
    await new Promise<void>((fin) => setTimeout(() => fin(), ATTACHE_PAS_MS))
  }
}

/** Charge la page de la demande `n` (`loadHTML`), le pont posé d'abord, puis la vue web attachée à l'écran (ticket 4.55). */
async function charger(n: number, html: string, cle: string) {
  const c = controleur()
  const pont = await installerPont(c)
  if (n !== etat.demande) return
  if (!pont) return echouer(n, "les messages de la page n'ont pas pu être posés")
  await attendreAttache(c)
  if (n !== etat.demande || etat.controleur !== c) return
  // Ticket 4.55b : l'état de la vue web avant le premier loadHTML de l'exécution (diagnostic, une fois).
  if (!etatVueDit && etatAvantChargement === null) {
    etatAvantChargement = await lireEtatVue(c)
    if (n !== etat.demande || etat.controleur !== c) return
  }
  etat.statut = "chargement"
  etat.jeton = n
  etat.cle = cle
  etat.depuis = Date.now()
  etat.tailleAppliquee = etat.taille
  let ok = false
  let erreur = ""
  try {
    ok = await c.loadHTML(documentHote(html, n, etat.taille, etat.fond))
  } catch (e) {
    erreur = String(e)
  }
  if (!etatVueDit) direEtatVue(etatAvantChargement, `${await lireEtatVue(c)} (loadHTML a rendu ${ok ? "vrai" : erreur !== "" ? "une erreur" : "faux"})`)
  if (n !== etat.demande) return
  if (!ok) echouer(n, erreur !== "" ? `loadHTML a levé (${erreur.slice(0, 200)})` : "la page ne s'est pas chargée (loadHTML a rendu faux)")
}

/**
 * Affiche une page : par le DOM si la page chargée a la même tête (styles ôtés), sinon par `loadHTML`. Rend le numéro de
 * la demande, aussitôt ; la suite est asynchrone (marquerPrete, ou echouer).
 */
function afficher(html: string): number {
  const n = ++etat.demande
  etat.html = html
  const { tete, corps } = decouper(html)
  const cle = cleDeTete(tete)
  if (etat.statut === "prete" && etat.cle === cle) {
    const c = controleur()
    c.evaluateJavaScript(codeCorps(stylesDeTete(tete), corps)).then(
      (ok: any) => {
        if (n !== etat.demande) return
        if (ok === true) marquerPrete(n)
        else charger(n, html, cle)
      },
      () => { if (n === etat.demande) charger(n, html, cle) },
    )
  } else {
    charger(n, html, cle)
  }
  return n
}

/** Le délai de la demande `n` est passé : si elle n'est ni réglée ni remplacée, retour au natif. */
function surDelai(n: number) {
  if (n === etat.demande && etat.reglee < n) {
    echouer(n, etat.statut === "chargement"
      ? `la page ne s'est pas dite prête en ${DELAI_PAGE_PRETE_MS} ms`
      : `la page n'a pas été mise en place en ${DELAI_PAGE_PRETE_MS} ms`)
  }
}

/** Attend une page prête : vrai, ou faux si elle échoue, si l'hôte se démonte ou si la session se ferme. */
function pagePrete(): Promise<boolean> {
  if (etat.statut === "prete") return Promise.resolve(true)
  if (etat.statut === "echec" || etat.controleur === null) return Promise.resolve(false)
  return new Promise((resolve) => { etat.attentes.push(resolve) })
}

async function evaluer(code: string): Promise<boolean> {
  if (!(await pagePrete())) return false
  try {
    return (await controleur().evaluateJavaScript(code)) === true
  } catch {
    return false
  }
}

/**
 * L'élément `#id` de la page remplacé (un bloc après un choix interne, la barre…) : `html` est l'élément entier (un seul
 * élément de même `id`, qui prend sa place) ou son contenu ; `css`, ses classes neuves, ajoutées à la feuille de la page.
 * Attend la page prête. Rend vrai si c'est fait, faux sinon (élément absent, page en échec ou fermée). L'image qui suit clôt la mesure de
 * l'appui en cours.
 */
export function remplacer(id: string, html: string, css?: string): Promise<boolean> {
  return evaluer(codeRemplacer(id, html, css))
}

/**
 * Ticket 4.50, phase C : des éléments neufs insérés dans `#dans`, juste après `#apres` (au début si `apres` est vide) : les
 * lignes d'un lot de plus (« Voir plus »), sans renvoyer celles déjà montrées ; comme `remplacer`.
 */
export function inserer(dans: string, apres: string, html: string, css?: string): Promise<boolean> {
  return evaluer(codeInserer(dans, apres, html, css))
}

/** Relecture C2 : le menu ouvert dans la page fermé (l'onglet se cache) ; vrai une fois fait ; sans page prête, rien. */
export function fermerMenus(): Promise<boolean> {
  if (etat.statut !== "prete" || etat.controleur === null) return Promise.resolve(false)
  return controleur().evaluateJavaScript("if (window.vs && window.vs.fermerMenus) window.vs.fermerMenus(); return true").then((x: any) => x === true, () => false)
}

/** La `section[data-sous-onglet=sousOnglet]` montrée, les autres cachées, la page ramenée en haut ; comme `remplacer`. */
export function basculer(sousOnglet: string): Promise<boolean> {
  return evaluer(codeBasculer(sousOnglet))
}

/**
 * Ticket 4.51 : la vue `cle` de la page (`data-vue` : « stats », « detail ») montrée, poussée ou dépilée en glissant comme
 * la pile de navigation d'iOS ; comme `remplacer`.
 */
export function montrer(cle: string): Promise<boolean> {
  return evaluer(codeMontrer(cle))
}

/**
 * Une section de sous-onglet ajoutée à la page (dans `#sous-onglets`), ou mise à la place de celle de même clé (sa
 * visibilité gardée), sans remplacer les autres ; `html` : la `section data-sous-onglet` entière, ou son contenu (alors
 * mis dans une section cachée). Comme `remplacer`.
 */
export function ajouterSection(cle: string, html: string, css?: string): Promise<boolean> {
  return evaluer(codeAjouterSection(cle, html, css))
}

/**
 * La page défile jusqu'à `[data-cle=cle]`, ancre `top` par défaut (début du contenu, puce centrée…) ; comme `remplacer`.
 * `lecteur` : le chemin du ScrollViewReader qui le demande (ticket 4.50, phase C : diagnostic et harnais), sans effet ici.
 */
export function defiler(cle: string, ancre?: string, lecteur?: string): Promise<boolean> {
  return evaluer(codeDefiler(cle, ancre))
}

/**
 * Fin de la session (fermeture de l'app) : le contrôleur libéré (`dispose`, dts : à appeler soi-même), l'état remis à zéro ;
 * un `remplacer`/`basculer` en attente rend faux. Jamais d'erreur.
 */
export function fermerPageWeb() {
  const c = etat.controleur
  etat.controleur = null
  etat.pont = null
  etat.statut = "aucune"
  etat.demande = 0; etat.reglee = 0; etat.echecDit = 0; etat.jeton = 0; etat.cle = null
  etat.vue = false
  etat.taille = undefined; etat.tailleAppliquee = undefined
  etat.arrets = 0; etat.html = ""; etat.cachee = false
  etat.remontages = 0
  if (garde !== null) { clearTimeout(garde); garde = null }
  if (chien !== null) { clearTimeout(chien); chien = null }
  regler(false)
  lignesAuJournal = 0
  if (c !== null) {
    try { c.dispose() } catch { /* déjà libéré : rien */ }
  }
}

/** L'hôte, sous le lecteur d'environnement : la vue web, cachée sur le fond de l'app tant que la page ne s'est pas montrée. */
function HoteWeb({ html, onAction, onEchec, onRecharge, cachee, taille, contraste }: {
  html: string; onAction: (action: string, valeur?: string) => void; onEchec: () => void; onRecharge?: () => string; cachee: boolean
  taille: DynamicTypeSize | undefined; contraste: ColorSchemeContrast | undefined
}) {
  etat.rappels = { onAction, onEchec, onRecharge }
  etat.cachee = cachee
  etat.taille = taille
  const fond = couleurs(contraste).fond
  etat.fond = fond as string
  const c = controleur()
  const [vue, setVue] = useState(etat.vue)
  // Ticket 4.55b : le numéro de rechargement demandé par le chien de garde (surChien) ; à chaque changement, la page rechargée
  // (ticket 4.55c : un loadHTML seul, la vue web n'est plus remontée).
  const [cleVue, setCleVue] = useState(etat.cleVue)
  const cleChargee = useRef(etat.cleVue)

  // Montage : prévenu quand la page se montre ou échoue ; au démontage, les attentes rendent faux.
  useEffect(() => {
    const f = (v: boolean) => setVue(v)
    etat.abonnes.add(f)
    if (etat.vue !== vue) setVue(etat.vue)
    const r = (k: number) => setCleVue(k)
    etat.remonteurs.add(r)
    if (etat.cleVue !== cleVue) setCleVue(etat.cleVue)
    return () => {
      etat.remonteurs.delete(r)
      etat.abonnes.delete(f)
      if (etat.abonnes.size === 0) regler(false)
    }
  }, [])

  // Taille du texte : suivie par la page déjà prête (la page suivante la reçoit à son chargement).
  useEffect(() => {
    if (etat.statut !== "prete" || etat.tailleAppliquee === taille) return
    etat.tailleAppliquee = taille
    c.evaluateJavaScript(codeTaille(taille)).catch(() => {})
  }, [taille])

  // Chaque page : affichée (DOM ou chargement), sous la garde de DELAI_PAGE_PRETE_MS, armée seulement page visible
  // (relecture C9 : une page cachée, Détail poussé ou autre onglet, peut être suspendue par WebKit ; la garde attend son retour).
  useEffect(() => {
    armerGarde(afficher(html))
  }, [html])
  // Ticket 4.55b : la page rechargée à la demande du chien de garde (même vue, même contrôleur), sous la garde.
  useEffect(() => {
    if (cleVue === cleChargee.current) return
    cleChargee.current = cleVue
    armerGarde(recharger())
  }, [cleVue])
  useEffect(() => {
    if (!cachee) armerGarde(etat.demande)
    else if (garde !== null) { clearTimeout(garde); garde = null }
  }, [cachee])
  // Ticket 4.55c : le cache retiré (page montrée) : une ligne au journal, une fois par exécution.
  useEffect(() => {
    if (!vue || cacheRetireDit) return
    cacheRetireDit = true
    try { note(`[page web] cache retiré à ${Date.now() - etat.depuis} ms`).catch(() => {}) } catch { /* rien */ }
  }, [vue])

  const plein = { maxWidth: "infinity", maxHeight: "infinity" } as const
  return (
    <ZStack frame={plein} background={fond}>
      {/* Ticket 4.55c : la vue web et son conteneur, aux modificateurs constants dès le premier rendu (Scripting 3.2.2 n'appliquait
          plus leur changement : la page restait cachée). */}
      <VStack key="page-web-vue" frame={plein}>
        <WebView controller={c} />
      </VStack>
      {/* Ticket 4.55c : tant que la page n'est pas prête, un cache de la couleur du fond posé dessus (il prend les appuis, VoiceOver
          ne le lit pas), retiré de l'arbre quand elle l'est. */}
      {vue ? null : <Rectangle key="page-web-cache" fill={fond} frame={plein} accessibilityHidden />}
    </ZStack>
  )
}

/**
 * La page web de l'onglet Stats : `html` (page complète ou morceau), `onAction(action, valeur)` à chaque appui sur un
 * `[data-action]`, `onEchec()` quand la page ne peut s'afficher (l'app revient alors au natif). Taille du texte et contraste
 * lus dans l'environnement.
 */
export function PageWeb({ html, onAction, onEchec, onRecharge, cachee = false }: {
  html: string; onAction: (action: string, valeur?: string) => void; onEchec: () => void
  /** Relecture C3 : le document courant de l'app, pour recharger la page après un arrêt du processus WebContent. */
  onRecharge?: () => string
  /** Relecture C9 : la page n'est pas à l'écran (Détail poussé, autre onglet). */
  cachee?: boolean
}) {
  return (
    <EnvironmentValuesReader keys={["dynamicTypeSize", "colorSchemeContrast"]}>
      {(env) => <HoteWeb html={html} onAction={onAction} onEchec={onEchec} onRecharge={onRecharge} cachee={cachee} taille={env.dynamicTypeSize} contraste={env.colorSchemeContrast} />}
    </EnvironmentValuesReader>
  )
}
