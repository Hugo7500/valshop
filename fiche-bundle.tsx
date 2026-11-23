import {
  Button, EmptyView, HStack, Image, LabeledContent, List, Rectangle, Section, Spacer, Text, VStack, useRef, useState,
  type VirtualNode,
} from "scripting"
import { COULEURS } from "./design"
import { EnTeteFiche } from "./fiche-cartes"
import { FicheAccessoire } from "./fiche-accessoire"
import { FicheSkin } from "./fiche-skin"
import { jusquAu, libelleType, objetsDuBundle, separerNom, type ObjetAffiche } from "./fiches"
import { langueDesNoms } from "./langue"
import { CATALOG } from "./valshop"
import { iconeLisible, imageAdmise } from "./securite"

// Fiche d'un bundle (CAP-25, entrée 3 de epic-boutique-visuels), poussée dans la pile de l'onglet Boutique (vue.tsx) par
// un appui sur un bundle en vedette. Ouverte par le bundle tel que le range shop.json (nom, icône en cache, prix, fin,
// objets) et `ouverture`, numéro qui change à chaque appui. Grande image : l'icône du bundle, déjà en cache (aucune
// requête) ; puis ses objets, chacun avec son image chargée par adresse depuis catalog.json (lu une fois, au montage,
// jamais écrit ; objetsDuBundle, fiches.ts), son nom, son type et son prix dans le bundle. Un appui sur un objet pousse
// sa fiche par la pile de la fiche : un skin, la fiche d'un skin (fiche-skin.tsx), ouverte telle quelle par l'uuid du
// niveau, le prix dans le bundle et l'objet en repli (nom et image), avec un numéro d'ouverture neuf à chaque appui ;
// tout autre objet, inconnu compris, la fiche d'un accessoire (fiche-accessoire.tsx). Une nouvelle ouverture du bundle ne
// montre aucun objet poussé. Ce qui manque se dit sans erreur ni nouvel essai : objets d'un shop.json d'avant CAP-25
// (la note), aucun objet lu (« Contenu indisponible. »), image d'un objet absente ou en échec (emplacement vide).

/** Bundle de shop.json (Bundle, contrat-donnees.md) ; `items`, absent d'un fichier d'avant CAP-25, lu sans confiance. */
export type BundleAffiche = {
  id: string; name: string; icon: string | null; cost: number | null; discounted: number | null; endsAt: string | null
  items?: unknown
}

/** Fond de page de l'app, sous la liste de la fiche comme sous celle de l'onglet. */
const FOND = COULEURS.standard.fond
/** Hauteur de la grande image ; celle d'un bundle, large, s'y loge en largeur. */
const HAUTEUR_IMAGE = 180
/** Image d'un objet : le cadre d'une rangée de la liste de l'onglet. */
const CADRE = { width: 68, height: 30 }

/** Lit le catalogue local. Absent : null, sans bruit ; illisible : null et une ligne en console. */
function lireCatalogue(): unknown {
  try {
    return FileManager.existsSync(CATALOG) ? JSON.parse(FileManager.readAsStringSync(CATALOG)) : null
  } catch (e) {
    console.log("fiche du bundle : catalog.json illisible (" + e + ")")
    return null
  }
}

/** Prix en VP ; « — » si inconnu. */
function prixDit(prix: number | null): string {
  return prix == null ? "—" : `${prix} VP`
}

/**
 * Grande image : l'icône du bundle, en cache (le moteur n'écrit que des chemins locaux ; une adresse web, que le contrat
 * permet encore, s'afficherait quand même) ; sans icône, « Image indisponible ».
 */
function GrandeImage({ icon }: { icon: string | null }) {
  // Ticket 7.8 (F3) : une adresse web seulement de media.valorant-api.com ; entrée 16 de epic-boutique-visuels : un chemin
  // local, par son seul nom de fichier, dans `icons/` du dossier partagé d'aujourd'hui (securite.ts, iconeLisible).
  const icone = iconeLisible(icon, FileManager.appGroupDocumentsDirectory)
  if (icone === null) return <Text foregroundStyle="secondaryLabel">Image indisponible</Text>
  return icone.startsWith("http") ? (
    <Image imageUrl={icone} resizable scaleToFit frame={{ maxWidth: "infinity", minHeight: HAUTEUR_IMAGE, maxHeight: HAUTEUR_IMAGE }} />
  ) : (
    <Image filePath={icone} resizable scaleToFit frame={{ maxWidth: "infinity", minHeight: HAUTEUR_IMAGE, maxHeight: HAUTEUR_IMAGE }} />
  )
}





