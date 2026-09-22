/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#F8FAFC',
        surface: '#FFFFFF',
        card: '#FFFFFF',
        accentPrimary: '#6D28D9',
        accentSecondary: '#0EA5E9',
        warmAccent: '#F59E0B',
        textPrimary: '#0F172A',
        textSecondary: '#64748B',
        borderToken: '#E2E8F0',
        slate: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          500: '#64748B',
          900: '#0F172A'
        }
      },
      boxShadow: {
        glass: '0 1px 3px rgba(15,23,42,0.08), 0 4px 12px rgba(15,23,42,0.06)',
        card: '0 1px 3px rgba(15,23,42,0.08), 0 4px 12px rgba(15,23,42,0.06)'
      },
      borderRadius: {
        card: '12px'
      },
      backdropBlur: {
        glass: '0px'
      },
      backgroundImage: {
        gradientPrimary: 'linear-gradient(135deg, #6D28D9, #7C3AED, #0EA5E9)',
        gradientSecondary: 'linear-gradient(135deg, #0F172A, #334155, #64748B)'
      }
    }
  },
  plugins: []
}





