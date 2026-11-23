import {
  Navigation, NavigationStack, NavigationLink, List, Section, LabeledContent, ContentUnavailableView,
  HStack, VStack, Text, Image, Rectangle, Spacer, Button, EmptyView, EnvironmentValuesReader, GeometryReader, ScrollView, Widget, useEffect, useRef, useState,
  ImageRenderer, type VirtualNode,
} from "scripting"
import {
  LIMITE_RECHERCHE, basculer, catalogueAncien, chercher, contient, lireListe, type Souhait,
} from "./souhaits"
import { CatalogueSkins } from "./catalogue-web"
import { CatalogueAccessoires } from "./accessoires-web"
import { BoutonSecondaire, COULEURS, ESPACES, TYPO, couleurs, tailleAccessibilite } from "./design"
import {
  BandeauSouhait, Carte, CarteBundle, CarteOffre, Defilant, ECART, EtatBoutique, GrilleOffres, MARGE_PAGE, TitreSection, TuileAcces, TuileAccessoire,
  type OffreVue, type Teintes,
} from "./boutique-cartes"
import { chargerDonnees } from "./widgets-donnees"
import { FicheAccessoire } from "./fiche-accessoire"
import { FicheBundle } from "./fiche-bundle"
import { FicheSkin, type OffreAffichee } from "./fiche-skin"
import { jusquAu, libelleType, type ObjetBundle } from "./fiches"
import { boutiqueExpiree, type IssueLecture } from "./garde-fou"
import { delaiEnClair } from "./historique"
import { CATALOG, SHOP_FILE, SOLDE_FILE, WISHLIST_FILE, lireBoutique, loadCookies, note } from "./valshop"
import { planifierIle } from "./widgets-ile-app"
import { iconeLisible } from "./securite"
import { DEJA_A_TOI, VOIX_DEJA_A_TOI, accessoirePossede, skinPossede } from "./possessions"
import { possessionsLues } from "./possessions-ecran"
import { MaCollection } from "./collection"
import { locale } from "./langue"
import { ImagePartage } from "./boutique-cartes"
import { ligneSolde, lireSolde, type IssueSolde, type SoldeGarde } from "./solde"


































/** Même cadre que l'image d'une tuile du widget en format moyen. */
const CADRE = { width: 68, height: 30 }

/** Fond de page de l'app (DESIGN.md, Colors), le même dans les deux palettes de contraste : sous les listes, à la place du fond groupé du système. */
const FOND = COULEURS.standard.fond

// Champs de `shop.json` lus ici (voir contrat-donnees.md) ; `bundles` et
// `accessories` manquent dans un fichier d'avant leur arrivée : sections vides ; les
// objets d'un bundle (`items`), dans un fichier d'avant CAP-25 : sa fiche le dit.
type Item = { id: string; name: string; cost: number | null; icon: string | null; color: string | null }
type ItemNM = Item & { discounted: number | null; discountPercent: number | null }
type Bundle = {
  id: string; name: string; icon: string | null
  cost: number | null; discounted: number | null; endsAt: string | null
  items?: ObjetBundle[]
}
type Accessoire = {
  id: string; kind: string; name: string; icon: string | null
  cost: number | null; endsAt: string | null
}
export type Shop = {
  updatedAt: string
  daily: { items: Item[]; resetAt: string | null }
  nightMarket?: { active: boolean; items?: ItemNM[] }
  bundles?: Bundle[]
  accessories?: { items?: Accessoire[] }
}

/** Lit la boutique en cache. Absente : null, sans bruit. Illisible : null et une ligne en console. */
export function charger(): Shop | null {
  try {
    if (!FileManager.existsSync(SHOP_FILE)) return null
    const shop = JSON.parse(FileManager.readAsStringSync(SHOP_FILE)) as Shop
    if (!shop?.daily || !Array.isArray(shop.daily.items)) throw new Error("format inattendu")
    return shop
  } catch (e) {
    console.log("vue : shop.json illisible (" + e + ")")
    return null
  }
}

/**
 * Entrée 17 de epic-boutique-visuels : le solde gardé (solde.json), lu sur place, sans requête. Absent : null, sans bruit ;
 * illisible ou d'une autre forme : null aussi (lireSolde), une ligne en console si la lecture lève.
 */
export function chargerSolde(): SoldeGarde | null {
  try {
    return FileManager.existsSync(SOLDE_FILE) ? lireSolde(FileManager.readAsStringSync(SOLDE_FILE)) : null
  } catch (e) {
    console.log("vue : solde.json illisible (" + e + ")")
    return null
  }
}

/**
 * Relecture 2 (ticket 4.51) : ce qu'on sait de shop.json tel que lu : sa date de modification (si Scripting la donne,
 * `FileManager.statSync`) et son texte ; null : absent ou illisible.
 */
export type EmpreinteBoutique = { date: number | null; texte: string | null }

function dateDeShop(): number | null {
  try {
    const f: any = FileManager
    if (typeof f.statSync !== "function") return null
    const d = f.statSync(SHOP_FILE).modificationDate
    return typeof d === "number" && Number.isFinite(d) ? d : null
  } catch {
    return null
  }
}

/** Le texte de shop.json, null s'il manque ou ne se lit pas ; sans bruit. */
function texteDeShop(): string | null {
  try {
    return FileManager.existsSync(SHOP_FILE) ? FileManager.readAsStringSync(SHOP_FILE) : null
  } catch {
    return null
  }
}

/** La boutique d'un texte de shop.json : null si absent ; illisible : null et une ligne en console (comme `charger`). */
function boutiqueDe(texte: string | null): Shop | null {
  if (texte === null) return null
  try {
    const shop = JSON.parse(texte) as Shop
    if (!shop?.daily || !Array.isArray(shop.daily.items)) throw new Error("format inattendu")
    return shop
  } catch (e) {
    console.log("vue : shop.json illisible (" + e + ")")
    return null
  }
}

/** Relecture 2 : `charger`, avec l'empreinte du fichier lu (presenterApp, à l'ouverture de l'app). */
export function chargerAvecEmpreinte(): { shop: Shop | null; empreinte: EmpreinteBoutique } {
  const date = dateDeShop()
  const texte = texteDeShop()
  return { shop: boutiqueDe(texte), empreinte: { date, texte } }
}

/**
 * Relecture 2 : au montage de la Boutique (différé ou au premier appui), shop.json relu s'il a changé depuis l'ouverture
 * (une lecture de la boutique par le widget ou une mise à jour entre-temps) : sa date d'abord, si Scripting la donne et
 * qu'elle n'a pas bougé, rien n'est lu ; sinon son texte, comparé. Rend la boutique neuve et son empreinte, ou null si rien
 * n'a changé. Aucune requête, aucune écriture.
 */
export function relireSiChangee(avant: EmpreinteBoutique): { shop: Shop | null; empreinte: EmpreinteBoutique } | null {
  const date = dateDeShop()
  if (date !== null && avant.date !== null && date === avant.date) return null
  const texte = texteDeShop()
  if (texte === avant.texte) return null
  return { shop: boutiqueDe(texte), empreinte: { date, texte } }
}

