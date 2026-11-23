import {
  AVPlayerView, Button, Circle, EmptyView, HStack, Image, LabeledContent, List, ProgressView, Rectangle, ScrollView, Section, Spacer,
  Text, VStack, ZStack, useEffect, useObservable, useRef, useState, type PIPStatus,
} from "scripting"
import { COULEURS } from "./design"
import { BoutonSouhait, EnTeteFiche } from "./fiche-cartes"
import { libelleVariante, lireFicheSkin, separerNom, type NiveauDeSkin } from "./fiches"
import { catalogueAReconstruire, type Variante } from "./souhaits"
import { CATALOG } from "./valshop"
import { iconeLisible, imageAdmise, videoAdmise } from "./securite"
import { apparitions, niveauxDuSkin, phraseApparitions, skinPossede } from "./possessions"
import { possessionsLues } from "./possessions-ecran"





















/** Nom et icône d'une offre tels que la liste les montre (shop.json) : le repli de la fiche. */

export type OffreAffichee = { name: string; icon: string | null; color?: string | null }








export type InfosCatalogue = {
  prix: string; remise?: { base: number | null; pourcentage: number | null; voix: string } | null
  /** Ticket 8.9 : d'où vient le prix (boutique, prix retenu, HenrikDev, table de référence) ; null sans prix. */
  source?: string | null





  sansPrix?: boolean; origine?: string | null; sortie?: string | null
  boutique: string; souhait: "skin" | "arme" | null; onSouhait: () => void; erreur: string | null
}

/**
 * Ticket 8.7 : le prix du Night Market dans la fiche, la forme de la Boutique (vue.tsx, PrixRemise) : prix de base barré et
 * prix remisé sur une ligne, « −N % » en orange dessous, alignés à droite ; un seul élément pour VoiceOver, qui lit `voix`.
 */
function PrixRemise({ prix, remise }: { prix: string; remise: { base: number | null; pourcentage: number | null; voix: string } }) {
  return (
    <LabeledContent title="Prix">
      <VStack alignment="trailing" spacing={1} accessibilityElement="ignore" accessibilityLabel={remise.voix}>
        <HStack spacing={6}>
          {remise.base !== null ? (
            <Text font="caption" foregroundStyle="secondaryLabel" monospacedDigit strikethrough="secondaryLabel">
              {String(remise.base)}
            </Text>
          ) : null}
          <Text font="body" fontWeight="semibold" foregroundStyle="label" monospacedDigit>
            {prix}
          </Text>
        </HStack>
        {remise.pourcentage !== null ? (
          <Text font="caption2" fontWeight="bold" foregroundStyle="orange">
            {`−${remise.pourcentage} %`}
          </Text>
        ) : null}
      </VStack>
    </LabeledContent>
  )
}

/** Fond de page de l'app, sous la liste de la fiche comme sous celle de l'onglet. */
const FOND = COULEURS.standard.fond
/** Fond des feuilles de l'app, sous le lecteur. */
const SURFACE = COULEURS.standard.surface
/** Hauteur de la grande image ; celle d'une arme, large, s'y loge en largeur. */
const HAUTEUR_IMAGE = 180
/** Diamètre d'une pastille ; sa zone d'appui fait 44 points de côté. */
const PASTILLE = 30
const CIBLE = 44
/** Seul hôte des vidéos (CDN public de Riot, spec « Tout en local ») : une adresse ailleurs vaut absente. */
const CDN_VIDEOS = "https://valorant.dyn.riotcdn.net/"
/** Ce que dit une vidéo absente ou en échec, sur sa rangée comme dans le lecteur. */
const INDISPONIBLE = "Vidéo indisponible"

/** Une vidéo proposée : clé de sa rangée, adresse (null si absente), titre, effet décrit (null si aucun). */
type Video = { cle: string; adresse: string | null; titre: string; detail: string | null }

/**
 * La vidéo du lecteur, pour une ouverture de la fiche (`id`, `ouverture`) ; `etat` : en chargement, prête ou en échec ;
 * `plein` : montrée sur tout l'écran (ticket 8.12).
 */
type VideoOuverte = {
  id: string; ouverture: number | undefined; adresse: string; titre: string; detail: string | null
  etat: "chargement" | "prete" | "erreur"; plein: boolean
}


const PAYSAGE: string[] = ["landscape", "landscapeLeft", "landscapeRight", "all", "allButUpsideDown"]





