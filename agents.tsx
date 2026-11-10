import {
  EnvironmentValuesReader, HStack, Spacer, Text, VStack, ZStack, type DynamicTypeSize, type VirtualNode,
} from "scripting"
import { createElement, Fragment, useState } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import type { Emplacement, PropsEmplacement } from "./app"
import { ESPACES, TYPO, couleurs, policeCondensee, tailleAccessibilite, type Palette } from "./design"
import { PileDeBlocs } from "./design" // ticket 4.46 : blocs du sous-onglet dans une pile paresseuse
import {
  BarrePaire, Barres, Bloc, Constat, Legende, PucesDeChoix, couleurEvaluation, sansMauvaiseCoupure,
  type Barre, type ItemLegende, type Puce, type ValeurPaire,
} from "./dessin"
import { colonnesChiffres } from "./vue-ensemble"
import type { NomsCapacites } from "./ressources"
import {
  ASSISTS_PAR_MANCHE, MIN_PARTIES_FICHE, TIRET, agentsJoues, capacitesAgent, comparer, constatAgent, faceATesAutresAgents, ficheAgent,
  nombreEnClair, valeurEnClair, victoiresParCarte,
  type AgentJoue, type CapacitesAgent, type ChiffreAgent, type CleChiffreAgent, type Comparaison, type Evaluation, type FicheAgent,
  type LigneAutresAgents, type Mode, type VictoiresCarte,
} from "./metriques"

// Module du sous-onglet Agents de l'onglet Stats (entrée 24 de epic-stats-tableau-de-bord ; EXPERIENCE.md, Information
// Architecture, Component Patterns : Puces de choix, Bloc, Chiffre, Barre, Barre paire, Légende, Constat ; State Patterns :
// Trop peu de parties, Groupe trop petit ; Définitions des métriques : Capacités, Profil de jeu ; Voice and Tone ;
// Accessibility Floor ; DESIGN.md ; maquette Agents). Son emplacement, EMPLACEMENT_AGENTS, troisième de la Barre de
// sous-onglets (entrée 18), reçoit de app.tsx les données tenues (parties, cumuls par agent, rôles du catalogue) et l'état du
// périmètre commun (entrée 17) ; aucun choix d'arrivée ne le vise. De haut en bas, à 14 l'un de l'autre : l'agent, par les
// Puces de choix (agents du périmètre, du plus joué au moins joué, effectif écrit) ; sa fiche (nom, rôle, parties, six
// Chiffres, premiers duels) ; Tes capacités face aux mêmes agents de tes lobbys (Barres paires), avec tes kills aux capacités,
// tes assists par manche avec l'agent et, tous agents, face à tes lobbys (le Point fort fréquent de la Vue d'ensemble, renvoi
// n° 6 de l'entrée 12, retrouvé ici) ; Face à tes autres agents (Barres paires) ; Victoires par carte avec l'agent (Barres) ;
// un Constat. Valeurs, textes et couleurs tels que les rendent agentsJoues, ficheAgent, capacitesAgent, comparer,
// faceATesAutresAgents, victoiresParCarte et constatAgent de metriques.ts (entrées 6 et 12), calculés une fois par périmètre,
// par données et par agent avec la sélection (`agregat` de l'état du périmètre), un calcul qui lève retirant son bloc ;
// briques de dessin.tsx (entrées 13, 15 et 37) reprises telles quelles ; le Chiffre est celui de ce module (valeur colorée
// quand son sous-texte écrit la référence, sauf écrites pareil : entrée 35 ; sous-texte facultatif), design.tsx n'ayant que
// celui des réglages ; le texte affiché passe par sansMauvaiseCoupure de dessin.tsx (entrée 19). Aucun écart
// écrit (valeurs et références seulement), aucune courbe. Sans lecture, requête ni écriture ; l'agent choisi est le seul
// état, jamais gardé. « Tes manches avec ultime » (analyse 11) n'est pas affichée : aucune source ne donne l'ultime de chaque manche. Rendu jugé sur l'iPhone.

