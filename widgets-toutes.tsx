import { Capsule, HStack, Spacer, VStack, ZStack, type VirtualNode } from "scripting"
import { BoutiqueStats, Jour, Partie, StatsVue } from "./widgets-stats"
import type { Cadre, Constat, Donnees } from "./widgets-types"
import { vueVerrou } from "./widgets-verrou-vues"
import { fondWidget } from "./widgets-briques"
import { Accessoires, Boutique, Bundle, Nuit, Solde, Souhaits, Tout, moyen, petit, tresGrand } from "./widgets-vues"

// Le choix de la vue d'un widget d'après son contenu (widgets-reglage.ts), pour l'entrée des widgets et l'écran « Mes widgets ».

/**
 * Très grand : les contenus faits de deux vues, celle du haut à la forme du moyen, celle du bas à la forme du grand. Seule la
 * vue du haut peut porter le bouton ↻ : sa zone d'appui est le coin en haut à droite du widget.
 */
const PAIRES: Readonly<Record<string, readonly [string, string]>> = {
  "boutique+stats": ["boutique", "stats"], "boutique+jour": ["boutique", "jour"], "boutique+partie": ["boutique", "partie"],
  "solde+souhaits": ["solde", "souhaits"], "stats+partie": ["partie", "stats"],
}
const BORD_PAIRE = 6

/** Les cadres des deux vues d'une paire : le haut aux proportions du widget moyen, le bas sur ce qui reste. */
function cadresPaire(c: Cadre): [Cadre, Cadre] {
  const l = c.l - 2 * BORD_PAIRE
  const hHaut = Math.round((l * 164) / 350)
  return [{ famille: "systemMedium", l, h: hHaut }, { famille: "systemLarge", l, h: c.h - 3 * BORD_PAIRE - hHaut }]
}

function Paire({ haut, bas, d, c }: { haut: string; bas: string; d: Donnees; c: Cadre }) {
  const [ch, cb] = cadresPaire(c)
  const carte = (contenu: string, k: Cadre) => (
    <ZStack frame={{ width: k.l, height: k.h }} clipShape={{ type: "rect", cornerRadius: 17 }}>{vue(contenu, d, k)}</ZStack>
  )
  return (
    <ZStack frame={{ width: c.l, height: c.h }} background={fondWidget()} widgetBackground={fondWidget()}>
      <VStack spacing={BORD_PAIRE} frame={{ width: c.l, height: c.h }}>
        {carte(haut, ch)}
        {carte(bas, cb)}
      </VStack>
    </ZStack>
  )
}

/** Ce widget montre-t-il le bouton ↻ ? (Sa zone d'appui, plus large que lui, est posée par l'entrée du widget.) */
export function aBouton(contenu: string, c: Cadre): boolean {
  if (tresGrand(c) && PAIRES[contenu]) return aBouton(PAIRES[contenu][0], cadresPaire(c)[0])
  if (petit(c)) return false
  if (contenu === "bundle" || contenu === "accessoires") return !moyen(c)
  return ["boutique", "solde", "bundle", "accessoires", "tout", "boutique+stats", "lecture", "a-jour", "echec", "session"].includes(contenu)
}

/** Deux autres constats de démonstration, pour le banc de rendu. */
const carte = (d: Donnees): Constat | null => d.jour && { ...d.jour, jour: "Mardi", titre: "Meilleure carte", valeur: "61", sujet: "Ascent", detail: "de victoires · 23 parties", portrait: null, fond: d.stats?.derniere?.fond ?? null, plus: [{ valeur: "54\u202f%", libelle: "Attaque" }, { valeur: "66\u202f%", libelle: "Défense" }] }
const travail = (d: Donnees): Constat | null => d.jour && { ...d.jour, jour: "Mercredi", titre: "À travailler", valeur: "18", sujet: "Tirs à la tête", detail: "en baisse sur la période", genre: "travail", portrait: null, fond: null, plus: [] }