function permettrePaysage(): boolean {
  try {
    if (Device.userConfiguredInterfaceOrientations.some((o) => PAYSAGE.includes(o))) return false
    Device.supportedInterfaceOrientations = ["allButUpsideDown"]
    return true
  } catch (e) {
    console.log("fiche : paysage non permis (" + e + ")")
    return false
  }
}


function rendreOrientations() {
  try {
    Device.supportedInterfaceOrientations = Device.userConfiguredInterfaceOrientations
  } catch (e) {
    console.log("fiche : orientations non rendues (" + e + ")")
  }
}

/**
 * Ticket 8.12 : le lecteur natif d'iOS (AVPlayerViewController) sur `player`, contrôles natifs (lecture, pause, avancer, plein
 * écran) ; sans Picture-in-Picture ni écran verrouillé : le lecteur est libéré en quittant. Pendant le chargement, une attente
 * posée au-dessus, retirée de l'arbre une fois la vidéo prête ; props constantes.
 */
function LecteurNatif({ player, chargement }: { player: AVPlayer; chargement: boolean }) {
  const pip = useObservable<PIPStatus>()
  return (
    <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <AVPlayerView
        player={player}
        pipStatus={pip}
        renderingMode="controller"
        showsPlaybackControls
        allowsPictureInPicturePlayback={false}
        updatesNowPlayingInfoCenter={false}
        videoGravity="resizeAspect"
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      />
      {chargement ? <ProgressView allowsHitTesting={false} /> : null}
    </ZStack>
  )
}

/**
 * Ticket 8.12 : la vidéo sur tout l'écran, fond noir : titre et « Fermer » en haut, le lecteur natif dessous, ajusté à l'écran
 * (portrait ou paysage) ; en échec ou sans lecteur, « Vidéo indisponible ».
 */
function PleinEcran({ video, player, onFermer }: { video: VideoOuverte; player: AVPlayer | null; onFermer: () => void }) {
  return (
    <VStack spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }} background="black" preferredColorScheme="dark">
      <HStack padding={{ horizontal: 16, vertical: 8 }}>
        <Text font="headline" foregroundStyle="white" lineLimit={1} accessibilityAddTraits="isHeader">
          {video.titre}
        </Text>
        <Spacer />
        <Button title="Fermer" action={onFermer} />
      </HStack>
      {player && video.etat !== "erreur" ? (
        <LecteurNatif player={player} chargement={video.etat === "chargement"} />
      ) : (
        <Text foregroundStyle="secondaryLabel" frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
          {INDISPONIBLE}
        </Text>
      )}
    </VStack>
  )
}

/** Lit le catalogue local. Absent : null, sans bruit ; illisible : null et une ligne en console. */
function lireCatalogue(): unknown {
  try {
    return FileManager.existsSync(CATALOG) ? JSON.parse(FileManager.readAsStringSync(CATALOG)) : null
  } catch (e) {
    console.log("fiche : catalog.json illisible (" + e + ")")
    return null
  }
}

/** Prix à afficher, en VP ; « — » si inconnu. */
function prixDit(prix: number | null): string {
  return prix == null ? "—" : `${prix} VP`
}





function videoDuNiveau(n: NiveauDeSkin, rang: number): Video {
  const lignes = n.name.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 0)
  const suite = lignes.slice(1).join(" ")
  return { cle: n.id, adresse: n.streamedVideo, titre: `Niveau ${rang + 1}`, detail: suite || null }
}

/**
 * Grande image : l'adresse de la variante choisie, chargée à l'affichage ; sans elle (absente ou déjà en échec),
 * l'icône de l'offre en cache, sinon « Image indisponible ». `onEchec` reçoit l'adresse qui n'a pas chargé.
 */