// Caractères écrits par leur code : l'outil d'écriture les rendrait invisibles dans la source.
const NBSP = String.fromCharCode(0xa0)
/** Séparateur de deux morceaux (Formats : point médian, espace insécable avant lui). */
const SEP = `${NBSP}· `


export const NOM_PUCES = "Agent"
/** Les titres des blocs (maquette) ; le Bloc les écrit toujours en capitales (entrée 42 ; DESIGN.md, Typography). */
export const TITRE_CAPACITES = "Tes capacités"
export const TITRE_AUTRES = "Face à tes autres agents"

export const NOM_AUTRES = "autres agents"
/** Une Barre paire : la plus grande des deux valeurs aux trois quarts de la piste (maquette : de 50 à 75 %). */
export const PART_MAX_PAIRE = 0.75
/** La phrase d'un périmètre sans partie (EXPERIENCE.md, State Patterns), aux mots de la Vue d'ensemble. */
export const SANS_PARTIE: Readonly<Record<Mode, string>> = {
  competition: "Aucune partie de compétition gardée dans cette période.",
  "non-classe": "Aucune partie non classée gardée dans cette période.",
  tout: "Aucune partie gardée dans cette période.",
}
/** Des parties sans agent lisible (parties gardées malformées) : aucune puce. */
export const SANS_AGENT = "Aucune partie de cette période n'a d'agent."
/** Face à tes autres agents quand le périmètre n'a qu'un agent. */
export const SEUL_AGENT = "Aucun autre agent joué dans cette période."
/** Dans l'en-tête de la fiche, sous 3 parties de l'agent, où ses valeurs sont « — » (EXPERIENCE.md, Trop peu de parties). */
export const TROP_PEU = "trop peu de parties"
/** Sous la Note Valorant de la fiche, ta moyenne de compétition (maquette). */
const MOYENNE = "moyenne"
/** Chiffre (DESIGN.md, chiffre ; maquette) : écart entre libellé, valeur et sous-texte. */
const ECART_CHIFFRE = 2
/** En-tête de la fiche : entre le nom et le détail sur une ligne ; l'un sous l'autre aux tailles d'accessibilité. */
const ECART_EN_TETE = { ligne: 10, pile: 4 } as const

/** Le nom dit de chaque Chiffre de la fiche (Voice and Tone : chaque abréviation dite). */
const CHIFFRES_DITS: Readonly<Record<CleChiffreAgent, string>> = {
  victoires: "Victoires",
  kd: "Ratio kills sur morts",
  score: "Score de combat",
  degats: "Dégâts par manche",
  tete: "Tirs à la tête",
  note: "Note Valorant",
  premiersKills: "Premiers kills par manche",
  premieresMorts: "Premières morts par manche",
  ratioPremiersDuels: "Ratio des premiers duels",
}
/** Le nom dit de chaque ligne de Face à tes autres agents. */
const AUTRES_DITS: Readonly<Record<LigneAutresAgents["cle"], string>> = {
  kd: "Ratio kills sur morts",
  score: "Score de combat",
  premieresMorts: "Premières morts par manche",
}

// ─────────────────────────── textes et valeurs ───────────────────────────

/** Un agent se reconnaît à son id, sans casse (comme metriques.ts). */
function cleAgent(id: string): string {
  return id.toLowerCase()
}


function partiesEcrites(n: number): string {
  return `${nombreEnClair(n, 0)} partie${n > 1 ? "s" : ""}`
}

/** Une valeur écrite, dite par VoiceOver : « — » devient « aucune valeur ». */
function dite(texte: string): string {
  return texte === TIRET ? "aucune valeur" : texte
}


export function pucesAgents(joues: readonly AgentJoue[]): Puce<string>[] {
  return joues.map((a) => ({ cle: a.id, libelle: a.libelle, parle: `${a.nom}, ${partiesEcrites(a.parties)}` }))
}

