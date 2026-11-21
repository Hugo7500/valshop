// Le fichier du réglage des widgets, widgets.json (contrat-donnees.md), dans le dossier partagé : lu par le widget à chaque
// rendu, écrit par l'écran « Mes widgets » seulement. La forme et ses règles : widgets-reglage.ts (part pure).

import { contenuPositions, lirePositions, type Positions } from "./widgets-carrousel"
import { contenuReglage, lireReglage, type Reglage } from "./widgets-reglage"

export const REGLAGE_FILE = FileManager.appGroupDocumentsDirectory + "/widgets.json"

/** Le réglage gardé ; fichier absent ou illisible : aucun réglage (tous les widgets en « classique »). */
export function lireReglageGarde(): Reglage {
  try {
    return lireReglage(FileManager.existsSync(REGLAGE_FILE) ? FileManager.readAsStringSync(REGLAGE_FILE) : null)
  } catch {
    return lireReglage(null)
  }
}

/** Écrit le réglage : un temporaire, puis le remplacement, pour qu'une écriture coupée ne laisse jamais un fichier tronqué. */
export function ecrireReglage(r: Reglage): void {
  const temp = REGLAGE_FILE + ".tmp"
  FileManager.writeAsStringSync(temp, contenuReglage(r))
  if (FileManager.existsSync(REGLAGE_FILE)) FileManager.removeSync(REGLAGE_FILE)
  FileManager.renameSync(temp, REGLAGE_FILE)
}

/** Lot 3 : la position des carrousels (widgets-carrousel.ts), écrite par l'appui sur un bord d'un carrousel seulement. */
export const POSITIONS_FILE = FileManager.appGroupDocumentsDirectory + "/widget-carrousel.json"

/** Les positions gardées ; fichier absent ou illisible : aucune (chaque carrousel à sa première vue, ou à celle de l'heure). */
export function lirePositionsGardees(): Positions {
  try {
    return lirePositions(FileManager.existsSync(POSITIONS_FILE) ? FileManager.readAsStringSync(POSITIONS_FILE) : null)
  } catch {
    return {}
  }
}

/** Écrit les positions, comme le réglage : un temporaire, puis le remplacement. */
export function ecrirePositions(p: Positions): void {
  const temp = POSITIONS_FILE + ".tmp"
  FileManager.writeAsStringSync(temp, contenuPositions(p))
  if (FileManager.existsSync(POSITIONS_FILE)) FileManager.removeSync(POSITIONS_FILE)
  FileManager.renameSync(temp, POSITIONS_FILE)
}