/**
 * Lit la liste de souhaits, nettoyée. Absente : vide, sans bruit ; illisible : vide et une ligne en console. Relecture 2
 * (ticket 4.51) : lue par presenterApp à l'ouverture, comme quand la Boutique y était montée, et donnée à la Boutique : son
 * montage, différé, ne lit rien de plus.
 */
export function chargerListe(): Souhait[] {
  try {
    return FileManager.existsSync(WISHLIST_FILE) ? lireListe(FileManager.readAsStringSync(WISHLIST_FILE)) : []
  } catch (e) {
    console.log("vue : wishlist.json illisible (" + e + ")")
    return []
  }
}

/** Lit le catalogue local. Absent : null, sans bruit ; illisible : null et une ligne en console. */
function chargerCatalogue(): unknown {
  try {
    return FileManager.existsSync(CATALOG) ? JSON.parse(FileManager.readAsStringSync(CATALOG)) : null
  } catch (e) {
    console.log("vue : catalog.json illisible (" + e + ")")
    return null
  }
}

/**
 * « Vandal (Glitchpop) » → skin « Glitchpop », arme « VANDAL » ; sans parenthèses, tout est le skin.
 * Blancs autour retirés d'abord : valorant-api en laisse parfois un à la fin (« Vandal (XERØFANG) »).
 */
function split(n: string): { skin: string; weapon: string } {
  const t = n.trim()
  const m = t.match(/^(.*?)\s*\((.*)\)$/)
  return m ? { skin: m[2], weapon: m[1].toUpperCase() } : { skin: t, weapon: "" }
}


function restant(iso: string | null): string {
  if (!iso) return "—"
  const ms = new Date(iso).getTime() - Date.now()
  if (Number.isNaN(ms)) return "—"
  if (ms <= 0) return "expirée"
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `dans ${h} h ${String(m).padStart(2, "0")}` : `dans ${m} min`
}


