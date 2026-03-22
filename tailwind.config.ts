import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Hnědozlaté schéma – pekárna / bread palette
        bread: {
          50:  '#fdf8f0',
          100: '#faefd9',
          200: '#f5ddb0',
          300: '#edc47d',
          400: '#e3a84a',
          500: '#d4892a',  // hlavní barva – zlatohnědá
          600: '#b86e1e',
          700: '#965519',
          800: '#7a4419',
          900: '#643818',
          950: '#371c09',
        },
        // Doplňkové odstíny kůry chleba
        crust: {
          light: '#e8c97a',   // světlá kůra
          DEFAULT: '#c8882e', // střední kůra
          dark: '#7a4419',    // tmavá kůra
        },
        // Neutrální krémová pozadí
        dough: {
          50:  '#fefcf7',
          100: '#fdf7ed',
          200: '#f9edd6',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
