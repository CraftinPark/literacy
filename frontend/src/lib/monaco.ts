// Monaco (VS Code's editor) set up for ReadCode: workers, theme, and TypeScript so that
// go-to-definition and hover work across an exercise's files. Imported only by the exercise page.
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import type { Theme } from './theme'

self.MonacoEnvironment = {
  getWorker: (_id: string, label: string) => (label === 'typescript' || label === 'javascript' ? new TsWorker() : new EditorWorker()),
}

// Editor themes; colours follow src/theme.css (the code-* variables) for each app theme.
monaco.editor.defineTheme('readcode-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '7DB7FF' },
    { token: 'string', foreground: 'A9D9A1' },
    { token: 'number', foreground: 'F4B97A' },
    { token: 'comment', foreground: '6E6E6E' },
    { token: 'type', foreground: 'C9A9FF' },
    { token: 'type.identifier', foreground: 'DCDCDC' },
    { token: 'identifier', foreground: 'DCDCDC' },
    { token: 'delimiter', foreground: 'A8A8A8' },
  ],
  colors: {
    'editor.background': '#181818',
    'editor.foreground': '#DCDCDC',
    'editorLineNumber.foreground': '#5E5E5E',
    'editorLineNumber.activeForeground': '#BDBDBD',
    'editor.lineHighlightBackground': '#1F1F1F',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#2B3E5C',
    'editor.inactiveSelectionBackground': '#22314A',
    'editorCursor.foreground': '#9DB6D9',
    'editorWidget.background': '#1C1C1C',
    'editorWidget.border': '#2C2C2C',
    'editorHoverWidget.background': '#1C1C1C',
    'editorHoverWidget.border': '#2C2C2C',
    'editorIndentGuide.background1': '#242424',
    'editorIndentGuide.activeBackground1': '#383838',
    'editorGutter.background': '#181818',
    'scrollbarSlider.background': '#FFFFFF14',
    'scrollbarSlider.hoverBackground': '#FFFFFF24',
    'minimap.background': '#181818',
    'diffEditor.insertedLineBackground': '#4CC38A14',
    'diffEditor.insertedTextBackground': '#4CC38A2E',
    'diffEditor.removedLineBackground': '#E5534B14',
    'diffEditor.removedTextBackground': '#E5534B2E',
  },
})

monaco.editor.defineTheme('readcode-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '1F5FBF' },
    { token: 'string', foreground: '2E7D32' },
    { token: 'number', foreground: 'B5530A' },
    { token: 'comment', foreground: '8A8F98' },
    { token: 'type', foreground: '7B3FBF' },
    { token: 'type.identifier', foreground: '1F2328' },
    { token: 'identifier', foreground: '1F2328' },
    { token: 'delimiter', foreground: '5F6B78' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#1F2328',
    'editorLineNumber.foreground': '#A3AAB3',
    'editorLineNumber.activeForeground': '#3B4450',
    'editor.lineHighlightBackground': '#F5F6F8',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#C9DAF1',
    'editor.inactiveSelectionBackground': '#DCE6F3',
    'editorCursor.foreground': '#3E6399',
    'editorWidget.background': '#FFFFFF',
    'editorWidget.border': '#E2E5E9',
    'editorHoverWidget.background': '#FFFFFF',
    'editorHoverWidget.border': '#E2E5E9',
    'editorIndentGuide.background1': '#EEF0F3',
    'editorIndentGuide.activeBackground1': '#D5DAE0',
    'editorGutter.background': '#FFFFFF',
    'scrollbarSlider.background': '#0000001A',
    'scrollbarSlider.hoverBackground': '#0000002A',
    'minimap.background': '#FFFFFF',
    'diffEditor.insertedLineBackground': '#1E8A5512',
    'diffEditor.insertedTextBackground': '#1E8A5530',
    'diffEditor.removedLineBackground': '#C4362D12',
    'diffEditor.removedTextBackground': '#C4362D30',
  },
})

/** The Monaco theme name for an app theme. */
export const editorTheme = (t: Theme) => (t === 'light' ? 'readcode-light' : 'readcode-dark')

const ts = monaco.languages.typescript
ts.typescriptDefaults.setCompilerOptions({
  target: ts.ScriptTarget.ES2017,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  strict: true,
  strictNullChecks: false,
  lib: ['esnext', 'dom'],
  allowNonTsExtensions: true,
  noEmit: true,
})
// Exercises are trimmed excerpts, so the type checker's red squiggles would be noise (and could hint);
// syntax errors from the candidate's own edits still show.
ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })
// Just enough of Node's types for hover and go-to-definition on the imports the exercises use.
ts.typescriptDefaults.addExtraLib(`
declare module 'node:events' {
  export class EventEmitter {
    emit(event: string | symbol, ...args: any[]): boolean;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
  }
}
declare module 'node:crypto' { export function randomUUID(): string; }
declare namespace NodeJS { type Timeout = ReturnType<typeof setTimeout>; }
`, 'file:///__node_stubs.d.ts')

export function languageOf(path: string): string {
  const ext = path.split('.').pop() ?? ''
  return ({ ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', c: 'c', h: 'c', py: 'python', go: 'go' } as Record<string, string>)[ext] ?? 'plaintext'
}

export const uriOf = (path: string) => monaco.Uri.parse(`file:///${path}`)
export const pathOf = (uri: monaco.Uri) => uri.path.replace(/^\//, '')

export { monaco }
