import { useEffect, useRef, useState, type CSSProperties } from 'react'

/* ------------------------------------------------------------------ */
/*  Délai d'animation (lu par .men-rise, .men-draw, .men-bar, etc.)    */
/* ------------------------------------------------------------------ */

export const delai = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

/* ------------------------------------------------------------------ */
/*  Compteur animé (décélération douce, respecte reduced-motion)       */
/* ------------------------------------------------------------------ */

export function useCompteur(cible: number, duree = 1100) {
  const [valeur, setValeur] = useState(0)
  const precedent = useRef(0)

  useEffect(() => {
    const debut = performance.now()
    const depart = precedent.current
    const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let id = 0

    const pas = (maintenant: number) => {
      const t = reduit ? 1 : Math.min(1, (maintenant - debut) / duree)
      const progression = 1 - Math.pow(1 - t, 4)
      const courant = Math.round(depart + (cible - depart) * progression)
      precedent.current = courant
      setValeur(courant)
      if (t < 1) id = requestAnimationFrame(pas)
    }

    id = requestAnimationFrame(pas)
    return () => cancelAnimationFrame(id)
  }, [cible, duree])

  return valeur
}

/* ------------------------------------------------------------------ */
/*  Champs de formulaire                                               */
/* ------------------------------------------------------------------ */

export const champBase =
  'w-full rounded-xl border border-[#E5E5EA] bg-white px-3.5 text-sm text-[#0A0A0A] outline-none transition duration-200 placeholder:text-[#86868B] hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15 disabled:border-[#E5E5EA] disabled:bg-[#FAFAF8] disabled:text-[#86868B]'

export const champ = `h-11 ${champBase}`
export const zoneTexte = `py-3 ${champBase}`

export const etiquette =
  'mb-2 block text-sm font-semibold text-[#0A0A0A] transition-colors duration-200 group-focus-within:text-[#1B1BFF]'

/* ------------------------------------------------------------------ */
/*  Boutons                                                            */
/* ------------------------------------------------------------------ */

export const boutonPrimaire =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1B1BFF] px-4 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(27,27,255,0.3),0_8px_16px_-8px_rgba(27,27,255,0.55)] transition duration-200 hover:bg-[#1B1BFF] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/25 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50'

export const boutonSecondaire =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#E5E5EA] bg-white px-4 text-sm font-semibold text-[#0A0A0A] transition duration-200 hover:border-[#E5E5EA] hover:bg-[#F0F0FF] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/15 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50'

/* À utiliser sur fond coloré (bandeaux bleus, en-têtes) */
export const boutonClair =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#1B1BFF] shadow-[0_8px_20px_-10px_rgba(0,0,0,0.35)] transition duration-200 hover:bg-[#F0F0FF] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40 active:scale-[.98] disabled:pointer-events-none disabled:opacity-60'

export const boutonIcone =
  'grid h-9 w-9 place-items-center rounded-lg text-[#86868B] transition duration-200 hover:bg-[#F5F5F7] hover:text-[#0A0A0A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/40 disabled:opacity-40'

/* ------------------------------------------------------------------ */
/*  Surface                                                            */
/* ------------------------------------------------------------------ */

export const carte =
  'rounded-[20px] border border-[#E5E5EA] bg-white shadow-[0_1px_2px_rgba(15,36,55,0.04),0_10px_28px_-18px_rgba(15,36,55,0.14)]'