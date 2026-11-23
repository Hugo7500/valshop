import { traduire } from "./langue"
import {
  EnvironmentValuesReader, HStack, Text, VStack, ZStack,
  type VirtualNode,
} from "scripting"
import { createElement, Fragment } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import type { Emplacement, PropsEmplacement } from "./app"
import { ESPACES, TYPO, couleurs, type Palette } from "./design"
import { PileDeBlocs, creux } from "./design" // ticket 4.46 : blocs du sous-onglet dans une pile paresseuse
import {
  BarrePaire, Barres, Bloc, Legende, Tableau, colonnesChiffres, couleurEvaluation, sansMauvaiseCoupure,
  type Barre, type ItemLegende, type LigneTableau, type ValeurPaire,
} from "./dessin"
import {
  ACHATS_FACE_AUX_LOBBYS, MIN_OCCURRENCES, NOTE_ACHATS_LOBBYS, NOTE_STATS_ACHAT, TIRET, achatsParType, apresUnPistoletPerdu, depensePoche, depenses,
  manchesMarquantes, nombreEnClair, retenues,
  type ChiffreDepense, type ChiffrePoche, type CleDepense, type RaisonPoche, type RaisonDepense, type CleValeurAchat, type Evaluation, type LigneAchat, type ManchesMarquantes, type Mode,
} from "./metriques"

// Module du sous-onglet Économie de l'onglet Stats (entrée 28 de epic-stats-tableau-de-bord ; EXPERIENCE.md, Information
// Architecture : Économie ; Component Patterns : Bloc, Barre, Tableau, Barre paire, Légende, Chiffre ; State Patterns : Trop peu
// de parties, Groupe trop petit, Aucune partie dans la période ; Définitions des métriques : Types d'achat, Achat après un pistolet
// perdu, Manches marquantes, Dépenses, Évaluation ; Voice and Tone, Formats ; Accessibility Floor ; DESIGN.md ; maquette Economie).
// Son emplacement, EMPLACEMENT_ECONOMIE, sixième de la Barre de sous-onglets (entrée 18), reçoit de app.tsx PropsEmplacement : les
// données tenues, l'état du périmètre commun (entrée 17), un choix d'arrivée (aucun ne le vise) et `ouvrir`. De haut en bas, à 14
// l'un de l'autre, cinq Blocs : Victoires par type de manche (Barres) ; Tes stats selon l'achat (Tableau) ; Tes achats face à tes
// lobbys (Barres paires, Légende, l'achat forcé après un pistolet perdu) ; Manches marquantes (Chiffres) ; Dépenses (Chiffres, et la
// note de ce qu'ils comptent : ticket 4.47, valeurs de Riot, jamais une dépense). Types d'achat de ValShop
// (ta valeur d'équipement), jamais ceux de tracker.gg. Valeurs, écarts, couleurs et phrases tels que les rendent achatsParType,
// apresUnPistoletPerdu, manchesMarquantes et depenses de metriques.ts (entrée 10 ; écarts écrits par ecartDe, entrée 40), calculés
// une fois par périmètre et par données avec la sélection (`agregat` de l'état du périmètre), un calcul qui lève retirant ses blocs ;
// aucun écart ni aucune couleur recalculés ici. Briques de dessin.tsx (Bloc et son titre en capitales, entrée 42 ; Barres et Barre
// paire, entrée 13 ; Tableau et Légende, entrées 15 et 37), reprises telles quelles ; le Chiffre est celui de ce module (couleur
// d'évaluation, sous-texte facultatif), design.tsx n'ayant que celui des réglages. Sans état, sans lecture, requête ni écriture.
// Rendu jugé sur l'iPhone.
// Entrée 44 : une manche jouée avec l'arme gardée de la manche d'avant (typeDeManche de metriques.ts) a sa ligne à part, « Arme
// gardée », dans Victoires par type de manche et Tes stats selon l'achat (tes manches à toi) ; Tes achats face à tes lobbys compare
// par la valeur de l'équipement des deux côtés, armes gardées comprises, sous les noms courts des types, et sa note le dit.

