import { useState } from 'react'
import { api } from '../api/client'

type ProblemData = {
  _id: string
  title: string
  statement: string
  constraints?: string
  examples?: { input: string; output: string; title?: string }[]
  visible_testcases?: { input: string; output: string; title?: string }[]
  hidden_testcases?: { input: string; output: string }[]
}

type Props = {
  onClose: () => void
  onCreated: () => void
  problem?: ProblemData
}

type Row = { input: string; output: string; title?: string }

const emptyRow: Row = { input: '', output: '' }

export default function CreateProblemModal({ onClose, onCreated, problem }: Props) {
  const [title, setTitle] = useState(problem?.title || '')
  const [statement, setStatement] = useState(problem?.statement || '')
  const [constraints, setConstraints] = useState(problem?.constraints || '')
  const [examples, setExamples] = useState<Row[]>(problem?.examples?.length ? problem.examples : [emptyRow])
  const [visible, setVisible] = useState<Row[]>(problem?.visible_testcases?.length ? problem.visible_testcases : [emptyRow])
  const [hidden, setHidden] = useState<{ input: string; output: string }[]>(problem?.hidden_testcases?.length ? problem.hidden_testcases : [emptyRow, emptyRow])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const addRow = (setter: Function) => setter((arr: any[]) => [...arr, { input: '', output: '' }])
  const updateRow = (setter: Function, idx: number, field: 'input'|'output'|'title', value: string) => {
    setter((arr: any[]) => arr.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }
  const removeRow = (setter: Function, idx: number) => setter((arr: any[]) => arr.filter((_, i) => i !== idx))
  const withTitle = (r: Row) => ({
    input: r.input,
    output: r.output,
    ...(r.title && r.title.trim() ? { title: r.title.trim() } : {})
  })

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!title || !statement) { setError('Title and statement are required'); return }
    if (visible.length < 1 || hidden.length < 1) { setError('Add at least 1 visible and 1 hidden testcase'); return }

    const payload = {
      title,
      statement,
      constraints,
      examples: examples.filter(e => e.input && e.output).map(withTitle),
      visible_testcases: visible.filter(v => v.input && v.output).map(withTitle),
      hidden_testcases: hidden.filter(h => h.input && h.output)
    }

    setLoading(true)
    try {
      if (problem) {
        await api.put(`/admin/problems/${problem._id}`, payload)
      } else {
        await api.post('/admin/problems', payload)
      }
      onCreated()
    } catch (e: any) {
      setError(e.response?.data?.error || (problem ? 'Failed to update problem' : 'Failed to create problem'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass-card w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-borderToken">
          <h2 className="text-xl font-semibold">{problem ? 'Edit Problem' : 'Create Problem'}</h2>
          <button className="text-textSecondary hover:text-textPrimary" onClick={onClose}>✕</button>
        </div>
        <form id="create-problem-form" onSubmit={onSubmit} className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
          <div>
            <label className="block text-sm text-textSecondary mb-1">Title</label>
            <input className="w-full bg-surface border border-borderToken rounded-md p-2 focus-ring" value={title} onChange={e=>setTitle(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Statement</label>
            <textarea className="w-full bg-surface border border-borderToken rounded-md p-2 focus-ring" rows={6} value={statement} onChange={e=>setStatement(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Constraints</label>
            <textarea className="w-full bg-surface border border-borderToken rounded-md p-2 focus-ring" rows={3} value={constraints} onChange={e=>setConstraints(e.target.value)} />
          </div>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Examples</h3>
              <button type="button" className="px-2 py-1 text-xs bg-accentSecondary/20 hover:bg-accentSecondary/30 rounded" onClick={()=>addRow(setExamples)}>+ Add</button>
            </div>
            <div className="space-y-2">
              {examples.map((ex, idx) => (
                <div key={idx} className="grid md:grid-cols-2 gap-2">
                  <input className="bg-surface border border-borderToken rounded p-2 md:col-span-2" placeholder="Title (optional) — e.g. Example 1" value={ex.title || ''} onChange={e=>updateRow(setExamples, idx, 'title', e.target.value)} />
                  <input className="bg-surface border border-borderToken rounded p-2" placeholder="Input" value={ex.input} onChange={e=>updateRow(setExamples, idx, 'input', e.target.value)} />
                  <div className="flex gap-2">
                    <input className="flex-1 bg-surface border border-borderToken rounded p-2" placeholder="Output" value={ex.output} onChange={e=>updateRow(setExamples, idx, 'output', e.target.value)} />
                    <button type="button" className="px-2 text-xs bg-rose-500/20 hover:bg-rose-500/30 rounded" onClick={()=>removeRow(setExamples, idx)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Visible Testcases</h3>
              <button type="button" className="px-2 py-1 text-xs bg-accentSecondary/20 hover:bg-accentSecondary/30 rounded" onClick={()=>addRow(setVisible)}>+ Add</button>
            </div>
            <div className="space-y-2">
              {visible.map((tc, idx) => (
                <div key={idx} className="grid md:grid-cols-2 gap-2">
                  <input className="bg-surface border border-borderToken rounded p-2 md:col-span-2" placeholder="Title (optional) — e.g. Edge case: empty array" value={tc.title || ''} onChange={e=>updateRow(setVisible, idx, 'title', e.target.value)} />
                  <textarea className="bg-surface border border-borderToken rounded p-2" placeholder="Input" value={tc.input} onChange={e=>updateRow(setVisible, idx, 'input', e.target.value)} />
                  <div className="flex gap-2">
                    <textarea className="flex-1 bg-surface border border-borderToken rounded p-2" placeholder="Output" value={tc.output} onChange={e=>updateRow(setVisible, idx, 'output', e.target.value)} />
                    <button type="button" className="px-2 text-xs bg-rose-500/20 hover:bg-rose-500/30 rounded" onClick={()=>removeRow(setVisible, idx)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Hidden Testcases</h3>
              <button type="button" className="px-2 py-1 text-xs bg-accentSecondary/20 hover:bg-accentSecondary/30 rounded" onClick={()=>addRow(setHidden)}>+ Add</button>
            </div>
            <div className="space-y-2">
              {hidden.map((tc, idx) => (
                <div key={idx} className="grid md:grid-cols-2 gap-2">
                  <textarea className="bg-surface border border-borderToken rounded p-2" placeholder="Input" value={tc.input} onChange={e=>updateRow(setHidden, idx, 'input', e.target.value)} />
                  <div className="flex gap-2">
                    <textarea className="flex-1 bg-surface border border-borderToken rounded p-2" placeholder="Output" value={tc.output} onChange={e=>updateRow(setHidden, idx, 'output', e.target.value)} />
                    <button type="button" className="px-2 text-xs bg-rose-500/20 hover:bg-rose-500/30 rounded" onClick={()=>removeRow(setHidden, idx)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {error && <div className="text-rose-400 text-sm">{error}</div>}

        </form>
        <div className="p-6 pt-4 border-t border-borderToken flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-md border border-borderToken">Cancel</button>
          <button form="create-problem-form" type="submit" disabled={loading} className="px-3 py-2 rounded-md bg-accentPrimary/80 hover:bg-accentPrimary disabled:opacity-60">
            {loading ? (problem ? 'Saving…' : 'Creating…') : (problem ? 'Save Changes' : 'Create Problem')}
          </button>
        </div>
      </div>
    </div>
  )
}