function libelles(o: ObjetAffiche): { titre: string; secondaire: string; voix: string } {
  if (o.kind === "skin") {
    const { skin, weapon } = separerNom(o.name, langueDesNoms() === "en-US")
    return { titre: skin, secondaire: weapon ? `Skin · ${weapon}` : "Skin", voix: [skin, "Skin", weapon].filter((t) => t !== "").join(", ") }
  }
  const type = libelleType(o.kind)
  return { titre: o.name, secondaire: type, voix: `${o.name}, ${type}` }
}

/**
 * Rangée d'un objet, dans un bouton qui pousse sa fiche : image par adresse (emplacement vide sans elle), titre, ligne
 * secondaire, prix dans le bundle (prix de base barré quand il diffère) puis chevron ; VoiceOver : titre, type, arme,
 * prix. Couleurs explicites : dans le bouton, les textes ne prennent pas la teinte.
 */
function RangeeObjet({ objet, adresse, onEchec, ouvrir }: {
  objet: ObjetAffiche; adresse: string | null; onEchec: (adresse: string) => void; ouvrir: (objet: ObjetAffiche) => void
}) {
  const { titre, secondaire, voix } = libelles(objet)
  const prix = objet.discounted ?? objet.cost
  const barre = objet.cost != null && objet.cost !== prix
  return (
    <Button action={() => ouvrir(objet)} accessibilityLabel={`${voix}, ${prix == null ? "prix inconnu" : `${prix} VP`}`}>
      <HStack spacing={10}>
        {adresse && imageAdmise(adresse) ? (
          <Image imageUrl={adresse} resizable scaleToFit frame={CADRE} onError={() => onEchec(adresse)} />
        ) : (
          <Rectangle fill="clear" frame={CADRE} />
        )}
        <VStack alignment="leading" spacing={1}>
          <Text font="body" fontWeight="semibold" foregroundStyle="label" lineLimit={1}>
            {titre}
          </Text>
          <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
            {secondaire}
          </Text>
        </VStack>
        <Spacer />
        <HStack spacing={8}>
          {barre ? (
            <Text font="caption" foregroundStyle="secondaryLabel" monospacedDigit strikethrough="secondaryLabel">
              {objet.cost}
            </Text>
          ) : null}
          <Text font="body" fontWeight="semibold" foregroundStyle="label" monospacedDigit>
            {prix ?? "—"}
          </Text>
          <Image systemName="chevron.right" font="footnote" foregroundStyle="tertiaryLabel" />
        </HStack>
      </HStack>
    </Button>
  )
}

/**
 * La fiche d'un objet, poussée par celle du bundle ; `icon` : son image, sauf en échec ; `n` : son numéro d'ouverture,
 * neuf à chaque appui ; `echecs` : les adresses en échec dans la fiche du bundle, que celle d'un accessoire, qui relit
 * catalog.json, ne redemande jamais.
 */
function ficheDe(o: ObjetAffiche, icon: string | null, n: number, echecs: string[]): VirtualNode {
  if (o.kind === "skin") return <FicheSkin id={o.id} prix={o.discounted ?? o.cost} offre={offreDe(o, icon)} ouverture={n} />
  return <FicheAccessoire id={o.id} offre={offreDe(o, icon) as { name: string; kind: string; icon: string | null }} prix={prixDit(o.discounted ?? o.cost)} echouees={echecs} />
}

/** Ticket 4.51 : l'offre d'un objet pour sa fiche, le même objet tant que l'objet et son image sont les mêmes (fiche non rendue de nouveau). */
const OFFRES = new WeakMap<ObjetAffiche, { icon: string | null; offre: { name: string; kind?: string; icon: string | null } }>()
function offreDe(o: ObjetAffiche, icon: string | null) {
  const t = OFFRES.get(o)
  if (t && t.icon === icon) return t.offre
  // Les mêmes props qu'avant : { name, icon } pour un skin, { name, kind, icon } pour un accessoire.
  const offre = o.kind === "skin" ? { name: o.name, icon } : { name: o.name, kind: o.kind, icon }
  OFFRES.set(o, { icon, offre })
  return offre
}

/**
 * Ticket 4.51 : une fonction qui reste la même d'un rendu à l'autre et appelle celle du dernier rendu (useStable de vue.tsx) :
 * Scripting ne rend pas une rangée aux props inchangées. Par useRef : le faux hôte du harnais n'a pas `useCallback`.
 */
