import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'

type Props = {
  value: string
  onChange: (value: string) => void
  language: string
  height?: string
}

const monacoLangMap: Record<string,string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  java: 'java',
  cpp: 'cpp',
  csharp: 'csharp',
  php: 'php',
  ruby: 'ruby',
  go: 'go',
  rust: 'rust',
  swift: 'swift',
  kotlin: 'kotlin',
  html: 'html'
}
function toMonacoLang(lang: string): string {
  return monacoLangMap[lang.toLowerCase()] || 'javascript'
}

export default function Editor({ value, onChange, language, height = '400px' }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const editorInstanceRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(()=>{ onChangeRef.current = onChange }, [onChange])

  // create once
  useEffect(() => {
    if (!editorRef.current) return

    const editor = monaco.editor.create(editorRef.current, {
      value,
      language: toMonacoLang(language),
      theme: 'vs',
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 14,
      lineNumbers: 'on',
      roundedSelection: false,
      scrollbar: { vertical: 'visible', horizontal: 'visible' },
      wordWrap: 'on',
      renderWhitespace: 'selection',
      copyWithSyntaxHighlighting: false,
      contextmenu: true,
      quickSuggestions: { other: false, comments: false, strings: false },
      suggestOnTriggerCharacters: false,
      acceptSuggestionOnEnter: 'off',
      tabCompletion: 'off',
      parameterHints: { enabled: false },
      hover: { enabled: false },
      links: false,
      colorDecorators: false,
      formatOnPaste: false,
      formatOnType: false,
      folding: true,
      showFoldingControls: 'always',
      foldingStrategy: 'indentation',
      lightbulb: { enabled: false as any }
    })

    editor.onDidChangeModelContent(() => {
      const newValue = editor.getValue()
      onChangeRef.current(newValue)
    })

    // Block only devtools / save shortcuts, allow clipboard
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {} )
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO, () => {} )
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, () => {} )
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => {} )
    editor.addCommand(monaco.KeyCode.F12, () => {} )
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyI, () => {} )
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyJ, () => {} )
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU, () => {} )

    editorInstanceRef.current = editor

    return () => {
      editorInstanceRef.current?.dispose()
      editorInstanceRef.current = null
    }
  }, [])

  // sync value without recreating editor and without cursor jump
  useEffect(() => {
    const e = editorInstanceRef.current
    if (e && e.getValue() !== value) {
      const model = e.getModel()
      const pos = e.getPosition()
      e.setValue(value)
      if (pos && model) {
        try { e.setPosition(pos) } catch {}
      }
    }
  }, [value])

  useEffect(() => {
    const e = editorInstanceRef.current
    if (e) {
      const model = e.getModel()
      if (model) monaco.editor.setModelLanguage(model, toMonacoLang(language))
    }
  }, [language])

  return (
    <div
      ref={editorRef}
      role="region"
      aria-label={`Code editor - ${language}`}
      style={{ height, minHeight: '400px' }}
      className="border border-borderToken rounded-md overflow-hidden"
    />
  )
}
