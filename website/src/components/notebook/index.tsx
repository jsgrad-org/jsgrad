import { Fragment, type ReactNode, useRef, useState } from 'react'
import { Editor, useMonaco } from '@monaco-editor/react'
import { Uri, Range, KeyMod, KeyCode } from 'monaco-editor'
import { useEffect } from 'react'
import { ArrowDownIcon, ArrowUpIcon, CirclePlayIcon, CodeIcon, CopyIcon, CopyPlusIcon, Loader2Icon, PlayIcon, PlusIcon, RefreshCwIcon, RefreshCwOffIcon, ShareIcon, TextIcon, XIcon } from 'lucide-react'
import { Console } from 'console-feed'
import { marked } from 'marked'
import { toast } from 'sonner'
import { cellsToCode, getStartEnd, type CellType, type CodeType, type Cell, fetchTypes, type Notebook as NotebookType, codeToNotebook } from './helpers'
import { NotebookProvider, useNotebook } from './context'

const NOTEBOOK = Uri.file('notebook.ts')

export const Notebook = (args: { kvBaseUrl: string; notebookBaseUrl: string }) => {
  const [notebook, setNotebook] = useState<NotebookType>()
  useEffect(() => {
    const effect = async () => {
      const params = new URLSearchParams(window.location.search)

      const hash = params.get('hash')
      const data = params.get('data')
      if (hash) {
        const res = await fetch(`${args.kvBaseUrl}?hash=${encodeURIComponent(hash)}`)
        if (!res.ok) throw new Error(`Invalid hash`)
        setNotebook(codeToNotebook((await res.text()).split('\n')))
        return
      }

      else if (data) {
        return setNotebook(codeToNotebook(atob(decodeURIComponent(data)).split('\n')))
      }

      setNotebook({ cells: [{ type: 'code', content: '// Write code here \n' }] })
    }
    effect()
  }, [])
  if (!notebook) return <p>Loading...</p>
  return <NotebookWrapper {...args} notebook={notebook} />
}

export const NotebookWrapper = (args: { kvBaseUrl: string; notebookBaseUrl: string; notebook: NotebookType }) => {
  return (
    <NotebookProvider {...args}>
      <Cells />
    </NotebookProvider>
  )
}

const MenuButton = ({ Icon, text, onClick }: { Icon: Icon; text: string; onClick: () => void }) => {
  return (
    <button className="cursor-pointer shrink-0 flex gap-1 items-center text-sm hover:bg-white/10 py-1 pl-1 pr-2 rounded-md" onClick={onClick}>
      <Icon className="h-4" />
      {text}
    </button>
  )
}

const Cells = () => {
  const { cells, setQueue, notebookBaseUrl, kvBaseUrl } = useNotebook()
  const [raw, setRaw] = useState(false)
  const startEnd = getStartEnd(cells)
  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast('Copied to clipboard!')
  }
  return (
    <div className="flex flex-col h-full min-h-screen pt-16">
      <div className="flex fixed top-0 backdrop-blur-lg bg-[#1e1e1e]/50 w-full border-b border-white/10 z-50 p-1 overflow-auto">
        <MenuButton Icon={PlusIcon} text="New" onClick={() => (window.location.href = `${notebookBaseUrl}/nb`)} />
        <MenuButton Icon={CopyIcon} text="Copy content" onClick={() => copy(cellsToCode(cells))} />
        <MenuButton
          Icon={ShareIcon}
          text="Save with base64"
          onClick={() => {
            const url = `${notebookBaseUrl}?data=${encodeURIComponent(btoa(cellsToCode(cells)))}`
            window.history.pushState({}, '', url)
            copy(url)
          }}
        />
        <MenuButton
          Icon={ShareIcon}
          text="Save with hash"
          onClick={async () => {
            const body = cellsToCode(cells)
            const res = await fetch(kvBaseUrl, { body, method: 'POST' })
            if (!res.ok) throw new Error(`Failed to save the hash!`)

            const hash = await res.json().then((x) => x.hash)
            const url = `${notebookBaseUrl}?hash=${encodeURIComponent(hash)}`
            window.history.pushState({}, '', url)
            copy(url)
          }}
        />
        <MenuButton Icon={CodeIcon} text={raw ? 'Edit blocks' : 'Edit raw'} onClick={() => setRaw((r) => !r)} />
        <MenuButton Icon={CirclePlayIcon} text="Run all" onClick={() => setQueue(() => [...cells.entries()].filter(([i, x]) => x.type === 'code').map(([i]) => i))} />
      </div>

      <CodeInit type="typescript" />
      {raw && (
        <div className="section">
          <Code start={1} end={cellsToCode(cells).split('\n').length + 1} />
        </div>
      )}
      {!raw &&
        cells.map((cell, i) => {
          return (
            <Fragment key={i}>
              {cell.type === 'markdown' && <MarkdownBlock index={i} content={cell.content} start={startEnd[i].start} end={startEnd[i].end} />}
              {cell.type === 'code' && <CodeBlock index={i} content={cell.content} start={startEnd[i].start} end={startEnd[i].end} />}
            </Fragment>
          )
        })}
    </div>
  )
}

