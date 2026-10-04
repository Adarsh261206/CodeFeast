import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import CreateAssessmentModal from '@/components/CreateAssessmentModal'
import EditAssessmentModal from '@/components/EditAssessmentModal'
import ConfirmModal from '@/components/ConfirmModal'

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

export default function Assessments() {
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [allProblems, setAllProblems] = useState<{ _id: string }[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Assessment | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id?: string; title?: string }>({ open: false })
  const { user } = useAuth()
  const navigate = useNavigate()

  const load = async () => {
    try {
      const [assessmentsRes, problemsRes] = await Promise.all([
        api.get('/assessments'),
        api.get('/problems')
      ])
      setAssessments(assessmentsRes.data.assessments || [])
      setAllProblems(problemsRes.data.problems || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const confirmDeleteAssessment = async () => {
    if (!confirmDelete.id) return
    try {
      await api.delete(`/assessments/${confirmDelete.id}`)
      setConfirmDelete({ open: false })
      load()
    } catch (e) {
      console.error('Failed to delete assessment:', e)
      setConfirmDelete({ open: false })
    }
  }

  if (loading) {
    return <div className="glass-card neon-border p-6">Loading assessments…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Assessments</h1>
        {user?.role === 'admin' && (
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-accentSecondary/80 hover:bg-accentSecondary rounded-md">Create Assessment</button>
        )}
      </div>

      {assessments.length === 0 ? (
        <div className="glass-card neon-border p-6 text-textSecondary">No assessments yet.</div>
      ) : (
        <div className="grid gap-3">
          {assessments.map(a => (
            <div key={a._id} className="glass-card neon-border p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold">{a.title}</div>
                <div className="text-sm text-textSecondary">
                  Duration: {a.duration} min • Problems: {
                    a.problems.filter(pid => allProblems.some(p => p._id === pid)).length
                  }
                </div>
              </div>
              <div className="flex gap-2">
                {user?.role === 'admin' && (
                  <>
                    <button onClick={() => setEditing(a)} className="px-3 py-1 bg-accentPrimary/80 hover:bg-accentPrimary rounded-md text-sm">Edit</button>
                    <button onClick={() => setConfirmDelete({ open: true, id: a._id, title: a.title })} className="px-3 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded-md text-sm">Delete</button>
                  </>
                )}
                <button onClick={() => navigate(`/live-assessment/${a._id}`)} className="px-3 py-1 bg-surface rounded-md text-sm border border-borderToken">Open</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateAssessmentModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load() }} />
      )}

      {editing && (
        <EditAssessmentModal assessment={editing} onClose={() => setEditing(null)} onUpdated={() => { setEditing(null); load() }} />
      )}

      <ConfirmModal
        open={confirmDelete.open}
        title="Delete Assessment"
        message={`Are you sure you want to delete "${confirmDelete.title || ''}"? Submissions and reports for it stay, but the assessment will be removed. This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDeleteAssessment}
        onCancel={() => setConfirmDelete({ open: false })}
      />
    </div>
  )
}
