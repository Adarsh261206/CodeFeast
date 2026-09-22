import { useEffect } from 'react'

type ToastProps = {
  message: string
  type?: 'success' | 'error' | 'info'
  duration?: number
  onClose: () => void
}

export default function Toast({ message, type = 'info', duration = 2500, onClose }: ToastProps) {
  useEffect(() => {
    const id = setTimeout(onClose, duration)
    return () => clearTimeout(id)
  }, [duration, onClose])

  const color = type === 'success' ? 'bg-green-500/20 text-green-300 border-green-500/30'
    : type === 'error' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
    : 'bg-accentSecondary/20 text-accentSecondary border-accentSecondary/30'

  return (
    <div className={`fixed top-4 right-4 z-[10000] max-w-sm w-[min(92vw,360px)] rounded-md border ${color} shadow-lg`}
         role="status" aria-live="polite">
      <div className="px-4 py-3 text-sm font-medium flex items-start gap-3">
        <span className="select-none">{type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
        <div className="flex-1">{message}</div>
        <button onClick={onClose} className="opacity-70 hover:opacity-100">✕</button>
      </div>
    </div>
  )
}



