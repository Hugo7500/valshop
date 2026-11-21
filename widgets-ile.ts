// L'île dynamique de ValShop (lot 4 de l'étude des widgets) : quand un skin de la liste de souhaits est dans la boutique du jour,
// une activité en direct le dit dans l'île dynamique et sur l'écran verrouillé, avec le compte à rebours du reset. Part pure :
// elle tourne sous `node --test`. Ici : ce que l'activité montre, s'il faut la lancer, et les phrases de l'écran « Mes
// widgets ». Le lancement lui-même : widgets-ile-app.ts ; le dessin : live_activity.tsx.
// widget-ile.json (contrat-donnees.md) : `{ "v": 1, "reset": 1795000000000, "nom": "Oni Phantom", "id": "…", "etat": {…} }`,
// l'activité lancée pour la boutique du jour : une seule par boutique et par souhait, pour ne pas la relancer si on l'a
// balayée ; `etat` : ce qu'elle montre, redonné à iOS pour l'arrêter.

import type { Donnees } from "./widgets-types"
import { nomComplet } from "./widgets-verrou"


export type IleSouhait = { nom: string; prix: string | null; icone: string | null; reset: number; debut: number; fin: string; autres: number }

/**
 * L'activité gardée : celle lancée pour ce reset et ce skin ; `id` : son identifiant chez iOS, null s'il n'a pas été rendu ;
 * `etat` : ce qu'elle montre.
 */
export type IleGardee = { reset: number; nom: string; id: string | null; etat: IleSouhait }

/** Deux lectures de la même boutique donnent son reset à quelques secondes près : en dessous de cet écart, c'est le même. */
const MEME_RESET_MS = 10 * 60_000

/** En dessous d'une minute avant le reset, l'île n'a plus rien à dire. */
const MARGE_MS = 60_000

function heure(ms: number): string {
  const d = new Date(ms)
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0")
}

/** Ce que l'île doit montrer maintenant ; null sans souhait dans la boutique du jour, ou si son reset est passé ou inconnu. */
export function ileVoulue(d: Donnees | null, maintenant: number): IleSouhait | null {
  if (d === null || d.souhait === null || d.reset === null || d.reset <= maintenant + MARGE_MS) return null
  const s = d.souhait
  return {
    nom: nomComplet(s), prix: s.prix !== null ? String(s.prix).replace(/\B(?=(\d{3})+(?!\d))/g, " ") : null, icone: s.icone,
    reset: d.reset, debut: maintenant, fin: heure(d.reset), autres: Math.max(0, (d.souhaitsTrouves ?? 1) - 1),
  }
}

/** Faut-il lancer une activité pour `voulue` ? Non si celle gardée est déjà celle de ce reset et de ce skin. */
export function aLancer(voulue: IleSouhait, gardee: IleGardee | null): boolean {
  return gardee === null || Math.abs(gardee.reset - voulue.reset) >= MEME_RESET_MS || gardee.nom !== voulue.nom
}

const texteOuNull = (x: unknown): x is string | null => x === null || typeof x === "string"

/** L'état d'une activité, lu strictement ; null s'il n'a pas la forme attendue. */
function lireEtat(x: unknown): IleSouhait | null {
  if (typeof x !== "object" || x === null) return null
  const o = x as Record<string, unknown>
  const nombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
  if (typeof o.nom !== "string" || !texteOuNull(o.prix) || !texteOuNull(o.icone) || !nombre(o.reset) || !nombre(o.debut) || typeof o.fin !== "string" || !nombre(o.autres)) return null
  return { nom: o.nom, prix: o.prix, icone: o.icone, reset: o.reset, debut: o.debut, fin: o.fin, autres: o.autres }
}

/** L'activité gardée d'après le texte de widget-ile.json, lue strictement ; sans état lisible : le peu qu'on sait d'elle. */
export function lireIle(texte: string | null | undefined): IleGardee | null {
  if (!texte) return null
  try {
    const o = JSON.parse(texte)
    if (typeof o !== "object" || o === null || o.v !== 1 || typeof o.reset !== "number" || !Number.isFinite(o.reset) || typeof o.nom !== "string") return null
    const etat = lireEtat(o.etat) ?? { nom: o.nom, prix: null, icone: null, reset: o.reset, debut: o.reset - 1, fin: heure(o.reset), autres: 0 }
    return { reset: o.reset, nom: o.nom, id: typeof o.id === "string" && o.id !== "" ? o.id : null, etat }
  } catch {
    return null
  }
}

/** Contenu de widget-ile.json. */
export function contenuIle(g: IleGardee): string {
  return JSON.stringify({ v: 1, reset: g.reset, nom: g.nom, id: g.id, etat: g.etat })
}

/** Où en est l'île : ce que l'écran « Mes widgets » dit sous son réglage. */
export type EtatIle = "eteinte" | "lancee" | "en-cours" | "deja" | "rien" | "refusee" | "echec"

export const PHRASES_ILE: Readonly<Record<EtatIle, string>> = {
  eteinte: "",
  lancee: "Lancée : regarde l'île dynamique, ou ton écran verrouillé.",
  "en-cours": "Elle tourne déjà pour ton souhait du jour.",
  deja: "Déjà montrée aujourd'hui pour ce souhait.",
  rien: "Aucun de tes souhaits n'est dans la boutique d'aujourd'hui : rien à montrer pour l'instant.",
  refusee: "iOS a refusé : autorise les activités en direct de Scripting dans les Réglages de l'iPhone.",
  echec: "L'île n'a pas pu se lancer.",
}
