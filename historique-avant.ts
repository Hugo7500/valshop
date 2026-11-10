import type { BilanImport, EtatHistoriqueAvant, Indisponibilite } from "./importation"
import type { RaisonRefus } from "./parties"
import { ANNONCE_MS, nombreDeParties } from "./historique"

// Section « Ton historique d'avant » de la feuille Réglages des stats (entrée 5 de epic-stats-import ; EXPERIENCE.md, State
// Patterns, import ; maquette Reglages-stats) : ses textes, en hypothèse, et ses règles, tirés de l'état de l'import
// (importation.ts, etatDeLImport) et du suivi que l'onglet Stats tient de la lecture de cet état et du dernier appui
// (reglages.tsx, useHistoriqueAvant). Quand relire l'état, qui télécharge et lit tout le fichier (aRelire) ; ce que laisse
// un import fini (suiviApres) ; ce que montre la section, que la feuille ne fait qu'afficher (vueHistoriqueAvant) ; quand
// elle change d'elle-même, pour la minuterie de l'onglet (echeanceHistoriqueAvant) ; ce que dit VoiceOver à la fin
// (annonceImport), Scripting n'ayant aucune annonce : la valeur du Bouton principal, comme le bilan de Mettre à jour.
//
// Module pur : aucun import de « scripting », aucune lecture de fichier ; types seuls de importation.ts et parties.ts,
// valeurs de historique.ts (sous node, tests/resoudre-ts.ts). Les dates en toutes lettres sont celles de recap.ts
// (jourEnClair, periodeEnClair ; EXPERIENCE.md, Formats, Période), recopiées : l'importer chargerait metriques.ts avec la
// feuille.

/** Espace insécable, avant une unité ; espace fine insécable, séparateur des milliers (EXPERIENCE.md, Formats). */
const NBSP = " "
const FINE = " "

/** Le titre de la section, étiquette annoncée comme en-tête, comme Ton compte et Collecte. */
export const TITRE_HISTORIQUE_AVANT = "Ton historique d'avant"
/** Le Bouton principal de la section (EXPERIENCE.md, Component Patterns). */
export const BOUTON_IMPORT = "Importer mon historique"
/** La note sous le bouton, celle de la maquette Reglages-stats. */
export const NOTE_IMPORT = "Import unique. Seules tes données et des moyennes sont gardées ; une partie déjà présente n'est pas doublée."
/** La phrase pendant la lecture de l'état, à côté de l'indicateur d'activité. */
export const LECTURE_IMPORT = "Lecture du fichier d'import…"
/** La valeur VoiceOver du bouton pendant l'import, comme « Mise à jour lancée » sur Mettre à jour. */
export const IMPORT_LANCE = "Import lancé"
/** La raison sous le bouton, inactif pendant une mise à jour de l'onglet (DESIGN.md, Bouton principal, Inactif). */
export const RAISON_MISE_A_JOUR = "Mise à jour en cours"
/** Fichier absent : où le déposer, sans bouton. */
export const ABSENT = "Aucun fichier d'import : dépose-le dans iCloud Drive, dossier Scripting, puis rouvre les réglages."
/** Le message d'un appui arrêté par une écriture refusée (issue `stockage`). */
export const MESSAGE_STOCKAGE = "Import arrêté : enregistrement refusé sur l'iPhone. Rien n'est perdu, le bouton le reprend."

/** Un refus en clair : ce que le fichier ou l'historique empêche, et ce qu'il reste à faire. Rien n'est écrit. */
const REFUS: Record<RaisonRefus, string> = {
  sansNumero: "Import pas encore possible : touche Mettre à jour, qui prépare ton historique.",
  premiereInachevee: "Import pas encore possible : termine d'abord ta première collecte avec Mettre à jour.",
  autreCompte: "Import refusé : ce fichier est celui d'un autre compte Riot que celui connecté.",
  fichierRefuse: "Import refusé : fichier abîmé ou incomplet. Rien n'est écrit.",
  nAtteintPas: "Import refusé : le fichier s'arrête trop tôt pour rejoindre ton historique. Refais un export tracker.gg récent.",
}

