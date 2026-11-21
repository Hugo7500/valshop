import {
  EnvironmentValuesReader, HStack, Text, VStack, ZStack,
  type Color, type DynamicTypeSize, type VirtualNode,
} from "scripting"
import { createElement, Fragment } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import type { Emplacement, PropsEmplacement } from "./app"
import { ESPACES, TYPO, couleurs, tailleAccessibilite, type Palette } from "./design"
import { PileDeBlocs, creux } from "./design" // ticket 4.46 : blocs du sous-onglet dans une pile paresseuse
import { Bloc, Constat, LEGENDE_CASES, Legende, Tableau, couleurEvaluation, sansMauvaiseCoupure, type LigneTableau } from "./dessin"
import {
  MIN_PARTIES_FICHE, TIRET, apresLaPose, constatAttaqueDefense, manchesParCote, nombreEnClair, parCarte, premiersDuelsParCote, retenues,
  type ApresLaPose, type ChiffreCote, type CleCote, type CompteCote, type Evaluation, type LigneCarte, type ManchesParCote, type Mode,
  type PremiersDuelsDuCote,
} from "./metriques"
import type { Cote } from "./reduction"

// Module du sous-onglet Attaque · défense de l'onglet Stats (entrée 29 de epic-stats-tableau-de-bord ; EXPERIENCE.md, Information
// Architecture : Attaque · défense ; Component Patterns : Bloc, Chiffre, Tableau, Case colorée, Légende, Constat ; State Patterns ;
// Définitions des métriques : Référence, Évaluation, Retakes, Après la pose ; Voice and Tone, Formats ; Accessibility Floor ;
// DESIGN.md ; maquette Attaque-defense). Son emplacement, EMPLACEMENT_ATTAQUE_DEFENSE, septième de la Barre de sous-onglets
// (entrée 18), reçoit de app.tsx PropsEmplacement : les données tenues, l'état du périmètre commun (entrée 17), un choix d'arrivée
// (aucun ne le vise) et `ouvrir`. De haut en bas, à 14 l'un de l'autre : le Bloc « Manches par côté » (tes manches gagnées et tes
// pistolets de chaque côté) ; le Bloc « Par carte » (Tableau en Cases colorées, sa Légende) ; le Bloc « Après la pose » (après une
// pose de ton équipe, Retakes, tes poses, tes désamorçages, tes kills après la pose) ; le Bloc « Premiers duels par côté » (tes
// 1ᵉʳˢ kills, tes 1ʳᵉˢ morts et ton ratio de chaque côté) ; le Constat de l'onglet. Valeurs, écarts et couleurs tels que les rendent
// manchesParCote, apresLaPose, premiersDuelsParCote (chiffreCote : stats d'équipe face à ta période précédente), parCarte et
// constatAttaqueDefense de metriques.ts (entrées 7 et 12) : l'écran n'écrit d'écart que le champ `ecart` du module, à la couleur
// de son champ `evaluation`, jamais recalculé (règle commune des écarts écrits, entrée 40). Calculés une fois par périmètre et
// par données avec la sélection (`agregat` de l'état du périmètre), un calcul qui lève retirant son bloc ; briques de dessin.tsx
// (Bloc, Tableau, Case colorée, Légende, Constat : entrées 13, 37 et 42) reprises telles quelles ; le Chiffre est celui de ce
// module (valeur colorée quand l'écart est écrit, repère et écart dessous), design.tsx n'ayant que celui des réglages. Sans
// lecture, requête ni écriture, sans état. Rendu jugé sur l'iPhone.

// Caractères écrits par leur code : l'outil d'écriture les rendrait invisibles dans la source.
const NBSP = String.fromCharCode(0xa0)
const MOINS = String.fromCharCode(0x2212)

const ERS = String.fromCharCode(0x1d49, 0x02b3, 0x02e2)
const RES = String.fromCharCode(0x02b3, 0x1d49, 0x02e2)