// Caractères écrits par leur code : l'outil d'écriture les rendrait invisibles dans la source.
const NBSP = String.fromCharCode(0xa0)
const FINE = String.fromCharCode(0x202f)
const MOINS = String.fromCharCode(0x2212)

const ERS = String.fromCharCode(0x1d49, 0x02b3, 0x02e2)

/** Les titres des blocs (maquette) : toujours en capitales, quelle que soit leur longueur (Bloc, entrée 42 ; DESIGN.md, Typography). */
export const TITRE_VICTOIRES = "Victoires par type de manche"
export const TITRE_STATS = "Tes stats selon l'achat"
export const TITRE_ACHATS = "Tes achats face à tes lobbys"
export const TITRE_MARQUANTES = "Manches marquantes"
export const TITRE_DEPENSES = "Dépenses"
/** La phrase d'une période sans partie (EXPERIENCE.md, State Patterns), aux mots de la Vue d'ensemble et de Duels. */
export const SANS_PARTIE: Readonly<Record<Mode, string>> = {
  competition: "Aucune partie de compétition gardée dans cette période.",
  "non-classe": "Aucune partie non classée gardée dans cette période.",
  tout: "Aucune partie gardée dans cette période.",
}
/** Des parties dans la période, aucune des files à achat (escarmouche, deathmatch ; Files admises) : aucune économie comptée. */
export const SANS_ACHAT = "Aucune partie de cette période ne compte pour l'économie."
/** Des parties des files à achat, aucune manche typée (valeur d'équipement inconnue) : ni victoires par type, ni Tableau, ni parts. */
export const SANS_TYPE = "Aucune manche de cette période n'a de type d'achat."
/** Tes achats face à tes lobbys sans référence (Groupe trop petit : lobbys sur moins de 5 parties) : pourquoi toi seul. */
export const SANS_LOBBYS = "Trop peu de parties pour comparer à tes lobbys."
/**
 * La note des Dépenses (EXPERIENCE.md, Définitions des métriques, Dépenses ; tickets 4.47 et 4.54), deux phrases : ce que compte chaque
 * chiffre et face à qui ; quelles manches ta dépense compte (prouvées par deux sources : plan du ticket 4.54, mesure).
 */
export const MENTION_DEPENSE = "Ta dépense : les crédits sortis de ta poche à l'achat, armes payées pour un coéquipier comprises ; équipement : ce que tu tiens à la fin de l'achat, capacités comprises ; "
  + `crédits gardés : ce qui te reste après l'achat ; dégâts pour 1${FINE}000 crédits de cet équipement ; tes lobbys : les autres joueurs de tes parties, sur les mêmes parties. `
  + "Ta dépense ne compte que les manches vérifiées, où tes crédits, par les règles du jeu, redonnent la dépense que Riot te compte (ou partent d'un départ fixé, au pistolet et en prolongation), dans les parties qui ont la dépense de Riot par manche."
/**
 * Les en-têtes du Tableau (maquette ; Voice and Tone : « % tête » en en-tête de colonne) : la première colonne nomme le type ;
 * « K/D » glué après sa barre oblique (sansMauvaiseCoupure, entrée 19). Masqués à VoiceOver : chaque ligne dit sa phrase.
 */
export const COLONNES_TABLEAU: readonly string[] = ["", sansMauvaiseCoupure("K/D"), "% tête", `1${ERS} kills`, "Victoires"]

export const NOM_LOBBYS = "lobbys"
/** La Légende des Barres paires : ta barre pleine orange, la barre creuse cernée de bleu de tes lobbys (repères d'Agents). */
export const LEGENDE_ACHATS: readonly ItemLegende[] = [{ marque: "pastilleFaible", libelle: "Toi" }, { marque: "bande", libelle: "Tes lobbys" }]
/** Le sous-texte de « Sans perte » (Définitions des métriques ; Voice and Tone : « Sans perte », jamais « flawless », que la maquette écrit). */
export const SOUS_TEXTE_SANS_PERTE = "aucun mort de ton équipe"
/** Entre le libellé, la valeur et le sous-texte d'un Chiffre, en points (maquette, et Chiffre de design.tsx). */
const ECART_CHIFFRE = 2

