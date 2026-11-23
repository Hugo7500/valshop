import { ProgressView, Rectangle, Text, VStack, WebView, ZStack, fetch, useEffect, useRef, useState } from "scripting"
import {
  PONT_ACCESSOIRES, TYPES_ACCESSOIRES, sourcesAccessoires, boutiqueAccessoiresConnue, cacheARefaire, contenuCache, lignesAccessoires, lireAccessoires, lireCache, pageAccessoires,
  type Accessoire, type TypeAccessoire,
} from "./catalogue-accessoires"
import { lireTableDuPaquet, tableDesOrigines } from "./catalogue-web"
import { COULEURS, SEUIL_JOURNAL_MS } from "./design"
import { messageHote } from "./historique"
import { REMONTAGES_MAX, attendreAttache, garderNavigation } from "./page-web"
import { lirePrixVus } from "./prix-retenus"
import { BORNE_JSON, texteBorne } from "./securite"
import { ecrireSur } from "./stockage"
import { ACCESSOIRES_FILE, PRIX_VUS_FILE, note } from "./valshop"
import { langueDesNoms } from "./langue"


















/** Délai laissé à la page pour se dire prête : au-delà, « Catalogue des accessoires indisponible ». */
export const DELAI_PRETE_MS = 4000
/** Arrêts du processus WebContent tolérés (page rechargée). */
export const ARRETS_TOLERES = 2






export const CHIEN_ACCESSOIRES_MS = 1500
/** Délai de chaque liste de valorant-api, en secondes. */
const DELAI_LISTE_S = 20
const MESURES_FILTRE_MAX = 5

export const MESSAGE_LECTURE = "Lecture du catalogue des accessoires…"
export const MESSAGE_INDISPONIBLE = "Catalogue des accessoires indisponible. Détail dans le journal."
export const MESSAGE_RESEAU = "Catalogue des accessoires pas encore lu : réseau indisponible. Réessaie plus tard."

let etatDit = false

/** Une ligne au journal, sans jamais d'erreur. */
function dire(ligne: string) {
  try {
    note(ligne).catch(() => {})
  } catch { /* journal indisponible : rien */ }
}

/** Lit un fichier texte ; absent ou illisible : null. */
function lireTexte(chemin: string): string | null {
  try {
    return FileManager.existsSync(chemin) ? FileManager.readAsStringSync(chemin) : null
  } catch {
    return null
  }
}

/** Le nom d'un type pour le journal. */
const NOMS: Record<TypeAccessoire, string> = { buddy: "porte-bonheur", spray: "tags", card: "cartes", title: "titres", flex: "flex" }

/**
 * Les cinq listes publiques de valorant-api (SOURCES_ACCESSOIRES), l'une après l'autre, sans cookie, clé ni en-tête, corps
 * bornés (securite.ts) : les accessoires lus ; un échec lève (la liste et son statut, jamais un corps).
 */
async function relireListes(langue: string): Promise<Accessoire[]> {
  const reponses: Partial<Record<TypeAccessoire, unknown>> = {}

  const sources = sourcesAccessoires(langue)
  for (const type of TYPES_ACCESSOIRES) {
    const r = await fetch(sources[type], { timeout: DELAI_LISTE_S })
    if (!r.ok) throw new Error(`${NOMS[type]} HTTP ${r.status}`)
    let corps: unknown
    try {
      corps = JSON.parse(await texteBorne(r, BORNE_JSON))
    } catch {
      throw new Error(`${NOMS[type]} : réponse illisible`)
    }
    reponses[type] = corps
  }
  const liste = lireAccessoires(reponses, langue)
  if (liste.length === 0) throw new Error("aucun accessoire dans les réponses")
  return liste
}

/** Ce que l'écran a préparé : la page, ou un manque (réseau, rien en cache). */
type Prepare = { html: string; jeton: number; n: number } | { manque: true }

let pages = 0

/**
 * Le cache lu (et relu de valorant-api s'il est à refaire, une fois), les prix lus une fois, la page construite. Sans cache
 * ni réseau : « manque ».
 */