/** Les titres des blocs (maquette ; le premier, sans titre visible, prend son nom) : toujours en capitales (Bloc, entrée 42). */
export const TITRE_MANCHES = "Manches par côté"
export const TITRE_CARTES = "Par carte"
export const TITRE_POSE = "Après la pose"
export const TITRE_DUELS = "Premiers duels par côté"
/** La phrase d'un périmètre sans partie (EXPERIENCE.md, State Patterns), aux mots de la Vue d'ensemble. */
export const SANS_PARTIE: Readonly<Record<Mode, string>> = {
  competition: "Aucune partie de compétition gardée dans cette période.",
  "non-classe": "Aucune partie non classée gardée dans cette période.",
  tout: "Aucune partie gardée dans cette période.",
}
/** Des parties dans la période, aucune des files complètes (escarmouche, deathmatch) : aucun côté. */
export const SANS_COTE = "Aucune partie de cette période ne compte pour les côtés : ni l'escarmouche ni le deathmatch n'en ont."
/** Des parties des files complètes dont aucune ne dit le côté de ses manches. */
export const COTES_ILLISIBLES = "Aucune partie de cette période ne dit ses côtés."
/** Les en-têtes du Tableau de Par carte (maquette). */
export const COLONNES_CARTES: readonly string[] = ["Carte", "Attaque", "Défense"]
/** La note de Par carte : ce que dit une Case, puis ce que dit un « — » s'il en paraît un. */
export const NOTE_CARTES = "Part de tes manches gagnées de chaque côté."
export const NOTE_TIRET = `«${NBSP}${TIRET}${NBSP}» : moins de ${MIN_PARTIES_FICHE} parties sur la carte.`
/** Chiffre (DESIGN.md, chiffre ; maquette) : écart entre libellé, valeur, repère et écart. */
const ECART_CHIFFRE = 2

// ─────────────────────────── textes ───────────────────────────







export type ChiffreVu = { cle: string; libelle: string; valeur: string; repere: string | null; ecart: string | null; evaluation: Evaluation; voix: string }

/** Un chiffre de l'entrée 7 à l'écran : libellé écrit (casse de phrase, ordinal en exposant), repère de la maquette, nom dit. */
type DefChiffre = { libelle: string; repere: string | null; dit: string }

/** Les chiffres de l'entrée 7 tels que l'écran les nomme ; « Kills après pose » abrège comme la maquette, dit en entier. */
export const CHIFFRES_COTE: Readonly<Record<CleCote, DefChiffre>> = {
  manchesAttaque: { libelle: "Manches en attaque", repere: "gagnées", dit: "Manches gagnées en attaque" },
  manchesDefense: { libelle: "Manches en défense", repere: "gagnées", dit: "Manches gagnées en défense" },
  pistoletAttaque: { libelle: "Pistolets en attaque", repere: "gagnés", dit: "Pistolets gagnés en attaque" },
  pistoletDefense: { libelle: "Pistolets en défense", repere: "gagnés", dit: "Pistolets gagnés en défense" },
  premiersKillsAttaque: { libelle: `1${ERS} kills en attaque`, repere: "par manche", dit: "Premiers kills par manche en attaque" },
  premiersKillsDefense: { libelle: `1${ERS} kills en défense`, repere: "par manche", dit: "Premiers kills par manche en défense" },
  premieresMortsAttaque: { libelle: `1${RES} morts en attaque`, repere: "par manche", dit: "Premières morts par manche en attaque" },
  premieresMortsDefense: { libelle: `1${RES} morts en défense`, repere: "par manche", dit: "Premières morts par manche en défense" },
  ratioAttaque: { libelle: "Ratio en attaque", repere: null, dit: "Ratio des premiers duels en attaque" },
  ratioDefense: { libelle: "Ratio en défense", repere: null, dit: "Ratio des premiers duels en défense" },
  apresPose: { libelle: "Après une pose de ton équipe", repere: "manches gagnées", dit: "Manches gagnées après une pose de ton équipe" },
  killsApresPose: { libelle: "Kills après pose", repere: "par manche", dit: "Kills après la pose, par manche" },
  retakes: { libelle: "Retakes", repere: "manches gagnées en défense après une pose adverse", dit: "Retakes, manches gagnées en défense après une pose adverse" },
}

/** La référence d'un écart telle que l'écrit metriques.ts, puis telle que la dit VoiceOver (Voice and Tone : « par rapport à tes lobbys »). */
const REFERENCES_DITES: readonly (readonly [string, string])[] = [
  [" vs lobby", " par rapport à tes lobbys"],
  [" vs semaine d'avant", " par rapport à la semaine d'avant"],
  [" vs mois d'avant", " par rapport au mois d'avant"],
  [" vs acte d'avant", " par rapport à l'acte d'avant"],
]

const POINTS = new RegExp(`(\\d+)${NBSP}pts?(?!\\p{L})`, "gu")








export function ditEnClair(texte: string): string {
  if (texte === TIRET) return "aucune valeur"
  let t = texte
  for (const [ecrit, dit] of REFERENCES_DITES) {
    const i = t.indexOf(ecrit)
    if (i >= 0) {
      t = t.slice(0, i) + dit + t.slice(i + ecrit.length)
      break
    }
  }
  if (t.startsWith("+")) t = `plus ${t.slice(1)}`
  else if (t.startsWith(MOINS)) t = `moins ${t.slice(1)}`
  return t.replace(POINTS, (_tout: string, n: string) => `${n} point${Number(n) >= 2 ? "s" : ""}`)
}