/** Les valeurs du Tableau, dans l'ordre de ses colonnes, et leur nom dans une note. */
const VALEURS_TABLEAU: readonly CleValeurAchat[] = ["kd", "tete", "premiersKills", "victoires"]
const NOMS_VALEURS: Readonly<Record<CleValeurAchat, string>> = { kd: "K/D", tete: "tête", premiersKills: `1${ERS} kills`, victoires: "victoires" }
/** Ticket 4.47 : pourquoi un chiffre des Dépenses vaut « — » (RaisonDepense du module), écrit sous lui et dit par VoiceOver. */
export const RAISONS_DEPENSE: Readonly<Record<RaisonDepense, string>> = {
  nonGardees: "aucune partie ne garde ces valeurs pour chaque joueur",
  afk: "un joueur AFK retiré de ton lobby dans chaque partie",
  manquantes: "une valeur manque à une manche dans chaque partie",
}
/** Ticket 4.54 : pourquoi ta dépense vaut « — » (RaisonPoche du module), écrit sous elle et dit par VoiceOver. */
export const RAISONS_POCHE: Readonly<Record<RaisonPoche, string>> = {
  sansSecondeSource: "aucune partie n'a la dépense de Riot par manche",
  sansLobby: "un joueur AFK retiré de ton lobby dans chaque partie qui l'a",
  aucuneVerifiee: "aucune de tes manches n'est vérifiée",
}
/** Ticket 4.47 : une valeur sans référence (tes lobbys sur moins de 5 parties comparables). */
export const TROP_PEU_LOBBYS = "trop peu pour comparer à tes lobbys"

function surParties(n: number): string {
  return `sur ${nombreEnClair(n, 0)}${NBSP}partie${n >= 2 ? "s" : ""}`
}


export function surManchesVerifiees(n: number): string {
  return `sur ${nombreEnClair(n, 0)}${NBSP}manche${n >= 2 ? "s" : ""} vérifiée${n >= 2 ? "s" : ""}`
}

/** Ce que dit chaque chiffre des Dépenses : son nom en toutes lettres (Voice and Tone), l'unité de sa valeur. */
const DEPENSES_DITES: Readonly<Record<CleDepense, { dit: string; unite: string }>> = {
  equipement: { dit: "Équipement par manche", unite: " crédits" },
  restant: { dit: "Crédits gardés par manche", unite: " crédits" },
  degatsPour1000: { dit: `Dégâts pour 1${FINE}000 crédits d'équipement`, unite: "" },
}

// ─────────────────────────── textes ───────────────────────────

/** Une valeur écrite, dite par VoiceOver : « — » devient « aucune valeur ». */
function dite(texte: string): string {
  return texte === TIRET ? "aucune valeur" : texte
}


function manchesEcrites(n: number): string {
  return `${nombreEnClair(n, 0)} manche${n >= 2 ? "s" : ""}`
}


export function ecartDit(ecart: string): string {
  let t = ecart.endsWith(" vs lobby") ? `${ecart.slice(0, ecart.length - " vs lobby".length)} par rapport à tes lobbys` : ecart
  if (t.startsWith("+")) t = `plus ${t.slice(1)}`
  else if (t.startsWith(MOINS)) t = `moins ${t.slice(1)}`
  return t
}

/** Tes manches typées sur la sélection : la somme des manches des quatre types (aucune : SANS_TYPE). */
export function manchesTypees(lignes: readonly LigneAchat[]): number {
  let n = 0
  for (const l of lignes) n += l.manches
  return n
}






export function voixVictoires(l: LigneAchat): string {
  if (l.manches === 0) return `${l.libelle}, aucune manche.`
  const tete = `${l.libelle}, ${manchesEcrites(l.manches)}`
  const v = l.victoires, s = l.sommes.victoires
  if (v.valeur !== null) return `${tete} : ${v.texte} de victoires${l.precisions.victoires === null ? "" : ` ${l.precisions.victoires}`}.`
  if (s.den === 0) return `${tete} : issue des manches inconnue.`
  return `${tete} : ${nombreEnClair(s.num, 0)} victoire${s.num >= 2 ? "s" : ""} sur ${nombreEnClair(s.den, 0)}.`
}






