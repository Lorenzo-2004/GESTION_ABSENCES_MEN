/** Règles de saisie communes au portail MEN. */

/** Ne conserve que les chiffres et limite l'IM à six caractères. */
export function normaliserIM(valeur: string): string {
  return valeur.replace(/\D/g, '').slice(0, 6)
}

export function imValide(valeur: string): boolean {
  return /^\d{6}$/.test(valeur)
}

/** Ne conserve que les chiffres et limite la CIN à douze caractères. */
export function normaliserCIN(valeur: string): string {
  return valeur.replace(/\D/g, '').slice(0, 12)
}

export function cinValide(valeur: string): boolean {
  return /^\d{12}$/.test(valeur)
}

/** Autorise les lettres Unicode, espaces, apostrophes et traits d'union. */
export function normaliserNom(valeur: string): string {
  return valeur.replace(/[^\p{L}\s'’\-]/gu, '').replace(/\s{2,}/g, ' ')
}

export function nomValide(valeur: string): boolean {
  return valeur.trim().length > 0 && /^[\p{L}\s'’\-]+$/u.test(valeur.trim())
}

/** Le cahier des charges du formulaire impose une adresse Gmail. */
export function emailGmailValide(valeur: string): boolean {
  return /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(valeur.trim())
}

export const MESSAGE_IM = 'L’IM doit contenir exactement 6 chiffres.'
export const MESSAGE_CIN = 'La CIN doit contenir exactement 12 chiffres.'
export const MESSAGE_NOM = 'Utilisez uniquement des lettres, espaces, apostrophes ou traits d’union.'
export const MESSAGE_EMAIL_GMAIL = 'L’adresse doit se terminer par @gmail.com.'
