import type { ReactNode } from 'react'
import { toast } from 'sonner'

export const Copy = ({ children, text, className }: { className?: string; text: string; children: ReactNode }) => {
  return (
    <div
      className={className}
      onClick={() => {
        navigator.clipboard.writeText(text)
        toast('Copied!')
      }}
    >
      {children}
    </div>
  )
}
