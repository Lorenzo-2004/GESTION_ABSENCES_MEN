import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
  headers: {
    Accept: 'application/json',
  },
})

/**
 * Initialise le cookie CSRF avant une requête sensible.
 */
export async function initialiserCSRF(): Promise<void> {
  await api.get<{ csrfToken: string }>('/auth/csrf/')
}