export const CodeInit = ({ type }: { type: CodeType }) => {
  const monaco = useMonaco()
  const { cells, setCells } = useNotebook()
  const code = cellsToCode(cells)

  useEffect(() => {
    if (!monaco) return

    let model = monaco.editor.getModel(NOTEBOOK)
    if (model) return

    model = monaco.editor.createModel(code, type, NOTEBOOK)
    model.onDidChangeContent((e) => {
      const { cells } = codeToNotebook(model.getLinesContent())
      setCells(cells)
    })
  }, [monaco])

  useEffect(() => {
    if (!monaco) return

    monaco.languages.typescript[`${type}Defaults`].setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.Latest,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      noEmit: true,
    })
  }, [monaco])
  const [imported, setImported] = useState<string[]>([])
  useEffect(() => {
    if (!monaco) return

    const packages = [...code.matchAll(/import\s*{[^}]+}\s*from\s*['"]([^'"]+)['"]/g)].map((match) => match[1])
    Promise.all(
      packages
        .filter((x) => !imported.includes(x))
        .map(async (x) => {
          const res = await fetchTypes(x)
          for (const { name, content } of res) {
            monaco.languages.typescript[`${type}Defaults`].addExtraLib(content, `file:///node_modules/${name}`)
          }
          setImported((i) => [...i, x])
        }),
    )
  }, [code, monaco])

  return null
}

type Icon = (x: { className?: string; onClick?: () => void }) => ReactNode

const SmallIcon = ({ onClick, Icon, description }: { description: string; Icon: Icon; onClick: () => void }) => {
  return (
    <button className="relative cursor-pointer p-1.5 bg-[#1e1e1e] hover:bg-[#2d2d2d] group/icon rounded-sm">
      <Icon className="h-4 w-4" onClick={onClick} />
      <span className="absolute hidden whitespace-nowrap bottom-[105%] left-[50%] text-sm -translate-x-1/2 group-hover/icon:block">{description}</span>
    </button>
  )
}

const AddCell = ({ bottom, add }: { bottom?: boolean; add: (c: CellType) => void }) => {
  return (
    <div className={`absolute w-full h-[1px]  ${bottom ? 'bottom-0 -translate-y-1/2' : 'top-0 translate-y-1/2'}  rounded-full opacity-0 group-hover:opacity-100 duration-200 z-20`}>
      <div className="absolute text-xs bg-[#1e1e1e] rounded-full border border-white/20 left-1/2 -translate-x-1/2 -translate-y-1/2 flex overflow-hidden">
        <button className="cursor-pointer w-20 hover:bg-white/5 p-0.5" onClick={() => add('code')}>
          Code
        </button>
        <div className="h-5 w-[1px] shrink-0 bg-white/20"></div>
        <button className="cursor-pointer w-20 hover:bg-white/5 p-0.5" onClick={() => add('markdown')}>
          Markdown
        </button>
      </div>
    </div>
  )
}

const Cell = ({ index, children, onClick, Icon }: { index: number; Icon: Icon; onClick: () => void; children: ReactNode }) => {
  const { cells, setCells } = useNotebook()
  const cell = cells[index]
  const monaco = useMonaco()
  const set = (cells: Cell[]) => {
    setCells(cells)
    monaco!.editor.getModel(NOTEBOOK)!.setValue(cellsToCode(cells))
  }
  return (
    <div className="group hover:bg-white/2 duration-200 relative p-3">
      <div className="section">
        <div className="relative w-full">
          <div className="hidden group-hover:flex absolute top-1.5 right-1.5 z-20 shadow-sm shadow-white/10 border border-white/10 rounded-md">
            <SmallIcon Icon={Icon} description={cell.type === 'code' ? 'Run cell' : 'Edit markdown'} onClick={onClick} />
            <SmallIcon
              Icon={ArrowUpIcon}
              description="Move up"
              onClick={() => {
                if (index === 0) return
                ;[cells[index - 1], cells[index]] = [cells[index], cells[index - 1]]

                set(cells)
              }}
            />
            <SmallIcon
              Icon={ArrowDownIcon}
              description="Move down"
              onClick={() => {
                if (index === cells.length - 1) return
                ;[cells[index + 1], cells[index]] = [cells[index], cells[index + 1]]

                set(cells)
              }}
            />
            <SmallIcon
              Icon={cell.runOnLoad ? RefreshCwOffIcon : RefreshCwIcon}
              description={cell.runOnLoad ? 'Disable running on start' : 'Enable running on start'}
              onClick={() => {
                set(cells.map((x, i) => (i !== index ? x : { ...x, runOnLoad: x.runOnLoad ? undefined : 'true' })))
              }}
            />
            <SmallIcon
              Icon={cell.type === 'code' ? TextIcon : CodeIcon}
              description={cell.type === 'code' ? 'Change to markdown cell' : 'Change to code cell'}
              onClick={() => {
                set(cells.map((x, i) => (i !== index ? x : { ...x, type: x.type === 'code' ? 'markdown' : 'code' })))
              }}
            />
            <SmallIcon Icon={CopyPlusIcon} description="Clone cell" onClick={() => set([...cells.slice(0, index + 1), ...cells.slice(index)])} />
            <SmallIcon Icon={XIcon} description="Delete cell" onClick={() => set([...cells.slice(0, index), ...cells.slice(index + 1)])} />
          </div>
          {children}
        </div>
      </div>
      <AddCell bottom add={(type) => set([...cells.slice(0, index + 1), { type, content: '' }, ...cells.slice(index + 1)])} />
    </div>
  )
}