function jourDeBoutique(iso: string | null | undefined): string {
  const d = new Date(iso ?? "")
  if (Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" }).format(d)
}
export const REFUS_PARTAGE_BOUTIQUE = "Image pas partagée, réessaie."

/** HH:MM en heure locale ; null si l'horodatage est absent ou illisible. */
function heureSeule(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Pendant la lecture, écrit sous la section « Dernière lecture / Reset ». */
export const LECTURE_EN_COURS = "Lecture de la boutique…"
/** Valeur VoiceOver de « Lire la boutique » pendant la lecture. */
export const ANNONCE_LECTURE = "Lecture lancée"
/** « Déjà en cours », une fois passé le délai dit : le verrou ne bloquait plus. */
export const PHRASE_REESSAYER = "Lecture déjà en cours tout à l'heure. Tu peux réessayer."

/**
 * Entrée 17 de epic-boutique-visuels : ce que la phrase dit du seul solde relu, après « Déjà à jour » : relu ; trop tôt (le
 * solde a été demandé il y a peu, lu ou non : la phrase ne dit pas « lu »), avec l'heure à laquelle un nouvel essai sera
 * permis, arrondie à la minute au-dessus (à cette heure-là, l'appui n'est plus refusé) ; non relu, et pourquoi quand c'est
 * le réseau.
 */
function phraseSolde(solde: IssueSolde): string {
  switch (solde.genre) {
    case "relu":
      return "Solde relu."
    case "trop-tot": {
      const d = new Date(Math.ceil(solde.possible / 60_000) * 60_000)
      const h = Number.isNaN(d.getTime()) ? null : heureSeule(d.toISOString())
      return `Solde déjà demandé il y a peu${h ? ` : nouvel essai possible à ${h}` : ""}.`
    }
    default:
      return solde.reseau ? "Solde non relu : réseau indisponible." : "Solde non relu. Détail dans le journal."
  }
}

/**
 * La phrase de l'issue d'un appui sur « Lire la boutique », écrite sous la section et lue par
 * VoiceOver ; `now` : l'heure de l'issue (le délai d'une lecture déjà en cours en part). Entrée 17 de
 * epic-boutique-visuels : `soldeLu`, faux quand la boutique vient d'être lue sans qu'un solde soit gardé sous elle (la
 * phrase le dit) ; déjà à jour, l'issue du seul solde, s'il a été demandé.
 */
export function phraseIssue(issue: IssueLecture, now: number, soldeLu: boolean = true): string {
  switch (issue.genre) {
    case "lue": {
      const h = heureSeule(issue.lueA)
      return (h ? `Boutique lue à ${h}.` : "Boutique lue.") + (soldeLu ? "" : " Solde non lu.")
    }
    case "a-jour": {
      const h = heureSeule(issue.resetAt)
      return `Déjà à jour : la boutique ne change qu'au reset${h ? `, à ${h}` : ""}.` + (issue.solde ? " " + phraseSolde(issue.solde) : "")
    }
    case "en-cours":
      return `Lecture déjà en cours. Réessaie dans ${delaiEnClair(Math.max(1, Math.ceil((issue.reessai - now) / 1000)))}.`
    case "session":
      return "Session Riot expirée. Reconnecte-toi pour lire la boutique."
    case "reseau":
      return "Réseau indisponible. Réessaie une fois connecté."
    case "riot":
      return issue.maintenance
        ? "Boutique indisponible chez Riot, maintenance probable. Réessaie plus tard."
        : "Riot a répondu par une erreur. Réessaie plus tard."
    default:
      return "Lecture impossible. Détail dans le journal."
  }
}

/**
 * L'état du bouton : `enCours` pendant la lecture ; `issue` et sa `phrase` après elle, jusqu'à
 * l'appui suivant ; `reessai` (ms depuis l'epoch) tant que la phrase dit un délai à attendre.
 */
type EtatLecture = { enCours: boolean; issue: IssueLecture | null; phrase: string | null; reessai: number | null }


function heure(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} à ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Image en largeur fixe, depuis le cache des icônes ; emplacement vide sans icône. Le
 * moteur n'écrit que des chemins locaux ; une adresse web, que le contrat permet
 * encore, s'afficherait quand même.
 */
function Visuel({ icon }: { icon: string | null }) {
  // Ticket 7.8 (F3) : une adresse web seulement de media.valorant-api.com ; entrée 16 de epic-boutique-visuels : un chemin
  // local, par son seul nom de fichier, dans `icons/` du dossier partagé d'aujourd'hui (securite.ts, iconeLisible) ; sinon
  // l'emplacement vide.
  const icone = iconeLisible(icon, FileManager.appGroupDocumentsDirectory)
  if (icone === null) return <Rectangle fill="clear" frame={CADRE} />
  return icone.startsWith("http") ? (
    <Image imageUrl={icone} resizable scaleToFit frame={CADRE} />
  ) : (
    <Image filePath={icone} resizable scaleToFit frame={CADRE} />
  )
}

/** Prix en VP, à chasse fixe ; « — » si inconnu. Couleur explicite : dans le bouton d'une offre, elle ne prend pas la teinte. */
function Prix({ valeur }: { valeur: number | null }) {
  return (
    <Text font="body" fontWeight="semibold" foregroundStyle="label" monospacedDigit>
      {valeur ?? "—"}
    </Text>
  )
}

/**
 * Entrée 17 de epic-boutique-visuels : la ligne « Solde » de la section « Dernière lecture / Reset » : les montants à droite,
 * aux couleurs des valeurs voisines, en chiffres à chasse fixe ; sans limite de lignes, et tenus à leur hauteur : trop longs
 * pour l'écran (petit iPhone, grande taille de texte), ils passent à la ligne après un « · » (solde.ts) au lieu d'être
 * tronqués ; dessous, l'heure de leur lecture quand elle diffère de celle de la boutique. Un seul élément pour VoiceOver, qui
 * lit `voix`.
 */
function Solde({ texte, date, voix }: { texte: string; date: string | null; voix: string }) {
  return (
    <LabeledContent title="Solde" accessibilityElement accessibilityLabel={voix}>
      <VStack alignment="trailing" spacing={1}>
        <Text
          font="body"
          foregroundStyle="secondaryLabel"
          monospacedDigit
          multilineTextAlignment="trailing"
          fixedSize={{ horizontal: false, vertical: true }}
        >
          {texte}
        </Text>
        {date !== null ? (
          <Text font="caption" foregroundStyle="secondaryLabel">
            {date}
          </Text>
        ) : null}
      </VStack>
    </LabeledContent>
  )
}

/** Prix du Night Market : prix de base barré, prix remisé, puis la remise. */
function PrixRemise({ item }: { item: ItemNM }) {
  return (
    <VStack alignment="trailing" spacing={1}>
      <HStack spacing={6}>
        <Text font="caption" foregroundStyle="secondaryLabel" monospacedDigit strikethrough="secondaryLabel">
          {item.cost ?? "—"}
        </Text>
        <Prix valeur={item.discounted} />
      </HStack>
      {item.discountPercent != null ? (
        <Text font="caption2" fontWeight="bold" foregroundStyle="orange">
          {`−${item.discountPercent} %`}
        </Text>
      ) : null}
    </VStack>
  )
}

/** Prix d'un bundle : prix de base barré quand il diffère, puis prix du bundle. */
function PrixBundle({ bundle }: { bundle: Bundle }) {
  const prix = bundle.discounted ?? bundle.cost
  const barre = bundle.cost != null && bundle.cost !== prix
  return (
    <HStack spacing={6}>
      {barre ? (
        <Text font="caption" foregroundStyle="secondaryLabel" monospacedDigit strikethrough="secondaryLabel">
          {bundle.cost}
        </Text>
      ) : null}
      <Prix valeur={prix} />
    </HStack>
  )
}

/** Prix en Kingdom Credits, à chasse fixe ; « — » si inconnu. Couleur explicite : dans le bouton d'un accessoire, elle ne prend pas la teinte. */
function PrixKC({ valeur }: { valeur: number | null }) {
  return (
    <Text font="body" fontWeight="semibold" foregroundStyle="label" monospacedDigit>
      {valeur == null ? "—" : `${valeur} KC`}
    </Text>
  )
}

/**
 * Rangée générique : image, titre en gras, ligne secondaire (omise si vide), contenu à droite.
 * Titre en couleur explicite : dans le bouton d'une offre, il ne prend pas la teinte.
 */
function Ligne({ icon, titre, secondaire, children }: {
  icon: string | null; titre: string; secondaire: string; children: VirtualNode
}) {
  return (
    <HStack spacing={10}>
      <Visuel icon={icon} />
      <VStack alignment="leading" spacing={1}>
        <Text font="body" fontWeight="semibold" foregroundStyle="label" lineLimit={1}>
          {titre}
        </Text>
        {secondaire ? (
          <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
            {secondaire}
          </Text>
        ) : null}
      </VStack>
      <Spacer />
      {children}
    </HStack>
  )
}

/**
 * Rangée qui pousse une fiche : la rangée générique, son contenu à droite puis un chevron, dans un
 * bouton de la liste ; `libelle` : ce que lit VoiceOver.
 */
function Poussoir({ icon, titre, secondaire, libelle, onAppui, children }: {
  icon: string | null; titre: string; secondaire: string; libelle: string; onAppui: () => void; children: VirtualNode
}) {
  return (
    <Button action={onAppui} accessibilityLabel={libelle}>
      <Ligne icon={icon} titre={titre} secondaire={secondaire}>
        <HStack spacing={8}>
          {children}
          <Image systemName="chevron.right" font="footnote" foregroundStyle="tertiaryLabel" />
        </HStack>
      </Ligne>
    </Button>
  )
}


function prixLu(prix: number | null, monnaie: "VP" | "KC"): string {
  return prix == null ? "prix inconnu" : `${prix} ${monnaie}`
}

/**
 * Offre du jour ou du Night Market : image, skin en gras, arme en secondaire, prix puis chevron
 * à droite, dans un bouton de la liste qui pousse sa fiche ; VoiceOver lit skin, arme et prix à
 * afficher (`prix`, celui que montre la fiche).
 */
function Offre({ item, prix, onAppui, children, aToi = false }: {
  item: Item; prix: number | null; onAppui: () => void; children: VirtualNode; aToi?: boolean
}) {
  const { skin, weapon } = split(item.name)

  return (
    <Poussoir
      icon={item.icon}
      titre={skin}
      secondaire={aToi ? [weapon, DEJA_A_TOI].filter((t) => t !== "").join(" · ") : weapon}
      libelle={[skin, weapon, prixLu(prix, "VP"), aToi ? VOIX_DEJA_A_TOI : ""].filter((t) => t !== "").join(", ")}
      onAppui={onAppui}
    >
      {children}
    </Poussoir>
  )
}

/**
 * Ticket 4.51 : une fonction qui reste la même d'un rendu à l'autre et appelle toujours celle du dernier rendu (comme
 * useFonctionStable d'app.tsx, 4.49) : Scripting ne rend pas un composant aux props inchangées (Object.is, clé par clé), et
 * une fonction neuve à chaque rendu les change toutes. Par useRef : le faux hôte du harnais n'a pas `useCallback`.
 */
function useStable<A extends unknown[], R>(f: (...a: A) => R): (...a: A) => R {
  const boite = useRef<{ f: (...a: A) => R; stable: ((...a: A) => R) | null }>({ f, stable: null })
  const b = boite.current
  b.f = f
  if (b.stable === null) b.stable = (...a: A) => b.f(...a)
  return b.stable
}

/**
 * Ticket 4.51 : les rangées de la liste, chacune un composant aux props stables (l'offre, tenue par la boutique lue ; l'appui,
 * stable) : ouvrir ou fermer une fiche, une lecture en cours, la liste de souhaits changée ne les rendent pas de nouveau. Le
 * même contenu qu'avant, à l'élément près.
 */
function OffreDuJour({ item, ouvrir, aToi }: { item: Item; ouvrir: (item: Item, prix: number | null) => void; aToi?: boolean }) {
  return (
    <Offre item={item} prix={item.cost ?? null} onAppui={() => ouvrir(item, item.cost ?? null)} aToi={aToi}>
      <Prix valeur={item.cost} />
    </Offre>
  )
}
function OffreNightMarket({ item, ouvrir, aToi }: { item: ItemNM; ouvrir: (item: Item, prix: number | null) => void; aToi?: boolean }) {
  return (
    <Offre item={item} prix={item.discounted ?? null} onAppui={() => ouvrir(item, item.discounted ?? null)} aToi={aToi}>
      <PrixRemise item={item} />
    </Offre>
  )
}
function LigneBundle({ bundle: b, pousser }: { bundle: Bundle; pousser: (f: AOuvrir) => void }) {
  return (
    <Poussoir
      icon={b.icon}
      titre={b.name}
      secondaire={jusquAu(b.endsAt)}
      libelle={[b.name, jusquAu(b.endsAt), prixLu(b.discounted ?? b.cost, "VP")].join(", ")}
      onAppui={() => pousser({ quoi: "bundle", bundle: b })}
    >
      <PrixBundle bundle={b} />
    </Poussoir>
  )
}
function LigneAccessoire({ accessoire: a, pousser, aToi = false }: { accessoire: Accessoire; pousser: (f: AOuvrir) => void; aToi?: boolean }) {
  return (
    <Poussoir
      icon={a.icon}
      titre={a.name}
      secondaire={`${libelleType(a.kind)} · ${jusquAu(a.endsAt)}${aToi ? ` · ${DEJA_A_TOI}` : ""}`}
      libelle={[a.name, libelleType(a.kind), prixLu(a.cost, "KC"), aToi ? VOIX_DEJA_A_TOI : ""].filter((t) => t !== "").join(", ")}
      onAppui={() => pousser({ quoi: "accessoire", accessoire: a })}
    >
      <PrixKC valeur={a.cost} />
    </Poussoir>
  )
}

/**
 * Ticket 8.4 : la rangée qui pousse le Catalogue de tous les skins (libellé, chevron), dans un bouton de la liste ; aucune
 * lecture au rendu : le Catalogue lit ses fichiers une fois poussé.
 */
function LigneCatalogue({ pousser }: { pousser: (f: AOuvrir) => void }) {
  return (
    <Button action={() => pousser({ quoi: "catalogue" })} accessibilityLabel="Tous les skins" accessibilityHint="Prix, variantes et vidéos de chaque skin">
      <HStack spacing={10}>
        <Text font="body" foregroundStyle="label">
          Tous les skins
        </Text>
        <Spacer />
        <Image systemName="chevron.right" font="footnote" foregroundStyle="tertiaryLabel" />
      </HStack>
    </Button>
  )
}

/**
 * Ticket 8.10 : la rangée qui pousse le catalogue de tous les accessoires, sous « Tous les skins », de la même forme ; aucune
 * lecture au rendu : l'écran lit son cache une fois poussé.
 */
function LigneAccessoires({ pousser }: { pousser: (f: AOuvrir) => void }) {
  return (
    <Button action={() => pousser({ quoi: "accessoires" })} accessibilityLabel="Tous les accessoires" accessibilityHint="Porte-bonheur, tags, cartes, titres et flex, avec leur prix">
      <HStack spacing={10}>
        <Text font="body" foregroundStyle="label">
          Tous les accessoires
        </Text>
        <Spacer />
        <Image systemName="chevron.right" font="footnote" foregroundStyle="tertiaryLabel" />
      </HStack>
    </Button>
  )
}

/** Titre et ligne secondaire d'un souhait : « Glitchpop » et « VANDAL » pour un skin, « Vandal » et « Arme entière » pour une arme. */
function libelles(e: Souhait): { titre: string; secondaire: string } {
  if (e.kind === "weapon") return { titre: e.name, secondaire: "Arme entière" }
  const { skin, weapon } = split(e.name.trim())
  return { titre: skin, secondaire: weapon || "Skin" }
}

/**
 * Rangée d'un souhait : titre en gras, ligne secondaire, ★ s'il est dans la liste, ☆ sinon ; un appui bascule (`basculer`,
 * stable : ticket 4.51, seule la rangée basculée est rendue de nouveau).
 */
function LigneSouhait({ entree, dedans, basculer: surAppui }: { entree: Souhait; dedans: boolean; basculer: (e: Souhait) => void }) {
  const { titre, secondaire } = libelles(entree)
  return (
    <Button action={() => surAppui(entree)}>
      <HStack spacing={10}>
        <VStack alignment="leading" spacing={1}>
          <Text font="body" fontWeight="semibold" foregroundStyle="label" lineLimit={1}>
            {titre}
          </Text>
          <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
            {secondaire}
          </Text>
        </VStack>
        <Spacer />
        <Text font="title3" foregroundStyle={dedans ? "orange" : "secondaryLabel"}>
          {dedans ? "★" : "☆"}
        </Text>
      </HStack>
    </Button>
  )
}

/**
 * Écran de la liste de souhaits : recherche par nom dans le catalogue local
 * (aucune requête), un appui ajoute ou retire un skin ou une arme entière, puis la
 * liste courante. Chaque appui réécrit wishlist.json en entier ; une écriture
 * ratée laisse la liste inchangée et le dit. Catalogue ancien ou absent : pas de
 * recherche jusqu'à la prochaine mise à jour de la boutique, la liste reste visible.
 */
function EditeurSouhaits({ initiale, onChange }: { initiale: Souhait[]; onChange: (liste: Souhait[]) => void }) {
  const [catalogue] = useState<unknown>(chargerCatalogue)
  const [liste, setListe] = useState<Souhait[]>(initiale)
  const [texte, setTexte] = useState("")
  const [erreur, setErreur] = useState<string | null>(null)

  const ancien = catalogueAncien(catalogue)
  // Ticket 4.51 : la recherche faite une fois par texte (un appui sur une étoile ne la refait pas), chaque résultat gardé sous
  // le même objet d'une recherche à l'autre : une rangée déjà montrée, à l'étoile inchangée, n'est pas rendue de nouveau.
  const tenue = useRef<{ texte: string | null; trouves: Souhait[]; objets: Map<string, Souhait> }>({ texte: null, trouves: [], objets: new Map() })
  if (tenue.current.texte !== texte) {
    const { armes, skins } = chercher(catalogue, texte)
    const objets = tenue.current.objets
    const garder = (e: Souhait) => {
      const k = `${e.kind}:${e.id}`
      const avant = objets.get(k)
      if (avant && avant.name === e.name) return avant
      objets.set(k, e)
      return e
    }
    tenue.current = { texte, trouves: [...armes, ...skins].map(garder), objets }
  }
  const trouves = tenue.current.trouves

  const appui = useStable((entree: Souhait) => {
    const nouvelle = basculer(liste, entree)
    try {
      FileManager.writeAsStringSync(WISHLIST_FILE, JSON.stringify(nouvelle, null, 2))
    } catch (e) {
      setErreur("Liste non enregistrée : " + e)
      return
    }
    setErreur(null)
    setListe(nouvelle)
    onChange(nouvelle)
    // Lot 2 : le widget Souhaits lit la liste ; il se recharge.
    try { Widget.reloadAll() } catch { /* il se rechargera seul */ }
    // Lot 4 : l'île dynamique suit la liste, si son réglage est allumé (sinon rien).
    planifierIle()
  })

  return (
    <List
      navigationTitle="Liste de souhaits"
      searchable={ancien ? undefined : { value: texte, onChanged: setTexte, prompt: "Skin ou arme" }}
      scrollContentBackground="hidden"
      background={FOND}
    >
      {ancien ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">Le catalogue sera prêt après la prochaine mise à jour de la boutique</Text>
        </Section>
      ) : null}
      {erreur ? (
        <Section>
          <Text foregroundStyle="red">{erreur}</Text>
        </Section>
      ) : null}
      {!ancien && texte.trim() ? (
        <Section
          header={<Text>Résultats</Text>}
          footer={trouves.length >= LIMITE_RECHERCHE
            ? <Text>{`${LIMITE_RECHERCHE} résultats au plus : précise la recherche.`}</Text>
            : undefined}
        >
          {trouves.length > 0 ? (
            trouves.map((e) => (
              <LigneSouhait
                key={`${e.kind}:${e.id}`}
                entree={e}
                dedans={contient(liste, e.kind, e.id)}
                basculer={appui}
              />
            ))
          ) : (
            <Text foregroundStyle="secondaryLabel">Aucun résultat</Text>
          )}
        </Section>
      ) : null}
      <Section title="Ma liste">
        {liste.length > 0 ? (
          liste.map((e) => (
            <LigneSouhait key={`${e.kind}:${e.id}`} entree={e} dedans basculer={appui} />
          ))
        ) : (
          <Text foregroundStyle="secondaryLabel">Aucun souhait pour l'instant</Text>
        )}
      </Section>
    </List>
  )
}

/**
 * Choix que l'app rend au script (index.tsx) en se fermant : « changer-de-compte » et « deconnexion »
 * (epic-installation-ami, entrée 11), faits dans Boutique ; « connexion », fait sur l'Écran de connexion
 * ou l'invitation de l'onglet Boutique (connexion.tsx) ; null : fermée par le Bouton Fermer, rien à faire.
 */
export type ChoixVue = "changer-de-compte" | "deconnexion" | "connexion" | null

/** Epic-installation-ami, entrée 11 : la confirmation de « Se déconnecter », dite avant d'agir. */
export const CONFIRMATION_DECONNEXION = {
  title: "Se déconnecter de Riot ?",
  message: "ValShop oublie ta session Riot, la boutique, le solde et ta collection gardés sur cet iPhone. Ton historique de parties et celui de ta boutique, ta liste de souhaits et ta clé HenrikDev restent.",
  confirmLabel: "Se déconnecter",
  cancelLabel: "Annuler",
}

/**
 * Ce qu'un appui pousse : une offre du jour ou du Night Market, par l'uuid de son niveau, le prix à afficher
 * et sa rangée (repli) ; un bundle ; un accessoire de la semaine.
 */
type AOuvrir =
  | { quoi: "skin"; id: string; prix: number | null; offre: OffreAffichee }
  | { quoi: "catalogue" }
  | { quoi: "accessoires" }
  | { quoi: "souhaits" }
  | { quoi: "collection" }
  | { quoi: "bundle"; bundle: Bundle }
  | { quoi: "accessoire"; accessoire: Accessoire }
/** Fiche à pousser, avec `ouverture`, numéro qui change à chaque appui : la fiche, restée à sa place, repart de zéro. */
type Ouverture = AOuvrir & { ouverture: number }

/** Ticket 4.51 : l'offre d'un accessoire pour sa fiche, le même objet à chaque rendu (la fiche n'est pas rendue de nouveau). */
const OFFRES_ACCESSOIRES = new WeakMap<Accessoire, { name: string; kind: string; icon: string | null }>()
function offreAccessoire(a: Accessoire) {
  let o = OFFRES_ACCESSOIRES.get(a)
  if (!o) { o = { name: a.name, kind: a.kind, icon: a.icon }; OFFRES_ACCESSOIRES.set(a, o) }
  return o
}

/** Ce que le Catalogue reçoit de l'onglet (ticket 8.4) : la boutique lue et la liste de souhaits tenue ici. */
type PourCatalogue = { shop: Shop; souhaits: Souhait[]; onSouhaits: (liste: Souhait[]) => void }


function couleurRarete(x: string | null): string | null {
  const m = typeof x === "string" ? /^#?([0-9a-fA-F]{6})/.exec(x) : null
  return m ? "#" + m[1] : null
}

/** Ce que les widgets lisent déjà et que l'onglet reprend : gardé tant que la boutique et la liste de souhaits ne changent pas. */
const WIDGETS_LUS: { cle: string; monnaies: { vp: string | null; kc: string | null }; attendu: { nom: string; arme: string } | null } = { cle: "", monnaies: { vp: null, kc: null }, attendu: null }
function lireWidgets(boutique: string, souhaits: readonly Souhait[]) {
  const cle = boutique + "|" + souhaits.map((s) => s.kind + s.id).join(",")
  if (WIDGETS_LUS.cle !== cle) {
    WIDGETS_LUS.cle = cle
    try {
      const d = chargerDonnees()
      WIDGETS_LUS.monnaies = { vp: d?.monnaies.vp ?? null, kc: d?.monnaies.kc ?? null }
      WIDGETS_LUS.attendu = d?.souhait ? { nom: d.souhait.nom, arme: d.souhait.arme } : null
    } catch {
      WIDGETS_LUS.monnaies = { vp: null, kc: null }; WIDGETS_LUS.attendu = null
    }
  }
  return WIDGETS_LUS
}

/** La fiche poussée par la liste ; rien avant le premier appui. */
function ficheDe(f: Ouverture | null, catalogue: PourCatalogue): VirtualNode {
  if (!f) return <EmptyView />

  if (f.quoi === "collection") return <MaCollection key={`collection-${f.ouverture}`} />
  if (f.quoi === "souhaits") return <EditeurSouhaits initiale={catalogue.souhaits} onChange={catalogue.onSouhaits} />
  if (f.quoi === "catalogue") return <CatalogueSkins shop={catalogue.shop} souhaits={catalogue.souhaits} onSouhaits={catalogue.onSouhaits} ouverture={f.ouverture} />
  if (f.quoi === "accessoires") return <CatalogueAccessoires shop={catalogue.shop} ouverture={f.ouverture} />
  if (f.quoi === "bundle") return <FicheBundle bundle={f.bundle} ouverture={f.ouverture} />
  if (f.quoi === "accessoire") {
    const a = f.accessoire
    // Entrée 18 de epic-boutique-visuels : la fin de l'offre, que la rangée dit, est dite aussi dans la fiche.
    return <FicheAccessoire id={a.id} offre={offreAccessoire(a)} prix={a.cost == null ? "—" : `${a.cost} KC`} fin={a.endsAt ?? null} />
  }
  return <FicheSkin id={f.id} prix={f.prix} offre={f.offre} ouverture={f.ouverture} />
}

/** Ticket 2.20 : la ligne du journal d'une lecture de la boutique qui part toute seule, avant celles de la lecture. */
export const LIGNE_LECTURE_AUTO = "ouverture : boutique gardée expirée, lecture automatique (chemin du bouton Lire la boutique)."

/** Ticket 2.20 : une session Riot est-elle gardée (des cookies au trousseau) ? Trousseau illisible : non. */
export function sessionGardee(): boolean {
  try {
    return loadCookies().length > 0
  } catch {
    return false
  }
}

/**
 * L'onglet Boutique : en-tête (dernière lecture, reset), boutique du jour, Night Market,
 * bundles, accessoires, liste de souhaits, compte. Racine sans barre de navigation, l'en-tête
 * de l'app en tient lieu ; l'éditeur de la liste et la fiche d'une offre, poussés, gardent la
 * leur. `entete`, que l'app passe aux tailles de texte d'accessibilité : En-tête ValShop et
 * Barre d'onglets, rendus en première section, sans fond ni séparateur, pour défiler avec la liste.
 * Ticket 2.20 : `auto`, les tentatives automatiques de cette ouverture de l'app (app.tsx, OuvertureAuto ; absent :
 * interrupteur éteint) : au montage, une fois (`auto.boutique`), si la boutique reçue a expiré (boutiqueExpiree) et qu'une
 * session est gardée, la lecture du bouton part toute seule (`lire`), une ligne au journal avant elle ; sinon rien. Jamais
 * pendant une collecte ou un import de cette ouverture (`auto.collecte` : automatique, ou lancés par leur bouton) : après
 * eux ; `auto.lecture` dit sa fin, que toute collecte de l'onglet Stats attend de même.
 */
export function Boutique({ shop: ouverte, entete, souhaits: souhaitsLus, auto }: {
  shop: Shop; entete?: VirtualNode; souhaits?: Souhait[]
  auto?: { boutique: boolean; lecture: Promise<void> | null; collecte: Promise<void> | null }
}) {
  // Entrée 10 : la boutique relue après un appui sur « Lire la boutique » ; celle de l'ouverture avant.
  const [relue, setRelue] = useState<Shop | null>(null)
  const shop = relue ?? ouverte
  // Ticket 4.51 : chaque offre gardée sous le même objet d'une lecture à l'autre tant qu'elle est la même (même JSON) : une
  // relecture qui ne change rien ne rend pas les rangées de nouveau.
  const offres = useRef(new Map<string, unknown>())
  function garder<T>(x: T): T {
    const k = JSON.stringify(x)
    const avant = offres.current.get(k)
    if (avant !== undefined) return avant as T
    offres.current.set(k, x)
    return x
  }
  const [lecture, setLecture] = useState<EtatLecture>({ enCours: false, issue: null, phrase: null, reessai: null })
  // Entrée 17 de epic-boutique-visuels : le solde gardé, lu au montage de l'onglet (sans requête), relu après chaque lecture.
  const [solde, setSolde] = useState<SoldeGarde | null>(chargerSolde)

  const [possedes, setPossedes] = useState(() => possessionsLues().possedes)
  const occupe = useRef(false)
  // `appui` : lancée par le bouton (la boutique déjà à jour, le moteur relit le seul solde) ; faux : la lecture automatique.
  const lire = useStable(async (appui: boolean) => {
    if (occupe.current) return
    occupe.current = true
    setLecture({ enCours: true, issue: null, phrase: null, reessai: null })
    let issue: IssueLecture
    try {
      issue = await lireBoutique(appui)
    } catch {
      issue = { genre: "echec" }
    }
    occupe.current = false
    // Toujours relue, sans requête : un ↻ a pu lire entre-temps.
    const lue = charger()
    if (lue) setRelue(lue)
    // Le solde aussi, de même : celui que la lecture vient de garder, ou celui d'avant.
    const garde = chargerSolde()
    setSolde(garde)
    setPossedes(possessionsLues().possedes)
    // Un délai déjà passé au retour (journal lent, verrou d'autrui repris) : « Tu peux réessayer » tout de suite.
    const fin = Date.now()
    const attente = issue.genre === "en-cours" ? issue.reessai : null
    setLecture({
      enCours: false, issue,
      phrase: attente !== null && attente <= fin ? PHRASE_REESSAYER : phraseIssue(issue, fin, ligneSolde(garde, (lue ?? shop).updatedAt) !== null),
      reessai: attente !== null && attente > fin ? attente : null,
    })
    // Lot 4 : la boutique lue, l'île dynamique dit le souhait qui s'y trouve, si son réglage est allumé (sinon rien).
    planifierIle()
  })
  const lireAppui = useStable(() => lire(true))


  const partageEnCours = useRef(false)
  const [refusPartage, setRefusPartage] = useState(false)
  const partagerImage = async (vue: VirtualNode) => {
    if (partageEnCours.current) return
    partageEnCours.current = true
    setRefusPartage(false)
    try {
      const image = await ImageRenderer.toUIImage(vue, { scale: 3, opaque: true })
      await ShareSheet.present([image])
    } catch {
      setRefusPartage(true)
    } finally {
      partageEnCours.current = false
    }
  }
  // Le délai dit d'une lecture déjà en cours passé, la phrase le dit à son tour.
  const reessai = lecture.reessai
  useEffect(() => {
    if (reessai === null) return
    const minuterie = setTimeout(() => {
      setLecture((l) => (l.reessai === reessai ? { ...l, phrase: PHRASE_REESSAYER, reessai: null } : l))
    }, Math.max(0, reessai - Date.now()))
    return () => clearTimeout(minuterie)
  }, [reessai])
  // La liste vit ici pour le compte du lien ; l'écran de liste la tient à jour à chaque appui.
  const [souhaits, setSouhaits] = useState<Souhait[]>(() => souhaitsLus ?? chargerListe())
  // Fiche poussée par la liste (`navigationDestination`) : rien avant le premier appui ; au
  // retour, `poussee` repasse à faux et la dernière fiche reste, le temps de l'animation.
  const [pile, setPile] = useState<{ fiche: Ouverture | null; poussee: boolean }>({ fiche: null, poussee: false })
  const pousser = useStable((f: AOuvrir) =>
    setPile((p) => ({ fiche: { ...f, ouverture: (p.fiche ? p.fiche.ouverture : 0) + 1 }, poussee: true })))
  const ouvrir = useStable((item: Item, prix: number | null) =>
    pousser({ quoi: "skin", id: item.id, prix, offre: { name: item.name, icon: item.icon, color: couleurRarete(item.color) } }))
  // Le login ne s'empile pas sur l'app : elle se ferme, le script l'ouvre ensuite.
  const fermer: (choix: ChoixVue) => void = Navigation.useDismiss()
  // Ticket 2.20 : la lecture automatique, à son heure : rien si un appui lit déjà ; `apresAttente` (elle a attendu la fin de
  // la collecte) : rien non plus si la boutique n'est plus expirée, shop.json relu sur place (lue entre-temps par un appui ou
  // par ↻) ; sinon une ligne au journal, puis le chemin du bouton.
  const lireAuto = useStable(async (apresAttente: boolean) => {
    if (occupe.current) return
    if (apresAttente && !boutiqueExpiree(Date.now(), charger() ?? shop)) return
    try { note(LIGNE_LECTURE_AUTO).catch(() => {}) } catch { /* journal indisponible : la lecture part quand même */ }
    await lire(false)
  })
  // Ticket 2.20 : la lecture automatique de cette ouverture, décidée une fois, au montage : la boutique reçue expirée et une
  // session gardée, elle part par le chemin du bouton, après la collecte ou l'import de cette ouverture s'il court (jamais en
  // même temps : les prix de HenrikDev ne se contrôlent pas sous leur marqueur) ; sinon rien, et plus rien ensuite sans un appui.
  // Démontée avant son heure (app fermée), elle ne part pas.
  useEffect(() => {
    if (auto === undefined || auto.boutique) return
    auto.boutique = true
    if (!boutiqueExpiree(Date.now(), ouverte) || !sessionGardee()) return
    let montee = true
    const attendue = auto.collecte
    const fin = (attendue ?? Promise.resolve()).then(() => (montee ? lireAuto(attendue !== null) : undefined)).then(() => {}, () => {})
    auto.lecture = fin
    fin.then(() => { if (auto.lecture === fin) auto.lecture = null })
    return () => { montee = false }
  }, [])


  const nm = shop.nightMarket
  const offresNM = (nm?.active ? nm.items ?? [] : []).map(garder)
  const bundles = (Array.isArray(shop.bundles) ? shop.bundles : []).map(garder)
  const offresAcc = shop.accessories?.items
  const accessoires = (Array.isArray(offresAcc) ? offresAcc : []).map(garder)
  const offresDuJour = shop.daily.items.map(garder)
  // Entrée 17 de epic-boutique-visuels : la ligne du solde lu sous cette boutique, ou rien.
  const ligne = ligneSolde(solde, shop.updatedAt)


  const { monnaies, attendu } = lireWidgets(shop.updatedAt, souhaits)
  // Les offres telles que les cartes et l'image à partager les montrent.
  const vp = monnaies.vp, kc = monnaies.kc

  const vue = (item: Item, prix: number | null, plus: Partial<OffreVue> = {}): OffreVue => {
    const { skin, weapon } = split(item.name)
    const aToi = skinPossede(possedes, [item.id]) === true
    return {
      cle: item.id, nom: skin, arme: weapon, prix, icone: iconeLisible(item.icon, FileManager.appGroupDocumentsDirectory), couleur: couleurRarete(item.color),
      souhait: attendu !== null && attendu.nom === skin && attendu.arme.toUpperCase() === weapon.toUpperCase(), aToi,
      voix: [skin, weapon, prixLu(prix, "VP"), aToi ? VOIX_DEJA_A_TOI : ""].filter((x) => x !== "").join(", "), onAppui: () => ouvrir(item, prix), ...plus,
    }
  }
  const duJour = offresDuJour.map((i) => vue(i, i.cost ?? null))
  const nuit = offresNM.map((i) => vue(i, i.discounted ?? null, { barre: i.cost, remise: i.discountPercent, souhait: false }))
  const partager = () => partagerImage(
    <ImagePartage t={COULEURS.standard} date={jourDeBoutique(shop.updatedAt)} reset={restant(shop.daily.resetAt)} offres={duJour} nuit={nuit} monnaie={vp} />,
  )
  // Le titre, masqué avec la barre, ne sert plus que de libellé au retour de l'éditeur.
  const destination = {
    isPresented: pile.poussee,
    onChanged: (poussee: boolean) => setPile((p) => ({ fiche: p.fiche, poussee })),
    content: ficheDe(pile.fiche, { shop, souhaits, onSouhaits: setSouhaits }),
  }
  // Aux tailles de texte d'accessibilité : la liste de texte d'avant la refonte, qui suit la taille réglée dans iOS.
  const liste = () => (
      <List
        navigationTitle="ValShop"
        navigationBarVisibility="hidden"
        scrollContentBackground="hidden"
        background={FOND}
        navigationDestination={destination}
      >
        {entete ? (
          <Section>
            <VStack listRowBackground={<Rectangle fill="clear" />} listRowSeparator="hidden" listRowInsets={0}>
              {entete}
            </VStack>
          </Section>
        ) : null}
        <Section footer={lecture.enCours || lecture.phrase ? <PiedLecture phrase={lecture.enCours ? LECTURE_EN_COURS : lecture.phrase ?? ""} /> : undefined}>
          <LabeledContent title="Dernière lecture" value={heure(shop.updatedAt)} />
          <LabeledContent title="Reset" value={restant(shop.daily.resetAt)} />
          {ligne !== null ? <Solde texte={ligne.texte} date={ligne.date} voix={ligne.voix} /> : null}
          {/* L'engrenage des réglages est dans la Barre d'onglets (app.tsx, Haut), pour les deux onglets. */}
          <BoutonSecondaire
            libelle="Lire la boutique"
            icone="arrow.clockwise"
            enCours={lecture.enCours}
            valeurAccessibilite={lecture.enCours ? ANNONCE_LECTURE : lecture.phrase ?? undefined}
            valeurSuivie
            action={lireAppui}
          />
          {!lecture.enCours && lecture.issue?.genre === "session" ? (
            <BoutonSecondaire libelle="Me connecter" action={() => fermer("connexion")} />
          ) : null}
          <BoutonSecondaire libelle="Partager ma boutique" icone="square.and.arrow.up" action={partager} />
          {refusPartage ? <PiedLecture phrase={REFUS_PARTAGE_BOUTIQUE} /> : null}
        </Section>
        <Section title="Boutique du jour">
          {offresDuJour.map((item) => (
            <OffreDuJour key={item.id} item={item} ouvrir={ouvrir} aToi={skinPossede(possedes, [item.id]) === true} />
          ))}
        </Section>
        <Section title="Night Market">
          {offresNM.length > 0 ? (
            offresNM.map((item) => (
              <OffreNightMarket key={item.id} item={item} ouvrir={ouvrir} aToi={skinPossede(possedes, [item.id]) === true} />
            ))
          ) : (
            <Text foregroundStyle="secondaryLabel">Pas de Night Market</Text>
          )}
        </Section>
        <Section title="Bundles">
          {bundles.length > 0 ? (
            bundles.map((b) => (
              <LigneBundle key={b.id} bundle={b} pousser={pousser} />
            ))
          ) : (
            <Text foregroundStyle="secondaryLabel">Pas de bundle en vedette</Text>
          )}
        </Section>
        <Section title="Accessoires">
          {accessoires.length > 0 ? (
            accessoires.map((a) => (
              <LigneAccessoire key={a.id} accessoire={a} pousser={pousser} aToi={accessoirePossede(possedes, a.kind, a.id) === true} />
            ))
          ) : (
            <Text foregroundStyle="secondaryLabel">Pas d'accessoire</Text>
          )}
        </Section>
        <Section title="Catalogue">
          <LigneCatalogue pousser={pousser} />
          <LigneAccessoires pousser={pousser} />
          <Button action={() => pousser({ quoi: "collection" })} accessibilityLabel="Ma collection" accessibilityHint="Les skins et objets déjà à toi">
            <HStack spacing={10}>
              <Text font="body" foregroundStyle="label">Ma collection</Text>
              <Spacer />
              <Image systemName="chevron.right" font="footnote" foregroundStyle="tertiaryLabel" />
            </HStack>
          </Button>
        </Section>
        <Section title="Liste de souhaits">
          <NavigationLink
            title={`Modifier (${souhaits.length})`}
            destination={<EditeurSouhaits initiale={souhaits} onChange={setSouhaits} />}
          />
        </Section>
      </List>
  )


  const cartes = (c: ReturnType<typeof couleurs>, largeurEcran: number) => {
    const t: Teintes = c
    const l = largeurEcran - 2 * MARGE_PAGE
    const lt = Math.floor((l - ECART) / 2)
    const voeu = duJour.find((o) => o.souhait) ?? null
    const texteDiscret = (x: string) => <Text {...TYPO.corps} foregroundStyle={c.texteDiscret}>{x}</Text>
    return (
      <ScrollView navigationTitle="ValShop" navigationBarVisibility="hidden" background={FOND} navigationDestination={destination}>
        <VStack alignment="leading" spacing={ESPACES.entreBlocs} padding={{ horizontal: MARGE_PAGE, top: ESPACES.entete, bottom: ESPACES.basPage }} frame={{ width: largeurEcran, alignment: "leading" }}>
          {entete ?? null}
          <Carte t={t}>
            <EtatBoutique t={t} reset={restant(shop.daily.resetAt)} lue={heure(shop.updatedAt)} solde={ligne} />
            <BoutonSecondaire
              libelle="Lire la boutique"
              icone="arrow.clockwise"
              enCours={lecture.enCours}
              valeurAccessibilite={lecture.enCours ? ANNONCE_LECTURE : lecture.phrase ?? undefined}
              valeurSuivie
              action={lireAppui}
            />
            {!lecture.enCours && lecture.issue?.genre === "session" ? (
              <BoutonSecondaire libelle="Me connecter" action={() => fermer("connexion")} />
            ) : null}
            {lecture.enCours || lecture.phrase ? <PiedLecture phrase={lecture.enCours ? LECTURE_EN_COURS : lecture.phrase ?? ""} /> : null}
            <BoutonSecondaire
              libelle="Partager ma boutique"
              icone="square.and.arrow.up"
              action={partager}
            />
            {refusPartage ? <PiedLecture phrase={REFUS_PARTAGE_BOUTIQUE} /> : null}
          </Carte>
          {voeu !== null ? <BandeauSouhait o={voeu} l={l} /> : null}
          <TitreSection t={t} titre="Boutique du jour" />
          <GrilleOffres offres={duJour} largeur={l} monnaie={vp} />
          <TitreSection t={t} titre="Night Market" accent={"#b56cff"} />
          {nuit.length > 0 ? <Defilant>{nuit.map((o) => <CarteOffre key={o.cle} o={o} l={176} h={150} monnaie={vp} />)}</Defilant> : texteDiscret("Pas de Night Market")}
          <TitreSection t={t} titre="Bundles" />
          {bundles.length > 0 ? bundles.map((b) => (
            <CarteBundle
              key={b.id}
              b={{
                cle: b.id, nom: b.name, prix: b.discounted ?? b.cost, barre: b.cost, fin: jusquAu(b.endsAt), image: iconeLisible(b.icon, FileManager.appGroupDocumentsDirectory),
                voix: [b.name, jusquAu(b.endsAt), prixLu(b.discounted ?? b.cost, "VP")].join(", "), onAppui: () => pousser({ quoi: "bundle", bundle: b }),
              }}
              l={l}
              monnaie={vp}
            />
          )) : texteDiscret("Pas de bundle en vedette")}
          <TitreSection t={t} titre="Accessoires" accent={"#5a9fe2"} />
          {accessoires.length > 0 ? (
            <Defilant>
              {accessoires.map((a) => (
                <TuileAccessoire
                  key={a.id}
                  a={{
                    cle: a.id, nom: a.name, type: libelleType(a.kind), fin: jusquAu(a.endsAt), prix: a.cost, icone: iconeLisible(a.icon, FileManager.appGroupDocumentsDirectory),
                    aToi: accessoirePossede(possedes, a.kind, a.id) === true,
                    voix: [a.name, libelleType(a.kind), prixLu(a.cost, "KC"), accessoirePossede(possedes, a.kind, a.id) === true ? VOIX_DEJA_A_TOI : ""].filter((x) => x !== "").join(", "),
                    onAppui: () => pousser({ quoi: "accessoire", accessoire: a }),
                  }}
                  t={t}
                  monnaie={kc}
                />
              ))}
            </Defilant>
          ) : texteDiscret("Pas d'accessoire")}
          <TitreSection t={t} titre="Explorer" />
          { }
          <VStack alignment="leading" spacing={ECART}>
            <HStack spacing={ECART}>
              <TuileAcces t={t} titre="Tous les skins" sous="Catalogue" l={lt} image={duJour[0]?.icone ?? null} voix="Tous les skins" indice="Prix, variantes et vidéos de chaque skin" onAppui={() => pousser({ quoi: "catalogue" })} />
              <TuileAcces t={t} titre="Tous les accessoires" sous="Catalogue" l={lt} voix="Tous les accessoires" indice="Porte-bonheur, tags, cartes, titres et flex, avec leur prix" onAppui={() => pousser({ quoi: "accessoires" })} />
            </HStack>
            <HStack spacing={ECART}>
              <TuileAcces t={t} titre="Ma collection" sous="Skins et objets à toi" l={lt} image={duJour[1]?.icone ?? null} voix="Ma collection" indice="Les skins et objets déjà à toi" onAppui={() => pousser({ quoi: "collection" })} />
              <TuileAcces t={t} titre="Mes souhaits" sous={`${souhaits.length} ${souhaits.length > 1 ? "suivis" : "suivi"}`} l={lt} or voix={`Liste de souhaits, modifier, ${souhaits.length}`} onAppui={() => pousser({ quoi: "souhaits" })} />
            </HStack>
          </VStack>
        </VStack>
      </ScrollView>
    )
  }
  return (
    <NavigationStack>
      <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
        {(env) => tailleAccessibilite(env.dynamicTypeSize) ? liste() : (
          <GeometryReader>{(g) => cartes(couleurs(env.colorSchemeContrast), g.size.width)}</GeometryReader>
        )}
      </EnvironmentValuesReader>
    </NavigationStack>
  )
}

/**
 * Sous la section « Dernière lecture / Reset » (entrée 10) : ce que fait ou a fait « Lire la boutique »,
 * en `petit` `texte-discret` (DESIGN.md, ligne-etat), aux couleurs du contraste d'iOS.
 */
function PiedLecture({ phrase }: { phrase: string }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => (
        <Text {...TYPO.petit} foregroundStyle={couleurs(env.colorSchemeContrast).texteDiscret}>
          {phrase}
        </Text>
      )}
    </EnvironmentValuesReader>
  )
}

/** Onglet Boutique sans cache : le message de la v1, et rien d'autre (aucune requête) ; sans titre, l'en-tête de l'app en tient lieu. */
export function SansCache() {
  return (
    <ContentUnavailableView
      title="Aucune boutique en cache"
      systemImage="cart"
      description="Lance une mise à jour depuis le widget."
    />
  )
}
