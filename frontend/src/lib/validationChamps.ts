/** Règles de saisie communes au portail MEN. Les contrôles complètent ceux du backend. */

/** Ne conserve que les chiffres et limite l’IM à six caractères. */
export function normaliserIM(valeur: string): string {
  return valeur.replace(/\D/g, '').slice(0, 6)
}

export function imValide(valeur: string): boolean {
  return /^\d{6}$/.test(valeur.trim())
}

/** Ne conserve que les chiffres et limite la CIN à douze caractères. */
export function normaliserCIN(valeur: string): string {
  return valeur.replace(/\D/g, '').slice(0, 12)
}

export function cinValide(valeur: string): boolean {
  return /^\d{12}$/.test(valeur.replace(/\s+/g, ''))
}

/** Autorise les lettres Unicode, espaces, apostrophes et traits d’union — pas de chiffres. */
export function normaliserNom(valeur: string): string {
  return valeur.replace(/[^\p{L}\s'’\-]/gu, '').replace(/\s{2,}/g, ' ').slice(0, 120)
}

export function nomValide(valeur: string): boolean {
  return valeur.trim().length > 0 && /^[\p{L}\s'’\-]+$/u.test(valeur.trim())
}

/** Numéro administratif : conserve les caractères couramment utilisés dans les décisions. */
export function normaliserNumeroDecision(valeur: string): string {
  return valeur.replace(/[^\p{L}\p{N}\s/._,\-°º#]/gu, '').replace(/\s{2,}/g, ' ').slice(0, 80)
}

/** Année seule ou liste/plage d’années comme 2026, 2025-2026 ou 2024, 2025. */
export function normaliserAnneesTitre(valeur: string): string {
  return valeur.replace(/[^\d\s,\-]/g, '').replace(/\s{2,}/g, ' ').slice(0, 80)
}

export function anneesTitreValides(valeur: string): boolean {
  const texte = valeur.trim()
  if (!/^\d{4}(?:\s*[-,]\s*\d{4})*$/.test(texte)) return false
  return texte.match(/\d{4}/g)?.every((annee) => Number(annee) >= 1900 && Number(annee) <= 9999) ?? false
}

/** Champ entier positif. La limite évite les saisies accidentellement trop longues. */
export function normaliserEntier(valeur: string, longueurMax = 9): string {
  return valeur.replace(/\D/g, '').slice(0, longueurMax)
}

export function entierValide(valeur: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): boolean {
  if (!/^\d+$/.test(valeur.trim())) return false
  const nombre = Number(valeur)
  return Number.isSafeInteger(nombre) && nombre >= minimum && nombre <= maximum
}

/** Élimine les caractères de contrôle sans interdire les chiffres dans un texte libre. */
export function normaliserTexteLibre(valeur: string, autoriserRetoursLigne = false): string {
  const controles = autoriserRetoursLigne ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g
  return valeur.replace(controles, '').slice(0, 4000)
}

/** Téléphone : chiffres, indicatif +, espaces, parenthèses et tirets. */
export function normaliserTelephone(valeur: string): string {
  return valeur.replace(/[^\d+() .\-]/g, '').replace(/(?!^)\+/g, '').slice(0, 24)
}

export function telephoneValide(valeur: string): boolean {
  const chiffres = valeur.replace(/\D/g, '')
  return chiffres.length >= 8 && chiffres.length <= 15
}

/** Les champs explicatifs doivent contenir au moins une lettre, mais gardent les chiffres utiles. */
export function texteContientLettres(valeur: string): boolean {
  return /\p{L}/u.test(valeur.trim())
}

export function emailValide(valeur: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur.trim())
}

/** Le formulaire de création de compte impose une adresse Gmail. */
export function emailGmailValide(valeur: string): boolean {
  return /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(valeur.trim())
}

export const MESSAGE_IM = 'L’IM doit contenir exactement 6 chiffres.'
export const MESSAGE_CIN = 'La CIN doit contenir exactement 12 chiffres.'
export const MESSAGE_NOM = 'Utilisez uniquement des lettres, espaces, apostrophes ou traits d’union.'
export const MESSAGE_EMAIL_GMAIL = 'L’adresse doit se terminer par @gmail.com.'

/** Libellé administratif (corps/grade) : garde lettres, chiffres et ponctuation usuelle. */
export function normaliserLibelleAdministratif(valeur: string, longueurMax = 100): string {
  return valeur
    .replace(/[^\p{L}\p{N}\s'’()\-./]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, longueurMax)
}

export function libelleAdministratifValide(valeur: string): boolean {
  const texte = valeur.trim()
  return texte.length > 0 && /\p{L}/u.test(texte) && /^[\p{L}\p{N}\s'’()\-./]+$/u.test(texte)
}

export const MESSAGE_TELEPHONE = 'Saisissez un numéro de téléphone valide (8 à 15 chiffres).'
export const MESSAGE_EMAIL = 'Saisissez une adresse e-mail valide.'
export const MESSAGE_DATE_NAISSANCE = 'La date de naissance doit être valide et ne pas être dans le futur.'
export const MESSAGE_LIBELLE_ADMIN = 'Saisissez un libellé valide avec des lettres et, si nécessaire, des chiffres, espaces, tirets ou points.'
