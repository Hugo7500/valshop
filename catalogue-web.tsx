import { EmptyView, ProgressView, Rectangle, Text, VStack, WebView, ZStack, fetch, useEffect, useRef, useState } from "scripting"
import {
  PONT_CATALOGUE, dansBoutique, indexCatalogue, lirePrix, niveauxEnBoutique, niveauxSouhaites, pageCatalogue, prixEnBoutique, prixEtProvenance,
  type DansBoutique, type IndexCatalogue, type PrixEnBoutique, type PrixLus, type SkinDuCatalogue,
} from "./catalogue-skins"
import { COULEURS, SEUIL_JOURNAL_MS } from "./design"
import { FicheSkin, type InfosCatalogue } from "./fiche-skin"
import { messageHote } from "./historique"
import { CHIEN_MS, REMONTAGES_MAX, attendreAttache, garderNavigation, lireEtatVue, litteral } from "./page-web"
import { basculer, contient, type Souhait } from "./souhaits"
import { lirePrixVus, lireReference, type PrixVus, type Reference } from "./prix-retenus"
import { TABLE_REFERENCE } from "./prix-reference"
import { construireOrigines, contenuOrigines, ligneJournalOrigines, lireOrigines, originesARefaire, type TableOrigines } from "./origines"
import { BORNE_JSON, texteBorne } from "./securite"
import { ecrireSur } from "./stockage"
import { CATALOG, ORIGINES_FILE, PRIX_FILE, PRIX_VUS_FILE, WISHLIST_FILE, note } from "./valshop"






















/** Ticket 4.55b : l'état de la vue web déjà dit au journal dans cette exécution (diagnostic, une fois). */
let etatCatalogueDit = false
/** Ticket 4.55c : « cache retiré » déjà dit dans cette exécution. */
let cacheCatalogueRetireDit = false

/** Délai laissé à la page pour se dire prête : au-delà, « Catalogue indisponible ». */
export const DELAI_PRETE_MS = 4000
/** Arrêts du processus WebContent tolérés (page rechargée) avant « Catalogue indisponible ». */
export const ARRETS_TOLERES = 2
/** Lignes de mesure d'un filtre au journal, au plus, par écran monté. */
const MESURES_FILTRE_MAX = 5

export const MESSAGE_ANCIEN = "Le catalogue sera prêt après la prochaine lecture de la boutique."
export const MESSAGE_INDISPONIBLE = "Catalogue indisponible. Détail dans le journal."

/**
 * Ce que l'écran a préparé : le catalogue lu, son index (et chaque skin par son premier niveau), les prix (prix.json ; ticket 8.7,
 * `boutique`, ceux de sa boutique tirés à la préparation, les mêmes pour la page et la fiche), la page.
 */
type Prepare =
  | {
    cat: unknown; index: IndexCatalogue; parNiveau: Map<string, SkinDuCatalogue>; prix: PrixLus | null; boutique: PrixEnBoutique | null
    retenus: PrixVus; reference: Reference | null; origines: TableOrigines | null; html: string; jeton: number; depuis: number
  }
  | { manque: true }

/** Lit un fichier texte ; absent : null, sans bruit ; illisible : null et une ligne en console. */
function lireTexte(chemin: string): string | null {
  try {
    return FileManager.existsSync(chemin) ? FileManager.readAsStringSync(chemin) : null
  } catch (e) {
    console.log("catalogue : fichier illisible (" + e + ")")
    return null
  }
}

/**
 * Ticket 8.9 : la table de référence du paquet (prix-reference.ts, module de données importé : ni fichier lu, ni dossier du
 * script visé) ; d'une autre forme : null.
 */
export function lireTableDuPaquet(): Reference | null {
  return lireReference(TABLE_REFERENCE)
}

/** Ticket 8.11 : délai de chaque liste de valorant-api lue pour la table des origines, en secondes. */
const DELAI_ORIGINES_S = 30
/**
 * Ticket 8.11 (relecture) : ce qu'une page attend la table des origines, au plus, en millisecondes ; au-delà, la page se fait
 * avec l'ancienne table (ou sans) et la lecture continue : écrite, elle sert à l'ouverture suivante.
 */
