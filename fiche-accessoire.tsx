import { Image, LabeledContent, List, ProgressView, Section, Text, VStack, useState } from "scripting"
import { COULEURS } from "./design"
import { libelleType, lireAccessoire } from "./fiches"
import { CATALOG } from "./valshop"
import { iconeLisible, imageAdmise } from "./securite"












/** Nom, type et icône d'un objet tels que les montre la rangée touchée : le repli de la fiche. */
export type ObjetAffichable = { name: string; kind: string; icon: string | null }

/** Fond de page de l'app, sous la liste de la fiche comme sous celle de l'onglet. */
const FOND = COULEURS.standard.fond
/** Hauteur du grand visuel : une carte, haute et étroite, s'y loge en hauteur ; un spray, carré, aussi. */
const HAUTEUR_VISUEL = 240

/** Lit le catalogue local. Absent : null, sans bruit ; illisible : null et une ligne en console. */
function lireCatalogue(): unknown {
  try {
    return FileManager.existsSync(CATALOG) ? JSON.parse(FileManager.readAsStringSync(CATALOG)) : null
  } catch (e) {
    console.log("fiche de l'accessoire : catalog.json illisible (" + e + ")")
    return null
  }
}

/**
 * Grand visuel : l'adresse du grand visuel, chargée à l'affichage ; sans elle (absente ou en échec), l'icône de l'offre,
 * chemin en cache ou adresse, sinon « Image indisponible ». `onEchec` reçoit l'adresse qui n'a pas chargé.
 */
function Visuel({ adresse, repli, onEchec }: {
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
        frame={{ maxWidth: "infinity", minHeight: HAUTEUR_VISUEL, maxHeight: HAUTEUR_VISUEL }}
        placeholder={<ProgressView />}
        onError={() => onEchec(adresse)}
      />
    )
  }
  // Entrée 16 de epic-boutique-visuels : le chemin local, par son seul nom de fichier (securite.ts, iconeLisible).
  const icone = iconeLisible(repli, FileManager.appGroupDocumentsDirectory)
  if (icone === null) return <Text foregroundStyle="secondaryLabel">Image indisponible</Text>
  return icone.startsWith("http") ? (
    <Image
      imageUrl={icone}
      resizable
      scaleToFit
      frame={{ maxWidth: "infinity", minHeight: HAUTEUR_VISUEL, maxHeight: HAUTEUR_VISUEL }}
      onError={() => onEchec(icone)}
    />
  ) : (
    <Image filePath={icone} resizable scaleToFit frame={{ maxWidth: "infinity", minHeight: HAUTEUR_VISUEL, maxHeight: HAUTEUR_VISUEL }} />
  )
}

/**
 * La fiche d'un accessoire d'uuid `id` : grand visuel (un titre : son texte), nom, type, prix. `offre` : nom, type et
 * icône de la rangée touchée ; `prix` : le prix à afficher, déjà écrit avec sa monnaie ; `echouees` : les adresses qui
 * n'ont pas chargé dans la fiche qui l'ouvre, jamais redemandées ici.
 */
export function FicheAccessoire({ id, offre, prix, echouees }: {
  id: string; offre: ObjetAffichable; prix: string; echouees?: string[]
}) {
  const [catalogue] = useState<unknown>(lireCatalogue)
  // Adresses qui n'ont pas chargé : plus jamais redemandées tant que la fiche est là.
  const [echecs, setEchecs] = useState<string[]>([])
  const echouer = (adresse: string) => setEchecs((l) => (l.includes(adresse) ? l : [...l, adresse]))
  const enEchec = (adresse: string) => echecs.includes(adresse) || (echouees ?? []).includes(adresse)

  const entree = lireAccessoire(catalogue, id)
  const titre = offre.kind === "title"
  const image = entree && entree.image && !enEchec(entree.image) ? entree.image : null
  const icone = offre.icon ?? (entree ? entree.icon : null)
  const repli = icone && !enEchec(icone) ? icone : null

  return (
    <List navigationTitle={offre.name} navigationBarTitleDisplayMode="inline" scrollContentBackground="hidden" background={FOND}>
      <Section>
        {titre ? (
          <Text font="title" fontWeight="heavy" multilineTextAlignment="center" frame={{ maxWidth: "infinity", minHeight: 120 }}>
            {offre.name}
          </Text>
        ) : (
          <Visuel adresse={image} repli={repli} onEchec={echouer} />
        )}
        <VStack alignment="leading" spacing={2}>
          {titre ? null : (
            <Text font="title2" fontWeight="bold">
              {offre.name}
            </Text>
          )}
          <Text font="subheadline" foregroundStyle="secondaryLabel">
            {libelleType(offre.kind)}
          </Text>
        </VStack>
        <LabeledContent title="Prix" value={prix} />
      </Section>
    </List>
  )
}
