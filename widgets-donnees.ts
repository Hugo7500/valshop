




import { deciderLecture, sessionExpiree } from "./garde-fou"
import { ETAT_FILE, SHOP_FILE, SOLDE_FILE, WISHLIST_FILE } from "./valshop"
import { contenuAppui, lireDonnees } from "./widgets-lecture"
import { langueDesNoms } from "./langue"
import type { Appui, Donnees } from "./widgets-types"

/** Le dernier appui sur ↻ depuis un widget (contrat-donnees.md) : état et heure, pour que le widget réponde à l'appui. */
export const APPUI_FILE = FileManager.appGroupDocumentsDirectory + "/widget-appui.json"

/** Le texte d'un fichier, ou null s'il manque ou ne se lit pas. */
function texte(chemin: string): string | null {
  try {
    return FileManager.existsSync(chemin) ? FileManager.readAsStringSync(chemin) : null
  } catch {
    return null
  }
}

/** La boutique gardée, en JSON ; null si elle manque ou ne se lit pas. */
function boutique(): unknown {
  const t = texte(SHOP_FILE)
  if (t === null) return null
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

/** Lot 2 : le skin et l'arme de chaque offre du jour, écrits par la lecture de la boutique (valshop.ts), pour le widget Souhaits. */
export const SOUHAITS_WIDGET_FILE = FileManager.appGroupDocumentsDirectory + "/widget-souhaits.json"
/** Lot 2 : le résumé des stats (widgets-stats-fichier.ts, qui l'écrit) et le compte connecté (stockage.ts). */
const STATS_WIDGET_FILE = FileManager.appGroupDocumentsDirectory + "/widget-stats.json"
const COMPTE_FILE = FileManager.appGroupDocumentsDirectory + "/stats/compte.json"

/** Les données des widgets ; null sans boutique gardée. `periode` : celle des stats de ce widget (widgets-reglage.ts). */
export function chargerDonnees(periode?: string): Donnees | null {
  return lireDonnees({
    shop: boutique(),
    solde: texte(SOLDE_FILE),
    appui: texte(APPUI_FILE),
    etat: texte(ETAT_FILE),
    offres: texte(SOUHAITS_WIDGET_FILE),
    liste: texte(WISHLIST_FILE),
    stats: texte(STATS_WIDGET_FILE),
    compte: texte(COMPTE_FILE),
    periode,
    anglais: langueDesNoms() === "en-US",
    maintenant: Date.now(),
    groupe: FileManager.appGroupDocumentsDirectory,
    existe: (chemin) => {
      try { return FileManager.existsSync(chemin) } catch { return false }
    },
  })
}

/** Note l'état d'un appui sur ↻ ; un échec d'écriture ne remonte pas (le widget ne dit alors rien). */
export function ecrireAppui(etat: Appui["etat"]): void {
  try {
    FileManager.writeAsStringSync(APPUI_FILE, contenuAppui(etat, Date.now()))
  } catch { /* sans réponse à l'appui */ }
}

/** Après une lecture demandée par ↻ : la boutique gardée est-elle celle du jour, session vivante ? */
export function issueAppui(): Appui["etat"] {
  const shop = boutique() as Parameters<typeof deciderLecture>[1]
  return shop && deciderLecture(Date.now(), shop) === "cache" && !sessionExpiree(texte(ETAT_FILE)) ? "a-jour" : "echec"
}
