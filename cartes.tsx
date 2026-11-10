import {
  EnvironmentValuesReader, HStack, Text, VStack, type Color, type DynamicTypeSize, type VirtualNode,
} from "scripting"
import { createElement, Fragment, useState } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import { ESPACES, TYPO, couleurs, policeCondensee, tailleAccessibilite, type Palette } from "./design"
import { PileDeBlocs } from "./design" // ticket 4.46 : blocs du sous-onglet dans une pile paresseuse
import {
  Barres, Bloc, Legende, LignesDetaillees, PlanCarte, PucesDeChoix, REPLIS, SEGMENTS_COTE, SelecteurSegmente, couleurEvaluation,
  sansMauvaiseCoupure, type Barre, type ItemLegende, type LigneDetaillee, type Puce,
} from "./dessin"
import {
  TIRET, agentsSurLaCarte, cartesJouees, ficheCarte, nombreEnClair, planDeCarte, sitesPlantes, toutesTesCartes,
  type AgentSurCarte, type CarteJouee, type CoteCarte, type FicheCarte, type LigneCarte, type Mode, type PlanDeCarte,
  type PointCarte, type SitePlante, type SitesPlantes, type ZoneComptee,
} from "./metriques"
import type { Cote } from "./reduction"
import { ZONE_LA_PLUS_PROCHE, analysesDeCarte, type ApresPose, type PositionsEnDefense, type PremiersDuels } from "./analyses-cartes"
import type { Emplacement, PropsEmplacement } from "./app"

// Module du sous-onglet Cartes de l'onglet Stats (entrée 25 de epic-stats-tableau-de-bord ; EXPERIENCE.md, Information
// Architecture : Cartes ; Component Patterns : Puces de choix, Sélecteur segmenté, Barre, Plan de carte, Chiffre, Légende ;
// State Patterns : Trop peu de parties, Aucune partie dans la période, Ressource de valorant-api absente, Zones non nommées ;
// Définitions des métriques : Où tu meurs, où tu tues, Après la pose, Évaluation ; Accessibility Floor ; DESIGN.md ; maquette
// Cartes). Son emplacement, EMPLACEMENT_CARTES, quatrième de la Barre de sous-onglets dans l'ordre fixe (entrée 18), reçoit
// de app.tsx PropsEmplacement : les données tenues (dont les ressources des cartes de catalog.json) et l'état du périmètre
// commun (entrée 17) ; aucun choix d'arrivée ne le vise. De haut en bas, à 14 l'un de l'autre : la carte, par les Puces de
// choix (cartes jouées du périmètre, de la plus jouée à la moins jouée) ; sa fiche (victoires, attaque, défense) ; Où tu
// meurs, où tu tues (côté par le Sélecteur segmenté, Plan de carte sur l'image en cache, Légende, Barres de tes morts par
// zone) ; les blocs des analyses 7 à 9 (epic-stats-analyses, entrée 6 : Tes premiers duels, par zone, du côté choisi ; Tes
// positions en défense ; Après la pose : ta distance au spike ; textes d'analyses-cartes.ts) ; Sites plantés ; Tes agents sur la
// carte ; Toutes tes cartes. Valeurs, textes et phrase du plan tels que les rendent cartesJouees, ficheCarte, planDeCarte,
// sitesPlantes, agentsSurLaCarte et toutesTesCartes de metriques.ts (entrées 7 et 8), calculés une fois par périmètre et par
// données avec la sélection (`agregat`) ; briques de dessin.tsx (entrées 13, 14, 15 et 37) reprises telles quelles. Sur une
// longue période, le plan montre au plus 80 marques de chaque sens, prises sur toute la période ; barres et phrase comptent
// tout. Titres de bloc en capitales par le Bloc (entrée 42) ; nom de la carte en capitales (maquette), étiquette des zones
// en casse de phrase, six mots (DESIGN.md, Typography ; entrée 35). Sans lecture, requête ni écriture ; la carte et le côté choisis sont les seuls
// états, jamais gardés. Rendu jugé sur l'iPhone.
// Ticket 4.48 : la note d'Où tu meurs, où tu tues dit ce qu'est une zone (MENTION_ZONE, la formule des analyses de 6.6) dès que
// ses zones se nomment.

// Caractères écrits par leur code : l'outil d'écriture les rendrait invisibles dans la source.
const NBSP = String.fromCharCode(0xa0)


export const NOM_PUCES = "Carte"