/** L'agent montré : celui choisi s'il est joué dans le périmètre (id sans casse), sinon le plus joué ; aucun sans agent joué. */
export function agentChoisi(joues: readonly AgentJoue[], choisi: string | null): AgentJoue | null {
  if (joues.length === 0) return null
  const k = choisi === null ? null : cleAgent(choisi)
  return joues.find((a) => cleAgent(a.id) === k) ?? joues[0]
}





export function enTeteFiche(f: FicheAgent): { ecrit: string; dit: string } {
  const morceaux: string[] = []
  if (f.role !== null) morceaux.push(f.role)
  morceaux.push(f.texteParties)
  if (f.mention !== null) morceaux.push(f.mention)
  else if (f.parties < MIN_PARTIES_FICHE) morceaux.push(TROP_PEU)
  return { ecrit: morceaux.join(SEP), dit: morceaux.join(", ") }
}

/**
 * Les parts d'une Barre paire sur une échelle commune : la plus grande des deux valeurs aux trois quarts de la piste, l'autre
 * à proportion ; une valeur absente : null (piste vide) ; les deux nulles : 0.
 */
export function partsPaire(toi: number | null, reference: number | null): { toi: number | null; reference: number | null } {
  const lisibles = [toi, reference].filter((x): x is number => typeof x === "number" && Number.isFinite(x))
  const max = Math.max(0, ...lisibles)
  const part = (x: number | null): number | null => {
    if (typeof x !== "number" || !Number.isFinite(x)) return null
    return max > 0 ? (x / max) * PART_MAX_PAIRE : 0
  }
  return { toi: part(toi), reference: part(reference) }
}

/** La phrase sous le titre de Tes capacités (maquette) ; sans aucune référence (Groupe trop petit), elle dit pourquoi. */
export function phraseCapacites(nom: string, avecReference: boolean): string {
  return avecReference
    ? `Utilisations par manche, face aux ${nom} de tes lobbys.`
    : `Utilisations par manche. Trop peu de ${nom} dans tes lobbys pour comparer.`
}

/** Le titre du bloc des cartes (maquette : « Victoires par carte avec Sage »). */
export function titreCartes(nom: string): string {
  return `Victoires par carte avec ${nom}`
}

/** Le bloc des cartes sans carte (l'agent joué seulement en deathmatch, en mode Tout). */
export function sansCarte(nom: string): string {
  return `Aucune partie de ${nom} dans cette période ne compte pour les victoires.`
}

/** Une Barre paire à montrer : sa clé, son libellé, toi, la référence nommée (null : toi seul), sa phrase VoiceOver. */
export type PaireVue = { cle: string; libelle: string; toi: ValeurPaire; reference: (ValeurPaire & { nom: string }) | null; voix: string }







export function pairesCapacites(c: CapacitesAgent, nom: string, noms: NomsCapacites | null = null): PaireVue[] {
  const ref = `${nom} de tes lobbys`
  return c.capacites.map((x) => {
    const parts = partsPaire(x.comparaison.valeur, x.comparaison.reference)
    const nomCapacite = noms !== null && typeof noms[x.cle] === "string" && noms[x.cle] !== "" ? noms[x.cle] : null
    const touche = nomCapacite === null ? x.touche : `${x.touche}${SEP}${nomCapacite}`
    const toucheDite = nomCapacite === null ? x.touche : `${x.touche}, ${nomCapacite}`
    const quoi = x.parManche ? `Capacité ${toucheDite}, par manche` : `Ultime ${toucheDite}, par partie`
    return {
      cle: x.cle,
      libelle: x.parManche ? touche : `${touche}, par partie`,
      toi: { valeur: x.texte, part: parts.toi },
      reference: x.reference !== null ? { nom: ref, valeur: x.reference, part: parts.reference } : null,
      voix: `${quoi} : toi ${dite(x.texte)}${x.reference !== null ? `, ${ref} ${x.reference}` : ""}.`,
    }
  })
}


