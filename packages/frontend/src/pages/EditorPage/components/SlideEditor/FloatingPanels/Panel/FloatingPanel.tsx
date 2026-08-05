import type { ReactNode } from 'react'
import './FloatingPanel.css'

interface FloatingPanelProps {
  open: boolean
  children: ReactNode
}

export function FloatingPanel({ open, children }: FloatingPanelProps) {
  return (
    <div className={`floating-panel ${open ? 'open' : ''}`} aria-hidden={!open}>
      {children}
    </div>
  )
}