export const MAX_MARQUES = 80
/** Les zones montrées sous le plan : les quatre premières (maquette), plus celles écrites comme la quatrième. */
export const ZONES_MONTREES = 4
/** Écart entre le nom de la carte et sa ligne de victoires, dans la fiche. */
const ECART_FICHE = 4
/** Tuile de Sites plantés (DESIGN.md, chiffre ; maquette) : marge et écart entre ses lignes, en points. */
const TUILE_SITE = { marge: ESPACES.cellule, ecart: 2 } as const

/** Les titres des blocs, en casse normale (en capitales par le Bloc, entrée 42). */
export const TITRE_OU_TU_MEURS = "Où tu meurs, où tu tues"
export const TITRE_SITES = "Sites plantés"
export const TITRE_TOUTES = "Toutes tes cartes"
/** Les titres des blocs des analyses 7 à 9 (maquette) ; l'espace insécable garde les deux-points sur la ligne de « pose ». */
export const TITRE_PREMIERS_DUELS = "Tes premiers duels, par zone"
export const TITRE_DEFENSE = "Tes positions en défense"
export const TITRE_APRES_POSE = `Après la pose${NBSP}: ta distance au spike`
/** Le titre des premiers duels dit par VoiceOver, avec son côté : « Tes premiers duels en attaque, par zone ». */
export function titreDitPremiersDuels(cote: Cote): string {
  return `Tes premiers duels en ${coteDit(cote)}, par zone`
}
/** « Tes agents sur Ascent ». */
export function titreAgents(carte: string): string {
  return `Tes agents sur ${carte}`
}
/** L'étiquette des barres par zone : « Tes morts en attaque, par zone ». */
export function etiquetteZones(cote: Cote): string {
  return `Tes morts en ${coteDit(cote)}, par zone`
}
/** Le côté dit en minuscules : « attaque », « défense ». */
function coteDit(cote: Cote): string {
  return cote === "attaque" ? "attaque" : "défense"
}

/** La phrase d'une période sans partie (EXPERIENCE.md, State Patterns), aux mots de la Vue d'ensemble. */
export const SANS_PARTIE: Readonly<Record<Mode, string>> = {
  competition: "Aucune partie de compétition gardée dans cette période.",
  "non-classe": "Aucune partie non classée gardée dans cette période.",
  tout: "Aucune partie gardée dans cette période.",
}
/** Des parties dans la période, aucune à côtés (escarmouche, deathmatch seuls). */
export const SANS_CARTE = "Aucune partie de cette période ne compte pour les cartes : ni l'escarmouche ni le deathmatch n'y entrent."
/** Sous la fiche d'une carte de moins de 3 parties (EXPERIENCE.md, Trop peu de parties : « — »). */
export const FICHE_TROP_TOT = "Valeurs dès 3 parties sur cette carte."
/** Une carte jouée absente des ressources (aucun coefficient : rien ne se place). */
export const PLAN_INDISPONIBLE = "Plan indisponible pour cette carte : ses positions ne se placent pas encore."
/** Aucune partie de la carte ne dit les côtés de ses manches. */
export const SANS_COTES = "Aucune partie de cette carte ne dit ses côtés."
/** Sites plantés sans aucune de tes poses sur la carte. */
export const AUCUNE_POSE = "Aucune pose de ta part sur cette carte dans cette période."




export const MENTION_ZONE = sansMauvaiseCoupure(ZONE_LA_PLUS_PROCHE)
/** La note du plan (maquette), quand il montre chaque marque, puis ce qu'est une zone. */
export const NOTE_PLAN = `Positions de chaque kill et de chaque mort, données par Riot partie par partie ; zones nommées comme dans le jeu. ${MENTION_ZONE}`
/** La même, sans callouts (zones non nommées). */
export const NOTE_PLAN_SANS_ZONES = "Positions de chaque kill et de chaque mort, données par Riot partie par partie."
/** La Légende du plan (maquette) : tes morts en croix, tes kills en disque. */
export const LEGENDE_PLAN: readonly ItemLegende[] = [{ marque: "croix", libelle: "Tes morts" }, { marque: "disque", libelle: "Tes kills" }]

/** Un rôle de titre condensé de design.tsx (titre de section, de bloc, étiquette, nom). */
type RoleTitre = Parameters<typeof policeCondensee>[0]

// ─────────────────────────── calculs d'écran ───────────────────────────