export const ATTENTE_ORIGINES_MS = 4000
/** Ticket 8.11 (relecture) : la lecture de la table en cours, par version du jeu : une seule à la fois, partagée par les écrans. */
let origineEnCours: { version: string; p: Promise<TableOrigines | null> } | null = null
/** Ticket 8.11 : les listes publiques de valorant-api (fr-FR) de la table des origines, dans l'ordre de lecture. */
const LISTES_ORIGINES = ["contracts", "seasons", "events", "agents"] as const

/**
 * Ticket 8.11 : la table des origines du Catalogue (origines.json), à la préparation d'un écran du Catalogue (skins, accessoires),
 * jamais au rendu : lue sur le disque ; relue de valorant-api (`/v1/contracts`, `/v1/seasons`, `/v1/events`, `/v1/agents`, fr-FR,
 * publics : ni cookie, ni clé, ni en-tête ; corps bornés) seulement si elle manque, est illisible ou d'une autre version du jeu
 * que la boutique lue (`shop.version`) ; sans version connue, aucune requête (la table suit la version du jeu). Écrite sûrement ;
 * une ligne au journal (`dire`, comptes seulement) ; un échec garde l'ancienne (rendue) et le dit ; une ouverture suivante
 * réessaie. Ne lève jamais.
 */
export async function tableDesOrigines(shop: unknown, dire: (ligne: string) => void, ecran: string): Promise<TableOrigines | null> {
  const { table: ancien, aRelire } = originesSurLeDisque(shop)
  const version = (shop as { version?: unknown } | null)?.version
  if (!aRelire || typeof version !== "string") return ancien
  // Une lecture déjà en cours pour cette version (écran rouvert, autre écran) : la même, jamais une seconde.
  if (origineEnCours === null || origineEnCours.version !== version) {
    const p = relireOrigines(version, ancien, dire, ecran)
    origineEnCours = { version, p }
    p.then(() => { if (origineEnCours !== null && origineEnCours.p === p) origineEnCours = null })
  }
  const enCours = origineEnCours.p
  // La page n'attend pas plus d'ATTENTE_ORIGINES_MS (réseau lent) : l'ancienne table, ou aucune, en attendant.
  let minuterie: ReturnType<typeof setTimeout> | null = null
  const attente = new Promise<TableOrigines | null>((r) => { minuterie = setTimeout(() => r(ancien), ATTENTE_ORIGINES_MS) })
  try {
    return await Promise.race([enCours, attente])
  } finally {
    if (minuterie !== null) clearTimeout(minuterie)
  }
}

/** Les quatre listes lues, la table construite et écrite ; un échec rend l'ancienne et le dit. Ne lève jamais. */
async function relireOrigines(version: string, ancien: TableOrigines | null, dire: (ligne: string) => void, ecran: string): Promise<TableOrigines | null> {
  const t0 = Date.now()
  try {
    const reponses: Record<string, unknown> = {}
    for (const chemin of LISTES_ORIGINES) {
      const r = await fetch(`https://valorant-api.com/v1/${chemin}?language=fr-FR`, { timeout: DELAI_ORIGINES_S })
      if (!r.ok) throw new Error(`${chemin} HTTP ${r.status}`)
      try {
        reponses[chemin] = JSON.parse(await texteBorne(r, BORNE_JSON))
      } catch {
        throw new Error(`${chemin} : réponse illisible`)
      }
    }
    const t = construireOrigines({ contracts: reponses.contracts, seasons: reponses.seasons, events: reponses.events, agents: reponses.agents },
      version, new Date().toISOString())
    if (Object.keys(t.objets).length === 0) throw new Error("aucune récompense dans les réponses")
    try {
      ecrireSur(ORIGINES_FILE, contenuOrigines(t))
    } catch (e) {
      dire(`[${ecran}] origines lues mais non gardées (${messageHote(String(e), [])})`)
    }
    dire(`[${ecran}] ${ligneJournalOrigines(t)} En ${Date.now() - t0} ms.`)
    return t
  } catch (e) {
    dire(`[${ecran}] origines non lues (${messageHote(e instanceof Error ? e.message : String(e), [])}) : ${ancien !== null ? "anciennes gardées" : "aucune encore"}, nouvel essai à la prochaine ouverture`)
    return ancien
  }
}

