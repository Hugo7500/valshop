import { traduire } from "./langue"
import { EnvironmentValuesReader, Rectangle, Text, type VirtualNode } from "scripting"
import { createElement, Fragment } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import { TYPO, couleurs, policeCondensee } from "./design"
import { BarresEmpilees, Bloc, Legende, Tableau, sansMauvaiseCoupure, type BarreEmpilee, type ItemLegende, type LigneTableau } from "./dessin"
import { LIBELLES_ZONES, nombreEnClair } from "./metriques"
import {
  COLONNES_AGENTS, COLONNES_ARME, COLONNES_PARTIE, ETIQUETTE_ARME, ETIQUETTE_KILLS, ETIQUETTE_TOUCHES, NOTE_AGENTS, NOTE_DELAI, NOTE_PARTIE,
  SANS_AGENT_PARTIE, SANS_AGENT_PERIODE, SANS_DETAIL_PERIODE, TITRE_AGENTS, TITRE_AGENTS_PARTIE, agentsAdversesDeLaPartie, armesEnMots, noteDesAgents,
  type AgentsDeLaPeriode, type LigneAgentAdverse,
} from "./analyses-agents"
import type { Partie } from "./reduction"

// Ce que chaque agent adverse te fait (epic-stats-analyses, entrée 11) : le Bloc de Duels, sur la période (duels.tsx l'appelle en
// dernier), et la section du Détail d'une partie (liste-parties.tsx l'appelle après « Tes morts dans cette partie »). Valeurs, textes,
// ordres et phrases VoiceOver tels que les rend analyses-agents.ts ; briques de dessin.tsx (Bloc et son titre par titreDeBloc, Tableau,
// Barres empilées, Légende) reprises telles quelles. Fichier à part pour ne rien mêler aux deux écrans qui l'appellent. Sans lecture,
// requête ni écriture ; aucun état. Rendu jugé sur l'iPhone.

/** Les trois listes du Bloc de Duels : étiquettes en casse de phrase condensée (plus de trois mots : DESIGN.md, étiquette). */
const ETIQUETTES_EN_CAPITALES = false
/** La Légende des Barres empilées des touches : tête en bleu, corps en texte-doux, jambes en orange (comme Armes et visée). */
export const LEGENDE_TOUCHES: readonly ItemLegende[] = [
  { marque: "pastilleForte", libelle: LIBELLES_ZONES.tete },
  { marque: "pastilleNeutre", libelle: LIBELLES_ZONES.corps },
  { marque: "pastilleFaible", libelle: LIBELLES_ZONES.jambes },
]

// ─────────────────────────── lignes ───────────────────────────


export function lignesAgents(lignes: readonly LigneAgentAdverse[]): LigneTableau[] {
  return lignes.map((l): LigneTableau => ({
    cellules: [sansMauvaiseCoupure(l.libelle), nombreEnClair(l.killsSurToi, 0), nombreEnClair(l.killsSurLui, 0), l.degatsParManche.texte], voix: l.phrase,
  }))
}


export function barresTouches(lignes: readonly LigneAgentAdverse[]): BarreEmpilee[] {
  return lignes.filter((l) => l.totalTouches > 0).map((l): BarreEmpilee => ({
    libelle: sansMauvaiseCoupure(l.libelleTouches), valeur: l.tete.texte, parts: l.zones.parts, legende: l.zones.legende, voix: l.phrase,
  }))
}





export function lignesArme(lignes: readonly LigneAgentAdverse[]): LigneTableau[] {
  return lignes.filter((l) => l.arme !== null).map((l): LigneTableau => {
    const a = l.arme!
    const kills = `${nombreEnClair(a.kills, 0)}${a.noms.length > 1 ? " chacune" : ""} sur ${nombreEnClair(l.killsSurToi, 0)}`
    return { cellules: [sansMauvaiseCoupure(l.nom), sansMauvaiseCoupure(armesEnMots(a.noms)), kills], voix: `${l.nom} : ${l.texteArme}.` }
  })
}

// ─────────────────────────── vues ───────────────────────────

/** La tête d'une liste : l'étiquette condensée, en casse de phrase, `texte-discret`, annoncée comme en-tête (comme Ce qui te tue). */
function Etiquette({ texte }: { texte: string }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => (
        <Text {...policeCondensee(TYPO.etiquette, ETIQUETTES_EN_CAPITALES)} foregroundStyle={couleurs(env.colorSchemeContrast).texteDiscret} accessibilityAddTraits="isHeader">
          {sansMauvaiseCoupure(texte)}
        </Text>
      )}
    </EnvironmentValuesReader>
  )
}

