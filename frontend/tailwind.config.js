/** @type {import('tailwindcss').Config} */
// Values come from the exercise-screen mockup (docs/ui-mockup/Main.dc.html).
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // App-wide dark theme: near-black neutrals (no blue tint), slate-blue accent.
        ink: '#EDEDED',
        muted: '#8F8F8F',
        line: '#222222',
        'line-strong': '#363636',
        canvas: '#0A0A0A',
        surface: '#151515',
        panel: '#0F0F0F',
        chip: '#1C1C1C',
        track: '#262626',
        accent: { DEFAULT: '#4A6FA5', hover: '#5780B8', on: '#FFFFFF', soft: '#1E2128', text: '#9DB6D9' }, // slate blue
        ok: '#4CC38A',
        danger: '#E5534B',
        bug: { DEFAULT: '#F5C518', soft: '#3A3114', ink: '#111111' },
        field: '#141414', // text inputs: a fill instead of an outline
        // One quiet hue per part of the exercise (tab, numbers, labels, comment stripes).
        sec: { understand: '#8FB3E0', bugs: '#E3B341', design: '#B39DDB', improve: '#6CC59A' },
        code: {
          bg: '#111111',
          bar: '#111111',
          border: '#222222',
          text: '#DCDCDC',
          dim: '#7A7A7A',
          fold: '#161616',
          side: '#0A0A0A',
          hover: '#1A1A1A',
          select: '#262626',
          kw: '#7DB7FF',
          const: '#F4B97A',
          str: '#A9D9A1',
          com: '#6B6B6B',
          pre: '#C9A9FF',
          note: '#6F92C2',
          'note-text': '#AFC4E2',
          'note-bg': '#171717',
          'note-border': '#262626',
        },
      },
      fontFamily: {
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
        mono: ['"Source Code Pro"', 'ui-monospace', 'monospace'],
      },
      fontSize: { code: ['13px', '20px'] },
    },
  },
  plugins: [],
}
