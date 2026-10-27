// Monaco (VS Code's editor) set up for ReadCode: workers, theme, and TypeScript so that
// go-to-definition and hover work across an exercise's files. Imported only by the exercise page.
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker: (_id: string, label: string) => (label === 'typescript' || label === 'javascript' ? new TsWorker() : new EditorWorker()),
}

// Colours follow tailwind.config.js (near-black neutrals, the code.* syntax colours).
monaco.editor.defineTheme('readcode', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '7DB7FF' },
    { token: 'string', foreground: 'A9D9A1' },
    { token: 'number', foreground: 'F4B97A' },
    { token: 'comment', foreground: '6B6B6B' },
    { token: 'type', foreground: 'C9A9FF' },
    { token: 'type.identifier', foreground: 'DCDCDC' },
    { token: 'identifier', foreground: 'DCDCDC' },
    { token: 'delimiter', foreground: 'A8A8A8' },
  ],
  colors: {
    'editor.background': '#111111',
    'editor.foreground': '#DCDCDC',
    'editorLineNumber.foreground': '#5C5C5C',
    'editorLineNumber.activeForeground': '#BDBDBD',
    'editor.lineHighlightBackground': '#181818',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#2B3E5C',
    'editor.inactiveSelectionBackground': '#22314A',
    'editorCursor.foreground': '#9DB6D9',
    'editorWidget.background': '#151515',
    'editorWidget.border': '#262626',
    'editorHoverWidget.background': '#151515',
    'editorHoverWidget.border': '#262626',
    'editorIndentGuide.background1': '#1E1E1E',
    'editorIndentGuide.activeBackground1': '#333333',
    'editorGutter.background': '#111111',
    'scrollbarSlider.background': '#FFFFFF14',
    'scrollbarSlider.hoverBackground': '#FFFFFF24',
    'minimap.background': '#111111',
    'diffEditor.insertedLineBackground': '#4CC38A14',
    'diffEditor.insertedTextBackground': '#4CC38A2E',
    'diffEditor.removedLineBackground': '#E5534B14',
    'diffEditor.removedTextBackground': '#E5534B2E',
  },
})

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