/** La vue d'un contenu ; un contenu inconnu : la boutique. Les derniers cas ne servent qu'au banc de rendu. */
export function vue(contenu: string, d: Donnees, c: Cadre): VirtualNode {
  // L'écran verrouillé (lot 4) : ses propres vues, en une seule couleur.
  if (c.famille.startsWith("accessory")) return vueVerrou(contenu, d, c)
  if (tresGrand(c) && PAIRES[contenu]) return <Paire haut={PAIRES[contenu][0]} bas={PAIRES[contenu][1]} d={d} c={c} />
  switch (contenu) {
    case "solde": return <Solde d={d} c={c} />
    case "bundle": return <Bundle d={d} c={c} />
    case "accessoires": return <Accessoires d={d} c={c} />
    case "souhaits": return <Souhaits d={d} c={c} />
    case "nuit": return <Nuit d={d} c={c} />
    case "tout": return <Tout d={d} c={c} />
    case "stats": return <StatsVue d={d} c={c} />
    case "boutique+stats": return <BoutiqueStats d={d} c={c} />
    case "partie": return <Partie d={d} c={c} />
    case "jour": return <Jour d={d} c={c} />
    case "jour-carte": return <Jour d={{ ...d, jour: carte(d) }} c={c} />
    case "jour-travail": return <Jour d={{ ...d, jour: travail(d) }} c={c} />
    case "jour-vide": return <Jour d={{ ...d, jour: null, jourVide: true }} c={c} />
    case "jour-sans": return <Jour d={{ ...d, jour: null, jourVide: false, stats: null }} c={c} />
    case "souhaits-vide": return <Souhaits d={{ ...d, souhait: null }} c={c} />
    case "stats-vide": return <StatsVue d={{ ...d, stats: null }} c={c} />
    case "partie-vide": return <Partie d={{ ...d, stats: null }} c={c} />
    case "partie-nul": return <Partie d={{ ...d, stats: d.stats && d.stats.derniere ? { ...d.stats, derniere: { ...d.stats.derniere, issue: "N", pour: 13, contre: 13, rr: null, portrait: null } } : null }} c={c} />
    case "stats-nul": return <StatsVue d={{ ...d, stats: d.stats ? { ...d.stats, derniers: ["V", "N", "D", "V", "D"], rang: d.stats.rang && { ...d.stats.rang, variation: -19 } } : null }} c={c} />
    case "lecture": return <Boutique d={{ ...d, appui: { etat: "lecture", t: Date.now() } }} c={c} />
    case "a-jour": return <Boutique d={{ ...d, lueA: Date.now(), appui: { etat: "a-jour", t: Date.now() } }} c={c} />
    case "echec": return <Boutique d={{ ...d, appui: { etat: "echec", t: Date.now() } }} c={c} />
    case "session": return <Boutique d={{ ...d, sessionExpiree: true }} c={c} />
    default: return <Boutique d={d} c={c} />
  }
}

/** Les barres du carrousel, en haut du widget comme celles d'une story : une par vue, celle de la vue montrée en blanc. */
function Barres({ n, i, c }: { n: number; i: number; c: Cadre }) {
  const ecart = 3, bord = 12
  const l = Math.max(2, (c.l - 2 * bord - (n - 1) * ecart) / n)
  return (
    <VStack spacing={0} frame={{ width: c.l, height: c.h }}>
      <HStack spacing={ecart} padding={{ top: 5 }}>
        {Array.from({ length: n }, (_, k) => <Capsule fill={k === i ? "#ffffff" : "rgba(255,255,255,0.26)"} frame={{ width: l, height: 2 }} />)}
      </HStack>
      <Spacer />
    </VStack>
  )
}

/** La vue d'un carrousel (lot 3) : la vue numéro `i` de sa liste, sous ses barres. Une liste vide : la boutique. */
export function vueCarrousel(vues: readonly string[], i: number, d: Donnees, c: Cadre): VirtualNode {
  if (vues.length === 0) return vue("boutique", d, c)
  const k = ((i % vues.length) + vues.length) % vues.length
  return (
    <ZStack frame={{ width: c.l, height: c.h }}>
      {vue(vues[k], d, c)}
      {vues.length > 1 ? <Barres n={vues.length} i={k} c={c} /> : null}
    </ZStack>
  )
}
