import {
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import axios from 'axios'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../contexts/useAuth'
import { imValide, MESSAGE_IM, normaliserIM } from '../lib/validationChamps'

interface LoginErrorResponse {
  detail?: string
  identifiant?: string[]
  password?: string[]
}

/* ------------------------------------------------------------------ */
/*  Animations : respect des préférences de mouvement réduit            */
/* ------------------------------------------------------------------ */

const STYLES = `
.men-serif{font-family:'Space Grotesk Variable','Space Grotesk','Inter Variable','Inter',sans-serif}

@keyframes men-rise{from{opacity:0;transform:translate3d(0,18px,0)}to{opacity:1;transform:none}}
@keyframes men-fade{from{opacity:0}to{opacity:1}}
@keyframes men-line{from{transform:translate3d(0,110%,0)}to{transform:none}}
@keyframes men-card-in{from{opacity:0;transform:translate3d(0,28px,0) scale(.98)}to{opacity:1;transform:none}}
@keyframes men-sway-doux{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2.6deg)}}
@keyframes men-float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-16px,0)}}
@keyframes men-shake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-4px)}40%,60%{transform:translateX(4px)}}
@keyframes men-logo-enter{from{opacity:0;transform:translate3d(0,14px,0) scale(.94)}to{opacity:1;transform:none}}
@keyframes men-accent-enter{from{transform:scaleX(0);opacity:0}to{transform:scaleX(1);opacity:1}}
@keyframes men-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}
@keyframes men-glow{0%,100%{opacity:.4}50%{opacity:.7}}
@keyframes men-shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes men-pulse-ring{0%{transform:scale(.95);opacity:.7}50%{transform:scale(1.05);opacity:.3}100%{transform:scale(.95);opacity:.7}}
@keyframes men-gradient-shift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes men-bounce-subtle{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes men-fade-slide-right{from{opacity:0;transform:translate3d(-20px,0,0)}to{opacity:1;transform:none}}
@keyframes men-particle-float{0%,100%{transform:translate3d(0,0,0) scale(1);opacity:.3}50%{transform:translate3d(20px,-30px,0) scale(1.3);opacity:.7}}
@keyframes men-text-glow{0%,100%{text-shadow:0 0 20px rgba(255,255,255,.3)}50%{text-shadow:0 0 40px rgba(255,255,255,.6), 0 0 60px rgba(125,211,252,.4)}}
@keyframes men-border-glow{0%,100%{box-shadow:0 14px 36px -14px rgba(29,78,216,.45), 0 0 0 0 rgba(59,130,246,.4)}50%{box-shadow:0 14px 36px -14px rgba(29,78,216,.6), 0 0 0 12px rgba(59,130,246,0)}}

.men-rise{animation:men-rise .85s cubic-bezier(.2,.7,.2,1) var(--d,0ms) both}
.men-fade{animation:men-fade 1.4s ease-out var(--d,0ms) both}
.men-line{animation:men-line 1s cubic-bezier(.2,.8,.2,1) var(--d,0ms) both}
.men-card-in{animation:men-card-in .9s cubic-bezier(.2,.7,.2,1) both}
.men-sway-doux{animation:men-sway-doux var(--s,9s) ease-in-out var(--sd,0s) infinite;transform-origin:0 0}
.men-float{animation:men-float var(--f,9s) ease-in-out var(--fd,0s) infinite}
.men-shake{animation:men-shake .45s cubic-bezier(.36,.07,.19,.97) both}
.men-logo-enter{animation:men-logo-enter .85s cubic-bezier(.2,.7,.2,1) var(--d,0ms) both}
.men-accent-reveal{transform-origin:center;animation:men-accent-enter .8s cubic-bezier(.2,.8,.2,1) var(--d,0ms) both}
.men-breathe{animation:men-breathe 6s ease-in-out infinite}
.men-glow{animation:men-glow 4s ease-in-out infinite}
.men-card-hover{transition:transform .5s cubic-bezier(.2,.7,.2,1), box-shadow .5s ease}
.men-card-hover:hover{transform:translateY(-4px);box-shadow:0 50px 120px -30px rgba(23,50,140,.6)}
.men-pulse-ring{animation:men-pulse-ring 3s ease-in-out infinite}
.men-gradient-shift{background-size:200% 200%;animation:men-gradient-shift 4s ease infinite}
.men-bounce-subtle{animation:men-bounce-subtle 2.5s ease-in-out infinite}
.men-fade-slide-right{animation:men-fade-slide-right .9s cubic-bezier(.2,.7,.2,1) var(--d,0ms) both}
.men-text-glow{animation:men-text-glow 3s ease-in-out infinite}
.men-border-glow{animation:men-border-glow 3s ease-in-out infinite}

.men-submit{position:relative;isolation:isolate;overflow:hidden}
.men-submit::after{content:"";position:absolute;top:-30%;bottom:-30%;left:-45%;width:28%;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent);transform:translateX(-100%) skewX(-20deg);transition:transform .8s cubic-bezier(.2,.7,.2,1)}
.men-submit:hover::after{transform:translateX(650%) skewX(-20deg)}

.men-particle{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.6),transparent 70%);pointer-events:none;animation:men-particle-float var(--pf,8s) ease-in-out var(--pd,0s) infinite}

@media (prefers-reduced-motion:reduce){
  .men-rise,.men-fade,.men-line,.men-card-in,.men-sway-doux,.men-float,.men-shake,.men-logo-enter,.men-accent-reveal,.men-breathe,.men-glow,.men-pulse-ring,.men-gradient-shift,.men-bounce-subtle,.men-fade-slide-right,.men-text-glow,.men-border-glow,.men-particle{animation:none!important}
  .men-submit::after{display:none!important}
  .men-card-hover:hover{transform:none}
}
`

const delai = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

/* ------------------------------------------------------------------ */
/* Illustration : feuilles et vagues de papier découpé (BLEU)          */
/* ------------------------------------------------------------------ */

function Fronde({
  x,
  y,
  angle,
  echelle = 1,
  teintes,
  duree = 9,
  retard = 0,
}: {
  x: number
  y: number
  angle: number
  echelle?: number
  teintes: string[]
  duree?: number
  retard?: number
}) {
  const nombre = 12

  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${echelle})`}>
      <g
        className="men-sway-doux"
        style={{ '--s': `${duree}s`, '--sd': `${retard}s` } as CSSProperties}
      >
        <path
          d="M0 0 Q 150 0 300 -90"
          fill="none"
          stroke={teintes[0]}
          strokeWidth="3"
          strokeLinecap="round"
        />

        {Array.from({ length: nombre }, (_, i) => {
          const t = i / (nombre - 1)
          const px = t * 300
          const py = -t * t * 90
          const tangente = (Math.atan2(-180 * t, 300) * 180) / Math.PI
          const longueur = 92 - t * 46
          const largeur = 15 - t * 6

          return [-1, 1].map((cote) => (
            <path
              key={`${i}-${cote}`}
              d={`M0 0 Q ${longueur / 2} ${-largeur} ${longueur} 0 Q ${longueur / 2} ${largeur} 0 0 Z`}
              transform={`translate(${px} ${py}) rotate(${tangente + cote * 62})`}
              fill={teintes[(i + (cote > 0 ? 1 : 0)) % teintes.length]}
              opacity={0.95}
            />
          ))
        })}
      </g>
    </g>
  )
}

/** Illustration de droite (ordinateur) - Version BLEUE */
function Art() {
  const calques = [
    { decalage: 0, fond: '#F0F0FF' },
    { decalage: 45, fond: '#F0F0FF' },
    { decalage: 90, fond: '#F0F0FF' },
    { decalage: 135, fond: '#ffffff' },
  ]

  return (
    <svg
      viewBox="0 0 620 700"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="men-fond-art" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1B1BFF" />
          <stop offset=".55" stopColor="#1B1BFF" />
          <stop offset="1" stopColor="#00FF9C" />
        </linearGradient>
        <radialGradient id="men-lueur-art" cx=".78" cy=".28" r=".6">
          <stop offset="0" stopColor="#00FF9C" stopOpacity=".55" />
          <stop offset="1" stopColor="#00FF9C" stopOpacity="0" />
        </radialGradient>
        <filter id="men-ombre-art" x="-30%" y="-5%" width="160%" height="110%">
          <feDropShadow
            dx="7"
            dy="0"
            stdDeviation="8"
            floodColor="#1B1BFF"
            floodOpacity=".4"
          />
        </filter>
      </defs>

      <rect width="620" height="700" fill="url(#men-fond-art)" />
      <rect width="620" height="700" fill="url(#men-lueur-art)" />

      <Fronde
        x={640}
        y={-10}
        angle={125}
        echelle={1.2}
        teintes={['#1B1BFF', '#1B1BFF', '#1B1BFF']}
        duree={11}
        retard={-2}
      />
      <Fronde
        x={640}
        y={600}
        angle={-168}
        echelle={1.35}
        teintes={['#1B1BFF', '#1B1BFF', '#00FF9C']}
        duree={10}
        retard={-5}
      />
      <Fronde
        x={230}
        y={720}
        angle={-62}
        echelle={1.55}
        teintes={['#1B1BFF', '#1B1BFF', '#1B1BFF']}
        duree={12}
      />
      <Fronde
        x={430}
        y={735}
        angle={-98}
        echelle={1.25}
        teintes={['#1B1BFF', '#1B1BFF', '#00FF9C']}
        duree={8}
        retard={-3}
      />

      {calques.map(({ decalage: o, fond }) => (
        <path
          key={o}
          className="men-breathe"
          style={{ animationDelay: `${o * 0.2}s` }}
          d={`M-20 -20 H ${270 - o} C ${210 - o} 120, ${350 - o} 190, ${290 - o} 330 S ${170 - o} 520, ${250 - o} 720 H -20 Z`}
          fill={fond}
          filter="url(#men-ombre-art)"
        />
      ))}
    </svg>
  )
}

/** Bandeau d'illustration (mobile) - Version BLEUE */
function ArtMobile() {
  const calques = [
    { decalage: 36, fond: '#F0F0FF' },
    { decalage: 24, fond: '#F0F0FF' },
    { decalage: 12, fond: '#F0F0FF' },
    { decalage: 0, fond: '#ffffff' },
  ]

  return (
    <svg
      viewBox="0 0 400 160"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="men-fond-mobile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1B1BFF" />
          <stop offset=".6" stopColor="#1B1BFF" />
          <stop offset="1" stopColor="#00FF9C" />
        </linearGradient>
        <filter id="men-ombre-mobile" x="-5%" y="-30%" width="110%" height="160%">
          <feDropShadow
            dx="0"
            dy="4"
            stdDeviation="5"
            floodColor="#1B1BFF"
            floodOpacity=".35"
          />
        </filter>
      </defs>

      <rect width="400" height="160" fill="url(#men-fond-mobile)" />

      <Fronde
        x={400}
        y={170}
        angle={-155}
        echelle={0.55}
        teintes={['#1B1BFF', '#1B1BFF', '#00FF9C']}
        duree={10}
      />
      <Fronde
        x={10}
        y={175}
        angle={-35}
        echelle={0.5}
        teintes={['#1B1BFF', '#1B1BFF', '#00FF9C']}
        duree={9}
        retard={-3}
      />

      {calques.map(({ decalage: o, fond }) => (
        <path
          key={o}
          className="men-breathe"
          style={{ animationDelay: `${o * 0.15}s` }}
          d={`M0 -10 H400 V ${30 + o} C 330 ${56 + o}, 270 ${6 + o}, 200 ${34 + o} S 70 ${58 + o}, 0 ${26 + o} Z`}
          fill={fond}
          filter="url(#men-ombre-mobile)"
        />
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Styles du formulaire de connexion                                   */
/* ------------------------------------------------------------------ */

const champ =
  'h-[52px] w-full rounded-full border border-[#E5E5EA] bg-white pl-12 pr-5 text-sm text-[#0A0A0A] shadow-[0_2px_8px_rgba(20,40,110,.04)] outline-none transition duration-200 placeholder:text-[#86868B] hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15 disabled:bg-[#F0F0FF] disabled:text-slate-500 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-500/10'

const etiquette =
  'mb-2 block pl-4 text-xs font-semibold tracking-[.01em] text-[#0A0A0A] transition-colors duration-200 group-focus-within:text-[#1B1BFF]'

/* ------------------------------------------------------------------ */
/* Page de connexion                                                   */
/* ------------------------------------------------------------------ */

export function LoginPage() {
  const { utilisateur, chargement, connecter } = useAuth()
  const navigate = useNavigate()

  const [identifiant, setIdentifiant] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [errorTick, setErrorTick] = useState(0)
  const [pending, setPending] = useState(false)

  if (chargement) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F0F0FF]">
        <span
          role="status"
          aria-label="Chargement"
          className="h-6 w-6 animate-spin rounded-full border-2 border-[#1B1BFF]/20 border-t-[#1B1BFF]"
        />
      </main>
    )
  }

  if (utilisateur) {
    return <Navigate to="/app" replace />
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (/^\d/.test(identifiant.trim()) && !imValide(identifiant.trim())) {
      setError(MESSAGE_IM)
      setErrorTick((valeur) => valeur + 1)
      return
    }

    setPending(true)

    try {
      await connecter({
        identifiant: identifiant.trim(),
        password,
      })

      navigate('/app', { replace: true })
    } catch (exception: unknown) {
      if (axios.isAxiosError<LoginErrorResponse>(exception)) {
        const data = exception.response?.data

        setError(
          data?.detail ??
            data?.identifiant?.[0] ??
            data?.password?.[0] ??
            'Connexion impossible. Vérifiez vos identifiants.',
        )
      } else {
        setError('Une erreur inattendue est survenue.')
      }

      setErrorTick((valeur) => valeur + 1)
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[linear-gradient(135deg,#F0F0FF_0%,#FAFAF8_45%,#E8FFF6_100%)] px-4 py-8 font-sans text-[#0A0A0A] antialiased sm:px-8">
      <style>{STYLES}</style>

      {/* Halos flous en arrière-plan */}
      <span
        aria-hidden="true"
        className="men-float men-glow pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-blue-300/40 blur-3xl"
        style={{ '--f': '17s', '--fd': '-3s' } as CSSProperties}
      />
      <span
        aria-hidden="true"
        className="men-float men-glow pointer-events-none absolute -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-teal-300/35 blur-3xl"
        style={{ '--f': '20s', '--fd': '-8s' } as CSSProperties}
      />
      <span
        aria-hidden="true"
        className="men-float men-glow pointer-events-none absolute right-[18%] top-[6%] h-56 w-56 rounded-full bg-indigo-300/30 blur-3xl"
        style={{ '--f': '14s', '--fd': '-5s' } as CSSProperties}
      />

      <section
        className="men-card-in men-card-hover relative w-full max-w-[1040px] overflow-hidden rounded-[28px] bg-white shadow-[0_40px_100px_-30px_rgba(23,50,140,.5)]"
        style={delai(60)}
      >
        <div className="relative flex flex-col lg:min-h-[660px]">
          {/* ---------- Formulaire ---------- */}
          <div className="relative z-10 flex flex-1 flex-col justify-center px-6 py-10 sm:px-12 lg:w-[48%] lg:px-14">
            <div className="mx-auto w-full max-w-[380px]">
              {/* Logo avec animations */}
              <header
                className="men-logo-enter mb-6 flex flex-col items-center text-center"
                style={delai(120)}
              >
                <div className="men-border-glow relative grid h-[84px] w-[84px] place-items-center rounded-[24px] border border-[#E5E5EA] bg-white p-3">
                  <span
                    aria-hidden="true"
                    className="men-pulse-ring absolute inset-0 rounded-[24px] border-2 border-[#1B1BFF]/30"
                  />
                  <img
                    src="/LOGOMEN.jpg"
                    alt="Logo du Ministère de l’Éducation Nationale"
                    className="h-full w-full object-contain mix-blend-multiply"
                  />
                </div>
              </header>

              {/* Titre avec animation de glissement */}
              <div className="men-fade-slide-right text-center" style={delai(200)}>
                <h1 className="men-serif text-[40px] font-normal leading-none tracking-[-0.03em] text-[#0A0A0A] sm:text-[44px]">
                  Connexion
                </h1>
                <div
                  aria-hidden="true"
                  className="men-accent-reveal mx-auto mt-5 h-[3px] w-10 rounded-full bg-gradient-to-r from-[#1B1BFF] to-sky-400"
                  style={delai(380)}
                />
              </div>

              {/* Formulaire */}
              <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
                <div className="men-rise group" style={delai(300)}>
                  <label htmlFor="men-identifiant" className={etiquette}>
                    Identifiant professionnel
                  </label>
                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className="men-bounce-subtle pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#86868B]"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-[18px] w-[18px]"
                      >
                        <rect x="4" y="5" width="16" height="14" rx="3" />
                        <circle cx="9" cy="10" r="1.5" />
                        <path d="M6.8 15c.6-1.6 4-1.6 4.6 0M14 10h3M14 14h3" />
                      </svg>
                    </span>
                    <input
                      id="men-identifiant"
                      name="identifiant"
                      type="text"
                      autoComplete="username"
                      autoFocus
                      value={identifiant}
                      onChange={(event) => {
                        const valeur = event.target.value
                        if (valeur === '' || /^\d/.test(valeur) || /^\d+$/.test(identifiant)) {
                          setIdentifiant(normaliserIM(valeur))
                        } else {
                          setIdentifiant(valeur.slice(0, 150))
                        }
                        setError('')
                      }}
                      disabled={pending}
                      required
                      maxLength={150}
                      placeholder="Votre IM ou identifiant"
                      aria-invalid={Boolean(error || (/^\d/.test(identifiant) && !imValide(identifiant)))}
                      className={champ}
                    />
                  </div>
                  {/^\d/.test(identifiant) && !imValide(identifiant) && (
                    <p role="status" aria-live="polite" className="mt-2 pl-4 text-xs font-medium text-red-600">
                      {MESSAGE_IM}
                    </p>
                  )}
                </div>

                <div className="men-rise group" style={delai(400)}>
                  <label htmlFor="men-password" className={etiquette}>
                    Mot de passe
                  </label>
                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className="men-bounce-subtle pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#86868B]"
                      style={{ animationDelay: '0.5s' }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-[18px] w-[18px]"
                      >
                        <rect x="5" y="10" width="14" height="10" rx="2.5" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
                      </svg>
                    </span>
                    <input
                      id="men-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={pending}
                      required
                      placeholder="Votre mot de passe"
                      aria-invalid={Boolean(error)}
                      className={`${champ} pr-14`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((valeur) => !valeur)}
                      aria-label={
                        showPassword
                          ? 'Masquer le mot de passe'
                          : 'Afficher le mot de passe'
                      }
                      aria-pressed={showPassword}
                      className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#86868B] transition hover:bg-[#1B1BFF]/10 hover:text-[#1B1BFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/30"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-[18px] w-[18px]"
                        aria-hidden="true"
                      >
                        {showPassword ? (
                          <>
                            <path d="M3 3l18 18" />
                            <path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c5 0 8.5 4 9.5 6a12.6 12.6 0 0 1-2.6 3.4M6.5 7.6A12.4 12.4 0 0 0 2.5 12c1 2 4.5 6 9.5 6 1.4 0 2.7-.3 3.8-.8" />
                            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                          </>
                        ) : (
                          <>
                            <path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6z" />
                            <circle cx="12" cy="12" r="3" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    key={errorTick}
                    role="alert"
                    className="men-shake flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-800"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      className="mt-0.5 h-[18px] w-[18px] shrink-0"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7.5v5M12 16h.01" />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                <div className="men-rise pt-2" style={delai(520)}>
                  <button
                    type="submit"
                    disabled={pending || !identifiant.trim() || !password}
                    className="men-submit men-gradient-shift group flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full bg-[linear-gradient(135deg,#1B1BFF_0%,#1B1BFF_50%,#00FF9C_100%)] px-4 text-sm font-semibold tracking-wide text-white shadow-[0_14px_28px_-12px_rgba(27,27,255,.8)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-12px_rgba(27,27,255,.9)] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/30 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {pending && (
                      <span
                        aria-hidden="true"
                        className="relative z-10 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                      />
                    )}
                    <span className="relative z-10">
                      {pending ? 'Connexion en cours' : 'Se connecter'}
                    </span>
                    {!pending && (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="relative z-10 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                        aria-hidden="true"
                      >
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    )}
                  </button>
                </div>
              </form>

              <p
                className="men-fade mt-7 text-center text-[11px] leading-relaxed text-[#86868B]"
                style={delai(700)}
              >
                En cas de difficulté de connexion, contactez votre
                administrateur.
              </p>

              <p
                className="men-fade mt-4 text-center text-[10px] tracking-[.14em] text-[#86868B]"
                style={delai(760)}
              >
                MEN · MADAGASCAR
              </p>
            </div>
          </div>

          {/* ---------- Illustration (ordinateur) ---------- */}
          <div
            aria-hidden="true"
            className="men-fade pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] lg:block"
            style={delai(150)}
          >
            <Art />

            {/* Particules flottantes */}
            <span
              className="men-particle"
              style={{
                width: '8px',
                height: '8px',
                top: '20%',
                right: '15%',
                '--pf': '7s',
                '--pd': '0s',
              } as CSSProperties}
            />
            <span
              className="men-particle"
              style={{
                width: '12px',
                height: '12px',
                top: '50%',
                right: '30%',
                '--pf': '9s',
                '--pd': '-2s',
              } as CSSProperties}
            />
            <span
              className="men-particle"
              style={{
                width: '6px',
                height: '6px',
                top: '70%',
                right: '10%',
                '--pf': '6s',
                '--pd': '-4s',
              } as CSSProperties}
            />
            <span
              className="men-particle"
              style={{
                width: '10px',
                height: '10px',
                top: '35%',
                right: '45%',
                '--pf': '8s',
                '--pd': '-1s',
              } as CSSProperties}
            />

            <div className="absolute bottom-0 left-[-100%] right-0 h-1/2 bg-gradient-to-t from-[#1B1BFF]/95 via-[#1B1BFF]/60 to-transparent" />

            <h2 className="men-serif men-text-glow absolute bottom-10 right-10 text-right text-[34px] font-normal leading-[1.1] tracking-[-0.01em] text-white xl:text-[42px]">
              <span className="block overflow-hidden pb-[0.12em]">
                <span className="men-line block" style={delai(700)}>
                  Ministère de
                </span>
              </span>
              <span className="block overflow-hidden pb-[0.12em]">
                <span className="men-line block" style={delai(860)}>
                  l’Éducation Nationale
                </span>
              </span>
            </h2>
          </div>

          {/* ---------- Illustration (mobile) ---------- */}
          <div aria-hidden="true" className="relative h-36 lg:hidden">
            <ArtMobile />
          </div>
        </div>
      </section>
    </main>
  )
}