/** Les souhaits sous la forme de la page. */
function souhaitsDeLaPage(liste: readonly Souhait[]) {
  return { skins: liste.filter((e) => e.kind === "skin").map((e) => e.id), armes: liste.filter((e) => e.kind === "weapon").map((e) => e.id) }
}

/** Numéro de chaque page préparée (renvoyé par la page prête : un signal d'une page remplacée est ignoré). */
let pages = 0

/**
 * catalog.json et prix.json lus, l'index et la page construits. Catalogue absent ou d'un format antérieur : « manque ». Ticket
 * 8.11 : la table des origines d'abord (tableDesOrigines : lue, ou relue de valorant-api une fois par version du jeu).
 */
function preparer(shop: unknown, souhaits: readonly Souhait[]): Prepare | Promise<Prepare> {
  // Ticket 8.11 (relecture) : la table à jour (ou sans version connue) : tout se fait sur place, comme avant 8.11 ; à relire :
  // la page attend sa lecture (ATTENTE_ORIGINES_MS au plus).
  const lue = originesSurLeDisque(shop)
  if (!lue.aRelire) return construire(shop, souhaits, lue.table)
  return tableDesOrigines(shop, dire, "catalogue").then((o) => construire(shop, souhaits, o))
}

/** La table des origines du disque, et s'il faut la relire de valorant-api (version de la boutique connue, autre ou absente). */
function originesSurLeDisque(shop: unknown): { table: TableOrigines | null; aRelire: boolean } {
  const table = lireOrigines(lireTexte(ORIGINES_FILE))
  const version = (shop as { version?: unknown } | null)?.version
  return { table, aRelire: typeof version === "string" && version.length > 0 && originesARefaire(table, version) }
}

/** La page de ce catalogue (catalog.json, prix, table des origines `origines`), construite sur place. */
function construire(shop: unknown, souhaits: readonly Souhait[], origines: TableOrigines | null): Prepare {
  const depuis = Date.now()
  const texte = lireTexte(CATALOG)
  let cat: unknown = null
  try {
    cat = texte !== null ? JSON.parse(texte) : null
  } catch (e) {
    console.log("catalogue : catalog.json illisible (" + e + ")")
  }
  const index = indexCatalogue(cat)
  // Catalogue d'avant le ticket 8.4 (sans éditions ni collections, le favori aléatoire indiscernable) : reconstruit à la
  // prochaine lecture de la boutique ; d'ici là, le message, pas une liste incomplète.
  if (index === null || index.skins.length === 0 || !index.complet) return { manque: true }
  const prix = lirePrix(lireTexte(PRIX_FILE))
  // Ticket 8.9 : les prix retenus (prix-vus.json) et la table de référence, lus une fois, avec prix.json.
  const retenus = lirePrixVus(lireTexte(PRIX_VUS_FILE))
  const reference = lireTableDuPaquet()
  // Ticket 8.11 : la table des origines (`origines`, preparer : lue une fois, relue de valorant-api si elle est à refaire) ; la
  // mesure « lecture et page » part de `depuis`, sans l'attente de la table (qui a sa ligne, son temps réseau à part).
  const jeton = ++pages
  const c = COULEURS.standard
  // Ticket 8.7 : les prix de sa boutique, tirés de la boutique déjà lue (shop.json en mémoire, rien de relu).
  const maintenant = Date.now()
  const boutique = prixEnBoutique(shop, maintenant)
  const html = pageCatalogue(index, {
    prix, boutique, retenus, reference, origines, enBoutique: niveauxEnBoutique(shop, maintenant), souhaits: souhaitsDeLaPage(souhaits), jeton,
    couleurs: {
      fond: String(c.fond), surface: String(c.surface), bordure: String(c.bordure), texte: String(c.texte), texteDoux: String(c.texteDoux),
      texteDiscret: String(c.texteDiscret), orange: String(c.orange), or: String(c.or),
    },
  })
  return { cat, index, parNiveau: new Map(index.skins.map((s) => [s.niveau, s])), prix, boutique, retenus, reference, origines, html, jeton, depuis }
}

/** Une ligne au journal, sans jamais d'erreur. */
function dire(ligne: string) {
  try {
    note(ligne).catch(() => {})
  } catch { /* journal indisponible : rien */ }
}

