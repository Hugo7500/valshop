import { Button, GeometryReader, HStack, ScrollView, Spacer, Text, VStack, Widget, ZStack, useEffect, useRef, useState, type VirtualNode } from "scripting"
import { C, DIN, fondWidget } from "./widgets-briques"
import { chargerDonnees } from "./widgets-donnees"
import { ecrireReglage, lireReglageGarde } from "./widgets-fichier"
import { preparerImages } from "./widgets-images"
import { PHRASES_ILE, type EtatIle } from "./widgets-ile"
import { arreterIle, assurerIle } from "./widgets-ile-app"
import {
  CARROUSEL, CLASSIQUE, CONTENUS, MODES_CARROUSEL, NOMS, NOMS_MODE, NOMS_PERIODE, PERIODES, SECONDES_CARROUSEL, avecPeriode, carrouselDe, choisir, choisirIle,
  choisirMode, choisirPeriode, choisirSecondes, cocherVue, contenuDe, deplacerVue, estVerrou, numeroLibre, numeros, periodeDe, retirer, vuesPossibles,
  type ModeCarrousel, type Reglage, type Taille,
} from "./widgets-reglage"
import type { Cadre, Donnees } from "./widgets-types"
import { vue, vueCarrousel } from "./widgets-toutes"

// L'écran « Mes widgets » (lot 1 de l'étude des widgets), poussé dans la pile de la feuille des réglages (engrenage de Stats ou de la
// Boutique ; reglages.tsx) : pour chaque widget et chaque taille, on
// touche l'aperçu du contenu voulu. Les aperçus sont les vraies vues des widgets, réduites, sur la boutique gardée. Le choix est
// écrit dans widgets.json (widgets-fichier.ts) et les widgets de l'écran d'accueil sont rechargés. Un widget se désigne par le
// nombre de sa case « Paramètre » : le 1 n'a rien à y écrire. Aucune requête, sauf les trois icônes des monnaies, gardées une
// fois (widgets-images.ts). Lot 3 : le carrousel se règle sous les aperçus (ses vues, leur ordre, sa façon d'avancer). Lot 4 :
// l'onglet « Verrou » règle les widgets de l'écran verrouillé (rectangle, rond) et l'île dynamique.


const FOND = "#080b10"
const BLOC = "#121821"
const NOM_TAILLE: Record<Taille, string> = { s: "Petit", m: "Moyen", l: "Grand", x: "Très grand", r: "Rectangle", c: "Rond", i: "Ligne" }
/** Les onglets de l'écran : les quatre tailles de l'écran d'accueil, puis l'écran verrouillé (ses trois formes ensemble). */
export type Onglet = "s" | "m" | "l" | "x" | "v"
const ONGLETS: Onglet[] = ["s", "m", "l", "x", "v"]
const NOM_ONGLET: Record<Onglet, string> = { s: "Petit", m: "Moyen", l: "Grand", x: "Très grand", v: "Verrou" }

/** La taille d'un aperçu : celles des widgets d'un iPhone de 402 points de large ; la très grande et l'écran verrouillé sont estimés. */
function cadreDe(t: Taille): Cadre {
  if (t === "s") return { famille: "systemSmall", l: 164, h: 164 }
  if (t === "m") return { famille: "systemMedium", l: 350, h: 164 }
  if (t === "l") return { famille: "systemLarge", l: 350, h: 366 }
  if (t === "r") return { famille: "accessoryRectangular", l: 160, h: 72, apercu: true }
  if (t === "c") return { famille: "accessoryCircular", l: 72, h: 72, apercu: true }
  if (t === "i") return { famille: "accessoryInline", l: 234, h: 26, apercu: true }
  return { famille: "systemExtraLargePortrait", l: 350, h: 568 }
}

/**
 * L'aperçu d'un contenu à la largeur voulue : la vraie vue du widget, réduite ; « classique » : une étiquette. `vues` : celles
 * du carrousel, si c'est lui qu'on montre (sa première vue, sous ses barres).
 */
