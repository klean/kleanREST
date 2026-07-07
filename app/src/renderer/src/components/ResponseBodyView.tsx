import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightSpecialChars,
  keymap,
  lineNumbers
} from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import {
  bracketMatching,
  foldAll,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
  unfoldAll
} from '@codemirror/language'
import {
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap
} from '@codemirror/search'
import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { html } from '@codemirror/lang-html'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'

export type BodyFormat = 'json' | 'xml' | 'html' | 'text'

export function detectFormat(body: string, contentType: string): BodyFormat {
  const ct = contentType.toLowerCase()
  if (ct.includes('json')) return 'json'
  if (ct.includes('html')) return 'html'
  if (ct.includes('xml')) return 'xml'

  // No usable content-type — sniff the body itself.
  const t = body.trimStart()
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      JSON.parse(body)
      return 'json'
    } catch {
      // fall through
    }
  }
  if (/^<\?xml/i.test(t)) return 'xml'
  if (/^<!doctype html/i.test(t) || /^<html[\s>]/i.test(t)) return 'html'
  if (t.startsWith('<')) return 'xml'
  return 'text'
}

function formatJson(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

// Elements whose raw content may contain `<` without it being markup.
const RAW_TEXT_TAGS = /^<(script|style)\b/i
// HTML elements that never have a closing tag, so they must not indent.
const HTML_VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
])

function tokenizeMarkup(src: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < src.length) {
    if (src[i] === '<') {
      let end: number
      if (src.startsWith('<!--', i)) {
        const close = src.indexOf('-->', i + 4)
        end = close === -1 ? src.length : close + 3
      } else if (src.startsWith('<![CDATA[', i)) {
        const close = src.indexOf(']]>', i + 9)
        end = close === -1 ? src.length : close + 3
      } else {
        const close = src.indexOf('>', i)
        end = close === -1 ? src.length : close + 1
      }
      const tag = src.slice(i, end)
      tokens.push(tag)
      i = end

      const raw = RAW_TEXT_TAGS.exec(tag)
      if (raw && !tag.endsWith('/>')) {
        const closer = new RegExp(`</${raw[1]}\\s*>`, 'i').exec(src.slice(i))
        if (closer) {
          if (closer.index > 0) tokens.push(src.slice(i, i + closer.index))
          tokens.push(closer[0])
          i += closer.index + closer[0].length
        }
      }
    } else {
      const next = src.indexOf('<', i)
      tokens.push(next === -1 ? src.slice(i) : src.slice(i, next))
      i = next === -1 ? src.length : next
    }
  }
  return tokens
}

function tagName(tag: string): string {
  return (/^<\/?([a-zA-Z][\w:.-]*)/.exec(tag)?.[1] ?? '').toLowerCase()
}

// Conservative re-indenter for XML/HTML: normalizes whitespace between tags
// and indents by nesting depth. Keeps `<tag>text</tag>` on one line. Never
// drops tokens, so malformed markup degrades to odd indentation at worst.
function formatMarkup(src: string, isHtml: boolean): string {
  const tokens = tokenizeMarkup(src)
  const lines: string[] = []
  let depth = 0
  const pad = (): string => '  '.repeat(depth)

  for (let idx = 0; idx < tokens.length; idx++) {
    const tok = tokens[idx]

    if (!tok.startsWith('<')) {
      for (const line of tok.split('\n')) {
        const text = line.trim()
        if (text) lines.push(pad() + text)
      }
      continue
    }

    const isClose = tok.startsWith('</')
    const isDecl = tok.startsWith('<!') || tok.startsWith('<?')
    const isSelfClose = tok.endsWith('/>')
    const isVoid = isHtml && HTML_VOID_TAGS.has(tagName(tok))

    if (isClose) {
      depth = Math.max(0, depth - 1)
      lines.push(pad() + tok)
    } else if (isDecl || isSelfClose || isVoid) {
      lines.push(pad() + tok)
    } else {
      const text = tokens[idx + 1]
      const close = tokens[idx + 2]
      const isTextOnlyElement =
        text !== undefined &&
        !text.startsWith('<') &&
        text.trim() !== '' &&
        close !== undefined &&
        close.startsWith('</') &&
        tagName(close) === tagName(tok)
      if (isTextOnlyElement) {
        lines.push(pad() + tok + text.trim() + close)
        idx += 2
      } else {
        lines.push(pad() + tok)
        depth++
      }
    }
  }
  return lines.join('\n')
}

export function formatBody(body: string, format: BodyFormat): string {
  try {
    if (format === 'json') return formatJson(body)
    if (format === 'xml') return formatMarkup(body, false)
    if (format === 'html') return formatMarkup(body, true)
  } catch {
    // Formatting is cosmetic — never let it take down the viewer.
  }
  return body
}

const viewerTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'transparent',
      fontSize: '12px',
      color: '#d4d4d8'
    },
    '.cm-scroller': {
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
      lineHeight: '1.5'
    },
    '.cm-content': { caretColor: '#a1a1aa', padding: '8px 0' },
    '&.cm-focused': { outline: 'none' },
    '.cm-line': { padding: '0 8px' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: '#52525b',
      border: 'none'
    },
    '.cm-activeLine': { backgroundColor: 'rgba(63, 63, 70, 0.2)' },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: '#a1a1aa'
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(59, 130, 246, 0.25)'
    },
    '.cm-selectionMatch': { backgroundColor: 'rgba(161, 161, 170, 0.15)' },
    '.cm-foldGutter .cm-gutterElement': { cursor: 'pointer', color: '#71717a' },
    '.cm-foldPlaceholder': {
      backgroundColor: '#3f3f46',
      border: 'none',
      color: '#a1a1aa',
      borderRadius: '3px',
      padding: '0 6px',
      margin: '0 2px'
    },
    '.cm-matchingBracket': { backgroundColor: 'rgba(59, 130, 246, 0.2)' },
    '.cm-panels': { backgroundColor: '#27272a', color: '#d4d4d8' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid #3f3f46' },
    '.cm-panel.cm-search': {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '4px',
      padding: '6px 28px 6px 8px',
      fontSize: '11px'
    },
    '.cm-panel.cm-search label': {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '3px',
      fontSize: '11px',
      color: '#a1a1aa'
    },
    '.cm-panel.cm-search input[type=checkbox]': { accentColor: '#3b82f6' },
    '.cm-panel.cm-search button[name=close]': {
      color: '#a1a1aa',
      cursor: 'pointer',
      right: '6px',
      top: '6px'
    },
    '.cm-textfield': {
      backgroundColor: '#18181b',
      border: '1px solid #3f3f46',
      borderRadius: '4px',
      color: '#e4e4e7',
      fontSize: '11px',
      padding: '2px 6px'
    },
    '.cm-textfield:focus': { borderColor: '#3b82f6', outline: 'none' },
    '.cm-button': {
      backgroundImage: 'none',
      backgroundColor: '#3f3f46',
      border: 'none',
      borderRadius: '4px',
      color: '#e4e4e7',
      fontSize: '11px',
      padding: '2px 8px',
      cursor: 'pointer'
    },
    '.cm-button:active': {
      backgroundImage: 'none',
      backgroundColor: '#52525b'
    },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(250, 204, 21, 0.2)',
      outline: '1px solid rgba(250, 204, 21, 0.35)'
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(250, 204, 21, 0.45)'
    }
  },
  { dark: true }
)

function buildExtensions(format: BodyFormat): Extension[] {
  const extensions: Extension[] = [
    lineNumbers(),
    highlightSpecialChars(),
    drawSelection(),
    EditorView.lineWrapping,
    EditorState.readOnly.of(true),
    syntaxHighlighting(oneDarkHighlightStyle),
    bracketMatching(),
    highlightSelectionMatches(),
    search({ top: true }),
    keymap.of([...searchKeymap, ...foldKeymap, ...defaultKeymap]),
    viewerTheme
  ]
  if (format !== 'text') extensions.push(foldGutter())
  if (format === 'json') extensions.push(json())
  else if (format === 'xml') extensions.push(xml())
  else if (format === 'html') extensions.push(html())
  return extensions
}

const FORMAT_LABELS: Record<BodyFormat, string> = {
  json: 'JSON',
  xml: 'XML',
  html: 'HTML',
  text: 'Text'
}

const toolbarButtonClass =
  'rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200'

export default function ResponseBodyView({
  body,
  contentType
}: {
  body: string
  contentType: string
}): JSX.Element {
  const [mode, setMode] = useState<'pretty' | 'raw'>('pretty')
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  const format = useMemo(() => detectFormat(body, contentType), [body, contentType])
  const displayText = useMemo(
    () => (mode === 'pretty' ? formatBody(body, format) : body),
    [body, format, mode]
  )

  useEffect(() => {
    if (!containerRef.current) return
    const view = new EditorView({
      state: EditorState.create({
        doc: displayText,
        extensions: buildExtensions(format)
      }),
      parent: containerRef.current
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [displayText, format])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  if (!body) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-zinc-600">No content</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Body toolbar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-zinc-800 px-2 py-1">
        <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-zinc-400">
          {FORMAT_LABELS[format]}
        </span>

        <div className="flex-1" />

        {format !== 'text' && (
          <>
            <div className="flex overflow-hidden rounded border border-zinc-700 text-[10px]">
              <button
                onClick={() => setMode('pretty')}
                className={
                  mode === 'pretty'
                    ? 'bg-zinc-700 px-2 py-0.5 text-zinc-200'
                    : 'px-2 py-0.5 text-zinc-500 hover:text-zinc-300'
                }
              >
                Pretty
              </button>
              <button
                onClick={() => setMode('raw')}
                className={
                  mode === 'raw'
                    ? 'bg-zinc-700 px-2 py-0.5 text-zinc-200'
                    : 'px-2 py-0.5 text-zinc-500 hover:text-zinc-300'
                }
              >
                Raw
              </button>
            </div>

            <button
              onClick={() => viewRef.current && unfoldAll(viewRef.current)}
              className={toolbarButtonClass}
              title="Expand all"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
              </svg>
            </button>
            <button
              onClick={() => viewRef.current && foldAll(viewRef.current)}
              className={toolbarButtonClass}
              title="Collapse all"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 11l7-7 7 7M5 19l7-7 7 7" />
              </svg>
            </button>
          </>
        )}

        <button
          onClick={() => {
            if (!viewRef.current) return
            viewRef.current.focus()
            openSearchPanel(viewRef.current)
          }}
          className={toolbarButtonClass}
          title="Search (Ctrl+F)"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        <button
          onClick={async () => {
            await navigator.clipboard.writeText(displayText)
            setCopied(true)
          }}
          className={toolbarButtonClass}
          title="Copy body"
        >
          {copied ? (
            <svg className="h-3.5 w-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>

      {/* CodeMirror mounts here */}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden" />
    </div>
  )
}
