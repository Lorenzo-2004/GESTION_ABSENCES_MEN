import { isAxiosError } from 'axios'

const DETAILS_GENERIQUES = new Set([
  'les données transmises sont invalides.',
  'invalid input.',
  'validation error.',
  'bad request',
])

function nettoyerTexte(message: string): string | null {
  let texte = message.trim()
  if (!texte) return null

  // Ne pas faire remonter au navigateur les détails d’implémentation ou d’infrastructure.
  if (/(localhost|127\.0\.0\.1|\[::1\]|\bbackend\b|traceback|internal server error|django|psycopg|postgresql|sqlstate|integrityerror|fielderror|object has no attribute|network error|axioserror|request failed with status code|\bHTTP\s+\d{3}\b|http:\/\/|https:\/\/)/i.test(texte)) {
    return null
  }

  texte = texte
    .replace(/\(?\s*RG[\s-–]?\d{1,2}\s*\)?\.?\s*:?[ \t]*/gi, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:]){2,}/g, '$1')
    .replace(/^\s*[,.!?;:]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const traductions: Record<string, string> = {
    'This field is required.': 'Ce champ est obligatoire.',
    'This field may not be blank.': 'Ce champ ne peut pas être vide.',
    'Enter a valid date.': 'Saisissez une date valide.',
    'Enter a valid email address.': 'Saisissez une adresse e-mail valide.',
    'The submitted data was not a file. Check the encoding type on the form.': 'Le fichier transmis est invalide.',
  }
  texte = traductions[texte] ?? texte
  if (!texte || DETAILS_GENERIQUES.has(texte.toLocaleLowerCase('fr'))) return null
  return texte
}

function lireMessagesChamps(valeur: unknown): string[] {
  if (Array.isArray(valeur)) return valeur.flatMap(lireMessagesChamps)
  if (typeof valeur === 'string') {
    const texte = nettoyerTexte(valeur)
    return texte ? [texte] : []
  }
  if (valeur && typeof valeur === 'object') {
    return Object.values(valeur as Record<string, unknown>).flatMap(lireMessagesChamps)
  }
  return []
}

function lireMessageDonnees(donnees: unknown): string | null {
  if (typeof donnees === 'string') return nettoyerTexte(donnees)
  if (!donnees || typeof donnees !== 'object') return null

  const objet = donnees as Record<string, unknown>
  const erreursChamps = objet.erreurs ?? objet.errors
  const messagesChamps = lireMessagesChamps(erreursChamps)
  if (messagesChamps.length) return [...new Set(messagesChamps)].slice(0, 3).join(' ')

  // Certains serializers renvoient directement les erreurs au niveau des champs.
  const champs = Object.entries(objet)
    .filter(([cle]) => !['detail', 'message', 'error', 'code', 'status'].includes(cle))
  const messagesDirects = champs.flatMap(([, valeur]) => lireMessagesChamps(valeur))
  if (messagesDirects.length) {
    return [...new Set(messagesDirects)].slice(0, 3).join(' ')
  }

  for (const cle of ['detail', 'message', 'error']) {
    const message = objet[cle]
    if (typeof message === 'string') {
      const propre = nettoyerTexte(message)
      if (propre) return propre
    }
  }
  return null
}

export function nettoyerMessageUtilisateur(message: unknown): string | null {
  return typeof message === 'string' ? nettoyerTexte(message) : null
}

export function messageErreurUtilisateur(
  erreur: unknown,
  fallback = 'L’opération n’a pas pu être effectuée. Vérifiez les informations puis réessayez.',
): string {
  if (!isAxiosError(erreur)) return fallback

  const statut = erreur.response?.status
  if (statut === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (statut === 403) return 'Vous n’êtes pas autorisé à effectuer cette action.'
  if (statut === 404) return 'L’information demandée est introuvable ou n’est plus disponible.'
  if (statut === 409) return 'Cette information existe déjà ou ne peut pas être modifiée dans son état actuel.'
  if (statut === 413) return 'Le fichier est trop volumineux. Choisissez un fichier plus petit.'
  if (statut === 429) return 'Trop de tentatives ont été effectuées. Patientez un instant avant de réessayer.'
  if (statut !== undefined && statut >= 500) return 'Une erreur est survenue pendant le traitement. Réessayez dans quelques instants.'
  if (!erreur.response) return 'Le service est momentanément indisponible. Réessayez dans quelques instants.'

  const message = lireMessageDonnees(erreur.response.data)
  if (message) return message
  if (statut === 400 || statut === 422) return 'Certaines informations sont manquantes ou incorrectes. Vérifiez le formulaire.'
  return fallback
}

