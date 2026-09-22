import axios from 'axios'

// In production VITE_API_URL must be set, otherwise fallback to same-origin proxy
const baseURL = (import.meta.env?.VITE_API_URL as string | undefined) || '/api'

export const api = axios.create({ baseURL, withCredentials: false })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cf_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      // Only clear auth keys, not unrelated localStorage
      localStorage.removeItem('cf_token')
      localStorage.removeItem('cf_email')
      localStorage.removeItem('cf_role')
      // avoid redirect loop if already on login
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)


