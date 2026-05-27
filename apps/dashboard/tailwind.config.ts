import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Onyx canvas — Prestige-Tech dark surface
        navy: {
          DEFAULT: '#0F0F0F',
          50:  '#16161A',
          100: '#1C1C20',
          200: '#242428',
          300: '#2A2A2E',
          400: '#323236',
          900: '#0B0B0D',
        },
        // Gold accent — primary actions, active states
        gold: {
          DEFAULT: '#C5A059',
          50:  'rgba(197,160,89,0.10)',
          100: '#D8B570',
          500: '#C5A059',
          600: '#8C6F36',
          700: '#5C4520',
        },
        // Silver — structural text
        silver: {
          DEFAULT: '#E0E0E0',
          50:  'rgba(224,224,224,0.08)',
          100: '#F5F5F5',
          600: 'rgba(224,224,224,0.35)',
        },
        // Parchment — primary foreground text
        parchment: {
          DEFAULT: '#F5F5F5',
          50:  '#FAFAFA',
          100: '#F0F0F0',
          200: '#E0E0E0',
        },
        // Semantic
        cyan: {
          DEFAULT: '#C5A059',
          soft:    '#D8B570',
          warm:    '#8C6F36',
          deep:    '#5C4520',
        },
      },
      fontFamily: {
        sans:  ['Heebo', 'system-ui', 'sans-serif'],
        serif: ['"Frank Ruhl Libre"', '"Playfair Display"', 'Georgia', 'serif'],
        mono:  ['"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'gold-sm':   '0 0 0 1px rgba(197,160,89,0.28), 0 0 12px rgba(197,160,89,0.22)',
        'gold-md':   '0 0 0 1px rgba(197,160,89,0.38), 0 8px 24px rgba(197,160,89,0.22)',
        'gold-glow': '0 0 14px rgba(197,160,89,0.35)',
        'glass':     '0 40px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(224,224,224,0.14)',
        'cyan-sm':   '0 0 0 1px rgba(197,160,89,0.28), 0 0 12px rgba(197,160,89,0.22)',
        'cyan-md':   '0 0 0 1px rgba(197,160,89,0.38), 0 0 24px rgba(197,160,89,0.30)',
        'cyan-glow': '0 0 14px rgba(197,160,89,0.35)',
        'metal':     'inset 0 1px 0 rgba(224,224,224,0.08), inset 0 -1px 0 rgba(0,0,0,0.25), 0 1px 0 rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [typography],
} satisfies Config;
