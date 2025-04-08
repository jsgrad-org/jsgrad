// @deno-types="npm:@types/react"
import '../../../jsgrad/env-web.ts'
import { useEffect, useRef, useState } from 'react'
import { round, type TqdmProgress } from '../../../jsgrad/base.ts'
import { Llama3, type Llama3Message, type Llama3Usage } from '../../../models/llama3.ts'
import { import_beam } from '../../../jsgrad/engine/search.ts'
import { vars } from '../../../jsgrad/helpers/helpers.ts'

vars.BEAM = 3
import_beam('NjEzOTYyNzk1NzI0NzY2MDMyNzo0LDAsMTZ8NCwwLDgKOTQyNTEwMTI1NDUyMTgxMjQzMjo0LDAsOHw0LDAsNHw1LDAsMTZ8MywwLDAKMTA1MDY4NTg1Mzc1NTA3NjUwNzc6NCwwLDE2fDQsMSw4fDIsMiwwfDIsMywyCjE1MzgzNTczMDI4NzQ2MTQyMzIzOjQsMCwzMnwyLDAsMgoxNTM4ODI0OTgwMjk0Nzc4NDA3Mzo0LDAsMzJ8NCwwLDh8MiwwLDQKMjg2ODc1Mzg1MDY3OTY2NDkxOTo0LDAsMzJ8NCwwLDh8MiwwLDN8MiwyLDIKOTYyOTU0NTM1MDM3NjA1OTg5NTo0LDAsMzIKNDgyODczNjQ1MDE1OTM0Njg3NDo2LDAsMzIKOTMwNjg0NDE0NDkzNzY2MTQwNzo2LDAsNjR8MywxLDR8MywxLDAKMTMxMTk3MTk5NjMwNzA5OTcxOTU6NCwwLDMyfDQsMCwyCjU2ODcyNDYyNjU0Mzc5OTQxMzI6NSwwLDE2fDQsMCw0fDMsMSw0CjE1NDExNzU3NDI2NjY5MTY5OTI0OjIsMCwwCjMyMTYwMDU1NzI1MjcyNjQ4MzM6MiwwLDQKNjY2MjY0NjYzNzY4ODU2MTAwMDo1LDAsMTZ8NCwwLDR8MiwxLDIKMTQ2MTU5NDcwOTU3MjUwODcyMzI6NCwwLDh8NSwwLDE2fDIsMCwyfDMsMSw0fDIsMSwyCjE3MTU0MTExMjcxMjcyMTA3NzI0OjQsMCw4fDUsMCwxNnwzLDEsNHwyLDAsMnwyLDEsNAoxNzU2NTQ2MDM2MzY0NzM3MDM4MDo0LDAsMTYKMTY4Nzc3ODg3NjQyMTA1MTgyNDk6CjI2MjU2NDE0NTcxMjczMTQ2OTQ6CjEzMTYzNTU2MDY4NDU5NTEzMTQ1OjYsMCwyNTZ8MywxLDQKMTY1OTcxNzgzODkzMDI2MTIxNzQ6NiwwLDMyfDMsMSw0CjMzMzk4NTA5MTUxMzUxMDI3ODk6NiwwLDI1NgoxNjg1MTg4NDczMjMxMzE4NjgyMDo0LDAsMTZ8NCwwLDh8MiwwLDN8MiwyLDIKMTQwNzUzODg5NDMyNzQ2Njc2OTA6NSwwLDE2fDQsMSw4CjE1MTQ5NDA5NDEzMTg1NjM5OTM4OjUsMCwwfDIsMCwzCjE2NTE2MDg1OTk0MTc2MDg2MzI4OjYsMCwyNTYKMTcxNTc3NDA2NjE0MjUwNzc0Nzg6MiwwLDAKMTYwOTkxMzY2NjE3NDM5MDc5MDY6NSwwLDE2fDQsMCw0CjMyMjkzNzA2MjcwMTQ5MzcxMjo0LDEsMTZ8NCwwLDR8MiwwLDIKNDg2MTU4MDgwNjc3Mzc1NDY1ODo0LDAsMzJ8MiwxLDR8NSwwLDR8MywxLDQKOTQxNzU1MDA3OTM3NDE3MjQ0Mzo0LDAsMgoxNTMwMzI1MzQwMzQxNzAxNjEzOTo0LDAsMnwyLDAsMgo2OTgzNjQzNTU1MzE1MTg5MDE3OjQsMCwxNnw0LDAsMgozMTU0NzA4NTgyNTYyOTIyODE2OjQsMSwxNgoxMTM2MTA1MzUxOTUxMTA1NjY3MToKMTA0NzMwMzQ0NDY4MzcyNzY1ODg6Cjk5NzkzMjMwNDE4NDMxODU2OToKNjA3NzMxMzkzMjIzNDY2MTEyNjo=')