/** Ce que dit la fiche de la boutique du jour pour ce skin, et où il y est. */
function boutiqueDite(shop: unknown, niveau: string): { texte: string; ou: DansBoutique } {
  const en = niveauxEnBoutique(shop, Date.now())
  if (en === null) return { texte: "Inconnue (boutique d'un jour passé)", ou: null }
  const ou = dansBoutique(niveau, en)
  return { texte: ou === "jour" ? "Oui" : ou === "nm" ? "Au Night Market" : "Non", ou }
}

/**
 * L'écran Catalogue : `shop`, la boutique lue (boutique du jour) ; `souhaits` et `onSouhaits`, la liste de souhaits tenue
 * par l'onglet Boutique (son compte y reste juste).
 */
export function CatalogueSkins({ shop, souhaits, onSouhaits, ouverture }: {
  shop: unknown; souhaits: Souhait[]; onSouhaits: (liste: Souhait[]) => void
  /** Numéro de l'ouverture (vue.tsx) : l'écran resté monté au retour ne relit qu'à une nouvelle ouverture, si la boutique a changé. */
  ouverture?: number
}) {
  // Le contrôleur de la vue web, créé au premier rendu, une fois ; null si Scripting n'en a pas.
  // Ticket 4.55b : `essais`, les remontages de la vue web par le chien de garde (contrôleur neuf), sur cet écran.
  const hote = useRef<{ essaye: boolean; c: WebViewController | null; pont: Promise<boolean> | null; arrets: number; mesures: number; depuis: number; essais: number }>(
    { essaye: false, c: null, pont: null, arrets: 0, mesures: 0, depuis: 0, essais: 0 })
  if (!hote.current.essaye) {
    hote.current.essaye = true
    try {
      hote.current.c = new WebViewController({ ephemeral: true })
      // Ticket 7.8 (M2) : aucune navigation hors des chargements de l'hôte (page-web.tsx, garderNavigation).
      garderNavigation(hote.current.c, "catalogue")
    } catch (e) {
      hote.current.c = null
      dire("[catalogue] page indisponible : pas de vue web (" + messageHote(String(e), []) + ")")
    }
  }
  const c = hote.current.c
  const [prepare, setPrepare] = useState<Prepare | null>(null)
  const [etat, setEtat] = useState<"attente" | "prete" | "echec">(c === null ? "echec" : "attente")
  const [pile, setPile] = useState<{ niveau: string | null; ouverture: number; poussee: boolean }>({ niveau: null, ouverture: 0, poussee: false })
  const [erreur, setErreur] = useState<string | null>(null)
  // Rechargements de la page après un arrêt du processus WebContent (chacun relance le chargement sous sa garde).
  const [recharge, setRecharge] = useState(0)
  // Le dernier état vu par les messages de la page (ils arrivent hors du rendu).
  const courant = useRef<{ prepare: Prepare | null; etat: string }>({ prepare: null, etat: "attente" })
  courant.current = { prepare, etat }
  const garde = useRef<ReturnType<typeof setTimeout> | null>(null)

  const echouer = (raison: string) => {
    if (garde.current !== null) { clearTimeout(garde.current); garde.current = null }
    if (courant.current.etat === "echec") return
    courant.current.etat = "echec"
    dire("[catalogue] page indisponible : " + messageHote(raison, []))
    setEtat("echec")
  }

  /** Messages de la page : prête (son numéro), appui sur un skin, mesure d'un filtre. */
  const recevoir = (corps?: any) => {
    if (corps === null || typeof corps !== "object") return
    const p = courant.current.prepare
    if (corps.genre === "prete") {
      if (p === null || "manque" in p || corps.jeton !== p.jeton || courant.current.etat === "echec") return
      if (garde.current !== null) { clearTimeout(garde.current); garde.current = null }
      courant.current.etat = "prete"
      dire(`[mesure] catalogue : page prête ${Date.now() - hote.current.depuis} ms`)
      setEtat("prete")
    } else if (corps.genre === "skin") {
      if (p === null || "manque" in p || typeof corps.valeur !== "string" || !p.parNiveau.has(corps.valeur)) return
      const niveau: string = corps.valeur
      setErreur(null)
      setPile((x) => ({ niveau, ouverture: x.ouverture + 1, poussee: true }))
    } else if (corps.genre === "mesure") {
      const ms = corps.ms
      if (typeof ms !== "number" || !Number.isFinite(ms) || ms < SEUIL_JOURNAL_MS || hote.current.mesures >= MESURES_FILTRE_MAX) return
      hote.current.mesures++
      dire(`[mesure] catalogue filtre : de l'appui à l'image peinte ${Math.round(ms)} ms`)
    }
  }
  const recepteur = useRef(recevoir)
  recepteur.current = recevoir

  /** Messages, réglages et écoute du processus, posés une fois sur le contrôleur. */
  const pont = (ctrl: WebViewController): Promise<boolean> => {
    if (hote.current.pont !== null) return hote.current.pont
    hote.current.pont = (async () => {
      try {
        await ctrl.addScriptMessageHandler(PONT_CATALOGUE, (corps?: any) => recepteur.current(corps))
      } catch (e) {
        console.log("catalogue : messages non posés (" + e + ")")
        return false
      }
      const x: any = ctrl
      const fond = COULEURS.standard.fond
      if (typeof x.setSettings === "function") {
        try {
          await x.setSettings({ isOpaque: false, backgroundColor: fond, underPageBackgroundColor: fond, allowsLinkPreview: false })
        } catch { /* réglages refusés : la vue reste cachée jusqu'à la page prête */ }
      }
      if (typeof x.addEventListener === "function") {
        try {
          await x.addEventListener("webContentProcessTerminated", () => {
            hote.current.arrets++
            if (hote.current.arrets > ARRETS_TOLERES) return echouer(`le processus de WebKit s'est arrêté ${hote.current.arrets} fois`)
            dire(`[catalogue] le processus de WebKit s'est arrêté (${hote.current.arrets} sur ${ARRETS_TOLERES + 1}) : page rechargée`)
            courant.current.etat = "attente"
            setEtat("attente")
            setRecharge((n) => n + 1)
          })
        } catch { /* écoute impossible : le délai reste */ }
      }
      return true
    })()
    return hote.current.pont
  }

  /** Charge la page préparée (la garde de DELAI_PRETE_MS est posée par l'effet qui l'appelle). */
  const charger = async (ctrl: WebViewController, p: Prepare) => {
    if ("manque" in p) return
    if (!(await pont(ctrl))) return echouer("les messages de la page n'ont pas pu être posés")
    // Ticket 4.55 : la vue web attachée à l'écran d'abord (page-web.tsx, attendreAttache) : au premier appui, la page chargée
    // avant restait blanche.
    await attendreAttache(ctrl)
    if (courant.current.prepare !== p) return
    // Ticket 4.55b : l'état de la vue web avant et après le premier loadHTML de l'exécution (diagnostic, une fois).
    const avant = etatCatalogueDit ? null : await lireEtatVue(ctrl)
    if (courant.current.prepare !== p) return
    hote.current.depuis = Date.now()
    let ok = false
    let cause = ""
    try {
      ok = await ctrl.loadHTML(p.html)
    } catch (e) {
      cause = String(e).slice(0, 160)
    }
    if (!etatCatalogueDit && avant !== null) {
      etatCatalogueDit = true
      dire(`[catalogue] état de la vue web : avant loadHTML ${avant} ; après ${await lireEtatVue(ctrl)} (loadHTML a rendu ${ok ? "vrai" : cause !== "" ? "une erreur" : "faux"})`)
    }
    if (!ok && courant.current.prepare === p) echouer(cause ? `loadHTML a levé (${cause})` : "la page ne s'est pas chargée (loadHTML a rendu faux)")
  }

  // Préparation : après la première image de l'écran (minuterie) ; l'écran resté monté au retour (pile de la Boutique) ne
  // relit qu'à une nouvelle ouverture, et seulement si la boutique lue a changé. Libération au démontage.
  const preparePour = useRef<{ shop: unknown } | null>(null)
  useEffect(() => {
    if (c === null) return
    if (preparePour.current !== null && preparePour.current.shop === shop) return
    preparePour.current = { shop }
    // Ticket 8.11 : la préparation attend la table des origines (une requête au plus par version du jeu) : un écran démonté
    // entre-temps n'en reçoit rien.
    let vivant = true
    const t = setTimeout(() => {
      const fini = (p: Prepare) => {
        if (!vivant) return
        if (!("manque" in p)) dire(`[mesure] catalogue : lecture et page ${Date.now() - p.depuis} ms (${p.index.skins.length} skins)`)
        courant.current = { prepare: p, etat: "attente" }
        setEtat("attente")
        setPrepare(p)
      }
      const r = preparer(shop, souhaits)
      if (r instanceof Promise) r.then(fini, (e) => { if (vivant) echouer("préparation en échec (" + String(e) + ")") })
      else fini(r)
    }, 0)
    return () => {
      vivant = false
      clearTimeout(t)
      if (preparePour.current !== null && preparePour.current.shop === shop && courant.current.prepare === null) preparePour.current = null
    }
  }, [ouverture])
  // Chaque page préparée (ou rechargée) : chargée, sous la garde de DELAI_PRETE_MS.
  useEffect(() => {
    if (c === null || prepare === null || "manque" in prepare) return
    const g = setTimeout(() => {
      if (garde.current === g) garde.current = null
      echouer(`la page ne s'est pas dite prête en ${DELAI_PRETE_MS} ms`)
    }, DELAI_PRETE_MS)
    garde.current = g
    // Ticket 4.55b : le chien de garde de ce chargement (CHIEN_MS après son loadHTML, page-web.tsx) : pas prête, la vue web remontée
    // avec un contrôleur neuf (ce qui l'affichait au second appui) et la page rechargée, au plus REMONTAGES_MAX fois ; puis
    // « Catalogue indisponible ».
    hote.current.depuis = 0
    let relances = 0
    let ch: ReturnType<typeof setTimeout> | null = null
    const surChien = () => {
      ch = null
      if (courant.current.prepare !== prepare || courant.current.etat !== "attente") return
      const ecoule = hote.current.depuis === 0 ? 0 : Date.now() - hote.current.depuis
      if (ecoule < CHIEN_MS) {
        if (relances++ < 20) ch = setTimeout(surChien, hote.current.depuis === 0 ? CHIEN_MS : Math.max(1, CHIEN_MS - ecoule))
        return
      }
      if (hote.current.essais >= REMONTAGES_MAX) return echouer(`page pas prête après ${REMONTAGES_MAX} remontages de la vue web`)
      let neuf: WebViewController
      try {
        neuf = new WebViewController({ ephemeral: true })
        garderNavigation(neuf, "catalogue")
      } catch (e) {
        return echouer("page pas prête, vue web impossible à refaire (" + String(e).slice(0, 120) + ")")
      }
      hote.current.essais++
      dire(`[catalogue] page pas prête après ${ecoule} ms : vue remontée avec un contrôleur neuf (essai ${hote.current.essais})`)
      const ancien = hote.current.c
      hote.current.c = neuf
      hote.current.pont = null
      try { ancien?.dispose() } catch { /* déjà libéré : rien */ }
      setRecharge((n) => n + 1)
    }
    ch = setTimeout(surChien, CHIEN_MS)
    charger(c, prepare)
    return () => {
      clearTimeout(g)
      if (ch !== null) clearTimeout(ch)
      if (garde.current === g) garde.current = null
    }
  }, [prepare, recharge])
  useEffect(() => () => {
    if (garde.current !== null) { clearTimeout(garde.current); garde.current = null }
    try {
      hote.current.c?.dispose()
    } catch { /* déjà libéré : rien */ }
  }, [])

  // Ticket 4.55c : le cache retiré (page montrée) : une ligne au journal, une fois par exécution.
  useEffect(() => {
    if (etat !== "prete" || cacheCatalogueRetireDit) return
    cacheCatalogueRetireDit = true
    dire(`[catalogue] cache retiré à ${Date.now() - hote.current.depuis} ms`)
  }, [etat])

  // Les étoiles de la page suivent la liste de souhaits (changée dans la fiche ou dans l'éditeur de la liste).
  useEffect(() => {
    if (c === null || etat !== "prete" || prepare === null || "manque" in prepare) return
    const niveaux = niveauxSouhaites(prepare.index, souhaitsDeLaPage(souhaits))
    c.evaluateJavaScript(`return window.catalogue ? window.catalogue.souhaits(JSON.parse(${litteral(JSON.stringify(niveaux))})) : false`).catch(() => {})
  }, [souhaits, etat])

  /** Le souhait d'un skin ajouté ou retiré : wishlist.json réécrit ; un échec laisse la liste telle quelle et le dit. */
  const basculerSouhait = (s: SkinDuCatalogue) => {
    const nouvelle = basculer(souhaits, { kind: "skin", id: s.skin, name: s.nom })
    try {
      FileManager.writeAsStringSync(WISHLIST_FILE, JSON.stringify(nouvelle, null, 2))
    } catch (e) {
      setErreur("Liste non enregistrée : " + e)
      return
    }
    setErreur(null)
    onSouhaits(nouvelle)
  }

  // La fiche poussée : rien avant le premier appui ; la dernière reste au retour, le temps de l'animation.
  let fiche = <EmptyView />
  if (pile.niveau !== null && prepare !== null && !("manque" in prepare)) {
    const s = prepare.parNiveau.get(pile.niveau)
    if (s) {
      const b = boutiqueDite(shop, s.niveau)
      // Ticket 8.7 : le prix de sa boutique d'abord, celui que dit la ligne de la page (tiré à la préparation).
      // Ticket 8.11 : l'origine exacte (à la place du prix s'il n'en a pas) et la sortie, si une source exacte la donne ;
      // ticket 8.13 : sans l'un ni l'autre, le complément de la table (prix confirmé, bundle, nature), comme la ligne.
      const { p, origine } = prixEtProvenance(s, prepare.prix, prepare.boutique, prepare.retenus, prepare.reference, prepare.origines)
      const infos: InfosCatalogue = {
        prix: p.texte,
        sansPrix: p.vp === null,
        origine: origine?.texte ?? null,
        sortie: origine?.sortie ?? null,
        source: p.source,
        remise: p.base !== null || p.remise !== null ? { base: p.base, pourcentage: p.remise, voix: p.voix } : null,
        boutique: b.texte,
        souhait: contient(souhaits, "skin", s.skin) ? "skin" : contient(souhaits, "weapon", s.arme) ? "arme" : null,
        onSouhait: () => basculerSouhait(s),
        erreur,
      }
      fiche = <FicheSkin id={s.niveau} prix={p.vp} ouverture={pile.ouverture} catalogue={prepare.cat} infos={infos} />
    }
  }

  const prete = etat === "prete"
  const manque = prepare !== null && "manque" in prepare
  const message = manque ? MESSAGE_ANCIEN : etat === "echec" ? MESSAGE_INDISPONIBLE : null
  const plein = { maxWidth: "infinity", maxHeight: "infinity" } as const
  return (
    <ZStack
      frame={plein}
      background={COULEURS.standard.fond}
      navigationTitle="Catalogue"
      navigationBarTitleDisplayMode="inline"
      navigationDestination={{
        isPresented: pile.poussee,
        onChanged: (poussee: boolean) => setPile((x) => ({ ...x, poussee })),
        content: fiche,
      }}
    >
      {c !== null && !manque ? (
        // Ticket 4.55c : la vue web et son conteneur, aux modificateurs constants dès le premier rendu (Scripting 3.2.2 n'appliquait
        // plus leur changement : la page restait cachée) ; une clé neuve seulement avec un contrôleur neuf (chien de garde, 4.55b).
        <VStack key={`catalogue-vue${hote.current.essais > 0 ? `-${hote.current.essais}` : ""}`} frame={plein}>
          <WebView controller={c} />
        </VStack>
      ) : null}
      {c !== null && !manque && !prete ? (
        // Ticket 4.55c : tant que la page n'est pas prête, un cache de la couleur du fond posé dessus (il prend les appuis, VoiceOver
        // ne le lit pas), retiré de l'arbre quand elle l'est.
        <Rectangle key="catalogue-cache" fill={COULEURS.standard.fond} frame={plein} accessibilityHidden />
      ) : null}
      {message !== null ? (
        <Text foregroundStyle="secondaryLabel" multilineTextAlignment="center" padding={24}>
          {message}
        </Text>
      ) : !prete ? (
        <ProgressView />
      ) : null}
    </ZStack>
  )
}
