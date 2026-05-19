import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Deep cool navy canvas — lifted ramp (Cyber-Knight)
        navy: {
          DEFAULT: '#0A1226',
          50:  '#19294A',
          100: '#101C36',
          200: '#19294A',
          300: '#243759',
          400: '#2E456D',
          900: '#060C1B',
        },
        // Electric cyan — replaces gold as primary accent
        gold: {
          DEFAULT: '#5BE0D4',
          50:  'rgba(91,224,212,0.10)',
          100: '#7DE9DF',
          500: '#5BE0D4',
          600: '#4BC9BE',
          700: '#2A8F89',
        },
        // Metallic silver — secondary brand / structural
        silver: {
          DEFAULT: '#C8D2DE',
          50:  'rgba(200,210,222,0.10)',
          100: '#DCE3EC',
          600: '#7E8DA0',
        },
        // Parchment — document preview / print contexts
        parchment: {
          DEFAULT: '#E8EEF3',
          50:  '#F2F5F8',
          100: '#E8EEF3',
          200: '#C8D2DE',
        },
        // Semantic
        cyan: {
          DEFAULT: '#5BE0D4',
          soft:    '#7DE9DF',
          warm:    '#4BC9BE',
          deep:    '#2A8F89',
        },
      },
      fontFamily: {
        sans:  ['Heebo', 'system-ui', 'sans-serif'],
        serif: ['"Frank Ruhl Libre"', 'Georgia', 'serif'],
        mono:  ['"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'cyan-sm': '0 0 0 1px rgba(91,224,212,0.28), 0 0 12px rgba(91,224,212,0.22)',
        'cyan-md': '0 0 0 1px rgba(91,224,212,0.38), 0 0 24px rgba(91,224,212,0.30)',
        'cyan-glow': '0 0 14px rgba(91,224,212,0.35)',
        'metal':    'inset 0 1px 0 rgba(220,227,236,0.08), inset 0 -1px 0 rgba(0,0,0,0.25), 0 1px 0 rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [typography],
} satisfies Config;