export function pairesAutres(lignes: readonly LigneAutresAgents[]): PaireVue[] {
  return lignes.map((l) => {
    const parts = partsPaire(l.toi.valeur, l.autres.valeur)
    return {
      cle: l.cle,
      libelle: l.libelle,
      toi: { valeur: l.toi.texte, part: parts.toi },
      reference: { nom: NOM_AUTRES, valeur: l.autres.texte, part: parts.reference },
      voix: `${AUTRES_DITS[l.cle]} : toi ${dite(l.toi.texte)}, tes autres agents ${dite(l.autres.texte)}.`,
    }
  })
}

/** Toi dans une Légende de Barres paires : la pastille orange de 12 × 8, ta barre pleine. */
const LEGENDE_TOI: ItemLegende = { marque: "pastilleFaible", libelle: "Toi" }

/** La Légende de Tes capacités : « Toi », « Skye de tes lobbys » (rectangle cerné bleu, la barre creuse) ; aucune sans référence. */
export function legendeCapacites(c: CapacitesAgent, nom: string): ItemLegende[] {
  return c.capacites.some((x) => x.reference !== null) ? [LEGENDE_TOI, { marque: "bande", libelle: `${nom} de tes lobbys` }] : []
}

/** La Légende de Face à tes autres agents. */
export const LEGENDE_AUTRES: readonly ItemLegende[] = [LEGENDE_TOI, { marque: "bande", libelle: "Tes autres agents" }]

/**
 * Un Chiffre à montrer : sa clé, son libellé, sa valeur écrite, son sous-texte (null : aucun), l'évaluation de sa valeur
 * (prise seulement quand le sous-texte écrit la référence : DESIGN.md, Chiffre) et sa phrase VoiceOver.
 */
export type ChiffreVu = { cle: string; libelle: string; valeur: string; sousTexte: string | null; evaluation: Evaluation; voix: string }

/** Les Chiffres de la fiche (six, ou les premiers duels) : valeurs sans référence, en `texte` ; « moyenne » sous la Note écrite. */
export function chiffresFiche(liste: readonly ChiffreAgent[]): ChiffreVu[] {
  return liste.map((x): ChiffreVu => {
    const sousTexte = x.cle === "note" && x.valeur !== null ? MOYENNE : null
    return {
      cle: x.cle, libelle: x.libelle, valeur: x.texte, sousTexte, evaluation: "neutre",
      voix: `${CHIFFRES_DITS[x.cle]} : ${dite(x.texte)}${sousTexte !== null ? `, ${sousTexte}` : ""}.`,
    }
  })
}






function evaluationEcrite(evaluation: Evaluation, valeur: string, reference: string | null): Evaluation {
  return reference === null || reference === valeur ? "neutre" : evaluation
}








export function chiffresCapacites(c: CapacitesAgent, nom: string, assists: Comparaison | null): ChiffreVu[] {
  const k = c.killsCapacites
  const killsEcrits = k.texte !== TIRET
  const kills = killsEcrits ? nombreEnClair(k.kills, 0) : TIRET
  const surParties = killsEcrits ? `en ${partiesEcrites(k.parties)}` : null
  const a = c.assists
  const memes = a.reference !== null ? `${nom} de tes lobbys ${a.reference}` : null
  const r: ChiffreVu[] = [
    {
      cle: "killsCapacites", libelle: "Kills aux capacités", valeur: kills, sousTexte: surParties, evaluation: "neutre",
      voix: `Kills aux capacités : ${dite(kills)}${surParties !== null ? `, ${surParties}` : ""}.`,
    },
    {
      cle: "assists", libelle: "Assists / manche", valeur: a.texte, sousTexte: memes, evaluation: evaluationEcrite(a.comparaison.evaluation, a.texte, a.reference),
      voix: `Assists par manche avec ${nom} : ${dite(a.texte)}${memes !== null ? `, ${memes}` : ""}.`,
    },
  ]
  if (assists !== null) {
    const mesure = ASSISTS_PAR_MANCHE.mesure
    const valeur = valeurEnClair(assists.valeur, mesure)
    const reference = assists.reference !== null ? valeurEnClair(assists.reference, mesure) : null
    const lobbys = reference !== null ? `tes lobbys ${reference}` : null
    r.push({
      cle: "assistsTous", libelle: "Assists, tous agents", valeur, sousTexte: lobbys, evaluation: evaluationEcrite(assists.evaluation, valeur, reference),
      voix: `Assists par manche, tous tes agents : ${dite(valeur)}${lobbys !== null ? `, ${lobbys}` : ""}.`,
    })
  }
  return r
}