function partiesDites(n: number): string {
  return `${nombreEnClair(n, 0)} partie${n > 1 ? "s" : ""}`
}

/** La carte choisie : celle de cet id si elle est jouée dans le périmètre, sinon la plus jouée (la première). */
export function carteChoisie(cartes: readonly CarteJouee[], id: string | null): CarteJouee {
  return cartes.find((c) => c.id === id) ?? cartes[0]
}


export function puceDe(c: CarteJouee): Puce<string> {
  return { cle: c.id, libelle: c.libelle, parle: `${c.nom}, ${partiesDites(c.parties)}` }
}

/**
 * Au plus `max` éléments d'une liste, pris à intervalles réguliers d'un bout à l'autre (le milieu de chaque tranche égale), dans
 * leur ordre ; la liste entière si elle n'en a pas plus.
 */
export function echantillonner<T>(liste: readonly T[], max: number = MAX_MARQUES): T[] {
  const n = liste.length
  if (n <= max) return [...liste]
  const r: T[] = []
  for (let j = 0; j < max; j++) r.push(liste[Math.floor(((j + 0.5) * n) / max)])
  return r
}

/** Les marques du plan : tes morts placées puis tes kills placés, au plus `max` de chaque sens, et ce que chaque sens en avait. */
export type MarquesPlan = { points: PointCarte[]; mortsPlacees: number; killsPlacees: number }

/**
 * Les marques du Plan de carte (décision 7 du plan, seuil relevé à 80) : chaque mort et chaque kill placés jusqu'à 80 de chaque
 * sens ; au-delà, 80 pris à intervalles réguliers dans l'ordre du module (partie par partie), donc sur toute la période.
 */
export function marquesDuPlan(points: readonly PointCarte[], max: number = MAX_MARQUES): MarquesPlan {
  const morts = points.filter((p) => p.sens === "mort" && p.affichage !== null)
  const kills = points.filter((p) => p.sens === "kill" && p.affichage !== null)
  return { points: [...echantillonner(morts, max), ...echantillonner(kills, max)], mortsPlacees: morts.length, killsPlacees: kills.length }
}

/** Les zones montrées sous le plan : les `n` premières (quatre, maquette), plus les suivantes écrites comme la dernière d'entre elles. */
export function zonesMontrees(zones: readonly ZoneComptee[], n: number = ZONES_MONTREES): ZoneComptee[] {
  if (zones.length <= n) return [...zones]
  const r = zones.slice(0, n)
  const borne = zones[n - 1].texte
  for (let i = n; i < zones.length && zones[i].texte === borne; i++) r.push(zones[i])
  return r
}







export function noteDuPlan(plan: PlanDeCarte, marques: MarquesPlan, barres: boolean, max: number = MAX_MARQUES): string {
  const morts = marques.mortsPlacees > max, kills = marques.killsPlacees > max
  if (!morts && !kills) return plan.zonesNommees ? NOTE_PLAN : NOTE_PLAN_SANS_ZONES
  const parts: string[] = []
  if (morts) parts.push(`${max} de tes ${nombreEnClair(plan.morts, 0)} morts`)
  if (kills) parts.push(`${max} de tes ${nombreEnClair(plan.kills, 0)} kills`)
  const repartis = morts && !kills ? "réparties" : "répartis"
  const barresDites = morts && barres ? " ; les barres comptent toutes tes morts" : ""
  const zones = plan.zonesNommees ? " ; zones nommées comme dans le jeu" : ""
  const mention = plan.zonesNommees ? ` ${MENTION_ZONE}` : ""
  return `Sur le plan, ${parts.join(" et ")}, ${repartis} sur toute la période${barresDites}. Positions données par Riot partie par partie${zones}.${mention}`
}

/** Une valeur écrite, dite : « — » « aucune valeur ». */
function dit(texte: string): string {
  return texte === TIRET ? "aucune valeur" : texte
}


export function voixCote(libelle: string, c: CoteCarte): string {
  if (c.texte === TIRET) return `${libelle} : aucune valeur.`
  return c.valeur === null ? `${libelle} : ${c.texte} manches gagnées.` : `${libelle} : ${c.texte} des manches gagnées.`
}


export function voixFiche(f: FicheCarte): string {
  const victoires = f.texteVictoires === TIRET ? "aucune valeur de victoires" : `${f.texteVictoires} de victoires`
  return `${f.nom} : ${victoires}, ${f.texteParties}${f.mention ? `, ${f.mention}` : ""}.`
}

