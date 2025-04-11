import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'

const raw = document.querySelector('#notebook-raw')
if (!raw) throw new Error('No notebook-raw id found')
const code = raw.textContent!
raw.remove()

createRoot(document.querySelector('#notebook-root') as HTMLElement).render(
  <StrictMode>
    <App code={code} />
  </StrictMode>,
)