function Apercu({ contenu, taille, d, largeur, vues }: { contenu: string; taille: Taille; d: Donnees | null; largeur: number; vues?: readonly string[] }) {
  const c = cadreDe(taille)
  const k = largeur / c.l
  const forme = { type: "rect" as const, cornerRadius: 22 * k }
  if (contenu === CLASSIQUE || d === null) {
    return (
      <VStack spacing={2} frame={{ width: largeur, height: c.h * k }} background={{ style: BLOC, shape: forme }}>
        <Spacer />
        <Text font={{ name: DIN, size: Math.max(11, 20 * k * 1.6) }} foregroundStyle={C.blanc} kerning={1} lineLimit={1} minScaleFactor={0.3}>
          {contenu === CLASSIQUE ? "CLASSIQUE" : "PAS DE BOUTIQUE"}
        </Text>
        {estVerrou(taille) ? null : (
          <Text font={10} foregroundStyle={C.doux} lineLimit={1} minScaleFactor={0.6}>
            {contenu === CLASSIQUE ? "ton widget d'avant" : "ouvre l'onglet Boutique"}
          </Text>
        )}
        <Spacer />
      </VStack>
    )
  }
  // L'écran verrouillé : la vue porte son propre fond (carte ou disque) ; la ligne, elle, est un simple texte.
  if (estVerrou(taille)) {
    return (
      <ZStack frame={{ width: largeur, height: c.h * k }}>
        <ZStack frame={{ width: c.l, height: c.h }} scaleEffect={k}>
          {vue(contenu, d, c)}
        </ZStack>
      </ZStack>
    )
  }
  return (
    <ZStack frame={{ width: largeur, height: c.h * k }} clipShape={forme}>
      <ZStack frame={{ width: c.l, height: c.h }} scaleEffect={k}>
        {contenu === CARROUSEL ? vueCarrousel(vues ?? [], 0, d, c) : vue(contenu, d, c)}
      </ZStack>
    </ZStack>
  )
}

/** Une carte de widget, en haut de l'écran : petit aperçu, « Widget n », ce qu'il montre à la taille choisie. */
function CarteWidget({ n, actif, r, taille, d, onChoix }: { n: number; actif: boolean; r: Reglage; taille: Taille; d: Donnees | null; onChoix: () => void }) {
  const contenu = contenuDe(r, n, taille)
  const c = cadreDe(taille)
  const largeur = Math.min(94, (58 * c.l) / c.h)
  return (
    <Button action={onChoix} buttonStyle="plain" accessibilityLabel={`Widget ${n}, ${estVerrou(taille) ? "écran verrouillé" : NOM_TAILLE[taille]}, ${NOMS[contenu] ?? contenu}`}>
      <VStack alignment="leading" spacing={3} padding={9} frame={{ width: 114, height: 118, alignment: "topLeading" }}
        background={{ style: actif ? "#2a161b" : BLOC, shape: { type: "rect", cornerRadius: 16 } }}
        overlay={actif ? <ZStack frame={{ width: 114, height: 118 }} background={{ style: "rgba(0,0,0,0)", shape: { type: "rect", cornerRadius: 16 } }} border={{ style: C.rouge, width: 2 }} clipShape={{ type: "rect", cornerRadius: 16 }} /> : undefined}>
        <ZStack frame={{ width: 96, height: 60 }}>
          <Apercu contenu={contenu} taille={taille} d={d} largeur={largeur} vues={contenu === CARROUSEL ? carrouselDe(r, n, taille).vues : undefined} />
        </ZStack>
        <Text font={14} fontWeight="bold" foregroundStyle={C.blanc}>{`Widget ${n}`}</Text>
        <Text font={11} foregroundStyle={C.doux} lineLimit={1} minScaleFactor={0.7}>{NOMS[contenu] ?? contenu}</Text>
      </VStack>
    </Button>
  )
}

