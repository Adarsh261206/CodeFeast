export const themeTokens = {
  background: '#F8FAFC', // slate-50 Odoo canvas
  surface: '#FFFFFF',
  card: '#FFFFFF',
  accentPrimary: '#6D28D9', // retain brand violet, muted in light
  accentSecondary: '#0EA5E9', // sky-500
  warmAccent: '#F59E0B', // amber-500
  textPrimary: '#0F172A', // slate-900
  textSecondary: '#64748B', // slate-500
  border: '#E2E8F0', // slate-200
  cardRadius: '12px',
  cardShadow: '0 1px 3px rgba(15,23,42,0.08), 0 4px 12px rgba(15,23,42,0.06)',
  glassBlur: '0px'
} as const

export type ThemeTokens = typeof themeTokens