/** Une barre d'un côté de la fiche (CoteCarte : texte, part de la piste, couleur d'évaluation). */
function barreCote(libelle: string, c: CoteCarte): Barre {
  return { libelle, valeur: c.texte, part: c.valeur, evaluation: c.evaluation, voix: voixCote(libelle, c) }
}

/** Les barres Attaque et Défense de la fiche. */
export function barresFiche(f: FicheCarte): Barre[] {
  return [barreCote("Attaque", f.attaque), barreCote("Défense", f.defense)]
}


export function barreZone(z: ZoneComptee, cote: Cote): Barre {
  return { libelle: z.nom, valeur: z.texte, part: z.part, evaluation: z.evaluation, voix: `${z.nom} : ${z.texte} de tes morts en ${coteDit(cote)}.` }
}


export function barresPremiersDuels(d: PremiersDuels): Barre[] {
  return d.zones.map((z) => ({ libelle: z.libelle, valeur: z.part.texte, part: z.part.valeur, evaluation: z.part.evaluation, voix: z.voix }))
}


export function barreAgent(a: AgentSurCarte): Barre {
  return { libelle: a.libelle, valeur: a.texte, part: a.valeur, evaluation: a.evaluation, voix: `${a.nom}, ${partiesDites(a.parties)} : victoires ${dit(a.texte)}.` }
}


export function barreCarte(l: LigneCarte): Barre {
  return {
    libelle: l.libelle, valeur: l.victoires.texte, part: l.victoires.valeur, evaluation: l.victoires.evaluation,
    voix: `${l.carte}, ${partiesDites(l.parties)} : victoires ${dit(l.victoires.texte)}.`,
  }
}


export function gagneesApres(s: SitePlante): string {
  return `${s.texteGagnees} gagnées après`
}


export function voixSite(s: SitePlante): string {
  return `${s.libelle} : ${s.textePart} de tes poses, ${gagneesApres(s)}.`
}


export function colonnesSites(taille: DynamicTypeSize | undefined): number {
  return taille === "xxLarge" || taille === "xxxLarge" || tailleAccessibilite(taille) ? 1 : 2
}

/** Le chemin entier de l'image d'une carte en cache (`icons/…png`, sous le dossier partagé), ou null : le plan montre ses seules marques. */
export function cheminImage(image: string | null): string | null {
  return image === null ? null : `${FileManager.appGroupDocumentsDirectory}/${image}`
}

/** Un calcul du module rattrapé : null s'il lève, dit en console (agrégat gardé avec la sélection : dit une fois). */
function attraper<T>(quoi: string, calcul: () => T): T | null {
  try {
    return calcul()
  } catch (e) {
    console.log(`cartes : ${quoi} impossible (${e})`)
    return null
  }
}

// ─────────────────────────── blocs ───────────────────────────

/** Un texte en `corps` `texte-doux` : la phrase d'un bloc sans données (DESIGN.md, bloc : `vide`). */
function Phrase({ texte, c }: { texte: string; c: Palette }) {
  return (
    <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
      {texte}
    </Text>
  )
}

/**
 * Le nom de la carte ou l'étiquette des zones, posés par l'écran, condensés, annoncés comme en-tête ; en capitales, sauf
 * `capitales` à faux : l'étiquette des zones (« Tes morts en attaque, par zone », six mots), en casse de phrase comme toute
 * étiquette au-delà de trois mots (DESIGN.md, Typography ; entrée 35). Ni titre de bloc ni règle des trois mots ici (entrée 42).
 */
function Titre({ texte, role, couleur, capitales = true }: { texte: string; role: RoleTitre; couleur: Color; capitales?: boolean }) {
  return (
    <Text {...policeCondensee(role, capitales)} foregroundStyle={couleur} accessibilityAddTraits="isHeader">
      {texte}
    </Text>
  )
}

/** Un Bloc coin bas qui ne dit qu'une phrase (périmètre sans partie, sans carte). */
function BlocPhrase({ texte }: { texte: string }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => (
        <Bloc coin="bas">
          <Phrase texte={texte} c={couleurs(env.colorSchemeContrast)} />
        </Bloc>
      )}
    </EnvironmentValuesReader>
  )
}







