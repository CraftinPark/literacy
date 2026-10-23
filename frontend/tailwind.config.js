/** @type {import('tailwindcss').Config} */
// Values come from the exercise-screen mockup (docs/ui-mockup/Main.dc.html).
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1B2430',
        muted: '#556274',
        line: '#D5DCE5',
        'line-strong': '#B8C2D0',
        canvas: '#E9EDF2',
        panel: '#F7F9FB',
        chip: '#EEF1F5',
        track: '#DCE3EC',
        accent: { DEFAULT: '#1F4FD8', soft: '#E3EBFB' },
        ok: '#1B7F4B',
        danger: '#B42318',
        bug: { DEFAULT: '#F5C518', soft: '#FFF3C4' },
        code: {
          bg: '#0E1621',
          bar: '#16212E',
          border: '#26354A',
          text: '#D7E0EA',
          dim: '#8497AD',
          fold: '#131E2B',
          kw: '#7DB7FF',
          const: '#F4B97A',
          str: '#A9D9A1',
          com: '#6F8399',
          pre: '#C9A9FF',
          note: '#508CFF',
          'note-text': '#9CC0FF',
          'note-bg': '#17212C',
          'note-border': '#2B3A4B',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: { code: ['13px', '20px'] },
    },
  },
  plugins: [],
}