/** Ce qui empêche de lire le fichier ou l'historique, en clair. Rien n'est écrit ; à l'ouverture suivante, l'état se relit (sauf une semaine illisible). */
const INDISPONIBLE: Record<Indisponibilite, string> = {
  compte: "Aucun compte Riot connecté : attends la prochaine lecture de la boutique.",
  icloud: "iCloud Drive est désactivé pour Scripting : active-le dans les Réglages de l'iPhone.",
  telechargement: "Fichier trouvé, mais pas encore téléchargé d'iCloud Drive : rouvre les réglages plus tard.",
  lecture: "Fichier ou historique illisible pour l'instant : rouvre les réglages plus tard.",
  semaines: "Une semaine de ton historique est illisible : l'import attend, rien n'est écrasé.",
}

// ─────────────────────────── nombres et dates ───────────────────────────


function milliers(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, FINE)
}

const MOIS: readonly string[] = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


function jourEnClair(jour: string, annee: boolean = true): string {
  const [a, m, j] = jour.split("-").map(Number)
  return `${j === 1 ? "1ᵉʳ" : String(j)} ${MOIS[m - 1]}${annee ? ` ${a}` : ""}`
}


function periodeEnClair(debut: string, fin: string): string {
  if (debut === fin) return `le ${jourEnClair(fin)}`
  return `du ${jourEnClair(debut, debut.slice(0, 4) !== fin.slice(0, 4))} au ${jourEnClair(fin)}`
}


