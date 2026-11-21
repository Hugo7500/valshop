// Ce que les vues des widgets reçoivent : des données déjà lues et vérifiées, jamais un fichier. Une donnée qui manque
// vaut null (exacte ou absente) : la vue l'omet, elle n'invente rien.

/** Un skin tel qu'une carte le montre ; `remise` et `origine` : Night Market (pourcentage, prix d'avant la remise). */
export type SkinVu = { nom: string; arme: string; prix: number | null; icone: string | null; couleur: string | null; remise?: number; origine?: number | null }

/**
 * La taille du widget : sa famille, sa largeur et sa hauteur en points. `apercu` : la vue est dessinée dans l'app (« Mes
 * widgets »), pas dans un widget : le fond des widgets de l'écran verrouillé, qu'iOS ne fournit que là-bas, y est dessiné.
 */
export type Cadre = { famille: string; l: number; h: number; apercu?: boolean }

export type Accessoire = { nom: string; type: string; prix: number | null; icone: string | null }

/** Le dernier appui sur ↻ depuis un widget : en cours, ou fini (boutique à jour, ou non) ; `t` : ms depuis l'epoch. */
export type Appui = { etat: "lecture" | "a-jour" | "echec"; t: number }

/** L'issue d'une partie : victoire, défaite, nul. */
export type Issue = "V" | "D" | "N"

/** Une partie, telle qu'un widget la montre. */
export type PartieVue = {
  issue: Issue
  /** Le nom de la carte ; null s'il manque. `file` : « Compétition », « Non classé »… */
  carte: string | null; file: string
  /** Les manches gagnées et perdues. */
  pour: number; contre: number

  kda: string | null
  /** RR gagnés ou perdus ; null hors compétition ou si la donnée manque. */
  rr: number | null

  tete: string | null
  /** Images gardées : petite icône de l'agent, son portrait, l'image de la carte. */
  icone: string | null; portrait: string | null; fond: string | null
}

/** Un chiffre et sa tendance par rapport à la période d'avant (`hausse` null : pas de comparaison). */
export type Chiffre = { valeur: string; unite: string; libelle: string; court: string; hausse: boolean | null }

/** Le résumé des stats d'une période (compétition), écrit par l'app à chaque lecture de l'onglet Stats (lot 2). */
export type Stats = {

  periode: string; majA: string | null
  rang: { nom: string; icone: string | null; rr: number | null; variation: number | null } | null
  /** Les derniers résultats de compétition, du plus ancien au plus récent. */
  derniers: Issue[]
  chiffres: Chiffre[]
  /** Le cumul des RR gagnés et perdus, partie après partie, de 0 (avant la plus ancienne) à la plus récente. */
  courbe: number[]
  /** Les dernières parties de compétition, la plus récente d'abord. */
  parties: PartieVue[]
  /** La dernière partie à manches, toutes files confondues ; null sans elle. */
  derniere: PartieVue | null
}

/** Le constat du jour (lot 3) : un chiffre de l'onglet Stats (compétition, période du widget), son sujet, et de quoi l'illustrer. */
export type Constat = {
  jour: string; titre: string; valeur: string; unite: string; sujet: string; detail: string

  periode: string; majA: string | null
  /** `fort` : un point fort (bleu), `travail` : un point à travailler (orange). */
  genre: "fort" | "travail"
  portrait: string | null; fond: string | null
  /** Deux chiffres de plus, pour le format moyen. */
  plus: { valeur: string; libelle: string }[]
}

export type Donnees = {
  /** Heure de la lecture de la boutique, ms depuis l'epoch. */
  lueA: number | null
  /** Dernier appui sur ↻ ; null : aucun, ou trop ancien pour être dit. */
  appui: Appui | null
  /** La session Riot est expirée (etat.json) : le widget le dit et mène à la connexion. */
  sessionExpiree: boolean
  /** Reset de la boutique du jour, ms depuis l'epoch. */
  reset: number | null
  skins: SkinVu[]
  /** Icônes des monnaies gardées sur l'appareil. */
  monnaies: { vp: string | null; rp: string | null; kc: string | null }
  solde: { vp: number | null; rp: number | null; kc: number | null; heure: string | null } | null
  bundle: { nom: string; prix: number | null; fin: string; objets: number | null; image: string | null } | null
  accessoires: Accessoire[]

  finAccessoires: string | null
  /** Le premier skin de la liste de souhaits présent dans la boutique du jour. */
  souhait: SkinVu | null
  /** Combien de skins de la boutique du jour la liste de souhaits attend (lot 4) ; null : pas su, comme `souhaitsSuivis`. */
  souhaitsTrouves: number | null
  /** Nombre de skins et d'armes suivis ; null : pas encore su du widget (boutique lue avant le lot 2 : il montre alors la boutique). */
  souhaitsSuivis: number | null
  nuit: { skins: SkinVu[]; fin: string } | null
  /** Le résumé des stats ; null tant qu'il n'est pas écrit, ou s'il est d'un autre compte (les widgets de stats invitent alors à ouvrir l'onglet Stats). */
  stats: Stats | null
  /** Le constat du jour ; null s'il n'y en a pas. */
  jour: Constat | null
  /** Le résumé des stats est là, mais la période n'a aucun constat à dire (trop peu de parties) : le widget le dit. */
  jourVide: boolean
}