function GrandeImage({ adresse, repli, onEchec }: {
  adresse: string | null; repli: string | null; onEchec: (adresse: string) => void
}) {
  // Ticket 7.8 (relecture) : une valeur qui n'est pas un texte (fichier partagé abîmé) : comme sans image, jamais d'erreur.
  if (typeof repli !== "string") repli = null
  // Ticket 7.8 (F3) : une adresse web seulement de media.valorant-api.com (securite.ts) ; toute autre, comme sans image.
  if (adresse && imageAdmise(adresse)) {
    return (
      <Image
        imageUrl={adresse}
        resizable
        scaleToFit
        frame={{ maxWidth: "infinity", minHeight: HAUTEUR_IMAGE, maxHeight: HAUTEUR_IMAGE }}
        placeholder={<ProgressView />}
        onError={() => onEchec(adresse)}
      />
    )
  }
  // Le moteur n'écrit que des chemins locaux ; une adresse web, que le contrat permet encore, s'afficherait quand même.
  // Entrée 16 de epic-boutique-visuels : le chemin local, par son seul nom de fichier (securite.ts, iconeLisible).
  const icone = iconeLisible(repli, FileManager.appGroupDocumentsDirectory)
  if (icone === null) return <Text foregroundStyle="secondaryLabel">Image indisponible</Text>
  return icone.startsWith("http") ? (
    <Image imageUrl={icone} resizable scaleToFit frame={{ maxWidth: "infinity", minHeight: HAUTEUR_IMAGE, maxHeight: HAUTEUR_IMAGE }} />
  ) : (
    <Image filePath={icone} resizable scaleToFit frame={{ maxWidth: "infinity", minHeight: HAUTEUR_IMAGE, maxHeight: HAUTEUR_IMAGE }} />
  )
}

/**
 * Ticket 4.51 : une fonction qui reste la même d'un rendu à l'autre et appelle celle du dernier rendu (useStable de vue.tsx) :
 * Scripting ne rend pas un composant aux props inchangées. Par useRef : le faux hôte du harnais n'a pas `useCallback`.
 */
function useStable<A extends unknown[], R>(f: (...a: A) => R): (...a: A) => R {
  const boite = useRef<{ f: (...a: A) => R; stable: ((...a: A) => R) | null }>({ f, stable: null })
  const b = boite.current
  b.f = f
  if (b.stable === null) b.stable = (...a: A) => b.f(...a)
  return b.stable
}

/**
 * Pastille d'une variante : son image de pastille, ronde ; neutre pour la première (de base), pour une variante
 * sans pastille ou dont la pastille n'a pas chargé. Un anneau marque la variante choisie ; un appui la choisit.
 */
function Pastille({ variante, rang, choisie, echouee, onEchec, choisir }: {
  variante: Variante; rang: number; choisie: boolean; echouee: boolean
  onEchec: (adresse: string) => void; choisir: (rang: number) => void
}) {
  const image = rang === 0 || echouee || !imageAdmise(variante.swatch) ? null : variante.swatch
  return (
    <Button
      buttonStyle="plain"
      action={() => choisir(rang)}
      accessibilityLabel={libelleVariante(variante.name, rang)}
      accessibilityAddTraits={choisie ? "isSelected" : undefined}
    >
      <ZStack frame={{ width: CIBLE, height: CIBLE }} contentShape="circle">
        {image ? (
          <Image
            imageUrl={image}
            resizable
            scaleToFill
            clipShape="circle"
            frame={{ width: PASTILLE, height: PASTILLE }}
            placeholder={<Circle fill="systemGray4" frame={{ width: PASTILLE, height: PASTILLE }} />}
            onError={() => onEchec(image)}
          />
        ) : (
          <Circle fill="systemGray3" frame={{ width: PASTILLE, height: PASTILLE }} />
        )}
        <Circle
          stroke={{ shapeStyle: choisie ? "label" : "clear", strokeStyle: { lineWidth: 2 } }}
          frame={{ width: PASTILLE + 8, height: PASTILLE + 8 }}
        />
      </ZStack>
    </Button>
  )
}

/**
 * Rangée de la section « Vidéos » : titre, ligne secondaire (omise si vide), puis ▶ dans un bouton qui lit la vidéo
 * si elle est lisible (VoiceOver : « titre, lire la vidéo », la ligne secondaire en indication) ; sinon « Vidéo
 * indisponible », sans bouton, lu d'un tenant.
 */