/** Un aperçu à toucher, avec son nom ; choisi : entouré de rouge et coché. */
function Choix({ contenu, taille, d, largeur, choisi, onChoix, vues }: { contenu: string; taille: Taille; d: Donnees | null; largeur: number; choisi: boolean; onChoix: () => void; vues?: readonly string[] }) {
  const nom = NOMS[contenu] ?? contenu
  return (
    <Button action={onChoix} buttonStyle="plain" accessibilityLabel={nom} accessibilityAddTraits={choisi ? "isSelected" : undefined}>
      <VStack alignment="leading" spacing={5} frame={{ width: largeur, alignment: "topLeading" }}>
        <ZStack padding={choisi ? 3 : 0} background={{ style: choisi ? C.rouge : "rgba(0,0,0,0)", shape: taille === "c" ? "circle" : { type: "rect", cornerRadius: ((estVerrou(taille) ? 14 : 22) * largeur) / cadreDe(taille).l + 3 } }}>
          {estVerrou(taille) ? (
            // Sur l'écran verrouillé, la vue est translucide : un fond sombre sous elle, pour que le rouge du choix ne la teinte pas.
            <ZStack background={{ style: FOND, shape: taille === "c" ? "circle" : { type: "rect", cornerRadius: (14 * largeur) / cadreDe(taille).l } }}>
              <Apercu contenu={contenu} taille={taille} d={d} largeur={choisi ? largeur - 6 : largeur} />
            </ZStack>
          ) : <Apercu contenu={contenu} taille={taille} d={d} largeur={choisi ? largeur - 6 : largeur} vues={vues} />}
        </ZStack>
        <HStack spacing={4}>
          <Text font={12} fontWeight={choisi ? "bold" : "regular"} foregroundStyle={choisi ? C.blanc : C.doux} lineLimit={1} minScaleFactor={0.7}>{nom}</Text>
          {choisi ? <Text font={12} fontWeight="bold" foregroundStyle={C.rouge}>✓</Text> : null}
        </HStack>
      </VStack>
    </Button>
  )
}

/** Les aperçus rangés par lignes de `colonnes`. */
function Grille({ contenus, colonnes, largeur, rendre }: { contenus: readonly string[]; colonnes: number; largeur: number; rendre: (contenu: string, largeur: number) => VirtualNode }) {
  const ecart = 10
  const lt = (largeur - (colonnes - 1) * ecart) / colonnes
  const lignes: string[][] = []
  for (let i = 0; i < contenus.length; i += colonnes) lignes.push(contenus.slice(i, i + colonnes))
  return (
    <VStack alignment="leading" spacing={14}>
      {lignes.map((l) => (
        <HStack alignment="top" spacing={ecart}>
          {l.map((c) => rendre(c, lt))}
        </HStack>
      ))}
    </VStack>
  )
}

/** Des boutons côte à côte, celui du choix en clair (tailles, périodes, façons d'avancer). */
function Segments<T extends string | number>({ choix, choisi, nom, largeur, onChoix }: { choix: readonly T[]; choisi: T; nom: (x: T) => string; largeur: number; onChoix: (x: T) => void }) {
  const n = choix.length
  return (
    <HStack spacing={2} padding={2} frame={{ width: largeur }} background={{ style: BLOC, shape: { type: "rect", cornerRadius: 10 } }}>
      {choix.map((x) => (
        <Button action={() => onChoix(x)} buttonStyle="plain" accessibilityLabel={nom(x)} accessibilityAddTraits={x === choisi ? "isSelected" : undefined}>
          <ZStack frame={{ width: (largeur - 4 - (n - 1) * 2) / n, height: 32 }} background={{ style: x === choisi ? "#2a333f" : "rgba(0,0,0,0)", shape: { type: "rect", cornerRadius: 8 } }}>
            <Text font={13} fontWeight="semibold" foregroundStyle={x === choisi ? C.blanc : C.doux} lineLimit={1} minScaleFactor={0.6}>{nom(x)}</Text>
          </ZStack>
        </Button>
      ))}
    </HStack>
  )
}

const Titre = ({ t }: { t: string }) => <Text font={12} foregroundStyle={C.doux}>{t}</Text>
const Note = ({ t }: { t: string }) => <Text font={11} foregroundStyle={C.doux}>{t}</Text>