/** Le filet entre deux listes : 1 point de `bordure`, toute la largeur, masqué à VoiceOver. */
function Filet() {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => <Rectangle fill={couleurs(env.colorSchemeContrast).bordure} frame={{ maxWidth: "infinity", height: 1 }} accessibilityHidden />}
    </EnvironmentValuesReader>
  )
}

/**
 * Bloc « Ce que chaque agent te fait » de Duels, titre de section, sans coin : « Ses kills et ses dégâts » (Tableau : agent · parties,
 * te tue, tu le tues, dégâts par manche) ; le filet ; « Ses touches sur toi » (une Barre empilée par agent qui t'a touché, la Légende
 * dès qu'une barre est dessinée) ; le filet ; « L'arme qui te tue le plus » (Tableau : agent, arme, kills) ; la note du module
 * (effectif, méthode, « — », délai, agents seulement). Sans agent : sa phrase, et la note.
 */
export function BlocAgentsAdverses({ r }: { r: AgentsDeLaPeriode }) {
  const note = sansMauvaiseCoupure(noteDesAgents(r))
  // Aucune partie portée : sa phrase ; des parties portées sans aucun agent adverse connu : la leur.
  if (r.lignes.length === 0) {
    return <Bloc titre={TITRE_AGENTS} niveau="section" vide={sansMauvaiseCoupure(r.effectif.parties === 0 ? SANS_DETAIL_PERIODE : SANS_AGENT_PERIODE)} note={note} />
  }
  const touches = barresTouches(r.lignes)
  const armes = lignesArme(r.lignes)
  const contenu: VirtualNode[] = [
    <Etiquette key="e-kills" texte={ETIQUETTE_KILLS} />,
    <Tableau key="t-kills" colonnes={COLONNES_AGENTS} lignes={lignesAgents(r.lignes)} />,
  ]
  if (touches.length > 0) {
    contenu.push(<Filet key="f-touches" />, <Etiquette key="e-touches" texte={ETIQUETTE_TOUCHES} />, <BarresEmpilees key="b-touches" barres={touches} />)
    if (touches.some((b) => b.parts !== null)) contenu.push(<Legende key="legende" items={LEGENDE_TOUCHES} />)
  }
  if (armes.length > 0) {
    contenu.push(<Filet key="f-arme" />, <Etiquette key="e-arme" texte={ETIQUETTE_ARME} />, <Tableau key="t-arme" colonnes={COLONNES_ARME} lignes={armes} />)
  }
  return (
    <Bloc titre={TITRE_AGENTS} niveau="section" note={note}>
      {contenu}
    </Bloc>
  )
}

/**
 * La section « Ce que chaque agent t'a fait » du Détail d'une partie, titre de bloc, sans coin : le Tableau (agent, te tue, tu le tues,
 * tête, dégâts), une phrase VoiceOver par ligne ; la note de méthode, du délai et des agents. Partie sans le champ : sa phrase ; sans
 * manches : rien (null). Un calcul qui lève : rien, dit en console.
 */
export function SectionAgentsDeLaPartie({ partie }: { partie: Partie }) {
  let r: ReturnType<typeof agentsAdversesDeLaPartie>
  try {
    r = agentsAdversesDeLaPartie(partie)
  } catch (e) {
    console.log(`parties : agents adverses impossibles (${e})`)
    return null
  }
  if (r.etat === "sansManches") return null
  // En anglais, chaque phrase traduite seule (anglais.ts) ; en français, telle quelle.
  const note = sansMauvaiseCoupure([NOTE_PARTIE, NOTE_DELAI, NOTE_AGENTS].map(traduire).join(" "))
  if (r.etat === "absent") return <Bloc titre={TITRE_AGENTS_PARTIE} vide={sansMauvaiseCoupure(r.phrase)} />
  if (r.lignes.length === 0) return <Bloc titre={TITRE_AGENTS_PARTIE} vide={sansMauvaiseCoupure(SANS_AGENT_PARTIE)} />
  const lignes = r.lignes.map((l): LigneTableau => ({
    cellules: [sansMauvaiseCoupure(l.nom), nombreEnClair(l.killsSurToi, 0), nombreEnClair(l.killsSurLui, 0), l.tete, nombreEnClair(l.degats, 0)], voix: l.phrase,
  }))
  return (
    <Bloc titre={TITRE_AGENTS_PARTIE} note={note}>
      <Tableau colonnes={COLONNES_PARTIE} lignes={lignes} />
    </Bloc>
  )
}
