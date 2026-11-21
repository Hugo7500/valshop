// Les images que les nouveaux widgets montrent en plus de celles de la boutique : les icônes des trois monnaies (VP, Radianite,
// Crédits Kingdom), gardées une fois dans le dossier partagé, à l'ouverture de l'écran « Mes widgets » (au premier plan). Source :
// media.valorant-api.com, le CDN public dont viennent déjà les icônes des skins ; aucune requête à Riot, aucun en-tête, aucune
// donnée du compte. Mêmes règles que les icônes de la boutique (valshop.ts, cacheIcon) : adresse admise, réponse d'un genre
// image, taille bornée. Un échec ne remonte pas : les prix s'affichent alors sans icône.

import { fetch } from "scripting"
import { DEVISE_KC, DEVISE_VP } from "./prix-retenus"
import { BORNE_IMAGE, imageAdmise, tailleAdmise, tailleAnnoncee } from "./securite"
import { DEVISE_RADIANITE } from "./solde"
import { CATALOG, SHOP_FILE } from "./valshop"
import { SOUHAITS_WIDGET_FILE } from "./widgets-donnees"
import { cheminAgent, cheminFond, cheminMonnaie, cheminPortrait, contenuOffres, uuidJeu, type ResumeStats } from "./widgets-lecture"

const MONNAIES: readonly { cle: "vp" | "rp" | "kc"; id: string }[] = [
  { cle: "vp", id: DEVISE_VP }, { cle: "rp", id: DEVISE_RADIANITE }, { cle: "kc", id: DEVISE_KC },
]

/**
 * Ce que l'écran « Mes widgets » prépare à son ouverture : les icônes des monnaies qui manquent, puis (lot 2) les offres du widget
 * Souhaits, le résumé des stats et ses images ; rend vrai si quelque chose vient d'être écrit (les aperçus sont alors relus). Ne
 * lève jamais.
 */
export async function preparerImages(): Promise<boolean> {
  const offres = preparerOffres()
  const monnaies = (await preparerMonnaies()) || offres
  // Le résumé des stats du compte connecté, refait s'il le faut (widgets-stats-fichier.ts) ; chargé ici seulement : il lit l'historique.
  let refait = false
  try {
    refait = await (await import("./widgets-stats-fichier")).assurerResume()
  } catch { /* sans résumé : les widgets de stats le disent */ }
  let resume: ResumeStats | null = null
  try {
    const chemin = FileManager.appGroupDocumentsDirectory + "/widget-stats.json"
    const lu = FileManager.existsSync(chemin) ? JSON.parse(FileManager.readAsStringSync(chemin)) : null
    resume = typeof lu === "object" && lu !== null && lu.v === 1 ? (lu as ResumeStats) : null
  } catch { /* sans résumé : pas d'image de stats */ }
  return (await preparerImagesStats(resume)) || monnaies || refait
}

/**
 * Lot 2 : les offres du jour du widget Souhaits (widget-souhaits.json), écrites ici d'après le catalogue gardé quand la boutique
 * gardée a été lue avant que la lecture ne les écrive elle-même (valshop.ts) : sans cela, le widget Souhaits montrerait la
 * boutique jusqu'à la lecture suivante. Aucune requête. Rend vrai si le fichier vient d'être écrit.
 */
function preparerOffres(): boolean {
  try {
    if (!FileManager.existsSync(SHOP_FILE)) return false
    const shop = JSON.parse(FileManager.readAsStringSync(SHOP_FILE))
    const boutique = shop?.updatedAt
    if (typeof boutique !== "string") return false
    if (FileManager.existsSync(SOUHAITS_WIDGET_FILE)) {
      const lu = JSON.parse(FileManager.readAsStringSync(SOUHAITS_WIDGET_FILE))
      if (lu?.v === 1 && lu.boutique === boutique) return false
    }
    if (!FileManager.existsSync(CATALOG)) return false
    const catalogue = JSON.parse(FileManager.readAsStringSync(CATALOG))
    FileManager.writeAsStringSync(SOUHAITS_WIDGET_FILE, contenuOffres(shop, catalogue?.levels))
    return true
  } catch {
    return false // le widget Souhaits attendra la prochaine lecture de la boutique
  }
}