/** Lot 2 : la période des stats d'un widget, quand ce qu'il montre en dépend. */
function Periode({ r, n, largeur, garder }: { r: Reglage; n: number; largeur: number; garder: (neuf: Reglage) => void }) {
  return (
    <VStack alignment="leading" spacing={8} padding={{ top: 6 }} frame={{ width: largeur, alignment: "leading" }}>
      <Titre t={`PÉRIODE DES STATS DU WIDGET ${n}`} />
      <Segments choix={PERIODES} choisi={periodeDe(r, n)} nom={(p) => NOMS_PERIODE[p]} largeur={largeur} onChoix={(p) => garder(choisirPeriode(r, n, p))} />
      <Note t="Compétition seulement. Les chiffres sont ceux de l'onglet Stats, à sa dernière ouverture." />
    </VStack>
  )
}

const PHRASES_MODE: Record<ModeCarrousel, string> = {
  ios: "Le widget passe à la vue suivante environ tous les quarts d'heure, quand iOS le redessine. Tu peux aussi toucher son bord droit ou son bord gauche.",
  doigt: "Le widget change de vue seulement quand tu touches son bord droit ou son bord gauche.",
  continu: "Le widget défile sans s'arrêter. Ses bords ne servent plus : un appui ouvre l'app.",
}

/** Lot 3 : le réglage d'un carrousel, sous les aperçus : ses vues cochées, dans l'ordre, puis les autres ; sa façon d'avancer. */
export function ReglageCarrousel({ r, n, taille, largeur, garder }: { r: Reglage; n: number; taille: Taille; largeur: number; garder: (neuf: Reglage) => void }) {
  const car = carrouselDe(r, n, taille)
  const autres = vuesPossibles(taille).filter((v) => !car.vues.includes(v))
  const fleche = (signe: string, nom: string, v: string, sens: -1 | 1, eteinte: boolean) => (
    <Button action={() => { if (!eteinte) garder(deplacerVue(r, n, taille, v, sens)) }} buttonStyle="plain" accessibilityLabel={`${nom} ${NOMS[v] ?? v}`} disabled={eteinte}>
      <ZStack frame={{ width: 36, height: 36 }} background={{ style: "rgba(255,255,255,0.07)", shape: { type: "rect", cornerRadius: 9 } }} opacity={eteinte ? 0.3 : 1}>
        <Text font={12} foregroundStyle={C.blanc}>{signe}</Text>
      </ZStack>
    </Button>
  )
  const rangee = (v: string, i: number | null) => (
    <HStack spacing={8} padding={{ horizontal: 12 }} frame={{ width: largeur, height: 48 }}>
      <Button action={() => garder(cocherVue(r, n, taille, v))} buttonStyle="plain" accessibilityLabel={NOMS[v] ?? v} accessibilityAddTraits={i !== null ? "isSelected" : undefined}>
        <HStack spacing={10} frame={{ height: 48 }} contentShape="rect">
          <ZStack frame={{ width: 24, height: 24 }} background={{ style: i !== null ? C.rouge : "rgba(255,255,255,0.12)", shape: { type: "rect", cornerRadius: 7 } }}>
            {i !== null ? <Text font={13} fontWeight="bold" foregroundStyle={C.blanc}>✓</Text> : null}
          </ZStack>
          <Text font={15} foregroundStyle={i !== null ? C.blanc : C.doux} lineLimit={1} minScaleFactor={0.7}>{NOMS[v] ?? v}</Text>
        </HStack>
      </Button>
      <Spacer />
      {i !== null ? fleche("▲", "Monter", v, -1, i === 0) : null}
      {i !== null ? fleche("▼", "Descendre", v, 1, i === car.vues.length - 1) : null}
    </HStack>
  )
  return (
    <VStack alignment="leading" spacing={8} padding={{ top: 6 }} frame={{ width: largeur, alignment: "leading" }}>
      <Titre t={`LES VUES DU CARROUSEL, DANS L'ORDRE`} />
      <VStack alignment="leading" spacing={0} frame={{ width: largeur }} background={{ style: BLOC, shape: { type: "rect", cornerRadius: 12 } }}>
        {car.vues.map((v, i) => rangee(v, i))}
        {autres.map((v) => rangee(v, null))}
      </VStack>
      <Note t="Coche les vues à montrer ; les flèches les rangent. Il en faut au moins une." />
      <VStack alignment="leading" spacing={8} padding={{ top: 6 }}>
        <Titre t="IL AVANCE" />
        <Segments choix={MODES_CARROUSEL} choisi={car.mode} nom={(m) => NOMS_MODE[m]} largeur={largeur} onChoix={(m) => garder(choisirMode(r, n, taille, m))} />
        <Note t={PHRASES_MODE[car.mode]} />
        {car.mode === "continu" ? (
          <VStack alignment="leading" spacing={8}>
            <Titre t="TEMPS PASSÉ SUR CHAQUE VUE" />
            <Segments choix={SECONDES_CARROUSEL} choisi={car.secondes} nom={(x) => `${x} s`} largeur={largeur} onChoix={(x) => garder(choisirSecondes(r, n, taille, x))} />
          </VStack>
        ) : null}
      </VStack>
    </VStack>
  )
}