export function partiesEcrites(n: number): string {
  return `${nombreEnClair(n, 0)} partie${n > 1 ? "s" : ""}`
}







export function chiffreVu(c: ChiffreCote): ChiffreVu {
  const d = CHIFFRES_COTE[c.cle]
  return {
    cle: c.cle, libelle: d.libelle, valeur: c.valeur, repere: d.repere, ecart: c.ecart, evaluation: c.evaluation,
    voix: `${d.dit} : ${ditEnClair(c.valeur)}${c.ecart === null ? "" : `, ${ditEnClair(c.ecart)}`}.`,
  }
}


export function compteVu(cle: "poses" | "desamorcages", c: CompteCote): ChiffreVu {
  const libelle = cle === "poses" ? "Tes poses" : "Tes désamorçages"
  const repere = c.parties > 0 ? `en ${partiesEcrites(c.parties)}` : null
  return { cle, libelle, valeur: c.texte, repere, ecart: null, evaluation: "neutre", voix: `${libelle} : ${ditEnClair(c.texte)}${repere === null ? "" : `, ${repere}`}.` }
}

/** Manches par côté : tes manches gagnées en attaque et en défense, puis tes pistolets de chaque côté (deux rangées de deux). */
export function chiffresManches(m: ManchesParCote): ChiffreVu[] {
  return [m.attaque, m.defense, m.pistoletAttaque, m.pistoletDefense].map((c) => chiffreVu(c))
}

/** Après la pose : après une pose de ton équipe et Retakes (`gagnees`), puis tes poses, tes désamorçages et tes kills après la pose (`comptes`). */
export function chiffresPose(a: ApresLaPose): { gagnees: ChiffreVu[]; comptes: ChiffreVu[] } {
  return {
    gagnees: [chiffreVu(a.apresPose), chiffreVu(a.retakes)],
    comptes: [compteVu("poses", a.poses), compteVu("desamorcages", a.desamorcages), chiffreVu(a.killsApresPose)],
  }
}

/** Premiers duels par côté : tes 1ᵉʳˢ kills, tes 1ʳᵉˢ morts, puis ton ratio, chacun en attaque puis en défense (trois rangées de deux). */
export function chiffresDuels(p: Readonly<Record<Cote, PremiersDuelsDuCote>>): ChiffreVu[] {
  return [p.attaque.premiersKills, p.defense.premiersKills, p.attaque.premieresMorts, p.defense.premieresMorts, p.attaque.ratio, p.defense.ratio]
    .map((c) => chiffreVu(c))
}





export function voixCarte(l: LigneCarte): string {
  const tete = `${l.carte}, ${partiesEcrites(l.parties)}`
  if (l.parties < MIN_PARTIES_FICHE) return `${tete} : pas de valeur sous ${MIN_PARTIES_FICHE} parties.`
  const cote = (texte: string, nom: string) => (texte === TIRET ? `aucune valeur ${nom}` : `${texte} ${nom}`)
  return `${tete} : manches gagnées, ${cote(l.attaque.texte, "en attaque")}, ${cote(l.defense.texte, "en défense")}.`
}


export function lignesCartes(lignes: readonly LigneCarte[]): LigneTableau[] {
  return lignes.map((l): LigneTableau => ({
    cellules: [l.libelle, { texte: l.attaque.texte, evaluation: l.attaque.evaluation }, { texte: l.defense.texte, evaluation: l.defense.evaluation }],
    voix: voixCarte(l),
  }))
}

/** La note de Par carte : ce que dit une Case, puis ce que dit un « — » quand une carte a moins de 3 parties. */
export function noteCartes(lignes: readonly LigneCarte[]): string {
  return lignes.some((l) => l.parties < MIN_PARTIES_FICHE) ? `${NOTE_CARTES} ${NOTE_TIRET}` : NOTE_CARTES
}

/** Colonnes d'une rangée de deux Chiffres (DESIGN.md, Layout & Spacing) : 2 ; 1 dès la première taille d'accessibilité. */
export function colonnesDeux(taille: DynamicTypeSize | undefined): number {
  return tailleAccessibilite(taille) ? 1 : 2
}

/**
 * Colonnes de la rangée de trois Chiffres d'Après la pose : 3 jusqu'à la taille par défaut ; 2 de xLarge à xxxLarge, où « désamorçages »
 * ne tiendrait plus dans un tiers de bloc et se couperait dans le mot (mesure CoreText) ; 1 dès la première taille d'accessibilité.
 */
