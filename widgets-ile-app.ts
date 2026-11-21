// Le lancement de l'île dynamique (lot 4 de l'étude des widgets ; widgets-ile.ts : la part pure). L'activité en direct ne se lance
// que depuis l'app ouverte : après une lecture de la boutique au premier plan, à un changement de la liste de souhaits, et
// quand on allume son réglage dans « Mes widgets ». Réglage éteint (le défaut) : rien n'est lu de plus que widgets.json, rien
// n'est écrit, aucune minuterie. iOS arrête de lui-même une activité au bout de quelques heures ; elle dit donc l'heure du
// reset en clair, en plus du compte à rebours. Les appels à iOS (widgets-ile-ios.ts) et le dessin (live_activity.tsx) ne sont
// chargés qu'au moment de lancer, de lire ou d'arrêter une activité.

import { chargerDonnees } from "./widgets-donnees"
import { lireReglageGarde } from "./widgets-fichier"
import { aLancer, contenuIle, ileVoulue, lireIle, type EtatIle, type IleGardee } from "./widgets-ile"

const ILE_FILE = FileManager.appGroupDocumentsDirectory + "/widget-ile.json"

function gardee(): IleGardee | null {
  try {
    return lireIle(FileManager.existsSync(ILE_FILE) ? FileManager.readAsStringSync(ILE_FILE) : null)
  } catch {
    return null
  }
}

function oublier(): void {
  try {
    if (FileManager.existsSync(ILE_FILE)) FileManager.removeSync(ILE_FILE)
  } catch { /* elle sera relue telle quelle */ }
}

/** Arrête l'activité gardée ; rend vrai si elle n'est plus là (ou n'a jamais eu d'identifiant). Ne lève jamais. */
async function finir(g: IleGardee): Promise<boolean> {
  if (g.id === null) return true
  try {
    return await (await import("./widgets-ile-ios")).finir(g.id, g.etat)
  } catch {
    return false
  }
}

let enCours: Promise<EtatIle> | null = null
let encore = false

/** Réglage éteint : l'activité en cours, s'il y en a une, s'arrête, et sa trace s'efface (gardée si iOS refuse l'arrêt). */
export async function arreterIle(): Promise<void> {
  // Un lancement en cours finit d'abord : sinon il écrirait sa trace après cet arrêt.
  if (enCours !== null) {
    try { await enCours } catch { /* il ne lève pas */ }
  }
  const g = gardee()
  if (g !== null && (await finir(g))) oublier()
}

/**
 * Met l'île en accord avec la boutique gardée : la lance s'il y a un souhait en boutique et qu'elle n'a pas déjà été montrée
 * pour lui aujourd'hui ; l'arrête si la boutique n'en a plus. Rend où elle en est (widgets-ile.ts, PHRASES_ILE). Ne lève
 * jamais. Un appel arrivé pendant le travail (la liste de souhaits a encore changé) fait refaire une passe à la fin.
 */
export function assurerIle(): Promise<EtatIle> {
  if (enCours !== null) {
    encore = true
    return enCours
  }
  enCours = (async () => {
    let etat: EtatIle
    do {
      encore = false
      etat = await faire()
    } while (encore)
    return etat
  })().finally(() => { enCours = null })
  return enCours
}

async function faire(): Promise<EtatIle> {
  try {
    const g = gardee()
    if (lireReglageGarde().ile !== true) {
      if (g !== null && (await finir(g))) oublier()
      return "eteinte"
    }
    const voulue = ileVoulue(chargerDonnees(), Date.now())
    if (voulue === null) {
      if (g !== null && (await finir(g))) oublier()
      return "rien"
    }
    const ios = await import("./widgets-ile-ios")
    if (!aLancer(voulue, g)) return g && g.id !== null && (await ios.vivante(g.id)) ? "en-cours" : "deja"
    if (g !== null) await finir(g)
    if (!(await ios.permises())) return "refusee"
    const lancee = await ios.lancer(voulue)
    if (lancee === false) return "echec"
    FileManager.writeAsStringSync(ILE_FILE, contenuIle({ reset: voulue.reset, nom: voulue.nom, id: lancee.id, etat: voulue }))
    return "lancee"
  } catch {
    return "echec"
  }
}

/** Depuis l'onglet Boutique (lecture finie, liste de souhaits changée) : l'île suit, si son réglage est allumé ; sinon rien. */
export function planifierIle(): void {
  try {
    if (lireReglageGarde().ile !== true) return
  } catch {
    return
  }
  void assurerIle()
}