export function barresVictoires(lignes: readonly LigneAchat[]): Barre[] {
  return lignes.map((l): Barre => {
    const s = l.sommes.victoires
    const part = l.victoires.valeur !== null ? l.victoires.valeur : s.den > 0 ? s.num / s.den : null
    return { libelle: l.effectif, valeur: l.victoires.texte, part, evaluation: l.victoires.evaluation, voix: voixVictoires(l) }
  })
}

/** Les lignes du Tableau : le type, puis K/D, tête, 1ᵉʳˢ kills par manche et victoires tels que le module les écrit ; sa phrase. */
export function lignesTableau(lignes: readonly LigneAchat[]): LigneTableau[] {
  return lignes.map((l): LigneTableau => ({ cellules: [l.libelle, l.kd.texte, l.tete.texte, l.premiersKills.texte, l.victoires.texte], voix: l.phrase }))
}


export function precisionsDites(lignes: readonly LigneAchat[], cles: readonly CleValeurAchat[]): string[] {
  const out: string[] = []
  for (const l of lignes) {
    const dites = cles.filter((k) => l.precisions[k] !== null).map((k) => `${NOMS_VALEURS[k]} ${l.precisions[k]}`)
    if (dites.length > 0) out.push(`${l.libelle} : ${dites.join(", ")}.`)
  }
  return out
}





export function baseArmeGardee(manches: number, connues: number): string {
  if (connues === 0) return "Arme gardée : aucune manche où ton arme est connue."
  return `Arme gardée : ${manchesEcrites(manches)} sur ${nombreEnClair(connues, 0)} où ton arme est connue.`
}

/**
 * La note du Tableau : celle du module (`NOTE_STATS_ACHAT`) ; la base de l'arme gardée ; puis, s'il paraît un « — », sa raison : moins de 5 manches du type,
 * aucune mort (K/D) ou aucune touche (tête) dans ces manches ; puis les valeurs écrites sur d'autres manches que leur ligne.
 */
export function noteTableau(lignes: readonly LigneAchat[]): string {
  let peu = false, sansMort = false, sansTouche = false
  for (const l of lignes) {
    for (const k of VALEURS_TABLEAU) {
      const v = k === "victoires" ? l.victoires : l[k]
      if (v.texte !== TIRET) continue
      if (l.manchesDe[k] < MIN_OCCURRENCES) peu = true
      else if (k === "kd") sansMort = true
      else if (k === "tete") sansTouche = true
    }
  }
  const raisons: string[] = []
  if (peu) raisons.push(`moins de ${MIN_OCCURRENCES} manches du type`)
  if (sansMort) raisons.push("aucune mort dans ces manches")
  if (sansTouche) raisons.push("aucune touche dans ces manches")
  const morceaux = [NOTE_STATS_ACHAT]
  const gardee = lignes.find((l) => l.type === "gardee")
  if (gardee !== undefined && gardee.manchesConnues !== null) morceaux.push(baseArmeGardee(gardee.manches, gardee.manchesConnues))
  if (raisons.length > 0) morceaux.push(`«${NBSP}${TIRET}${NBSP}» : ${raisons.join(", ou ")}.`)
  return [...morceaux, ...precisionsDites(lignes, VALEURS_TABLEAU)].map(traduire).join(" ")
}

/** La note de Victoires par type de manche : les victoires écrites sur d'autres manches que leur ligne ; aucune sinon. */
export function noteVictoires(lignes: readonly LigneAchat[]): string | null {
  const p = precisionsDites(lignes, ["victoires"])
  return p.length > 0 ? p.map(traduire).join(" ") : null
}

/** Une Barre paire à montrer : sa clé, son libellé, toi, la référence nommée (null : toi seul), sa phrase VoiceOver. */
export type PaireVue = { cle: string; libelle: string; toi: ValeurPaire; reference: (ValeurPaire & { nom: string }) | null; voix: string }