export function colonnesTrois(taille: DynamicTypeSize | undefined): number {
  if (tailleAccessibilite(taille)) return 1
  return taille === "xLarge" || taille === "xxLarge" || taille === "xxxLarge" ? 2 : 3
}

/** Les deux côtés n'ont aucune manche lue (files complètes dont aucune partie ne dit ses côtés) : rien à montrer. */
export function cotesIllisibles(m: ManchesParCote): boolean {
  return m.attaque.sommes.den + m.defense.sommes.den === 0
}

/** Un calcul du module rattrapé : null s'il lève, dit en console (agrégat gardé avec la sélection : dit une fois). */
function attraper<T>(quoi: string, calcul: () => T): T | null {
  try {
    return calcul()
  } catch (e) {
    console.log(`attaque · défense : ${quoi} impossible (${e})`)
    return null
  }
}

// ─────────────────────────── vues ───────────────────────────

/** Un texte en `corps` `texte-doux` : une phrase d'état, ou celle d'un onglet sans constat. */
function vuePhrase(cle: string, texte: string, c: Palette): VirtualNode {
  return (
    <Text key={cle} {...TYPO.corps} foregroundStyle={c.texteDoux}>
      {sansMauvaiseCoupure(texte)}
    </Text>
  )
}

/**
 * Une ligne d'un Chiffre (libellé, repère ou écart) en note, à la couleur donnée, posée sur les fantômes de la même ligne de ses
 * voisines de rangée (invisibles, masqués à VoiceOver) : chaque ligne d'une rangée a la hauteur de la plus haute, si bien que
 * valeurs, repères et écarts s'alignent d'une case à l'autre ; null si aucune case de la rangée n'a cette ligne.
 */
function vueLigne(cle: string, propre: string | null, voisines: readonly (string | null)[], couleur: Color, c: Palette): VirtualNode | null {
  if (propre === null && voisines.every((v) => v === null)) return null
  const fantomes: VirtualNode[] = []
  voisines.forEach((v, i) => {
    if (v !== null) {
      fantomes.push(
        <Text key={`fantome-${i}`} {...TYPO.note} foregroundStyle={c.texteDiscret} opacity={0} accessibilityHidden>
          {sansMauvaiseCoupure(v)}
        </Text>
      )
    }
  })
  return (
    <ZStack key={cle} alignment="topLeading">
      {fantomes}
      {propre !== null ? (
        <Text key="texte" {...TYPO.note} foregroundStyle={couleur}>
          {sansMauvaiseCoupure(propre)}
        </Text>
      ) : null}
    </ZStack>
  )
}

/**
 * Un Chiffre (DESIGN.md, chiffre ; maquette) : un creux `fond`, marge de 10, à gauche, éléments à 2 : le libellé en note
 * `texte-discret` ; la valeur en `valeur`, chiffres à chasse fixe, bleue ou orange selon l'évaluation du module (écart écrit), en
 * `texte` sinon ; le repère, puis l'écart, en note `texte-doux`, chacun sur sa ligne, sur autant de lignes qu'il faut ; toute la
 * hauteur de la rangée. Un seul élément VoiceOver, qui lit sa `voix`.
 */
function vueChiffre(ch: ChiffreVu, rangee: readonly ChiffreVu[], c: Palette): VirtualNode {
  const voisines = rangee.filter((v) => v.cle !== ch.cle)
  const couleur = ch.evaluation === "neutre" ? c.texte : couleurEvaluation(c, ch.evaluation)
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
      {vueLigne("libelle", ch.libelle, voisines.map((v) => v.libelle), c.texteDiscret, c)}
      <Text key="valeur" {...TYPO.valeur} monospacedDigit foregroundStyle={couleur}>
        {ch.valeur}
      </Text>
      {vueLigne("repere", ch.repere, voisines.map((v) => v.repere), c.texteDoux, c)}
      {vueLigne("ecart", ch.ecart, voisines.map((v) => v.ecart), c.texteDoux, c)}
    </VStack>
  )
}

/**
 * Une grille de Chiffres (DESIGN.md, Layout & Spacing : écart de 6) sur `n` colonnes, à 6 d'une rangée à l'autre ; chaque rangée
 * tenue à sa hauteur idéale, ses cases à toute cette hauteur et à parts égales de la largeur, une rangée incomplète gardant ses
 * colonnes par des cases vides.
 */