async function preparer(shop: unknown): Promise<Prepare> {
  const version = (shop as { version?: unknown } | null)?.version
  let cache = lireCache(lireTexte(ACCESSOIRES_FILE))


  const langue = langueDesNoms()
  if (cacheARefaire(cache, version, langue)) {
    const t0 = Date.now()
    try {
      const liste = await relireListes(langue)
      const v = typeof version === "string" && version.length > 0 ? version : null
      const lueA = new Date().toISOString()
      try {
        ecrireSur(ACCESSOIRES_FILE, contenuCache(v, lueA, liste, langue))
      } catch (e) {
        dire(`[accessoires] catalogue lu mais non gardé (${messageHote(String(e), [])})`)
      }
      cache = { version: v, lueA, langue, elements: liste }
      dire(`[accessoires] catalogue lu de valorant-api : ${liste.length} accessoires en ${Date.now() - t0} ms`)
    } catch (e) {
      dire(`[accessoires] catalogue non lu (${messageHote(e instanceof Error ? e.message : String(e), [])})${cache !== null && cache.elements.length > 0 ? " : ancien catalogue gardé" : ""}`)
      if (cache === null || cache.elements.length === 0) return { manque: true }
    }
  }
  let t1 = Date.now()
  const retenus = lirePrixVus(lireTexte(PRIX_VUS_FILE))
  const reference = lireTableDuPaquet()
  // Ticket 8.11 : la table des origines (origines.json), lue une fois avec les prix, relue de valorant-api si elle est à refaire.
  const tOrigines = Date.now()
  const origines = await tableDesOrigines(shop, dire, "accessoires")
  // Ticket 8.11 (relecture) : la mesure « prix et page » sans l'attente de la table des origines (sa ligne a son temps).
  t1 += Date.now() - tOrigines
  const maintenant = Date.now()
  const lignes = lignesAccessoires(cache!.elements, shop, maintenant, retenus, reference, origines)
  const c = COULEURS.standard
  const jeton = ++pages
  const html = pageAccessoires(lignes, {
    jeton, boutiqueConnue: boutiqueAccessoiresConnue(shop, maintenant),
    couleurs: {
      fond: String(c.fond), surface: String(c.surface), bordure: String(c.bordure), texte: String(c.texte), texteDoux: String(c.texteDoux),
      texteDiscret: String(c.texteDiscret), orange: String(c.orange), or: String(c.or),
    },
  })
  dire(`[mesure] accessoires : prix et page ${Date.now() - t1} ms (${lignes.length} accessoires)`)
  return { html, jeton, n: lignes.length }
}