/** Lot 4 : l'onglet « Verrou » : le rectangle et le rond de l'écran verrouillé, la ligne au-dessus de l'heure, l'île dynamique. */
export function Verrou({ r, n, d, largeur, garder }: { r: Reglage; n: number; d: Donnees | null; largeur: number; garder: (neuf: Reglage) => void }) {
  // Où en est l'île : dit après un changement de son réglage, et à l'ouverture de l'onglet si elle est allumée.
  const [etat, setEtat] = useState<EtatIle>("eteinte")
  const allumee = r.ile === true
  useEffect(() => {
    let vivant = true
    if (allumee) assurerIle().then((e) => { if (vivant) setEtat(e) }).catch(() => { /* rien à dire */ })
    else {
      setEtat("eteinte")
      arreterIle().catch(() => { /* iOS la retirera de lui-même */ })
    }
    return () => { vivant = false }
  }, [allumee])
  const forme = (t: Taille, colonnes: number) => (
    <Grille contenus={CONTENUS[t]} colonnes={colonnes} largeur={largeur}
      rendre={(c, l) => <Choix contenu={c} taille={t} d={d} largeur={Math.min(l, cadreDe(t).l * 1.15)} choisi={c === contenuDe(r, n, t)} onChoix={() => garder(choisir(r, n, t, c))} />} />
  )
  return (
    <VStack alignment="leading" spacing={16} frame={{ width: largeur, alignment: "leading" }}>
      <VStack alignment="leading" spacing={10}>
        <Titre t={`RECTANGLE DU WIDGET ${n}`} />
        {forme("r", 2)}
      </VStack>
      {avecPeriode(r, n, "r") ? <Periode r={r} n={n} largeur={largeur} garder={garder} /> : null}
      <VStack alignment="leading" spacing={10}>
        <Titre t={`ROND DU WIDGET ${n}`} />
        {forme("c", 4)}
      </VStack>
      <VStack alignment="leading" spacing={10}>
        <Titre t="LIGNE AU-DESSUS DE L'HEURE" />
        <HStack spacing={0} padding={{ horizontal: 12 }} frame={{ width: largeur, height: 40, alignment: "leading" }} background={{ style: BLOC, shape: { type: "rect", cornerRadius: 12 } }}>
          {d !== null ? vue("ligne", d, cadreDe("i")) : <Text foregroundStyle={C.doux}>Pas de boutique</Text>}
          <Spacer />
        </HStack>
        <Note t="Elle dit ton souhait s'il est en boutique, sinon les skins du jour." />
      </VStack>
      <Note t={"Sur l'écran verrouillé, iOS dessine tout en une seule couleur. Pour les poser : reste appuyé sur ton écran verrouillé, « Personnaliser », touche la zone des widgets, puis ajoute celui de Scripting et choisis ValShop." + (n > 1 ? ` Écris ${n} dans sa case « Paramètre ».` : "")} />

      <VStack alignment="leading" spacing={8} padding={{ top: 6 }}>
        <Titre t="ÎLE DYNAMIQUE" />
        <HStack spacing={10} padding={12} frame={{ width: largeur, alignment: "leading" }} background={{ style: BLOC, shape: { type: "rect", cornerRadius: 12 } }}>
          <VStack alignment="leading" spacing={3}>
            <Text font={15} foregroundStyle={C.blanc}>Quand un souhait est en boutique</Text>
            <Text font={11} foregroundStyle={C.doux}>{allumee ? "Allumée" : "Éteinte"}</Text>
          </VStack>
          <Spacer />
          <Segments choix={["non", "oui"] as const} choisi={allumee ? "oui" : "non"} nom={(x) => (x === "oui" ? "Oui" : "Non")} largeur={112} onChoix={(x) => garder(choisirIle(r, x === "oui"))} />
        </HStack>
        {allumee && PHRASES_ILE[etat] !== "" ? <Text font={12} foregroundStyle={etat === "refusee" || etat === "echec" ? "#ff9f43" : C.blanc}>{PHRASES_ILE[etat]}</Text> : null}
        <Note t="L'étoile et le compte à rebours du reset s'affichent dans l'île dynamique ; en la touchant, et sur l'écran verrouillé : le skin, son prix, l'heure du reset. Elle se lance quand ValShop lit ta boutique, app ouverte. iOS l'arrête de lui-même au bout de quelques heures." />
      </VStack>

      <VStack alignment="leading" spacing={8} padding={{ top: 6 }}>
        <Titre t="CENTRE DE CONTRÔLE" />
        <Note t="Un bouton « Lire la boutique », sans ouvrir l'app : ouvre le centre de contrôle, reste appuyé sur un espace vide, « Ajouter une commande », cherche Scripting, prends son bouton et choisis ValShop." />
      </VStack>
    </VStack>
  )
}