async function preparerMonnaies(): Promise<boolean> {
  const groupe = FileManager.appGroupDocumentsDirectory
  let neuves = false
  for (const m of MONNAIES) {
    const chemin = cheminMonnaie(groupe, m.cle)
    const adresse = `https://media.valorant-api.com/currencies/${m.id}/displayicon.png`
    try {
      if (FileManager.existsSync(chemin) || !imageAdmise(adresse)) continue
      if (!FileManager.existsSync(groupe + "/icons")) await FileManager.createDirectory(groupe + "/icons", true)
      const r = await fetch(adresse, { timeout: 15 })
      if (!r.ok) continue
      const annonce = tailleAnnoncee(r)
      if (annonce !== null && annonce > BORNE_IMAGE) continue
      const genre = r.headers?.get?.("content-type")
      if (typeof genre === "string" && genre !== "" && !genre.toLowerCase().startsWith("image/")) continue
      const octets = await r.data()
      if (!tailleAdmise(octets?.size, BORNE_IMAGE)) continue
      await FileManager.writeAsData(chemin, octets)
      neuves = true
    } catch { /* cette icône manquera : le prix s'affiche sans elle */ }
  }
  return neuves
}








/** Demande l'image `adresse`, la réduit à `large` points de large (proportions gardées) et l'écrit à `chemin`. Vrai si elle vient d'être écrite. */
async function garderReduite(adresse: string, chemin: string, large: number, jpeg: boolean): Promise<boolean> {
  try {
    if (FileManager.existsSync(chemin) || !imageAdmise(adresse)) return false
    const dossier = FileManager.appGroupDocumentsDirectory + "/icons"
    if (!FileManager.existsSync(dossier)) await FileManager.createDirectory(dossier, true)
    const r = await fetch(adresse, { timeout: 20 })
    if (!r.ok) return false
    const annonce = tailleAnnoncee(r)
    if (annonce !== null && annonce > BORNE_IMAGE) return false
    const genre = r.headers?.get?.("content-type")
    if (typeof genre === "string" && genre !== "" && !genre.toLowerCase().startsWith("image/")) return false
    const octets = await r.data()
    if (!tailleAdmise(octets?.size, BORNE_IMAGE)) return false
    const image = UIImage.fromData(octets)
    if (!image || !(image.width > 0) || !(image.height > 0)) return false
    const l = Math.min(large, Math.round(image.width))
    const petite = image.preparingThumbnail({ width: l, height: Math.max(1, Math.round((l * image.height) / image.width)) })
    const reduits = petite ? (jpeg ? Data.fromJPEG(petite, 0.8) : Data.fromPNG(petite)) : null
    if (!reduits || !tailleAdmise(reduits.size, BORNE_IMAGE)) return false
    await FileManager.writeAsData(chemin, reduits)
    return true
  } catch {
    return false // cette image manquera : le widget s'affiche sans elle
  }
}

/**
 * Garde les images qui manquent aux widgets de stats pour ce résumé : l'icône de l'agent de chaque partie listée, pour la
 * dernière partie le portrait de son agent et l'image de sa carte, et pour chaque constat son portrait ou sa carte. Rend vrai si au moins une vient d'être écrite. Ne lève jamais.
 */
export async function preparerImagesStats(r: Pick<ResumeStats, "parties" | "derniere" | "periodes"> | null): Promise<boolean> {
  if (r === null) return false
  const groupe = FileManager.appGroupDocumentsDirectory
  const media = "https://media.valorant-api.com"
  let neuves = false
  const agents = new Set<string>()
  for (const p of [...(Array.isArray(r.parties) ? r.parties : []), r.derniere]) {
    const a = uuidJeu(p?.agent)
    if (a !== null) agents.add(a)
  }
  for (const a of agents) neuves = (await garderReduite(`${media}/agents/${a}/displayicon.png`, cheminAgent(groupe, a), 96, false)) || neuves
  const agent = uuidJeu(r.derniere?.agent), carte = uuidJeu(r.derniere?.carteId)
  if (agent !== null) neuves = (await garderReduite(`${media}/agents/${agent}/fullportrait.png`, cheminPortrait(groupe, agent), 520, false)) || neuves
  if (carte !== null) neuves = (await garderReduite(`${media}/maps/${carte}/splash.png`, cheminFond(groupe, carte), 640, true)) || neuves
  // Lot 3, le chiffre du jour : le portrait de l'agent et l'image de la carte de chaque constat (les mêmes d'une période à l'autre, le plus souvent).
  const portraits = new Set<string>(), fonds = new Set<string>()
  try {
    for (const p of Object.values(r.periodes ?? {})) {
      for (const c of Array.isArray(p?.constats) ? p.constats : []) {
        if (c?.type !== "agent" && c?.type !== "carte" && c?.type !== "carte-faible") continue
        const id = uuidJeu(c.id)
        if (id !== null) (c.type === "agent" ? portraits : fonds).add(id)
      }
    }
  } catch { /* constats illisibles : pas d'image pour eux */ }
  for (const a of portraits) neuves = (await garderReduite(`${media}/agents/${a}/fullportrait.png`, cheminPortrait(groupe, a), 520, false)) || neuves
  for (const c of fonds) neuves = (await garderReduite(`${media}/maps/${c}/splash.png`, cheminFond(groupe, c), 640, true)) || neuves
  return neuves
}