export function pairesAchats(lignes: readonly LigneAchat[]): PaireVue[] {
  const out: PaireVue[] = []
  for (const type of ACHATS_FACE_AUX_LOBBYS) {
    const l = lignes.find((x) => x.type === type)
    if (l === undefined || l.partValeur === null) continue
    const v = l.partValeur
    const toi = v.valeur !== null ? v.valeur : l.comparaisonPart.valeur
    out.push({
      cle: l.type,
      libelle: l.libelle,
      toi: { valeur: v.texte, part: toi },
      reference: l.partLobbys === null ? null : { nom: NOM_LOBBYS, valeur: l.partLobbys, part: l.comparaisonPart.reference },
      voix: `${l.libelle} : toi ${dite(v.texte)}${l.partLobbys === null ? "" : `, tes lobbys ${dite(l.partLobbys)}`}.`,
    })
  }
  return out
}

/**
 * Un Chiffre à montrer : sa clé, son libellé, sa valeur écrite, son sous-texte (null : aucun), l'évaluation de sa valeur (prise
 * seulement quand le sous-texte écrit la référence : DESIGN.md, Chiffre) et sa phrase VoiceOver.
 */
export type ChiffreVu = { cle: string; libelle: string; valeur: string; sousTexte: string | null; evaluation: Evaluation; voix: string }







export function chiffresMarquantes(m: ManchesMarquantes): ChiffreVu[] {
  return m.lignes.map((l): ChiffreVu => {
    const i = l.libelle.indexOf(" contre ")
    const libelle = i < 0 ? l.libelle : l.libelle.slice(0, i)
    const sousTexte = i >= 0 ? l.libelle.slice(i + 1) : l.cle === "sansPerte" ? SOUS_TEXTE_SANS_PERTE : null
    const nom = l.cle === "sansPerte" ? `${l.libelle}, ${SOUS_TEXTE_SANS_PERTE}` : l.libelle
    const combien = l.texte === TIRET ? "aucune valeur" : manchesEcrites(l.nombre)
    return { cle: l.cle, libelle, valeur: l.texte, sousTexte, evaluation: "neutre", voix: `${nom} : ${combien}.` }
  })
}








export function chiffresDepenses(ds: readonly ChiffreDepense[]): ChiffreVu[] {
  return ds.map((d): ChiffreVu => {
    const x = DEPENSES_DITES[d.cle]
    if (d.valeur === TIRET) {
      const raison = RAISONS_DEPENSE[d.raison ?? "manquantes"]
      return { cle: d.cle, libelle: d.libelle, valeur: d.valeur, sousTexte: raison, evaluation: "neutre", voix: `${x.dit} : aucune valeur, ${raison}.` }
    }
    const sur = surParties(d.sommes.parties)
    const sousTexte = d.ecart !== null ? `${d.ecart} · ${sur}` : `${sur}, ${TROP_PEU_LOBBYS}`
    return {
      cle: d.cle, libelle: d.libelle, valeur: d.valeur, sousTexte, evaluation: d.evaluation,
      voix: `${x.dit} : ${d.valeur}${x.unite} ${sur}, ${d.ecart !== null ? ecartDit(d.ecart) : TROP_PEU_LOBBYS}.`,
    }
  })
}







export function chiffrePoche(d: ChiffrePoche): ChiffreVu {
  if (d.valeur === TIRET) {
    const raison = RAISONS_POCHE[d.raison ?? "sansSecondeSource"]
    return { cle: "poche", libelle: d.libelle, valeur: d.valeur, sousTexte: raison, evaluation: "neutre", voix: `Ta dépense par manche : aucune valeur, ${raison}.` }
  }
  const sur = surManchesVerifiees(d.manches)
  return {
    cle: "poche", libelle: d.libelle, valeur: d.valeur, evaluation: "neutre",
    sousTexte: d.ecart !== null ? `${d.ecart} · ${sur}` : `${sur}, ${TROP_PEU_LOBBYS}`,
    voix: `Ta dépense par manche : ${d.valeur} crédits ${sur}, ${d.ecart !== null ? ecartDit(d.ecart) : TROP_PEU_LOBBYS}.`,
  }
}

