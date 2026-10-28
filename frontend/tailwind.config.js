/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

// Values come from the exercise-screen mockup (docs/ui-mockup/Main.dc.html).
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every colour is a CSS variable defined per theme in src/theme.css (dark default, light).
        ink: v('ink'),
        muted: v('muted'),
        line: v('line'),
        'line-strong': v('line-strong'),
        canvas: v('canvas'),
        surface: v('surface'),
        panel: v('panel'),
        chip: v('chip'),
        track: v('track'),
        accent: { DEFAULT: v('accent'), hover: v('accent-hover'), on: v('accent-on'), soft: v('accent-soft'), text: v('accent-text') }, // slate blue
        ok: v('ok'),
        danger: v('danger'),
        bug: { DEFAULT: v('bug'), soft: v('bug-soft'), ink: v('bug-ink') },
        field: v('field'), // text inputs: a fill instead of an outline
        // One quiet hue per part of the exercise (tab, numbers, labels, comment stripes).
        sec: { understand: v('sec-understand'), bugs: v('sec-bugs'), design: v('sec-design'), improve: v('sec-improve') },
        code: {
          bg: v('code-bg'),
          bar: v('code-bar'),
          border: v('code-border'),
          text: v('code-text'),
          dim: v('code-dim'),
          fold: v('code-fold'),
          side: v('code-side'),
          hover: v('code-hover'),
          select: v('code-select'),
          kw: v('code-kw'),
          const: v('code-const'),
          str: v('code-str'),
          com: v('code-com'),
          pre: v('code-pre'),
          note: v('code-note'),
          'note-text': v('code-note-text'),
          'note-bg': v('code-note-bg'),
          'note-border': v('code-note-border'),
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
