type Props = {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ open, title = 'Confirm', message, confirmText = 'Yes', cancelText = 'Cancel', onConfirm, onCancel }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center bg-black/60">
      <div className="glass-card neon-border w-full max-w-md p-5">
        <div className="text-lg font-semibold mb-2">{title}</div>
        <div className="text-sm text-textSecondary">{message}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-2 rounded-md border border-borderToken" onClick={onCancel}>{cancelText}</button>
          <button className="px-3 py-2 rounded-md bg-rose-500/80 hover:bg-rose-500" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}