/** La note des Dépenses, toujours (ticket 4.47) : elle dit aussi pourquoi les chiffres manquent tant qu'aucune partie n'a son économie. */
export function mentionDepense(ds: readonly ChiffreDepense[]): string | null {
  return ds.length === 0 ? null : MENTION_DEPENSE
}


export function rangeesDe(chiffres: readonly ChiffreVu[], n: number): ChiffreVu[][] {
  const r: ChiffreVu[][] = []
  for (let i = 0; i < chiffres.length; i += n) r.push(chiffres.slice(i, i + n))
  return r
}

/** Un calcul du module rattrapé : null s'il lève, dit en console (agrégat gardé avec la sélection : dit une fois). */
function attraper<T>(quoi: string, calcul: () => T): T | null {
  try {
    return calcul()
  } catch (e) {
    console.log(`économie : ${quoi} impossible (${e})`)
    return null
  }
}

// ─────────────────────────── vues ───────────────────────────

/** Une phrase en `corps`, à la couleur d'une évaluation (`texte-doux` neutre, comme la phrase d'un bloc vide), coupée entre les mots seulement. */
function Phrase({ texte, evaluation = "neutre" }: { texte: string; evaluation?: Evaluation }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => (
        <Text {...TYPO.corps} foregroundStyle={couleurEvaluation(couleurs(env.colorSchemeContrast), evaluation)}>
          {sansMauvaiseCoupure(texte)}
        </Text>
      )}
    </EnvironmentValuesReader>
  )
}

/** Un texte en note, invisible et masqué à VoiceOver : il donne à un Chiffre la hauteur du libellé ou du sous-texte d'un voisin. */
function vueFantome(cle: string, texte: string, c: Palette): VirtualNode {
  return (
    <Text key={cle} {...TYPO.note} foregroundStyle={c.texteDiscret} opacity={0} accessibilityHidden>
      {sansMauvaiseCoupure(texte)}
    </Text>
  )
}

/**
 * Un Chiffre (DESIGN.md, chiffre ; maquette) : un creux `fond`, marge de 10, à gauche, éléments à 2 : le libellé en note
 * `texte-discret`, la valeur en `valeur`, chiffres à chasse fixe, à la couleur de son évaluation si son sous-texte écrit la
 * référence (fort bleu, faible orange), en `texte` sinon ; le sous-texte en note `texte-doux`. Les libellés et sous-textes de ses
 * voisins de rangée, invisibles et masqués, alignent valeurs et sous-textes d'une case à l'autre ; toute la hauteur de la rangée.
 * Un seul élément VoiceOver, qui lit sa `voix`.
 */
function vueChiffre(ch: ChiffreVu, rangee: readonly ChiffreVu[], c: Palette): VirtualNode {
  const voisins = rangee.filter((v) => v.cle !== ch.cle)
  const sousTextes = rangee.some((v) => v.sousTexte !== null)
  const couleur = ch.sousTexte !== null && ch.evaluation !== "neutre" ? couleurEvaluation(c, ch.evaluation) : c.texte
  const fantomesSous: VirtualNode[] = []
  for (const v of voisins) if (v.sousTexte !== null) fantomesSous.push(vueFantome(v.cle, v.sousTexte, c))
  return (
    <VStack
      key={ch.cle}
      alignment="leading"
      spacing={ECART_CHIFFRE}
      padding={ESPACES.cellule}
      frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
      background={creux(c)}
      accessibilityElement
      accessibilityLabel={ch.voix}
    >
      <ZStack alignment="topLeading">
        {voisins.map((v) => vueFantome(v.cle, v.libelle, c))}
        <Text key="libelle" {...TYPO.note} foregroundStyle={c.texteDiscret}>
          {sansMauvaiseCoupure(ch.libelle)}
        </Text>
      </ZStack>
      <Text {...TYPO.valeur} monospacedDigit foregroundStyle={couleur}>
        {ch.valeur}
      </Text>
      {sousTextes ? (
        <ZStack alignment="topLeading">
          {fantomesSous}
          {ch.sousTexte !== null ? (
            <Text key="sous-texte" {...TYPO.note} foregroundStyle={c.texteDoux}>
              {sansMauvaiseCoupure(ch.sousTexte)}
            </Text>
          ) : null}
        </ZStack>
      ) : null}
    </VStack>
  )
}

