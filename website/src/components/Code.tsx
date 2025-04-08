import '../../../jsgrad/env-web.ts'
import { useEffect, useRef, useState } from 'react'
import { Loader2, Play } from 'lucide-react'
import * as jsg from '../../../jsgrad/base.ts'

export const Code = ({ code, setCode }: { code: string; setCode?: (x: string) => void }) => {
  const [loading, setLoading] = useState(false)
  const [out, setOut] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current!.textContent = code
  }, [code])
  useEffect(() => (window as any).Prism?.highlightAll(), [code])

  const run = async () => {
    setLoading(true)
    try {
      let [imp, ...c] = code.split('\n')
      const imports = imp.split('import {')[1].split("} from '@jsgrad/jsgrad'")[0].split(',').map((x) => x.trim())
      const res = await new Function(`{ ${imports.join(', ')} }`, `return (async () => {\n${c.join('\n')}\n})()`)(Object.fromEntries(imports.map((k) => [k, (jsg as any)[k]])))
      setOut(res)
    } catch (e) {
      alert(`Error: ${e}`)
    }
    setLoading(false)
  }
  return (
    <div className='border border-white/5 h-full p-2 relative flex overflow-hidden'>
      <code
        ref={ref}
        className='!bg-transparent text-xs h-full w-full overflow-auto language-js'
        onInput={(e) => {
          const code = e.currentTarget.textContent!
          setCode?.(code)
        }}
        contentEditable
      />
      {out && <div id='out'>{out}</div>}
      <button
        type='button'
        className='absolute bottom-4 right-4 bg-green-500 p-2 rounded-full hover:bg-green-800 duration-150'
        onClick={run}
      >
        {!loading ? <Play /> : <Loader2 className='animate-spin' />}
      </button>
    </div>
  )
}

export const CodeWithExamples = ({ examples: input }: { examples: Record<string, string> }) => {
  let [examples, setExamples] = useState(input)
  const [selected, setSelected] = useState(Object.keys(input)[0])

  return (
    <div className='relative !bg-[#121212] w-full border-4 border-white/5 h-[400px] text-sm p-3 rounded-xl flex flex-col gap-3'>
      <div className='flex justify-between items-center'>
        <div className='flex gap-1 text-xs'>
          {Object.keys(examples).map((x) => <p key={x} onClick={() => setSelected(x)} className={`cursor-pointer bg-white/5 p-1 rounded-md ${selected === x ? 'text-blue-400' : ''}`}>{x}</p>)}
        </div>
      </div>
      <Code code={examples[selected]} setCode={(code) => setExamples((e) => ({ ...e, [selected]: code }))} />
      <div id='out' className='absolute top-[100%] mt-3 w-full text-center'></div>
    </div>
  )
}