function BlocFiche({ fiche }: { fiche: FicheCarte }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const suite = `${NBSP}de victoires${NBSP}· ${fiche.texteParties}${fiche.mention ? `${NBSP}· ${fiche.mention}` : ""}`
        return (
          <Bloc coin="bas" note={fiche.valeurVictoires === null ? FICHE_TROP_TOT : undefined}>
            <VStack key="tete" alignment="leading" spacing={ECART_FICHE}>
              <Titre texte={fiche.nom} role={TYPO.nom} couleur={c.texte} />
              {/* Police redite sur le morceau en gras : rien n'assure qu'un morceau hérite de celle du texte. */}
              <Text
                styledText={{
                  font: TYPO.petit.font,
                  fontWeight: TYPO.petit.fontWeight,
                  foregroundColor: c.texteDiscret,
                  monospacedDigit: true,
                  content: [
                    { content: fiche.texteVictoires, font: TYPO.petitFort.font, fontWeight: TYPO.petitFort.fontWeight, foregroundColor: c.texte, monospacedDigit: true },
                    suite,
                  ],
                }}
                accessibilityElement
                accessibilityLabel={voixFiche(fiche)}
              />
            </VStack>
            <Barres key="cotes" barres={barresFiche(fiche)} />
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/**
 * Où tu meurs, où tu tues (maquette ; EXPERIENCE.md, Plan de carte, Sélecteur segmenté, State Patterns), coin haut : le titre
 * de section ; le Sélecteur du côté dans le bloc ; le Plan de carte de ce côté, sur l'image en cache (sans image, ses seules
 * marques), au plus 80 marques de chaque sens (marquesDuPlan), qui lit la phrase du module ; la Légende ; l'étiquette « Tes morts
 * en attaque, par zone » et les Barres des zones montrées (zonesMontrees), sauf sans callouts ou sans mort en zone ; la note.
 * Carte sans coefficients : la phrase PLAN_INDISPONIBLE ; aucune partie lue : SANS_COTES ; repli `planEnBarres` : ni plan ni
 * Légende, les barres seules, la note sans ce que le plan montre.
 */
function BlocOuTuMeurs({ plan, cote, onCote }: { plan: PlanDeCarte; cote: Cote; onCote: (cote: Cote) => void }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const tete = <SelecteurSegmente key="cote" segments={SEGMENTS_COTE} choisi={cote} onChoix={onCote} />
        if (plan.parties === 0 || !plan.placable) {
          return (
            <Bloc titre={TITRE_OU_TU_MEURS} niveau="section" coin="haut">
              {tete}
              <Phrase key="vide" texte={plan.parties === 0 ? SANS_COTES : PLAN_INDISPONIBLE} c={c} />
            </Bloc>
          )
        }
        const marques = marquesDuPlan(plan.points)
        const zones = plan.zonesNommees ? zonesMontrees(plan.zonesMorts) : []
        const dessine = !REPLIS.planEnBarres
        return (
          <Bloc titre={TITRE_OU_TU_MEURS} niveau="section" coin="haut" note={dessine ? noteDuPlan(plan, marques, zones.length > 0) : plan.zonesNommees ? NOTE_PLAN : NOTE_PLAN_SANS_ZONES}>
            {tete}
            {dessine ? <PlanCarte key="plan" points={marques.points} image={cheminImage(plan.image)} phrase={plan.phrase} /> : null}
            {dessine ? <Legende key="legende" items={LEGENDE_PLAN} /> : null}
            {zones.length > 0 ? <Titre key="etiquette" texte={etiquetteZones(cote)} role={TYPO.etiquette} couleur={c.texteDiscret} capitales={false} /> : null}
            {zones.length > 0 ? <Barres key="zones" barres={zones.map((z) => barreZone(z, cote))} /> : null}
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}







function TuileSite({ site, c }: { site: SitePlante; c: Palette }) {
  return (
    <VStack
      alignment="leading"
      spacing={TUILE_SITE.ecart}
      padding={TUILE_SITE.marge}
      frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
      background={c.fond}
      accessibilityElement
      accessibilityLabel={voixSite(site)}
    >
      <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
        {site.libelle}
      </Text>
      <Text {...TYPO.valeur} monospacedDigit foregroundStyle={c.texte}>
        {site.textePart}
      </Text>
      <Text {...TYPO.note} foregroundStyle={c.texteDoux}>
        de tes poses
      </Text>
      <Text {...TYPO.note} monospacedDigit foregroundStyle={couleurEvaluation(c, site.evaluation)}>
        {gagneesApres(site)}
      </Text>
    </VStack>
  )
}

/**
 * Sites plantés (maquette ; EXPERIENCE.md, Après la pose), sans coin : le titre de bloc ; les tuiles des sites dans l'ordre du jeu,
 * en 2 colonnes à 6 (1 dès `xxLarge`), chaque rangée tenue à sa hauteur idéale, une dernière tuile seule à sa demi-largeur ;
 * aucune pose : AUCUNE_POSE.
 */
function BlocSites({ sites }: { sites: SitesPlantes }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        if (sites.poses === 0) {
          return (
            <Bloc titre={TITRE_SITES}>
              <Phrase key="vide" texte={AUCUNE_POSE} c={c} />
            </Bloc>
          )
        }
        const n = colonnesSites(env.dynamicTypeSize)
        const rangees: SitePlante[][] = []
        for (let i = 0; i < sites.sites.length; i += n) rangees.push(sites.sites.slice(i, i + n))
        return (
          <Bloc titre={TITRE_SITES}>
            <VStack key="grille" alignment="leading" spacing={ESPACES.grille} frame={{ maxWidth: "infinity", alignment: "leading" }}>
              {rangees.map((r, i) => (
                <HStack key={i} alignment="top" spacing={ESPACES.grille} fixedSize={{ horizontal: false, vertical: true }}>
                  {r.map((s) => <TuileSite key={s.site} site={s} c={c} />)}
                  {/* Une place vide, à la largeur d'une tuile : la dernière tuile seule garde sa demi-largeur. */}
                  {r.length < n ? <VStack key="place" frame={{ maxWidth: "infinity" }} accessibilityHidden /> : null}
                </HStack>
              ))}
            </VStack>
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/**
 * Tes premiers duels, par zone (maquette ; analyse 7), sans coin : le titre de bloc, dit avec le côté choisi ; les Barres des zones de
 * ce côté, la part gagnée colorée comme une liste par catégorie sans autre référence (EXPERIENCE.md, Évaluation : bleu dès 55 %, orange
 * sous 45 %) ; sans zone (carte sans callouts, aucun premier duel, aucune position), la phrase du module à leur place ; la note du module.
 */
function BlocPremiersDuels({ d }: { d: PremiersDuels }) {
  return (
    <Bloc titre={TITRE_PREMIERS_DUELS} titreDit={titreDitPremiersDuels(d.cote)} vide={d.vide === null ? null : sansMauvaiseCoupure(d.vide)} note={sansMauvaiseCoupure(d.note)}>
      <Barres key="zones" barres={barresPremiersDuels(d)} />
    </Bloc>
  )
}







function ligneAffichee(l: LigneDetaillee): LigneDetaillee {
  return { libelle: l.libelle, detail: sansMauvaiseCoupure(l.detail), voix: l.voix }
}

/**
 * Tes positions en défense (maquette ; analyse 8), coin bas : une ligne détaillée par zone (gagnées, survie, kills et morts par manche) ;
 * sans zone, la phrase du module ; la note du module.
 */
function BlocDefense({ d }: { d: PositionsEnDefense }) {
  return (
    <Bloc titre={TITRE_DEFENSE} coin="bas" vide={d.vide === null ? null : sansMauvaiseCoupure(d.vide)} note={sansMauvaiseCoupure(d.note)}>
      <LignesDetaillees key="zones" lignes={d.zones.map(ligneAffichee)} />
    </Bloc>
  )
}

/**
 * Après la pose : ta distance au spike (maquette ; analyse 9), sans coin : une ligne détaillée par tranche, les trois toujours (gagnées,
 * survie, tes kills après la pose par manche) ; sans pose ou sans distance, la phrase du module ; la note du module.
 */
function BlocApresPose({ a }: { a: ApresPose }) {
  return (
    <Bloc titre={TITRE_APRES_POSE} vide={a.vide === null ? null : sansMauvaiseCoupure(a.vide)} note={sansMauvaiseCoupure(a.note)}>
      <LignesDetaillees key="tranches" lignes={a.tranches.map(ligneAffichee)} />
    </Bloc>
  )
}

/** Un bloc de Barres sous son titre de bloc : Tes agents sur la carte (sans coin), Toutes tes cartes (coin bas). */
function BlocBarres({ titre, barres, coin }: { titre: string; barres: Barre[]; coin: "bas" | "aucun" }) {
  return (
    <Bloc titre={titre} coin={coin}>
      <Barres key="barres" barres={barres} />
    </Bloc>
  )
}

// ─────────────────────────── le sous-onglet ───────────────────────────

/**
 * Cartes dans son emplacement (PropsEmplacement de app.tsx) : la carte choisie (la plus jouée par défaut, et dès qu'elle manque au
 * périmètre) et le côté (Attaque par défaut, gardé d'une carte à l'autre), seuls états ; le mode et la période, ceux du périmètre
 * commun. Une pile à 14 : les Puces des cartes jouées, puis la fiche, Où tu meurs, où tu tues, Tes premiers duels, par zone (du
 * côté choisi), Tes positions en défense, Après la pose, Sites plantés, Tes agents sur la carte et Toutes tes cartes, chacun calculé une fois par périmètre et par données (`agregat`), un calcul qui lève retirant son
 * bloc. Périmètre sans partie : la phrase du mode ; sans partie à côtés : SANS_CARTE ; sans sélection : rien. Ni lecture, ni
 * requête, ni écriture.
 */
export function Cartes({ donnees, perimetre }: PropsEmplacement) {
  const [choix, setChoix] = useState<string | null>(null)
  const [cote, setCote] = useState<Cote>("attaque")
  const sel = perimetre.selection
  const blocs: VirtualNode[] = []
  if (sel !== null && sel.parties.length === 0) blocs.push(<BlocPhrase key="vide" texte={SANS_PARTIE[perimetre.perimetre.mode]} />)
  else if (sel !== null) {
    const cartes = perimetre.agregat("cartes:jouees", (s) => attraper("cartes jouées", () => cartesJouees(s)))
    if (cartes !== null && cartes.length === 0) blocs.push(<BlocPhrase key="vide" texte={SANS_CARTE} />)
    else if (cartes !== null) {
      const carte = carteChoisie(cartes, choix)
      const id = carte.id
      blocs.push(<PucesDeChoix key="cartes" nom={NOM_PUCES} puces={cartes.map(puceDe)} choisie={id} onChoix={(k) => setChoix(k)} />)
      const fiche = perimetre.agregat(`cartes:fiche:${id}`, (s) => attraper("fiche", () => ficheCarte(s, id)))
      if (fiche) blocs.push(<BlocFiche key="fiche" fiche={fiche} />)
      const plan = perimetre.agregat(`cartes:plan:${id}:${cote}`, (s) => attraper("plan", () => planDeCarte(s, id, cote, donnees.ressources.cartes)))
      if (plan) blocs.push(<BlocOuTuMeurs key="plan" plan={plan} cote={cote} onCote={(k) => setCote(k)} />)
      // Les deux côtés ensemble : un appui sur le Sélecteur ne recalcule rien.
      const analyses = perimetre.agregat(`cartes:analyses:${id}`, (s) => attraper("analyses", () => analysesDeCarte(s, id, donnees.ressources.cartes)))
      if (analyses) {
        blocs.push(<BlocPremiersDuels key="premiers-duels" d={analyses.premiersDuels[cote]} />)
        blocs.push(<BlocDefense key="defense" d={analyses.defense} />)
        blocs.push(<BlocApresPose key="apres-pose" a={analyses.apresPose} />)
      }
      const sites = perimetre.agregat(`cartes:sites:${id}`, (s) => attraper("sites plantés", () => sitesPlantes(s, id)))
      if (sites) blocs.push(<BlocSites key="sites" sites={sites} />)
      const agents = perimetre.agregat(`cartes:agents:${id}`, (s) => attraper("agents", () => agentsSurLaCarte(s, id)))
      if (agents && agents.length > 0) blocs.push(<BlocBarres key="agents" titre={titreAgents(carte.nom)} barres={agents.map(barreAgent)} coin="aucun" />)
      const toutes = perimetre.agregat("cartes:toutes", (s) => attraper("toutes tes cartes", () => toutesTesCartes(s)))
      if (toutes && toutes.length > 0) blocs.push(<BlocBarres key="toutes" titre={TITRE_TOUTES} barres={toutes.map(barreCarte)} coin="bas" />)
    }
  }
  return (
    <PileDeBlocs>
      {blocs}
    </PileDeBlocs>
  )
}

/** L'emplacement du sous-onglet Cartes dans la Barre de sous-onglets (SOUS_ONGLETS de app.tsx) : rempli. */
export const EMPLACEMENT_CARTES: Emplacement = Cartes