function Corps({ largeur, depart }: { largeur: number; depart?: Onglet }) {
  const [r, setR] = useState<Reglage>(lireReglageGarde)
  const [n, setN] = useState(1)
  const [onglet, setOnglet] = useState<Onglet>(depart ?? "m")
  const [erreur, setErreur] = useState<string | null>(null)
  // Les données des aperçus : celles du widget choisi, à sa période (lot 2) ; relues quand la période change, ou quand des
  // images viennent d'arriver (`images`).
  const [images, setImages] = useState(0)
  const periode = periodeDe(r, n)
  const lues = useRef<{ cle: string; d: Donnees | null } | null>(null)
  const cle = `${periode}|${images}`
  if (lues.current === null || lues.current.cle !== cle) lues.current = { cle, d: chargerDonnees(periode) }
  const d = lues.current.d

  // Les icônes des monnaies et les images des stats, gardées une fois ; les aperçus sont relus si elles viennent d'arriver.
  useEffect(() => {
    preparerImages().then((neuves) => { if (neuves) setImages((x) => x + 1) }).catch(() => { /* les aperçus s'affichent sans elles */ })
  }, [])

  const garder = (neuf: Reglage) => {
    if (neuf === r) return
    try {
      ecrireReglage(neuf)
      setR(neuf)
      setErreur(null)
      try { Widget.reloadAll() } catch { /* les widgets se rechargeront seuls */ }
    } catch (e) {
      setErreur("Réglage non gardé : " + String(e).slice(0, 120))
    }
  }
  const libre = numeroLibre(r)
  const marge = 16
  const utile = Math.min(largeur, 520) - 2 * marge
  // La taille des cartes du haut et des aperçus : celle de l'onglet ; pour l'écran verrouillé, son rectangle.
  const taille: Taille = onglet === "v" ? "r" : onglet
  const choisi = contenuDe(r, n, taille)

  return (
    <ScrollView>
      <VStack alignment="leading" spacing={16} padding={{ top: 8, bottom: 30 }}>
        <ScrollView axes="horizontal">
          <HStack spacing={10} padding={{ horizontal: marge }}>
            {numeros(r).map((x) => <CarteWidget n={x} actif={x === n} r={r} taille={taille} d={d} onChoix={() => setN(x)} />)}
            {libre !== null ? (
              <Button action={() => { garder(onglet === "v" ? choisir(r, libre, "r", CONTENUS.r[0]) : choisir(r, libre, taille, CLASSIQUE)); setN(libre) }} buttonStyle="plain" accessibilityLabel="Nouveau widget">
                <VStack spacing={4} frame={{ width: 114, height: 118 }} background={{ style: "rgba(255,255,255,0.05)", shape: { type: "rect", cornerRadius: 16 } }}>
                  <Spacer />
                  <Text font={30} foregroundStyle={C.rouge}>＋</Text>
                  <Text font={13} fontWeight="bold" foregroundStyle={C.rouge}>Nouveau widget</Text>
                  <Spacer />
                </VStack>
              </Button>
            ) : null}
          </HStack>
        </ScrollView>

        <VStack alignment="leading" spacing={16} padding={{ horizontal: marge }}>
        {n > 1 ? (
          <HStack spacing={10} padding={12} frame={{ width: utile, alignment: "leading" }} background={{ style: BLOC, shape: { type: "rect", cornerRadius: 12 } }}>
            <ZStack frame={{ width: 28, height: 28 }} background={{ style: C.rouge, shape: { type: "rect", cornerRadius: 7 } }}>
              <Text font={15} fontWeight="bold" foregroundStyle={C.blanc}>{String(n)}</Text>
            </ZStack>
            <Text font={13} foregroundStyle={C.blanc}>
              {`Pour le poser : sur l'écran d'accueil, reste appuyé sur le widget, « Modifier le widget », et écris ${n} dans la case « Paramètre ».`}
            </Text>
          </HStack>
        ) : null}

        {/* Le choix de la taille : cinq boutons côte à côte, celui de l'onglet montré en clair. */}
        <Segments choix={ONGLETS} choisi={onglet} nom={(t) => NOM_ONGLET[t]} largeur={utile} onChoix={setOnglet} />

        {onglet === "v" ? <Verrou r={r} n={n} d={d} largeur={utile} garder={garder} /> : (
        <VStack alignment="leading" spacing={10} frame={{ width: utile, alignment: "leading" }}>
          <Titre t={`CE QUE MONTRE LE WIDGET ${n}`} />
          <Grille contenus={CONTENUS[taille]} colonnes={taille === "s" ? 3 : 2} largeur={utile}
            rendre={(c, l) => <Choix contenu={c} taille={taille} d={d} largeur={l} choisi={c === choisi} onChoix={() => garder(choisir(r, n, taille, c))} vues={c === CARROUSEL ? carrouselDe(r, n, taille).vues : undefined} />} />
          {taille === "x" ? <Note t="La très grande taille est estimée : son aperçu peut différer un peu du widget." /> : null}
          {choisi === CARROUSEL ? <ReglageCarrousel r={r} n={n} taille={taille} largeur={utile} garder={garder} /> : null}
          {avecPeriode(r, n, taille) ? <Periode r={r} n={n} largeur={utile} garder={garder} /> : null}
        </VStack>
        )}
        {erreur !== null ? <Text font={12} foregroundStyle="#ff9f43">{erreur}</Text> : null}

        {n > 1 ? (
          <Button action={() => { garder(retirer(r, n)); setN(1) }} buttonStyle="plain">
            <ZStack frame={{ width: utile, height: 46 }} background={{ style: BLOC, shape: { type: "rect", cornerRadius: 12 } }}>
              <Text font={15} fontWeight="bold" foregroundStyle="#ff7783">{`Supprimer le Widget ${n}`}</Text>
            </ZStack>
          </Button>
        ) : null}
        </VStack>
      </VStack>
    </ScrollView>
  )
}

/**
 * L'écran, poussé dans la pile de la feuille des réglages (reglages.tsx). `depart` : l'onglet montré à l'ouverture (moyen
 * par défaut).
 */
export function MesWidgets({ depart }: { depart?: Onglet }) {
  return (
    <GeometryReader>
      {(g) => (
        <ZStack frame={{ width: g.size.width, height: g.size.height, alignment: "topLeading" }} background={FOND} navigationTitle="Mes widgets" navigationBarTitleDisplayMode="inline" preferredColorScheme="dark">
          <Corps largeur={g.size.width} depart={depart} />
        </ZStack>
      )}
    </GeometryReader>
  )
}