/** L'écran « Tous les accessoires » : `shop`, la boutique lue ; `ouverture`, le numéro de l'ouverture (vue.tsx). */
export function CatalogueAccessoires({ shop, ouverture }: { shop: unknown; ouverture?: number }) {
  const hote = useRef<{ essaye: boolean; c: WebViewController | null; pont: Promise<boolean> | null; arrets: number; mesures: number; depuis: number; essais: number }>(
    { essaye: false, c: null, pont: null, arrets: 0, mesures: 0, depuis: 0, essais: 0 })
  if (!hote.current.essaye) {
    hote.current.essaye = true
    try {
      hote.current.c = new WebViewController({ ephemeral: true })
      garderNavigation(hote.current.c, "accessoires")
    } catch (e) {
      hote.current.c = null
      dire("[accessoires] page indisponible : pas de vue web (" + messageHote(String(e), []) + ")")
    }
  }
  const c = hote.current.c
  const [prepare, setPrepare] = useState<Prepare | null>(null)
  const [etat, setEtat] = useState<"attente" | "prete" | "echec">(c === null ? "echec" : "attente")
  const [recharge, setRecharge] = useState(0)
  const courant = useRef<{ prepare: Prepare | null; etat: string }>({ prepare: null, etat: "attente" })
  courant.current = { prepare, etat }
  const garde = useRef<ReturnType<typeof setTimeout> | null>(null)

  const echouer = (raison: string) => {
    if (garde.current !== null) { clearTimeout(garde.current); garde.current = null }
    if (courant.current.etat === "echec") return
    courant.current.etat = "echec"
    dire("[accessoires] page indisponible : " + messageHote(raison, []))
    setEtat("echec")
  }

  /** Messages de la page : prête (son numéro), mesure d'un filtre ; l'ouverture d'une fiche ne demande rien à l'app. */
  const recevoir = (corps?: any) => {
    if (corps === null || typeof corps !== "object") return
    const p = courant.current.prepare
    if (corps.genre === "prete") {
      if (p === null || "manque" in p || corps.jeton !== p.jeton || courant.current.etat === "echec") return
      if (garde.current !== null) { clearTimeout(garde.current); garde.current = null }
      courant.current.etat = "prete"
      dire(`[mesure] accessoires : page prête ${Date.now() - hote.current.depuis} ms`)
      setEtat("prete")
    } else if (corps.genre === "mesure") {
      const ms = corps.ms
      if (typeof ms !== "number" || !Number.isFinite(ms) || ms < SEUIL_JOURNAL_MS || hote.current.mesures >= MESURES_FILTRE_MAX) return
      hote.current.mesures++
      dire(`[mesure] accessoires filtre : de l'appui à l'image peinte ${Math.round(ms)} ms`)
    }
  }
  const recepteur = useRef(recevoir)
  recepteur.current = recevoir

  const pont = (ctrl: WebViewController): Promise<boolean> => {
    if (hote.current.pont !== null) return hote.current.pont
    hote.current.pont = (async () => {
      try {
        await ctrl.addScriptMessageHandler(PONT_ACCESSOIRES, (corps?: any) => recepteur.current(corps))
      } catch (e) {
        console.log("accessoires : messages non posés (" + e + ")")
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
            dire(`[accessoires] le processus de WebKit s'est arrêté (${hote.current.arrets} sur ${ARRETS_TOLERES + 1}) : page rechargée`)
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

  const charger = async (ctrl: WebViewController, p: Prepare) => {
    if ("manque" in p) return
    if (!(await pont(ctrl))) return echouer("les messages de la page n'ont pas pu être posés")
    await attendreAttache(ctrl)
    if (courant.current.prepare !== p) return
    hote.current.depuis = Date.now()
    let ok = false
    let cause = ""
    try {
      ok = await ctrl.loadHTML(p.html)
    } catch (e) {
      cause = String(e).slice(0, 160)
    }
    if (!etatDit) {
      etatDit = true
      dire(`[accessoires] loadHTML a rendu ${ok ? "vrai" : cause !== "" ? "une erreur" : "faux"}`)
    }
    if (!ok && courant.current.prepare === p) echouer(cause ? `loadHTML a levé (${cause})` : "la page ne s'est pas chargée (loadHTML a rendu faux)")
  }

  // Préparation : après la première image de l'écran (minuterie), une fois par ouverture ; l'écran resté monté au retour
  // (pile de la Boutique) ne relit qu'à une nouvelle ouverture, et seulement si la boutique lue a changé.
  const preparePour = useRef<{ shop: unknown } | null>(null)
  useEffect(() => {
    if (c === null) return
    // Après un manque (réseau en échec, rien en cache), une nouvelle ouverture réessaie, même boutique.
    const manquait = courant.current.prepare !== null && "manque" in courant.current.prepare
    if (preparePour.current !== null && preparePour.current.shop === shop && !manquait) return
    preparePour.current = { shop }
    if (manquait) {
      courant.current = { prepare: null, etat: "attente" }
      setPrepare(null)
      setEtat("attente")
    }
    let vivant = true
    const t = setTimeout(() => {
      preparer(shop).then((p) => {
        if (!vivant) return
        courant.current = { prepare: p, etat: "attente" }
        setEtat("attente")
        setPrepare(p)
      }, (e) => {
        if (!vivant) return
        dire("[accessoires] page indisponible : " + messageHote(String(e), []))
        courant.current = { prepare: { manque: true }, etat: "attente" }
        setPrepare({ manque: true })
      })
    }, 0)
    return () => {
      vivant = false
      clearTimeout(t)
      if (preparePour.current !== null && preparePour.current.shop === shop && courant.current.prepare === null) preparePour.current = null
    }
  }, [ouverture])
  useEffect(() => {
    if (c === null || prepare === null || "manque" in prepare) return
    const g = setTimeout(() => {
      if (garde.current === g) garde.current = null
      echouer(`la page ne s'est pas dite prête en ${DELAI_PRETE_MS} ms`)
    }, DELAI_PRETE_MS)
    garde.current = g
    hote.current.depuis = 0
    let relances = 0
    let ch: ReturnType<typeof setTimeout> | null = null
    const surChien = () => {
      ch = null
      if (courant.current.prepare !== prepare || courant.current.etat !== "attente") return
      const ecoule = hote.current.depuis === 0 ? 0 : Date.now() - hote.current.depuis
      if (ecoule < CHIEN_ACCESSOIRES_MS) {
        if (relances++ < 20) ch = setTimeout(surChien, hote.current.depuis === 0 ? CHIEN_ACCESSOIRES_MS : Math.max(1, CHIEN_ACCESSOIRES_MS - ecoule))
        return
      }
      if (hote.current.essais >= REMONTAGES_MAX) return echouer(`page pas prête après ${REMONTAGES_MAX} remontages de la vue web`)
      let neuf: WebViewController
      try {
        neuf = new WebViewController({ ephemeral: true })
        garderNavigation(neuf, "accessoires")
      } catch (e) {
        return echouer("page pas prête, vue web impossible à refaire (" + String(e).slice(0, 120) + ")")
      }
      hote.current.essais++
      dire(`[accessoires] page pas prête après ${ecoule} ms : vue remontée avec un contrôleur neuf (essai ${hote.current.essais})`)
      const ancien = hote.current.c
      hote.current.c = neuf
      hote.current.pont = null
      try { ancien?.dispose() } catch { /* déjà libéré : rien */ }
      setRecharge((n) => n + 1)
    }
    ch = setTimeout(surChien, CHIEN_ACCESSOIRES_MS)
    charger(hote.current.c ?? c, prepare)
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

  const prete = etat === "prete"
  const manque = prepare !== null && "manque" in prepare
  const message = manque ? MESSAGE_RESEAU : etat === "echec" ? MESSAGE_INDISPONIBLE : null
  const vue = hote.current.c
  const plein = { maxWidth: "infinity", maxHeight: "infinity" } as const
  return (
    <ZStack frame={plein} background={COULEURS.standard.fond} navigationTitle="Accessoires" navigationBarTitleDisplayMode="inline">
      {vue !== null && !manque ? (
        // Tickets 4.55c et 8.8 : la vue web et son conteneur aux modificateurs constants dès le premier rendu ; une clé neuve
        // seulement avec un contrôleur neuf (chien de garde).
        <VStack key={`accessoires-vue${hote.current.essais > 0 ? `-${hote.current.essais}` : ""}`} frame={plein}>
          <WebView controller={vue} />
        </VStack>
      ) : null}
      {vue !== null && !manque && !prete ? (
        <Rectangle key="accessoires-cache" fill={COULEURS.standard.fond} frame={plein} accessibilityHidden />
      ) : null}
      {message !== null ? (
        <Text foregroundStyle="secondaryLabel" multilineTextAlignment="center" padding={24}>
          {message}
        </Text>
      ) : !prete ? (
        <VStack spacing={8}>
          <ProgressView />
          {prepare === null ? <Text font="footnote" foregroundStyle="secondaryLabel">{MESSAGE_LECTURE}</Text> : null}
        </VStack>
      ) : null}
    </ZStack>
  )
}