/**
 * Une grille de Chiffres (DESIGN.md, Layout & Spacing : écart de 6) : 2 colonnes, une seule dès la première taille d'accessibilité ;
 * chaque rangée tenue à sa hauteur idéale, ses Chiffres à toute cette hauteur et à parts égales de la largeur ; un Chiffre seul sur
 * sa rangée en prend toute la largeur.
 */
function GrilleChiffres({ chiffres }: { chiffres: readonly ChiffreVu[] }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <VStack alignment="leading" spacing={ESPACES.grille} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            {rangeesDe(chiffres, colonnesChiffres(env.dynamicTypeSize)).map((r, i) => (
              <HStack key={i} alignment="top" spacing={ESPACES.grille} fixedSize={{ horizontal: false, vertical: true }}>
                {r.map((ch) => vueChiffre(ch, r, c))}
              </HStack>
            ))}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/**
 * Bloc « Victoires par type de manche » (maquette), coin bas : une Barre par type, dans l'ordre du jeu ; la note des victoires
 * écrites sur d'autres manches que leur ligne, s'il y en a. `vide` : la phrase à la place des Barres, titre gardé.
 */
function BlocVictoires({ lignes, vide }: { lignes: readonly LigneAchat[] | null; vide: string | null }) {
  const note = lignes !== null && vide === null ? noteVictoires(lignes) : null
  return (
    <Bloc titre={TITRE_VICTOIRES} coin="bas" vide={vide} note={note === null ? undefined : sansMauvaiseCoupure(note)}>
      {lignes !== null ? <Barres barres={barresVictoires(lignes)} /> : null}
    </Bloc>
  )
}

/** Bloc « Tes stats selon l'achat » (maquette), coin haut : le Tableau des quatre types, sa note dessous. */
function BlocStats({ lignes }: { lignes: readonly LigneAchat[] }) {
  return (
    <Bloc titre={TITRE_STATS} coin="haut" note={sansMauvaiseCoupure(noteTableau(lignes))}>
      <Tableau colonnes={COLONNES_TABLEAU} lignes={lignesTableau(lignes)} />
    </Bloc>
  )
}

/**
 * Bloc « Tes achats face à tes lobbys » (maquette), sans coin : les Barres paires éco, forcé, complet ; leur Légende dès qu'une
 * référence s'écrit, sinon pourquoi toi seul ; dessous, la phrase de l'achat forcé après un pistolet perdu, à la couleur de son
 * évaluation (maquette ; neutre en `texte-doux`), s'il a pu se calculer ; en note, ce que comparent les Barres paires : la valeur de
 * l'équipement, armes gardées comprises, comme pour tes lobbys (entrée 44).
 */
function BlocAchats({ lignes, pistolet }: { lignes: readonly LigneAchat[]; pistolet: { phrase: string; evaluation: Evaluation } | null }) {
  const paires = pairesAchats(lignes)
  const avecReference = paires.some((p) => p.reference !== null)
  return (
    <Bloc titre={TITRE_ACHATS} note={sansMauvaiseCoupure(NOTE_ACHATS_LOBBYS)}>
      {paires.map((p) => <BarrePaire key={p.cle} libelle={p.libelle} toi={p.toi} reference={p.reference} voix={p.voix} />)}
      {avecReference ? <Legende key="legende" items={LEGENDE_ACHATS} /> : <Phrase key="sans-lobbys" texte={SANS_LOBBYS} />}
      {pistolet !== null ? <Phrase key="pistolet" texte={pistolet.phrase} evaluation={pistolet.evaluation} /> : null}
    </Bloc>
  )
}

/** Bloc « Manches marquantes » (maquette), coin bas : quatre Chiffres sur deux colonnes, sans couleur. */
function BlocMarquantes({ marquantes }: { marquantes: ManchesMarquantes }) {
  return (
    <Bloc titre={TITRE_MARQUANTES} coin="bas">
      <GrilleChiffres chiffres={chiffresMarquantes(marquantes)} />
    </Bloc>
  )
}





function BlocDepenses({ chiffres, poche }: { chiffres: readonly ChiffreDepense[]; poche: ChiffrePoche | null }) {
  const mention = mentionDepense(chiffres)
  return (
    <Bloc titre={TITRE_DEPENSES} note={mention === null ? undefined : mention}>
      <GrilleChiffres chiffres={[...(poche === null ? [] : [chiffrePoche(poche)]), ...chiffresDepenses(chiffres)]} />
    </Bloc>
  )
}

// ─────────────────────────── le sous-onglet ───────────────────────────

/**
 * Économie dans son emplacement (PropsEmplacement de app.tsx), sur la sélection du périmètre commun ; sans état. Une pile à 14 :
 * Victoires par type de manche ; Tes stats selon l'achat ; Tes achats face à tes lobbys ; Manches marquantes ; Dépenses. Période
 * sans partie : Victoires seul, avec la phrase du mode ; des parties, aucune des files à achat : sa phrase ; aucune manche typée :
 * Victoires dit SANS_TYPE, sans Tableau ni Barres paires, Manches marquantes et Dépenses gardées ; sans sélection : rien. Calculs
 * gardés une fois par périmètre et par données (`agregat`), un calcul qui lève retirant ses blocs. Ni lecture, ni requête, ni écriture.
 */
export function Economie({ perimetre }: PropsEmplacement) {
  const sel = perimetre.selection
  const blocs: VirtualNode[] = []
  if (sel !== null) {
    if (sel.parties.length === 0) {
      blocs.push(<BlocVictoires key="victoires" lignes={null} vide={SANS_PARTIE[perimetre.perimetre.mode]} />)
    } else {
      const achats = perimetre.agregat("economie:achats", (s) => attraper("types d'achat", () => ({
        completes: retenues(s.parties, "completes").length, lignes: achatsParType(s),
      })))
      if (achats !== null && achats.completes === 0) {
        blocs.push(<BlocVictoires key="victoires" lignes={null} vide={SANS_ACHAT} />)
      } else {
        if (achats !== null && manchesTypees(achats.lignes) === 0) {
          blocs.push(<BlocVictoires key="victoires" lignes={null} vide={SANS_TYPE} />)
        } else if (achats !== null) {
          const pistolet = perimetre.agregat("economie:pistolet", (s) => attraper("achat après un pistolet perdu", () => apresUnPistoletPerdu(s)))
          blocs.push(
            <BlocVictoires key="victoires" lignes={achats.lignes} vide={null} />,
            <BlocStats key="stats" lignes={achats.lignes} />,
            <BlocAchats key="achats" lignes={achats.lignes} pistolet={pistolet} />,
          )
        }
        const marquantes = perimetre.agregat("economie:marquantes", (s) => attraper("manches marquantes", () => manchesMarquantes(s)))
        if (marquantes !== null) blocs.push(<BlocMarquantes key="marquantes" marquantes={marquantes} />)
        const lesDepenses = perimetre.agregat("economie:depenses", (s) => attraper("dépenses", () => depenses(s)))
        const laPoche = perimetre.agregat("economie:poche", (s) => attraper("ta dépense", () => depensePoche(s)))
        if (lesDepenses !== null) blocs.push(<BlocDepenses key="depenses" chiffres={lesDepenses} poche={laPoche} />)
      }
    }
  }
  return (
    <PileDeBlocs>
      {blocs}
    </PileDeBlocs>
  )
}

/** L'emplacement du sous-onglet Économie dans la Barre de sous-onglets (SOUS_ONGLETS de app.tsx) : rempli. */
export const EMPLACEMENT_ECONOMIE: Emplacement = Economie