function useStable<A extends unknown[], R>(f: (...a: A) => R): (...a: A) => R {
  const boite = useRef<{ f: (...a: A) => R; stable: ((...a: A) => R) | null }>({ f, stable: null })
  const b = boite.current
  b.f = f
  if (b.stable === null) b.stable = (...a: A) => b.f(...a)
  return b.stable
}

/**
 * La fiche d'un bundle : grande image, nom, fin, prix, puis ses objets. `ouverture` : numéro qui change à chaque appui
 * sur un bundle de la liste ; l'objet poussé vaut pour cette ouverture seule.
 */
export function FicheBundle({ bundle, ouverture }: { bundle: BundleAffiche; ouverture?: number }) {
  const [catalogue] = useState<unknown>(lireCatalogue)
  // Adresses qui n'ont pas chargé : plus jamais redemandées tant que la fiche est là, ni par la fiche d'un objet.
  const [echecs, setEchecs] = useState<string[]>([])
  const echouer = useStable((adresse: string) => setEchecs((l) => (l.includes(adresse) ? l : [...l, adresse])))
  // Objet poussé (`navigationDestination` de la liste) pour une ouverture de la fiche : rien avant le premier appui ; au
  // retour, `poussee` repasse à faux et sa fiche reste le temps de l'animation. `n` ne fait que croître : la fiche d'un
  // skin, restée à sa place, reçoit un numéro neuf à chaque appui et repart de sa 1re variante.
  const [pile, setPile] = useState<{ ouverture: number | undefined; objet: ObjetAffiche | null; poussee: boolean; n: number }>(
    { ouverture, objet: null, poussee: false, n: 0 },
  )
  const actuelle = pile.ouverture === ouverture
  const ouvrir = useStable((objet: ObjetAffiche) => setPile((p) => ({ ouverture, objet, poussee: true, n: p.n + 1 })))
  // Ticket 4.51 : les objets calculés une fois par bundle (les mêmes d'un rendu à l'autre : rangées non rendues de nouveau).
  const tenus = useRef<{ items: unknown; objets: ObjetAffiche[] | null } | null>(null)
  if (tenus.current === null || tenus.current.items !== bundle.items) tenus.current = { items: bundle.items, objets: objetsDuBundle(bundle.items, catalogue) }
  const objets = tenus.current.objets
  const adresse = (o: ObjetAffiche) => (o.icon && !echecs.includes(o.icon) ? o.icon : null)
  const pousse = actuelle ? pile.objet : null
  const prix = bundle.discounted ?? bundle.cost

  return (
    <List
      navigationTitle={bundle.name}
      navigationBarTitleDisplayMode="inline"
      scrollContentBackground="hidden"
      background={FOND}
      navigationDestination={{
        isPresented: actuelle && pile.poussee,
        onChanged: (poussee: boolean) =>
          setPile((p) => (p.ouverture === ouverture ? { ...p, poussee } : { ouverture, objet: null, poussee: false, n: p.n })),
        content: pousse ? ficheDe(pousse, adresse(pousse), pile.n, echecs) : <EmptyView />,
      }}
    >
      { }
      <Section>
        <VStack listRowBackground={<Rectangle fill="clear" />} listRowSeparator="hidden" listRowInsets={0}>
          <EnTeteFiche t={COULEURS.standard} image={<GrandeImage icon={bundle.icon} />} nom={bundle.name} intitule={jusquAu(bundle.endsAt)} />
        </VStack>
      </Section>
      <Section listRowBackground={<Rectangle fill={COULEURS.standard.surface} />}>
        <LabeledContent title="Prix" value={prixDit(prix)} />
        {bundle.cost != null && bundle.cost !== prix ? <LabeledContent title="Prix de base" value={prixDit(bundle.cost)} /> : null}
      </Section>
      <Section title="Contenu" listRowBackground={<Rectangle fill={COULEURS.standard.surface} />}>
        {objets === null ? (
          <Text foregroundStyle="secondaryLabel">Contenu après la prochaine mise à jour de la boutique.</Text>
        ) : objets.length === 0 ? (
          <Text foregroundStyle="secondaryLabel">Contenu indisponible.</Text>
        ) : (
          objets.map((o) => (
            <RangeeObjet key={o.id} objet={o} adresse={adresse(o)} onEchec={echouer} ouvrir={ouvrir} />
          ))
        )}
      </Section>
    </List>
  )
}