function vueGrille(cle: string, chiffres: readonly ChiffreVu[], n: number, c: Palette): VirtualNode {
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

// ─────────────────────────── le sous-onglet ───────────────────────────

/**
 * Attaque · défense dans son emplacement (PropsEmplacement de app.tsx), sur la sélection du périmètre commun, sans état. Une pile à
 * 14 :
 * - Manches par côté, Bloc coin bas : tes manches gagnées en attaque et en défense, tes pistolets de chaque côté (Chiffres) ;
 * - Par carte, Bloc coin haut : le Tableau des cartes jouées en Cases colorées, la Légende des Cases, la note ;
 * - Après la pose, Bloc sans coin, titre de section : après une pose de ton équipe et Retakes, puis tes poses, tes désamorçages et
 *   tes kills après la pose (Chiffres) ;
 * - Premiers duels par côté, Bloc coin bas : tes 1ᵉʳˢ kills, tes 1ʳᵉˢ morts et ton ratio, en attaque puis en défense (Chiffres) ;
 * - le Constat de l'onglet (constatAttaqueDefense), ou la phrase sans constat.
 * Périmètre sans partie : Manches par côté avec la phrase de son mode ; aucune partie des files complètes : SANS_COTE ; aucune
 * manche dont le côté se lit : COTES_ILLISIBLES ; dans ces cas, rien d'autre. Sans sélection : rien. Chaque calcul gardé avec la
 * sélection (`agregat`), rattrapé : un calcul qui lève retire son bloc, dit une fois en console. Ni lecture, ni requête, ni
 * écriture.
 */
export function AttaqueDefense({ perimetre }: PropsEmplacement) {
  const sel = perimetre.selection
  const mode = perimetre.perimetre.mode
  const avecParties = sel !== null && sel.parties.length > 0
  const completes = avecParties
    ? perimetre.agregat("attaque-defense:completes", (s) => attraper("files complètes", () => retenues(s.parties, "completes").length))
    : null
  const avecCotes = avecParties && completes !== 0
  const manches = avecCotes ? perimetre.agregat("attaque-defense:manches", (s) => attraper("manches par côté", () => manchesParCote(s))) : null
  const lisibles = avecCotes && (manches === null || !cotesIllisibles(manches))
  const cartes = lisibles ? perimetre.agregat("attaque-defense:cartes", (s) => attraper("par carte", () => parCarte(s))) : null
  const pose = lisibles ? perimetre.agregat("attaque-defense:pose", (s) => attraper("après la pose", () => apresLaPose(s))) : null
  const duels = lisibles ? perimetre.agregat("attaque-defense:duels", (s) => attraper("premiers duels par côté", () => premiersDuelsParCote(s))) : null
  const constat = lisibles ? perimetre.agregat("attaque-defense:constat", (s) => attraper("constat", () => constatAttaqueDefense(s))) : null
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const deux = colonnesDeux(env.dynamicTypeSize)
        const blocs: VirtualNode[] = []
        const phrase = !avecParties ? SANS_PARTIE[mode] : !avecCotes ? SANS_COTE : !lisibles ? COTES_ILLISIBLES : null
        if (sel !== null && phrase !== null) blocs.push(<Bloc key="manches" titre={TITRE_MANCHES} coin="bas" vide={sansMauvaiseCoupure(phrase)} />)
        if (lisibles) {
          if (manches !== null) {
            blocs.push(
              <Bloc key="manches" titre={TITRE_MANCHES} coin="bas">
                {vueGrille("chiffres", chiffresManches(manches), deux, c)}
              </Bloc>
            )
          }
          if (cartes !== null && cartes.length > 0) {
            blocs.push(
              <Bloc key="cartes" titre={TITRE_CARTES} coin="haut" note={sansMauvaiseCoupure(noteCartes(cartes))}>
                <Tableau key="tableau" colonnes={COLONNES_CARTES} lignes={lignesCartes(cartes)} />
                <Legende key="legende" items={LEGENDE_CASES} />
              </Bloc>
            )
          }
          if (pose !== null) {
            const p = chiffresPose(pose)
            blocs.push(
              <Bloc key="pose" titre={TITRE_POSE} niveau="section">
                {vueGrille("gagnees", p.gagnees, deux, c)}
                {vueGrille("comptes", p.comptes, colonnesTrois(env.dynamicTypeSize), c)}
              </Bloc>
            )
          }
          if (duels !== null) {
            blocs.push(
              <Bloc key="duels" titre={TITRE_DUELS} coin="bas">
                {vueGrille("chiffres", chiffresDuels(duels), deux, c)}
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

/** L'emplacement du sous-onglet Attaque · défense dans la Barre de sous-onglets (SOUS_ONGLETS de app.tsx) : rempli. */
export const EMPLACEMENT_ATTAQUE_DEFENSE: Emplacement = AttaqueDefense
