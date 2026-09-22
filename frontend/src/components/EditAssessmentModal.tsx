import { useState, useEffect } from 'react'
import { api } from '../api/client'

type Problem = {
  _id: string
  title: string
}

type Assessment = {
  _id: string
  title: string
  description: string
  duration: number
  problems: string[]
  startDate: string
  endDate: string
  isActive?: boolean
}

type Props = {
  assessment: Assessment | null
  onClose: () => void
  onUpdated: () => void
}

export default function EditAssessmentModal({ assessment, onClose, onUpdated }: Props) {
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
    if (assessment) {
      setTitle(assessment.title)
      setDescription(assessment.description)
      setDuration(assessment.duration)
      setStartDate(new Date(assessment.startDate).toISOString().slice(0, 16))
      setEndDate(new Date(assessment.endDate).toISOString().slice(0, 16))
      setSelectedProblems(assessment.problems)
      loadProblems()
    }
  }, [assessment])

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
      await api.put(`/assessments/${assessment?._id}`, {
        title,
        description,
        duration,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        problems: selectedProblems
      })
      onUpdated()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to update assessment')
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

  if (!assessment) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60">
      <div className="glass-card neon-border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Edit Assessment</h2>
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

          <div>
            <label className="block text-sm text-textSecondary mb-1">Duration (minutes)</label>
            <input
              type="number"
              required
              min="5"
              max="480"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full bg-surface border border-borderToken rounded-md p-2 focus-ring"
              aria-label="Duration in minutes (5-480)"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
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
          </div>

          <div>
            <label className="block text-sm text-textSecondary mb-1">Select Problems</label>
            <div className="max-h-40 overflow-y-auto border border-borderToken rounded-md p-2">
              {problems.map((problem) => (
                <label key={problem._id} className="flex items-center gap-2 p-2 hover:bg-surface/50 rounded">
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
            <div className="text-xs text-textSecondary mt-1">
              Selected: {selectedProblems.length} problem(s)
            </div>
          </div>

          {error && <div className="text-rose-400 text-sm">{error}</div>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-md border border-borderToken"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-md bg-accentPrimary/80 hover:bg-accentPrimary disabled:opacity-60"
            >
              {loading ? 'Updating...' : 'Update Assessment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