export const LlamaApp = ({ initOnLoad }: { initOnLoad?: boolean }) => {
  const [model, setModel] = useState<Llama3>()
  const [progress, onProgress] = useState<TqdmProgress>()
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Llama3Message[]>([])
  const [usage, setUsage] = useState<Llama3Usage>()
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => void (initOnLoad ? init() : undefined), [])

  useEffect(() => {
    const textarea = ref.current!
    textarea.style.height = 'auto'
    const scrollHeight = textarea.scrollHeight
    const maxHeight = parseFloat(getComputedStyle(textarea).lineHeight) * 4

    textarea.style.height = scrollHeight <= maxHeight ? `${scrollHeight}px` : `${maxHeight}px`
  }, [message])

  const init = async () => {
    if (model || progress) return
    onProgress({ label: 'Loading model...', size: 1 })
    const _model = await Llama3.load({
      size: '1B',
      quantize: 'float16',
      system: 'You are an helpful assistant.',
      onProgress,
    })
    onProgress(undefined)
    setModel(_model)
  }

  const chat = async () => {
    if (!model || progress) return

    setMessages((
      x,
    ) => [...x, { role: 'user', content: message }, {
      role: 'assistant',
      content: '',
    }])
    setMessage('')
    onProgress({ label: 'Generating...', size: 1 })
    await model.chat({
      messages: [{ role: 'user', content: message }],
      onToken: (res) => {
        setMessages((x) => [...x.slice(0, -1), res.message])
        setUsage(res.usage)
      },
      onProgress,
    })
    onProgress(undefined)
  }

  return (
    <div className='flex flex-col h-screen w-screen justify-between overflow-hidden p-3 md:p-10'>
      <div className='h-full flex-col w-full max-w-screen-xl overflow-hidden relative mx-auto'>
        {messages.length === 0
          ? (
            <div className='h-full w-full flex items-center justify-center'>
              <div className='absolute'>
                <p className='text-6xl md:text-7xl'>denochat</p>
                {progress && (
                  <>
                    <p className='mt-2 text-sm'>{progress.label}</p>
                    {progress.size && (
                      <div className='bg-white/20 overflow-hidden h-3 w-full rounded-lg'>
                        <div
                          className='bg-white h-full'
                          style={{
                            width: `${((progress.i || 0) / progress.size * 100)}%`,
                          }}
                        >
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
          : (
            <div className='flex flex-col-reverse absolute h-full w-full overflow-y-auto gap-1'>
              {messages.toReversed().map((msg, i) => (
                <p
                  key={i}
                  className={`rounded-lg p-2 max-w-[800px] ${msg.role === 'assistant' ? 'mr-auto bg-white/10' : 'ml-auto bg-white text-black'}`}
                >
                  {msg.content}
                </p>
              ))}
            </div>
          )}
      </div>

      <div className='flex flex-col gap-2 pt-1'>
        {!!usage && (
          <div className='flex items-center justify-center gap-3 text-sm'>
            <p>{round(usage.time_to_first_token || 0)} sec to first token</p>
            <p>{round(usage.tokens_per_second || 0)} tokens/sec</p>
            <p>{usage.output_tokens} tokens</p>
          </div>
        )}
        <form
          className='w-full flex items-end gap-2 max-w-screen-xl mx-auto'
          onClick={init}
          onSubmit={async (e) => {
            e.preventDefault()
            await chat()
          }}
        >
          <textarea
            ref={ref}
            placeholder='Say something'
            className='bg-white/10 outline-none w-full rounded-xl p-3 overflow-auto resize-none'
            rows={1}
            value={message}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && !e.altKey && !e.shiftKey) {
                e.preventDefault()
                await chat()
              }
            }}
            onChange={(e) => setMessage(e.target.value)}
          />

          <button
            disabled={!model || !!progress}
            className='h-12 w-16 bg-white text-black flex items-center justify-center rounded-xl disabled:bg-white/70'
            type='submit'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 512 512'
              className='h-6 w-6'
            >
              <path d='M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23s-18.9 5.4-28 1.6L284 427.7l-68.5 74.1c-8.9 9.7-22.9 12.9-35.2 8.1S160 493.2 160 480l0-83.6c0-4 1.5-7.8 4.2-10.8L331.8 202.8c5.8-6.3 5.6-16-.4-22s-15.7-6.4-22-.7L106 360.8 17.7 316.6C7.1 311.3 .3 300.7 0 288.9s5.9-22.8 16.1-28.7l448-256c10.7-6.1 23.9-5.5 34 1.4z' />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
