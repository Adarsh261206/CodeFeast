import { useState, useEffect } from 'react'
import { api } from '../api/client'

type Problem = {
  _id: string
  title: string
}

type Props = {
  onClose: () => void
  onCreated: () => void
}

export default function CreateAssessmentModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState(60)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedProblems, setSelectedProblems] = useState<string[]>([])
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadProblems()
    // Set default dates
    const now = new Date()
    setStartDate(now.toISOString().slice(0, 16))
    setEndDate(new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16))
  }, [])

  const loadProblems = async () => {
    try {
      const res = await api.get('/problems')
      setProblems(res.data.problems)
    } catch (e) {
      console.error('Failed to load problems:', e)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedProblems.length === 0) {
      setError('Please select at least one problem')
      return
    }

    setLoading(true)
    setError('')

    try {
      await api.post('/assessments', {
        title,
        description,
        duration,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        problems: selectedProblems
      })
      onCreated()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to create assessment')
    } finally {
      setLoading(false)
    }
  }

  const toggleProblem = (problemId: string) => {
    setSelectedProblems(prev => 
      prev.includes(problemId) 
        ? prev.filter(id => id !== problemId)
        : [...prev, problemId]
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60">
      <div className="glass-card neon-border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Create Assessment</h2>
          <button
            onClick={onClose}
            className="text-textSecondary hover:text-textPrimary"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-textSecondary mb-1">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-surface border border-borderToken rounded-md p-2 focus-ring"
              placeholder="Enter assessment title"
            />
          </div>

          <div>
            <label className="block text-sm text-textSecondary mb-1">Description</label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-surface border border-borderToken rounded-md p-2 focus-ring"
              rows={3}
              placeholder="Enter assessment description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-textSecondary mb-1">Duration (minutes) — 5 to 480</label>
              <input
                type="number"
                required
                min="5"
                max="480"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full bg-surface border border-borderToken rounded-md p-2 focus-ring"
                aria-label="Duration 5-480 minutes"
              />
            </div>
            <div>
              <label className="block text-sm text-textSecondary mb-1">Start Date</label>
              <input
                type="datetime-local"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-surface border border-borderToken rounded-md p-2 focus-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-textSecondary mb-1">End Date</label>
            <input
              type="datetime-local"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-surface border border-borderToken rounded-md p-2 focus-ring"
            />
          </div>

          <div>
            <label className="block text-sm text-textSecondary mb-2">Select Problems</label>
            <div className="max-h-40 overflow-y-auto space-y-2">
              {problems.map((problem) => (
                <label key={problem._id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedProblems.includes(problem._id)}
                    onChange={() => toggleProblem(problem._id)}
                    className="rounded"
                  />
                  <span className="text-sm">{problem.title}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-rose-400 text-sm text-center">{error}</div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-borderToken hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-md bg-accentPrimary/80 hover:bg-accentPrimary disabled:opacity-60"
            >
              {loading ? 'Creating...' : 'Create Assessment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