export const CodeBlock = ({ start, end, content, index }: { index: number; content: string; start: number; end: number }) => {
  const { setQueue, cellLogs, cellIsRunning } = useNotebook()
  const run = () => setQueue((x) => [...x, index])
  const logs = cellLogs[index]
  const isRunning = cellIsRunning[index]
  return (
    <Cell index={index} onClick={run} Icon={!isRunning ? PlayIcon : ({ className }) => <Loader2Icon className={className + ' animate-spin'} />}>
      <Code start={start} end={end} run={run} />
      <div>
        <Console
          logs={logs}
          variant="dark"
          styles={{
            LOG_BACKGROUND: 'transparent',
            BASE_BACKGROUND_COLOR: 'transparent',
          }}
        />
      </div>
    </Cell>
  )
}
export const Code = ({ start, end, run }: { run?: () => void; start: number; end: number }) => {
  const lineHeight = 18
  const ref = useRef<any>(null)
  const range = useRef<Range>(null)

  useEffect(() => {
    range.current = new Range(start, 1, end - 1, Number.MAX_SAFE_INTEGER)
    ref.current?.revealRange(range.current, 1)
  }, [start, end])

  return (
    <div className="border border-white/10 rounded-md p-1">
      <Editor
        keepCurrentModel
        defaultPath={Uri.file('notebook.ts').toString()}
        height={(end - start) * lineHeight}
        onMount={(editor) => {
          ref.current = editor
          range.current = new Range(start, 1, end - 1, Number.MAX_SAFE_INTEGER)

          editor.revealRange(range.current, 1)
          editor.onDidScrollChange((e) => {
            editor.revealRange(range.current!, 1)
          })
          editor.addAction({
            id: 'custom-select-all',
            label: 'Select Cell Content',
            keybindings: [KeyMod.CtrlCmd | KeyCode.KeyA],
            run: () => {
              editor.setSelection(range.current!)
            },
          })
          if (run) {
            editor.addAction({
              id: 'run',
              label: 'Run cell',
              contextMenuGroupId: 'run',
              keybindings: [KeyMod.CtrlCmd | KeyCode.Enter],
              run: () => run(),
            })
            editor.addAction({
              id: 'save',
              label: 'Save',
              keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
              run: () => run(),
            })
          }
          editor.onDidChangeCursorPosition((e) => {
            const pos = e.position
            const start = range.current!.getStartPosition()
            const end = range.current!.getEndPosition()
            if (pos.isBefore(start)) editor.setPosition(start)
            else if (end.isBefore(pos)) editor.setPosition(end)
          })
        }}
        options={{
          lineNumbers: (e) => (e - start + 1) as any,
          stickyScroll: { enabled: false },
          wordWrap: 'off',
          minimap: { enabled: false },
          lineHeight,
          scrollbar: {
            vertical: 'hidden',
            horizontal: 'auto',
            handleMouseWheel: false,
            useShadows: false,
          },
          overviewRulerLanes: 0,
          lineDecorationsWidth: 1,
          lineNumbersMinChars: 3,
          overviewRulerBorder: false,
        }}
        theme="vs-dark"
      />
    </div>
  )
}

export const MarkdownBlock = ({ index, content, start, end }: { index: number; end: number; start: number; content: string }) => {
  const [md, setMd] = useState('')
  const [editor, setEditor] = useState(false)
  useEffect(() => {
    const effect = async () => setMd(await marked.parse(content))
    effect()
  }, [content])
  return (
    <Cell index={index} Icon={!editor ? CodeIcon : TextIcon} onClick={() => setEditor((e) => !e)}>
      {!editor && <div className="prose prose-invert max-w-full" dangerouslySetInnerHTML={{ __html: md }}></div>}
      {editor && <Code start={start} end={end} />}
    </Cell>
  )
}
