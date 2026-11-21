// Le fichier du résumé des stats pour les widgets, widget-stats.json (contrat-donnees.md), dans le dossier partagé, lu par les
// widgets de stats. Le calcul : widgets-resume.ts (part pure, les fonctions des écrans). Ici : quand l'écrire.
// - À l'ouverture de l'écran « Mes widgets » (assurerResume) : s'il manque, s'il est d'un autre compte, si les stats ont été mises
//   à jour depuis, s'il a plus de six heures, ou s'il date d'avant le lot 3 (sans constats) ; l'écran lit alors l'historique du compte, comme l'onglet Stats à son ouverture.
// - Par l'onglet Stats, après chaque lecture de ses données (ouverture, mise à jour), seulement si un widget de stats est réglé
//   (planifierResume) : sans widget de stats, l'onglet ne pose aucune minuterie et n'écrit rien de plus qu'avant.
// Le calcul part après un délai, l'écran d'abord ; un échec ne remonte pas (le widget garde le résumé d'avant, ou invite à
// ouvrir « Mes widgets »).

import { Widget } from "scripting"
import type { DonneesTableau } from "./collecte"
import type { Meta } from "./historique"
import { ecrireSur } from "./stockage"
import { lireReglageGarde } from "./widgets-fichier"
import { montreDesStats } from "./widgets-reglage"
import { preparerImagesStats } from "./widgets-images"
import type { ResumeStats } from "./widgets-lecture"
import { resumeStats, sansHeure } from "./widgets-resume"

export const STATS_WIDGET_FILE = FileManager.appGroupDocumentsDirectory + "/widget-stats.json"

/** Le temps laissé à l'onglet pour se dessiner avant le calcul du résumé. */
export const DELAI_RESUME_MS = 1_500

/**
 * Un widget de stats est-il réglé (widgets-reglage.ts, montreDesStats : un contenu de stats, un carrousel qui en montre un, ou
 * un widget de l'écran verrouillé) ? Sans lui, ni rechargement des widgets ni image demandée.
 */
export function widgetDeStatsRegle(): boolean {
  try {
    return montreDesStats(lireReglageGarde())
  } catch {
    return false
  }
}

/** Le résumé gardé, tel quel ; null s'il manque ou ne se lit pas. */
export function lireResumeGarde(): ResumeStats | null {
  try {
    if (!FileManager.existsSync(STATS_WIDGET_FILE)) return null
    const lu = JSON.parse(FileManager.readAsStringSync(STATS_WIDGET_FILE))
    return typeof lu === "object" && lu !== null && lu.v === 1 ? (lu as ResumeStats) : null
  } catch {
    return null
  }
}

type Entree = { meta: Pick<Meta, "puuid" | "derniereReussite">; donnees: Pick<DonneesTableau, "parties" | "rr" | "rang" | "ressources"> }

let attente: ReturnType<typeof setTimeout> | null = null

/**
 * Calcule le résumé et l'écrit s'il dit autre chose que celui gardé ; puis, si un widget de stats est réglé, recharge les
 * widgets et garde les images qui manquent. Rend vrai si le fichier a été écrit. Ne lève jamais.
 */
export async function ecrireResume(e: Entree): Promise<boolean> {
  let ecrit = false
  try {
    const resume = resumeStats({
      parties: e.donnees.parties, rr: e.donnees.rr, rang: e.donnees.rang, ressources: e.donnees.ressources,
      puuid: e.meta.puuid, derniereReussite: e.meta.derniereReussite, maintenant: Date.now(),
    })
    const garde = lireResumeGarde()
    if (garde === null || sansHeure(garde) !== sansHeure(resume)) {
      ecrireSur(STATS_WIDGET_FILE, JSON.stringify(resume))
      ecrit = true
    }
    if (ecrit) Widget.reloadAll()
    if (await preparerImagesStats(resume)) Widget.reloadAll()
  } catch (err) {
    console.log(`résumé des widgets : non écrit (${String(err).slice(0, 120)})`)
  }
  return ecrit
}

/** Au-delà de cet âge, le résumé est refait à l'ouverture de « Mes widgets » : ses périodes de 7 et 30 jours glissent avec le temps. */
export const AGE_RESUME_MS = 6 * 3_600_000

/**
 * À l'ouverture de « Mes widgets » : le résumé du compte connecté, refait s'il manque, s'il est d'un autre compte, si les stats
 * ont été mises à jour depuis, ou s'il a plus de AGE_RESUME_MS. Lit alors l'historique du compte (lireDonnees, comme l'onglet
 * Stats). Sans compte ou sans partie : rien. Rend vrai si le fichier a été écrit. Ne lève jamais.
 */
export async function assurerResume(): Promise<boolean> {
  try {
    const { lireCompte, lireMeta, nombreParties } = await import("./stockage")
    const id = lireCompte()
    if (id === null || nombreParties(id.puuid) === 0) return false
    const meta = lireMeta(id)
    const garde = lireResumeGarde()
    const maj = meta.derniereReussite === null ? NaN : Date.parse(meta.derniereReussite)
    const { empreinteCompte } = await import("./widgets-lecture")
    const bon = garde !== null && garde.compte === empreinteCompte(id.puuid) && garde.majA === (Number.isNaN(maj) ? null : maj)
      && typeof garde.ecritA === "number" && Date.now() - garde.ecritA < AGE_RESUME_MS && Date.now() >= garde.ecritA
      // Un résumé d'avant le lot 3 n'a pas les constats du chiffre du jour : refait.
      && Object.values(garde.periodes ?? {}).every((p) => Array.isArray(p?.constats))
    if (bon) return false
    const { lireDonnees } = await import("./collecte")
    const donnees = await lireDonnees(id.puuid, () => {})
    const resume = resumeStats({
      parties: donnees.parties, rr: donnees.rr, rang: donnees.rang, ressources: donnees.ressources,
      puuid: id.puuid, derniereReussite: meta.derniereReussite, maintenant: Date.now(),
    })
    ecrireSur(STATS_WIDGET_FILE, JSON.stringify(resume))
    return true
  } catch (err) {
    console.log(`résumé des widgets : non écrit (${String(err).slice(0, 120)})`)
    return false
  }
}

/**
 * Demande le résumé pour bientôt (DELAI_RESUME_MS) ; une demande plus récente remplace celle qui attend. Seulement si un widget
 * de stats est réglé : sinon rien n'est posé ni écrit.
 */
export function planifierResume(meta: Entree["meta"], donnees: Entree["donnees"]): void {
  try {
    if (!widgetDeStatsRegle()) return
    if (attente !== null) clearTimeout(attente)
    attente = setTimeout(() => {
      attente = null
      void ecrireResume({ meta, donnees })
    }, DELAI_RESUME_MS)
  } catch { /* sans minuterie : pas de résumé à cette lecture */ }
}
