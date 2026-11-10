import { EnvironmentValuesReader, Text, type VirtualNode } from "scripting"
import { createElement, Fragment } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import { TYPO, couleurs, policeCondensee } from "./design"
import { Bloc, GrilleChiffres, LignesDetaillees, sansMauvaiseCoupure, type ChiffreDeGrille, type LigneDetaillee } from "./dessin"
import {
  ETIQUETTE_PAR_COMPO, TITRE_CONDITIONS,
  type ChiffreCondition, type Conditions, type GroupeConditions, type LigneCompo,
} from "./analyses-evolution"

// Bloc « Dans quelles conditions tu gagnes » d'Évolution (epic-stats-analyses, entrée 7 ; analyses 12 à 14 de CAP-24 ; maquette
// Evolution ; EXPERIENCE.md, Component Patterns : Chiffre, Ligne détaillée ; DESIGN.md, chiffre, ligne-detaillee). Il pose ce que rend
// conditionsDeVictoire d'analyses-evolution.ts (étiquettes, Chiffres, lignes de compo, note, phrases VoiceOver), qu'il ne fait que
// couper (sansMauvaiseCoupure) : rien n'y est calculé ni écrit. Les sept chiffres sont des stats d'équipe face à ta période précédente :
// en Chiffres et non en Barres, l'écart et sa couleur demandant un sous-texte qui les écrit. Le Chiffre coloré, sa grille et les lignes
// détaillées sont les briques de dessin.tsx (entrée 10), partagées avec Duels, Armes et visée et Cartes. Sans lecture, requête ni écriture.

/** Les étiquettes des trois groupes, plus de trois mots : en casse de phrase (DESIGN.md, Typography) ; « Par compo », en capitales. */
const ETIQUETTES_EN_CAPITALES = false
const PAR_COMPO_EN_CAPITALES = true

/** Une étiquette de groupe : condensée 700, `texte-discret`, annoncée comme en-tête, coupée seulement entre les mots. */
function Etiquette({ texte, capitales }: { texte: string; capitales: boolean }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => (
        <Text {...policeCondensee(TYPO.etiquette, capitales)} foregroundStyle={couleurs(env.colorSchemeContrast).texteDiscret} accessibilityAddTraits="isHeader">
          {sansMauvaiseCoupure(texte)}
        </Text>
      )}
    </EnvironmentValuesReader>
  )
}

/** Un Chiffre tel qu'il s'affiche dans la grille de dessin.tsx : libellé et sous-texte coupés seulement entre les mots ; le reste tel quel. */
function chiffreAffiche(ch: ChiffreCondition): ChiffreDeGrille {
  return { ...ch, libelle: sansMauvaiseCoupure(ch.libelle), sousTexte: ch.sousTexte === null ? null : sansMauvaiseCoupure(ch.sousTexte) }
}





function ligneCompo(l: LigneCompo): LigneDetaillee {
  return { libelle: sansMauvaiseCoupure(l.libelle), detail: sansMauvaiseCoupure(l.detail), voix: l.voix }
}

/** Un texte en `corps` `texte-doux` : la phrase d'un groupe sans partie. */
function Phrase({ texte }: { texte: string }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => (
        <Text {...TYPO.corps} foregroundStyle={couleurs(env.colorSchemeContrast).texteDoux}>
          {sansMauvaiseCoupure(texte)}
        </Text>
      )}
    </EnvironmentValuesReader>
  )
}

/** Un groupe : son étiquette, puis ses Chiffres ou sa phrase. */
function contenuDuGroupe(g: GroupeConditions): VirtualNode[] {
  return [
    <Etiquette key={`e-${g.cle}`} texte={g.etiquette} capitales={ETIQUETTES_EN_CAPITALES} />,
    g.vide !== null ? <Phrase key={`v-${g.cle}`} texte={g.vide} /> : <GrilleChiffres key={`c-${g.cle}`} chiffres={g.chiffres.map(chiffreAffiche)} />,
  ]
}

/**
 * Bloc « Dans quelles conditions tu gagnes » (maquette Evolution), titre de section, coin haut : « Selon le rang de ton lobby » (au-dessus
 * du tien, à ton rang, en dessous), « Selon ton côté de départ » (attaque, défense d'abord), « Selon la compo de ton équipe » (avec, sans
 * contrôleur), chacun en Chiffres ou sa phrase ; puis « Par compo », une ligne détaillée par compo ; la note du module. Aucune partie des
 * files complètes : la phrase du module seule, titre gardé.
 */
export function BlocConditions({ c }: { c: Conditions }) {
  if (c.vide !== null) return <Bloc titre={TITRE_CONDITIONS} niveau="section" coin="haut" vide={sansMauvaiseCoupure(c.vide)} />
  const contenu: VirtualNode[] = c.groupes.flatMap(contenuDuGroupe)
  const groupeCompo = c.groupes.find((g) => g.cle === "compo")
  if (c.compos.length > 0 && groupeCompo !== undefined && groupeCompo.vide === null) {
    contenu.push(<Etiquette key="e-par-compo" texte={ETIQUETTE_PAR_COMPO} capitales={PAR_COMPO_EN_CAPITALES} />)
    contenu.push(<LignesDetaillees key="compos" lignes={c.compos.map(ligneCompo)} />)
  }
  return (
    <Bloc titre={TITRE_CONDITIONS} niveau="section" coin="haut" note={c.note === null ? undefined : sansMauvaiseCoupure(c.note)}>
      {contenu}
    </Bloc>
  )
}
