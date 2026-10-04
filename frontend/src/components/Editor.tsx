import { useEffect, useRef } from 'react'
import monaco from '@/lib/monacoSetup'

type Props = {
  value: string
  onChange: (value: string) => void
  language: string
  height?: string
  suggestionsEnabled?: boolean
  onStats?: (stats: { keystrokes: number; pasteEvents: number; activeTypingMs: number }) => void
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

export default function Editor({ value, onChange, language, height = '400px', suggestionsEnabled = true, onStats }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const editorInstanceRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(()=>{ onChangeRef.current = onChange }, [onChange])
  const onStatsRef = useRef(onStats)
  useEffect(()=>{ onStatsRef.current = onStats }, [onStats])
  const suggestionsRef = useRef(suggestionsEnabled)
  useEffect(()=>{ suggestionsRef.current = suggestionsEnabled }, [suggestionsEnabled])

  // keystroke / typing metrics refs
  const keystrokesRef = useRef(0)
  const pasteEventsRef = useRef(0)
  const lastKeystrokeAtRef = useRef<number>(0)
  const activeTypingMsRef = useRef(0)
  const emitStats = () => {
    onStatsRef.current?.({
      keystrokes: keystrokesRef.current,
      pasteEvents: pasteEventsRef.current,
      activeTypingMs: activeTypingMsRef.current
    })
  }
  const statsTimerRef = useRef<number | null>(null)

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
      folding: true,
      showFoldingControls: 'always',
      foldingStrategy: 'indentation',
      // Intellisense — controlled by suggestionsEnabled (default ON)
      quickSuggestions: { other: suggestionsRef.current, comments: false, strings: false },
      suggestOnTriggerCharacters: suggestionsRef.current,
      acceptSuggestionOnEnter: suggestionsRef.current ? 'smart' : 'off',
      tabCompletion: suggestionsRef.current ? 'on' : 'off',
      parameterHints: { enabled: suggestionsRef.current },
      hover: { enabled: suggestionsRef.current },
      links: false,
      colorDecorators: false,
      formatOnPaste: false,
      formatOnType: false,
      wordBasedSuggestions: suggestionsRef.current,
      lightbulb: { enabled: suggestionsRef.current as any }
    })

    editor.onDidChangeModelContent(() => {
      const newValue = editor.getValue()
      onChangeRef.current(newValue)
    })

    // Track keystrokes via onKeyDown (printable + backspace/delete/enter/tab)
    editor.onKeyDown((e: monaco.IKeyboardEvent) => {
      const now = Date.now()
      keystrokesRef.current++
      // active typing time: accumulate ms since last keystroke if gap < 5s (idle cutoff)
      if (lastKeystrokeAtRef.current > 0) {
        const gap = now - lastKeystrokeAtRef.current
        if (gap < 5000) activeTypingMsRef.current += gap
      }
      lastKeystrokeAtRef.current = now
    })

    // Track paste events (Ctrl/Cmd+V or context-menu paste)
    editor.onDidPaste(() => {
      pasteEventsRef.current++
      // a paste is not "typing" — reset idle anchor so large paste doesn't inflate active time
      lastKeystrokeAtRef.current = 0
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

    // periodic stats emit (2s) so parent always has fresh keystroke data
    statsTimerRef.current = window.setInterval(() => emitStats(), 2000)

    return () => {
      if (statsTimerRef.current) window.clearInterval(statsTimerRef.current)
      editorInstanceRef.current?.dispose()
      editorInstanceRef.current = null
    }
  }, [])

  // Apply suggestion toggle changes without recreating editor
  useEffect(() => {
    const e = editorInstanceRef.current
    if (e) {
      e.updateOptions({
        quickSuggestions: { other: suggestionsEnabled, comments: false, strings: false },
        suggestOnTriggerCharacters: suggestionsEnabled,
        acceptSuggestionOnEnter: suggestionsEnabled ? 'smart' : 'off',
        tabCompletion: suggestionsEnabled ? 'on' : 'off',
        parameterHints: { enabled: suggestionsEnabled },
        hover: { enabled: suggestionsEnabled },
        wordBasedSuggestions: suggestionsEnabled,
        lightbulb: { enabled: suggestionsEnabled as any }
      })
    }
  }, [suggestionsEnabled])

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