function RangeeVideo({ video, secondaire, lisible, onLire }: {
  video: Video; secondaire: string | null; lisible: boolean; onLire: (video: Video) => void
}) {
  // Couleur explicite : dans le bouton d'une rangée, le titre ne prend pas la teinte.
  const textes = (
    <VStack alignment="leading" spacing={1}>
      <Text font="body" foregroundStyle="label">
        {video.titre}
      </Text>
      {secondaire ? (
        <Text font="caption" foregroundStyle="secondaryLabel">
          {secondaire}
        </Text>
      ) : null}
    </VStack>
  )
  if (!lisible) {
    return (
      <HStack spacing={10} accessibilityElement="combine">
        {textes}
        <Spacer />
        <Text font="footnote" foregroundStyle="secondaryLabel">
          {INDISPONIBLE}
        </Text>
      </HStack>
    )
  }
  return (
    <Button action={() => onLire(video)} accessibilityLabel={`${video.titre}, lire la vidéo`} accessibilityHint={secondaire ?? undefined}>
      <HStack spacing={10}>
        {textes}
        <Spacer />
        <Image systemName="play.circle.fill" font="title2" />
      </HStack>
    </Button>
  )
}

/**
 * Le lecteur, contenu de la feuille : titre de la vidéo, nom du skin, « Fermer » ; la vidéo dans le lecteur natif (ticket
 * 8.12, LecteurNatif), sous une attente jusqu'à ce qu'elle soit prête, et « Plein écran » dessous dès l'ouverture ; en échec
 * ou sans lecteur,
 * « Vidéo indisponible » à sa place ; l'effet décrit dessous. Plein écran ouvert, le lecteur de la feuille est retiré de
 * l'arbre (« Lecture en plein écran ») : un seul lecteur natif sur l'AVPlayer.
 */
function LecteurVideo({ video, skin, player, onFermer, onPleinEcran }: {
  video: VideoOuverte; skin: string; player: AVPlayer | null; onFermer: () => void; onPleinEcran: (plein: boolean) => void
}) {
  const lisible = player !== null && video.etat !== "erreur"
  return (
    <VStack
      alignment="leading"
      spacing={12}
      padding={16}
      frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "top" }}
      preferredColorScheme="dark"
      presentationDetents={["medium", "large"]}
      presentationDragIndicator="visible"
      presentationBackground={SURFACE}
      fullScreenCover={{
        isPresented: lisible && video.plein,
        onChanged: (presente: boolean) => {
          if (!presente) onPleinEcran(false)
        },
        content: lisible && video.plein ? <PleinEcran video={video} player={player} onFermer={() => onPleinEcran(false)} /> : <EmptyView />,
      }}
    >
      <HStack alignment="top">
        <VStack alignment="leading" spacing={2}>
          <Text font="headline" accessibilityAddTraits="isHeader">
            {video.titre}
          </Text>
          <Text font="subheadline" foregroundStyle="secondaryLabel">
            {skin}
          </Text>
        </VStack>
        <Spacer />
        <Button title="Fermer" action={onFermer} />
      </HStack>
      {lisible && video.plein ? (
        <Text foregroundStyle="secondaryLabel" frame={{ maxWidth: "infinity", minHeight: 120 }}>
          Lecture en plein écran
        </Text>
      ) : lisible && player ? (
        <VStack spacing={8} frame={{ maxWidth: "infinity" }}>
          <ZStack frame={{ maxWidth: "infinity" }} aspectRatio={{ value: 16 / 9, contentMode: "fit" }}>
            <LecteurNatif player={player} chargement={video.etat === "chargement"} />
          </ZStack>
          <Button title="Plein écran" systemImage="arrow.up.left.and.arrow.down.right" action={() => onPleinEcran(true)} />
        </VStack>
      ) : (
        <Text foregroundStyle="secondaryLabel" frame={{ maxWidth: "infinity", minHeight: 120 }}>
          {INDISPONIBLE}
        </Text>
      )}
      {video.detail ? (
        <Text font="footnote" foregroundStyle="secondaryLabel">
          {video.detail}
        </Text>
      ) : null}
    </VStack>
  )
}

/**
 * La fiche d'un skin, ouverte par l'uuid d'un de ses niveaux (`id`) et le prix à afficher (`prix`, VP) ; `offre` :
 * nom et icône en cache de la rangée, pour le repli ; `ouverture` : numéro qui change à chaque appui sur une offre.
 * La variante choisie et la vidéo du lecteur valent pour cette ouverture et cet `id` seuls : la fiche, restée à sa
 * place dans la pile, repart de la première variante, lecteur fermé et libéré, quand une offre est de nouveau ouverte.
 * Ticket 8.4 : `catalogue`, catalog.json déjà lu par le Catalogue (rien n'est relu) ; `infos`, ce que la fiche dit en
 * plus (InfosCatalogue) : le prix écrit à la place de `prix`, la boutique du jour et le bouton des souhaits.
 */
