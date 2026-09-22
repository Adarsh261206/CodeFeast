import { useState } from 'react'
import { api } from '../api/client'

type Props = { onClose: () => void; onGenerated: () => void }

export default function AdminAIModal({ onClose, onGenerated }: Props) {
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      await api.post('/admin/generate', { topic })
      onGenerated()
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60">
      <div className="glass-card neon-border w-full max-w-lg p-5">
        <div className="text-lg font-semibold">Generate DSA Problem</div>
        <p className="text-sm text-textSecondary mt-1">Uses OpenAI to create a hard DSA problem with visible and hidden testcases.</p>
        <label className="block text-sm mt-4">Topic (optional)</label>
        <input className="w-full bg-surface border border-borderToken rounded-md p-2" value={topic} onChange={(e) => setTopic(e.target.value)} />
        {error && <div className="text-rose-400 text-sm mt-2">{error}</div>}
        <div className="mt-4 flex gap-2 justify-end">
          <button className="px-3 py-2 rounded-md border border-borderToken" onClick={onClose}>Cancel</button>
          <button disabled={loading} className="px-3 py-2 rounded-md bg-accentPrimary/80 hover:bg-accentPrimary disabled:opacity-60" onClick={onGenerate}>
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}