export function barreCarte(v: VictoiresCarte): Barre {
  const part = v.valeur !== null ? v.valeur : v.parties > 0 ? v.victoires / v.parties : null
  const quoi = v.valeur !== null
    ? `${v.texte} de victoires`
    : `${nombreEnClair(v.victoires, 0)} victoire${v.victoires > 1 ? "s" : ""} sur ${nombreEnClair(v.parties, 0)}`
  return { libelle: v.libelle, valeur: v.texte, part, evaluation: v.evaluation, voix: `${v.carte}, ${partiesEcrites(v.parties)} : ${quoi}.` }
}

/** Un calcul du module rattrapé : null s'il lève, dit en console (agrégat gardé avec la sélection : dit une fois). */
function attraper<T>(quoi: string, calcul: () => T): T | null {
  try {
    return calcul()
  } catch (e) {
    console.log(`agents : ${quoi} impossible (${e})`)
    return null
  }
}

// ─────────────────────────── vues ───────────────────────────

/** Un texte en `corps` `texte-doux` : une phrase d'état, à la place d'un bloc. */
function vuePhrase(cle: string, texte: string, c: Palette): VirtualNode {
  return (
    <Text key={cle} {...TYPO.corps} foregroundStyle={c.texteDoux}>
      {sansMauvaiseCoupure(texte)}
    </Text>
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
 * référence (fort bleu, faible orange), en `texte` sinon ; le sous-texte en note `texte-doux`. Les libellés et sous-textes de
 * ses voisines de rangée, invisibles et masqués, alignent valeurs et sous-textes d'une case à l'autre ; toute la hauteur de la
 * rangée. Un seul élément VoiceOver, qui lit sa `voix`.
 */
function vueChiffre(ch: ChiffreVu, rangee: readonly ChiffreVu[], c: Palette): VirtualNode {
  const voisines = rangee.filter((v) => v.cle !== ch.cle)
  const sousTextes = rangee.some((v) => v.sousTexte !== null)
  const couleur = ch.sousTexte !== null && ch.evaluation !== "neutre" ? couleurEvaluation(c, ch.evaluation) : c.texte
  const fantomesSous: VirtualNode[] = []
  for (const v of voisines) if (v.sousTexte !== null) fantomesSous.push(vueFantome(v.cle, v.sousTexte, c))
  return (
    <VStack
      key={ch.cle}
      alignment="leading"
      spacing={ECART_CHIFFRE}
      padding={ESPACES.cellule}
      frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
      background={c.fond}
      accessibilityElement
      accessibilityLabel={ch.voix}
    >
      <ZStack alignment="topLeading">
        {voisines.map((v) => vueFantome(v.cle, v.libelle, c))}
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
 * Une grille de Chiffres (DESIGN.md, Layout & Spacing : Chiffres en 3 colonnes ; 2 dès la première taille d'accessibilité,
 * 1 dès la troisième, comme les tuiles), à 6 l'un de l'autre et d'une rangée à l'autre ; chaque rangée tenue à sa hauteur
 * idéale, ses cases à toute cette hauteur et à parts égales de la largeur, une rangée incomplète gardant ses colonnes.
 */
function vueGrille(cle: string, chiffres: readonly ChiffreVu[], c: Palette, taille: DynamicTypeSize | undefined): VirtualNode {
  const n = colonnesChiffres(taille)
  const rangees: ChiffreVu[][] = []
  for (let i = 0; i < chiffres.length; i += n) rangees.push(chiffres.slice(i, i + n))
  return (
    <VStack key={cle} alignment="leading" spacing={ESPACES.grille} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      {rangees.map((r, i) => {
        const vides: VirtualNode[] = []
        for (let j = r.length; j < n; j++) vides.push(<VStack key={`vide-${j}`} frame={{ maxWidth: "infinity" }} accessibilityHidden />)
        return (
          <HStack key={i} alignment="top" spacing={ESPACES.grille} fixedSize={{ horizontal: false, vertical: true }}>
            {r.map((ch) => vueChiffre(ch, r, c))}
            {vides}
          </HStack>
        )
      })}
    </VStack>
  )
}

/**
 * L'en-tête de la fiche (maquette) : le nom de l'agent en `nom` condensé, en capitales, annoncé comme en-tête, jamais coupé ;
 * à droite, en petit `texte-discret`, le rôle, les parties et la mention (enTeteFiche), à la ligne au besoin, dit avec des
 * virgules ; l'un sous l'autre aux tailles d'accessibilité.
 */
function vueEnTete(f: FicheAgent, c: Palette, grand: boolean): VirtualNode {
  const detail = enTeteFiche(f)
  const nom = (
    <Text key="nom" {...policeCondensee(TYPO.nom)} foregroundStyle={c.texte} layoutPriority={1} accessibilityAddTraits="isHeader">
      {sansMauvaiseCoupure(f.nom)}
    </Text>
  )
  const texte = (
    <Text
      key="detail"
      {...TYPO.petit}
      foregroundStyle={c.texteDiscret}
      multilineTextAlignment={grand ? "leading" : "trailing"}
      accessibilityElement
      accessibilityLabel={detail.dit}
    >
      {sansMauvaiseCoupure(detail.ecrit)}
    </Text>
  )
  return grand ? (
    <VStack key="en-tete" alignment="leading" spacing={ECART_EN_TETE.pile}>
      {nom}
      {texte}
    </VStack>
  ) : (
    <HStack key="en-tete" alignment="firstTextBaseline" spacing={ECART_EN_TETE.ligne}>
      {nom}
      <Spacer />
      {texte}
    </HStack>
  )
}

/** Des Barres paires (dessin.tsx), une par paire, dans l'ordre reçu ; libellé et nom de la référence sans coupure dans un mot. */
function vuePaires(paires: readonly PaireVue[]): VirtualNode[] {
  return paires.map((p) => (
    <BarrePaire
      key={p.cle}
      libelle={sansMauvaiseCoupure(p.libelle)}
      toi={p.toi}
      reference={p.reference !== null ? { ...p.reference, nom: sansMauvaiseCoupure(p.reference.nom) } : null}
      voix={p.voix}
    />
  ))
}

/** Une Légende dont les libellés ne se coupent pas dans un mot (« KAY/O de tes lobbys »). */
function legendeAffichee(items: readonly ItemLegende[]): ItemLegende[] {
  return items.map((it) => ({ ...it, libelle: sansMauvaiseCoupure(it.libelle) }))
}

// ─────────────────────────── le sous-onglet ───────────────────────────

















export function Agents({ donnees, perimetre }: PropsEmplacement) {
  const [choisi, setChoisi] = useState<string | null>(null)
  const sel = perimetre.selection
  const mode = perimetre.perimetre.mode
  const roles = donnees.roles ?? null
  const avecParties = sel !== null && sel.parties.length > 0
  const joues = avecParties ? perimetre.agregat("agents:joues", (s) => attraper("agents joués", () => agentsJoues(s))) : null
  const a = joues !== null ? agentChoisi(joues, choisi) : null
  const id = a !== null ? a.id : ""
  const k = cleAgent(id)
  const fiche = a !== null ? perimetre.agregat(`agents:fiche:${k}`, (s) => attraper("fiche", () => ficheAgent(s, id, roles))) : null
  const capacites = a !== null
    ? perimetre.agregat(`agents:capacites:${k}`, (s) => attraper("capacités", () => capacitesAgent(s, donnees.cumuls, id)))
    : null
  const assists = a !== null ? perimetre.agregat("agents:assists", (s) => attraper("assists", () => comparer(s, ASSISTS_PAR_MANCHE))) : null
  const autres = a !== null ? perimetre.agregat(`agents:autres:${k}`, (s) => attraper("autres agents", () => faceATesAutresAgents(s, id))) : null
  const cartes = a !== null ? perimetre.agregat(`agents:cartes:${k}`, (s) => attraper("cartes", () => victoiresParCarte(s, id))) : null
  const constat = a !== null
    ? perimetre.agregat(`agents:constat:${k}`, (s) => attraper("constat", () => constatAgent(s, { historique: donnees.parties, cumuls: donnees.cumuls }, id)))
    : null
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const grand = tailleAccessibilite(env.dynamicTypeSize)
        const blocs: VirtualNode[] = []
        if (sel !== null && !avecParties) blocs.push(vuePhrase("phrase", SANS_PARTIE[mode], c))
        else if (joues !== null && a === null) blocs.push(vuePhrase("phrase", SANS_AGENT, c))
        if (joues !== null && a !== null) {
          const nom = a.nom
          blocs.push(<PucesDeChoix key="puces" nom={NOM_PUCES} puces={pucesAgents(joues)} choisie={a.id} onChoix={(x) => setChoisi(x)} />)
          if (fiche !== null) {
            blocs.push(
              <Bloc key="fiche" coin="bas">
                {vueEnTete(fiche, c, grand)}
                {vueGrille("chiffres", chiffresFiche(fiche.chiffres), c, env.dynamicTypeSize)}
                {vueGrille("premiers-duels", chiffresFiche(fiche.premiersDuels), c, env.dynamicTypeSize)}
              </Bloc>
            )
          }
          if (capacites !== null) {
            const legende = legendeCapacites(capacites, nom)
            blocs.push(
              <Bloc key="capacites" titre={TITRE_CAPACITES} coin="haut">
                <Text key="phrase" {...TYPO.corps} foregroundStyle={c.texteDoux}>
                  {sansMauvaiseCoupure(phraseCapacites(nom, legende.length > 0))}
                </Text>
                {vuePaires(pairesCapacites(capacites, nom, donnees.ressources?.capacites?.[id.toLowerCase()] ?? null))}
                {legende.length > 0 ? <Legende key="legende" items={legendeAffichee(legende)} /> : null}
                {vueGrille("chiffres", chiffresCapacites(capacites, nom, assists), c, env.dynamicTypeSize)}
              </Bloc>
            )
          }
          if (joues.length < 2) blocs.push(<Bloc key="autres" titre={TITRE_AUTRES} vide={SEUL_AGENT} />)
          else if (autres !== null) {
            blocs.push(
              <Bloc key="autres" titre={TITRE_AUTRES}>
                {vuePaires(pairesAutres(autres))}
                <Legende key="legende" items={LEGENDE_AUTRES} />
              </Bloc>
            )
          }
          if (cartes !== null) {
            blocs.push(
              <Bloc key="cartes" titre={sansMauvaiseCoupure(titreCartes(nom))} coin="bas" vide={cartes.length === 0 ? sansMauvaiseCoupure(sansCarte(nom)) : undefined}>
                {cartes.length > 0 ? <Barres barres={cartes.map(barreCarte)} /> : null}
              </Bloc>
            )
          }
          if (constat !== null) {
            const tire = constat.constats[0]
            blocs.push(tire !== undefined
              ? <Constat key="constat" genre={tire.genre} phrase={tire.phrase} />
              : vuePhrase("constat", constat.aucun ?? "", c))
          }
        }
        return (
          <PileDeBlocs>
            {blocs}
          </PileDeBlocs>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** L'emplacement du sous-onglet Agents dans la Barre de sous-onglets (SOUS_ONGLETS de app.tsx) : rempli. */
export const EMPLACEMENT_AGENTS: Emplacement = Agents