export function FicheSkin({ id, prix, offre, ouverture, catalogue: donne, infos }: {
  id: string; prix: number | null; offre?: OffreAffichee; ouverture?: number; catalogue?: unknown; infos?: InfosCatalogue
}) {
  const [catalogue] = useState<unknown>(() => (donne !== undefined ? donne : lireCatalogue()))
  const [choix, setChoix] = useState<{ id: string; ouverture: number | undefined; rang: number }>({ id, ouverture, rang: 0 })
  // Adresses qui n'ont pas chargé, images comme vidéos : plus jamais redemandées tant que la fiche est là.
  const [echecs, setEchecs] = useState<string[]>([])
  const echouer = useStable((adresse: string) => setEchecs((l) => (l.includes(adresse) ? l : [...l, adresse])))
  // Ticket 4.51 : le choix d'une variante, stable (seules les pastilles qui changent sont rendues de nouveau).
  const choisir = useStable((rang: number) => setChoix({ id, ouverture, rang }))
  // Le lecteur : un AVPlayer créé à l'appui, jamais avant, null quand aucun n'est ouvert ; `video`, ce qu'en montre la
  // feuille ; `session`, les réglages de la session audio, faits l'un après l'autre dans l'ordre des appels.
  const lecteur = useRef<AVPlayer | null>(null)
  const session = useRef<Promise<void>>(Promise.resolve())
  // Ticket 8.12 : vrai tant que les orientations ont été changées pour la vidéo ouverte (rendues une seule fois).
  const tourne = useRef(false)
  const [video, setVideo] = useState<VideoOuverte | null>(null)

  const [chezToi] = useState<{ aToi: boolean; phrase: string | null }>(() => {
    try {
      const p = possessionsLues()
      const niveaux = niveauxDuSkin(catalogue, id)
      return { aToi: skinPossede(p.possedes, niveaux) === true, phrase: phraseApparitions(apparitions(p.historique, p.compte, niveaux), Date.now()) }
    } catch {
      return { aToi: false, phrase: null }
    }
  })

  /** Un réglage de la session audio, à la suite des précédents, sans attendre ; un refus se dit en console. */
  const regler = (quoi: string, reglage: () => Promise<void>) => {
    session.current = session.current.then(reglage).catch((e) => console.log(`fiche : session audio refusée, ${quoi} (${e})`))
  }
  /** Arrête puis libère le lecteur ouvert, une seule fois, et rend la session audio aux autres apps. */
  const liberer = () => {
    const p = lecteur.current
    if (!p) return
    lecteur.current = null
    try {
      p.stop()
    } catch (e) {
      console.log("fiche : vidéo non arrêtée (" + e + ")")
    }
    try {
      p.dispose()
    } catch (e) {
      console.log("fiche : lecteur vidéo non libéré (" + e + ")")
    }
    regler("fin", () => SharedAudioSession.setActive(false, ["notifyOthersOnDeactivation"]))
    if (tourne.current) {
      tourne.current = false
      rendreOrientations()
    }
  }
  // Une nouvelle ouverture de la fiche (`id`, `ouverture`) ou son démontage libèrent le lecteur.
  useEffect(() => () => liberer(), [id, ouverture])

  /** Une adresse de vidéo qu'on peut lire : présente, sur le CDN des vidéos, jamais en échec. */
  const lisible = (adresse: string | null): adresse is string =>
    adresse !== null && adresse.startsWith(CDN_VIDEOS) && !echecs.includes(adresse)
  /** La vidéo ouverte en échec : lecteur libéré, adresse gardée avec les échecs, « Vidéo indisponible » au lecteur. */
  const echouerVideo = (adresse: string, cause: string) => {
    console.log("fiche : vidéo indisponible (" + cause + ")")
    liberer()
    echouer(adresse)
    setVideo((o) => (o && o.adresse === adresse ? { ...o, etat: "erreur", plein: false } : o))
  }
  /** Lit `v` dans la feuille : la vidéo d'avant arrêtée et libérée, un AVPlayer neuf sur son adresse, la lecture lancée. */
  const lire = useStable((v: Video) => {
    const adresse = v.adresse
    if (!lisible(adresse)) return
    liberer()
    setVideo({ id, ouverture, adresse, titre: v.titre, detail: v.detail, etat: "chargement", plein: false })
    try {
      const p = new AVPlayer()
      lecteur.current = p
      // Ticket 8.12 : le paysage permis tant que la vidéo est ouverte (feuille ou plein écran), rendu par liberer.
      if (!tourne.current) tourne.current = permettrePaysage()
      const ouvert = () => lecteur.current === p
      p.onReadyToPlay = () => {
        if (!ouvert()) return
        setVideo((o) => (o && o.adresse === adresse ? { ...o, etat: "prete" } : o))
        p.play()
      }
      p.onError = (message: string) => {
        if (ouvert()) echouerVideo(adresse, message)
      }
      // Son malgré le mode silencieux : catégorie « playback », réglée à chaque lecture.
      regler("lecture", async () => {
        await SharedAudioSession.setCategory("playback", [])
        await SharedAudioSession.setActive(true)
      })
      // L'adresse telle que rangée, sans options : ni cookie, ni jeton, ni en-tête. Ticket 7.8 (relecture) : seulement une vidéo
      // du CDN de Riot (securite.ts, videoAdmise) : catalog.json vit dans le dossier partagé, qu'un autre script peut réécrire.
      if (!videoAdmise(adresse) || !p.setSource(adresse)) throw new Error("adresse refusée")
      p.play()
    } catch (e) {
      echouerVideo(adresse, String(e))
    }
  })
  /** Feuille fermée (glissement ou « Fermer ») : le lecteur libéré, plus de vidéo ouverte. */
  const fermer = () => {
    liberer()
    setVideo(null)
  }
  /** Ticket 8.12 : ouvre ou ferme le plein écran de la vidéo ouverte ; le lecteur reste le même, rien n'est libéré. */
  const pleinEcran = (plein: boolean) => {
    setVideo((o) => (o && o.plein !== plein && (!plein || (o.etat !== "erreur" && lecteur.current !== null)) ? { ...o, plein } : o))
  }

  // Ticket 4.51 : la fiche lue une fois par skin, ses vidéos de niveau aussi : les mêmes objets d'un rendu à l'autre (une
  // pastille ou une vidéo touchée ne rend de nouveau que ce qui change). La vidéo de la variante, la même par variante choisie.
  const tenue = useRef<{ id: string | null; fiche: ReturnType<typeof lireFicheSkin>; niveaux: Video[]; variante: Video | null }>({ id: null, fiche: null, niveaux: [], variante: null })
  if (tenue.current.id !== id) {
    const f = lireFicheSkin(catalogue, id)
    tenue.current = { id, fiche: f, niveaux: f ? f.niveaux.map(videoDuNiveau) : [], variante: null }
  }
  const fiche = tenue.current.fiche
  const variantes = fiche ? fiche.variantes : []
  const rang = choix.id === id && choix.ouverture === ouverture && choix.rang < variantes.length ? choix.rang : 0
  const variante = variantes.length > 0 ? variantes[rang] : null
  const adresse = variante && variante.fullRender && !echecs.includes(variante.fullRender) ? variante.fullRender : null
  const noms = separerNom(fiche ? fiche.name : offre?.name ?? id)
  const arme = noms.weapon || (fiche?.weapon ?? "").toUpperCase()
  // Sans fiche, sur un catalogue à reconstruire : ses variantes viendront à la prochaine lecture de la boutique.
  const attente = !fiche && catalogueAReconstruire(catalogue)
  // Vidéos : celle de la variante choisie, dès deux variantes et si elle en a une ; puis chaque niveau, dans l'ordre.
  const neuve: Video | null = variante && variantes.length >= 2 && variante.streamedVideo
    ? { cle: "variante", adresse: variante.streamedVideo, titre: libelleVariante(variante.name, rang), detail: null }
    : null
  const tenueVariante = tenue.current.variante
  if (neuve === null || tenueVariante === null || tenueVariante.adresse !== neuve.adresse || tenueVariante.titre !== neuve.titre) tenue.current.variante = neuve
  const videoVariante = tenue.current.variante
  const videosNiveaux = tenue.current.niveaux
  const ouverte = video && video.id === id && video.ouverture === ouverture ? video : null

  return (
    <List
      navigationTitle={noms.skin}
      navigationBarTitleDisplayMode="inline"
      scrollContentBackground="hidden"
      background={FOND}
      sheet={{
        isPresented: ouverte !== null,
        onChanged: (presentee: boolean) => {
          if (!presentee) fermer()
        },
        content: ouverte ? (
          <LecteurVideo video={ouverte} skin={noms.skin} player={lecteur.current} onFermer={fermer} onPleinEcran={pleinEcran} />
        ) : <EmptyView />,
      }}
    >
      {
}
      <Section>
        <VStack listRowBackground={<Rectangle fill="clear" />} listRowSeparator="hidden" listRowInsets={0}>
          <EnTeteFiche
            t={COULEURS.standard}
            image={<GrandeImage adresse={adresse} repli={offre?.icon ?? null} onEchec={echouer} />}
            nom={noms.skin}
            intitule={arme || null}
            couleur={offre?.color ?? null}
          />
        </VStack>
      </Section>
      <Section listRowBackground={<Rectangle fill={SURFACE} />}>
        {infos && infos.remise ? <PrixRemise prix={infos.prix} remise={infos.remise} />
          : infos && infos.sansPrix && infos.origine ? <LabeledContent title="Origine" value={infos.origine} />
          : <LabeledContent title="Prix" value={infos ? infos.prix : prixDit(prix)} />}
      </Section>
      {chezToi.aToi || chezToi.phrase !== null ? (
        <Section title="Chez toi" listRowBackground={<Rectangle fill={SURFACE} />}>
          {chezToi.aToi ? <LabeledContent title="Ta collection" value="Déjà à toi" /> : null}
          {chezToi.phrase !== null ? <Text font="subheadline" foregroundStyle="secondaryLabel">{chezToi.phrase}</Text> : null}
        </Section>
      ) : null}
      {infos ? (
        <Section listRowBackground={<Rectangle fill={SURFACE} />}>
          {infos.source ? <LabeledContent title="Source du prix" value={infos.source} /> : null}
          {infos.origine && !infos.sansPrix ? <LabeledContent title="Origine" value={infos.origine} /> : null}
          {infos.sortie ? <LabeledContent title="Sortie" value={infos.sortie} /> : null}
          <LabeledContent title="Boutique du jour" value={infos.boutique} />
          <BoutonSouhait dedans={infos.souhait === "skin"} libelle={infos.souhait === "skin" ? "Retirer des souhaits" : "Ajouter aux souhaits"} onAppui={infos.onSouhait} />
          {infos.souhait === "arme" ? (
            <Text font="footnote" foregroundStyle="secondaryLabel">Déjà dans tes souhaits par son arme entière.</Text>
          ) : null}
          {infos.erreur ? <Text foregroundStyle="red">{infos.erreur}</Text> : null}
        </Section>
      ) : null}
      {variante && variantes.length >= 2 ? (
        <Section title="Variantes" listRowBackground={<Rectangle fill={SURFACE} />}>
          <ScrollView axes="horizontal" scrollIndicator="hidden">
            <HStack spacing={8}>
              {variantes.map((v, i) => (
                <Pastille
                  key={v.id}
                  variante={v}
                  rang={i}
                  choisie={i === rang}
                  echouee={v.swatch != null && echecs.includes(v.swatch)}
                  onEchec={echouer}
                  choisir={choisir}
                />
              ))}
            </HStack>
          </ScrollView>
          <Text font="footnote" foregroundStyle="secondaryLabel">
            {libelleVariante(variante.name, rang)}
          </Text>
        </Section>
      ) : null}
      {videoVariante || videosNiveaux.length > 0 ? (
        <Section title="Vidéos" listRowBackground={<Rectangle fill={SURFACE} />}>
          {videoVariante ? (
            <RangeeVideo
              key={videoVariante.cle}
              video={videoVariante}
              secondaire="Variante choisie"
              lisible={lisible(videoVariante.adresse)}
              onLire={lire}
            />
          ) : null}
          {videosNiveaux.map((v) => (
            <RangeeVideo key={v.cle} video={v} secondaire={v.detail} lisible={lisible(v.adresse)} onLire={lire} />
          ))}
        </Section>
      ) : null}
      {attente ? (
        <Section listRowBackground={<Rectangle fill={SURFACE} />}>
          <Text foregroundStyle="secondaryLabel">Variantes après la prochaine mise à jour de la boutique.</Text>
        </Section>
      ) : null}
    </List>
  )
}