function jourLocal(iso: string): string | null {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ─────────────────────────── phrases ───────────────────────────


function importees(ajoutees: number, parties: number): string {
  return `${nombreDeParties(ajoutees)} ${ajoutees > 1 ? "importées" : "importée"} sur ${milliers(parties)}`
}


function ajouteesEnClair(parties: number): string {
  return parties === 0 ? "aucune partie ajoutée" : `${nombreDeParties(parties)} ${parties > 1 ? "ajoutées" : "ajoutée"}`
}

/** La phrase d'un import en cours : avant la première avancée (fichier téléchargé, lu, préparé), puis après chaque lot. */
export function phraseEnCours(avancee: { ajoutees: number; parties: number } | null): string {
  return avancee === null ? "Import en cours : lecture du fichier…" : `Import en cours : ${importees(avancee.ajoutees, avancee.parties)}.`
}

/**
 * La phrase d'un état de l'import (EXPERIENCE.md, State Patterns ; textes en hypothèse) : absent, où déposer le fichier ;
 * prêt, ses parties et ses dates, et celles qu'il ajoute ; en cours ; interrompu, son avancée, que le même bouton reprend ;
 * fait, sa date et ses parties ; refusé, la raison en clair ; indisponible, la cause en clair.
 */
export function phraseEtat(e: EtatHistoriqueAvant): string {
  switch (e.etat) {
    case "absent":
      return ABSENT
    case "pret":
      return `Fichier trouvé dans iCloud Drive : ${nombreDeParties(e.fichier)} tracker.gg, ${periodeEnClair(e.periode.debut, e.periode.fin)}, `
        + `${e.parties > 0 ? `dont ${milliers(e.parties)} à ajouter` : e.fichier > 1 ? "toutes déjà gardées" : "déjà gardée"}.`
    case "enCours":
      return phraseEnCours(null)
    case "interrompu":
      return `Import interrompu : ${importees(e.ajoutees, e.parties)}. Le bouton le reprend là où il s'est arrêté.`
    case "fait": {
      const jour = jourLocal(e.quand)
      return `Import fait${jour === null ? "" : ` le ${jourEnClair(jour)}`} : ${ajouteesEnClair(e.parties)}.`
    }
    case "refuse":
      return REFUS[e.refus.raison]
    case "indisponible":
      return INDISPONIBLE[e.cause]
  }
}

// ─────────────────────────── suivi de l'onglet ───────────────────────────

/**
 * Le dernier appui qui n'a pas abouti, dit sous la section jusqu'au suivant : le marqueur de collecte tenu (`reessai`, en ms
 * depuis l'epoch, l'heure où il ne bloque plus ; null, une collecte de cette exécution), ou une écriture refusée.
 */
export type ArretImport = { issue: "collecte"; reessai: number | null } | { issue: "stockage" }

/**
 * Ce que l'onglet Stats tient de l'import (useHistoriqueAvant de reglages.tsx), feuille ouverte ou non : `etat`, le dernier
 * lu ou rendu par un appui (null : jamais lu) ; `lecture`, l'état se lit (etatDeLImport) ; `enCours`, l'import lancé par
 * l'appui tourne ; `avancee`, ses parties ajoutées sur celles du premier lancement, après chaque lot ; `arret`, le dernier
 * appui qui n'a pas abouti ; `bilan`, ce que dit VoiceOver de la fin du dernier import, jusqu'à `fin` (ms depuis l'epoch).
 */
export type SuiviImport = {
  etat: EtatHistoriqueAvant | null
  lecture: boolean
  enCours: boolean
  avancee: { ajoutees: number; parties: number } | null
  arret: ArretImport | null
  bilan: { annonce: string; fin: number } | null
}

/** Le suivi à l'ouverture de l'app : rien de lu, rien en cours. */
export const SUIVI_NEUF: SuiviImport = { etat: null, lecture: false, enCours: false, avancee: null, arret: null, bilan: null }

/**
 * L'état se relit-il à l'ouverture de la feuille ? Oui s'il n'a pas demandé la lecture entière du fichier et peut avoir
 * changé depuis : rien de lu ; absent (fichier déposé depuis) ; indisponible, sauf une semaine illisible (compte connu, iCloud
 * activé, fichier téléchargé, lecture qui repasse) ; refus de l'historique (Mettre à jour l'a numéroté, la première collecte
 * a fini). Non pour ce qui a lu le fichier en entier (prêt, interrompu, refus du fichier, semaine illisible), gardé jusqu'à un
 * appui ou une nouvelle ouverture de l'app, ni pour fait ou en cours.
 */
export function aRelire(etat: EtatHistoriqueAvant | null): boolean {
  if (etat === null) return true
  switch (etat.etat) {
    case "absent":
      return true
    case "indisponible":
      return etat.cause !== "semaines"
    case "refuse":
      return etat.refus.raison === "sansNumero" || etat.refus.raison === "premiereInachevee"
    default:
      return false
  }
}

/** L'heure de réessai d'un appui arrêté par le marqueur de collecte, s'il en a une : la minuterie décompte jusqu'à elle. */
export function reessaiDe(s: SuiviImport): number | null {
  return s.arret !== null && s.arret.issue === "collecte" ? s.arret.reessai : null
}

/**
 * Le message d'un appui qui n'a pas abouti, à `maintenant` : marqueur tenu par une collecte de cette exécution ; tenu ailleurs
 * (la collecte de ↻, ou un import ou une collecte coupés par Fermer), l'heure de réessai en minutes arrondies au-dessus,
 * jamais en secondes, puis plus rien à cette heure ; écriture refusée. null sans appui arrêté.
 */
export function messageArret(a: ArretImport | null, maintenant: number): string | null {
  if (a === null) return null
  if (a.issue === "stockage") return MESSAGE_STOCKAGE
  if (a.reessai === null) return "Import pas lancé : une mise à jour est en cours. Réessaie à sa fin."
  if (maintenant >= a.reessai) return null
  return `Import pas lancé : une mise à jour est en cours ou vient de s'arrêter. Réessaie dans ${Math.max(1, Math.ceil((a.reessai - maintenant) / 60_000))}${NBSP}min.`
}

/**
 * Ce que dit VoiceOver à la fin d'un import, sur le bouton, pendant ANNONCE_MS : fini, ses parties en tout ; arrêté avant
 * toute écriture, la phrase de l'état rendu ; écriture refusée ou marqueur tenu, leur message (à `maintenant`) ; déjà en cours.
 */
export function annonceImport(bilan: BilanImport, maintenant: number): string {
  switch (bilan.issue) {
    case "fait":
      return `Import terminé : ${ajouteesEnClair(bilan.parties)}`
    case "rienEcrit":
      return phraseEtat(bilan.etat)
    case "stockage":
      return MESSAGE_STOCKAGE
    case "collecte":
      return messageArret({ issue: "collecte", reessai: bilan.reessai }, maintenant) ?? "Import pas lancé : réessaie."
    case "dejaEnCours":
      return "Import déjà en cours"
  }
}

/**
 * Le suivi après l'issue `bilan` d'un appui, à `fin` : plus en cours ; fini, l'état fait (sa date, ses parties) ; arrêté
 * avant toute écriture, l'état rendu ; marqueur tenu ou écriture refusée, l'appui arrêté (après une écriture refusée,
 * l'appelant relit l'état : interrompu, ou prêt si le lancement n'a pas été gardé) ; le bilan dit jusqu'à fin + ANNONCE_MS.
 */
export function suiviApres(s: SuiviImport, bilan: BilanImport, fin: number): SuiviImport {
  const etat: EtatHistoriqueAvant | null = bilan.issue === "fait" ? { etat: "fait", quand: bilan.quand, parties: bilan.parties }
    : bilan.issue === "rienEcrit" ? bilan.etat : s.etat
  const arret: ArretImport | null = bilan.issue === "collecte" ? { issue: "collecte", reessai: bilan.reessai }
    : bilan.issue === "stockage" ? { issue: "stockage" } : null
  return { ...s, etat, enCours: false, avancee: null, arret, bilan: { annonce: annonceImport(bilan, fin), fin: fin + ANNONCE_MS } }
}

// ─────────────────────────── vue de la section ───────────────────────────

/**
 * Le Bouton principal « Importer mon historique » : `inactif` (DESIGN.md, Bouton principal, Inactif : sans fond, contour
 * `bordure`, libellé `texte-discret`) ; `enCours`, son indicateur d'activité ; `valeur`, ce que VoiceOver lit après le
 * libellé (« Import lancé », puis le bilan) ; `raison`, écrite dessous quand une mise à jour le rend inactif.
 */
export type BoutonImport = { inactif: boolean; enCours: boolean; valeur: string | undefined; raison: string | null }

/**
 * Ce que montre la section : `phrase`, sous son titre ; `lecture`, l'indicateur d'activité devant elle ; `bouton`, ou null
 * (aucun) ; `note`, celle de la maquette, avec le bouton ; `message`, celui d'un appui qui n'a pas abouti, ou null.
 */
export type VueHistoriqueAvant = { phrase: string; lecture: boolean; bouton: BoutonImport | null; note: boolean; message: string | null }

/**
 * La section, à `maintenant`, `miseAJour` vrai pendant une mise à jour de l'onglet : en cours, l'avancée, le bouton inactif
 * avec son indicateur et « Import lancé » ; en lecture (ou jamais lue), l'indicateur et « Lecture du fichier d'import… » ;
 * prêt ou interrompu, le bouton (inactif pendant une mise à jour, sa raison dessous) et la note ; sinon la phrase seule. Le
 * bilan d'un appui reste sur le bouton jusqu'à sa fin, le bouton inactif ces 10 s dans tous les cas, gardé si l'état n'en a
 * plus.
 */
export function vueHistoriqueAvant(s: SuiviImport, maintenant: number, miseAJour: boolean): VueHistoriqueAvant {
  const annonce = s.bilan !== null && maintenant < s.bilan.fin ? s.bilan.annonce : undefined
  const message = messageArret(s.arret, maintenant)
  const bilanSeul: BoutonImport | null = annonce === undefined ? null : { inactif: true, enCours: false, valeur: annonce, raison: null }
  if (s.enCours) {
    return { phrase: phraseEnCours(s.avancee), lecture: false, bouton: { inactif: true, enCours: true, valeur: IMPORT_LANCE, raison: null }, note: true, message: null }
  }
  if (s.lecture || s.etat === null) return { phrase: LECTURE_IMPORT, lecture: true, bouton: bilanSeul, note: false, message }
  const phrase = phraseEtat(s.etat)
  if (s.etat.etat === "pret" || s.etat.etat === "interrompu") {
    const inactif = miseAJour || annonce !== undefined
    return { phrase, lecture: false, bouton: { inactif, enCours: false, valeur: annonce, raison: miseAJour ? RAISON_MISE_A_JOUR : null }, note: true, message }
  }
  return { phrase, lecture: false, bouton: bilanSeul, note: false, message }
}

/**
 * Dans combien de millisecondes la section change d'elle-même, l'app ouverte : à la fin du bilan (`finBilan`, le bouton
 * peut alors partir) ; à chaque minute du décompte d'un appui arrêté par le marqueur (`reessai`), la dernière pile à
 * l'heure dite ; null : rien ne change seul. L'onglet Stats prend la plus proche de celle-ci et de la sienne.
 */
export function echeanceHistoriqueAvant(finBilan: number | null, reessai: number | null, maintenant: number): number | null {
  const delais: number[] = []
  if (finBilan !== null && finBilan > maintenant) delais.push(finBilan - maintenant)
  if (reessai !== null && reessai > maintenant) delais.push((reessai - maintenant) % 60_000 || 60_000)
  return delais.length === 0 ? null : Math.min(...delais)
}
