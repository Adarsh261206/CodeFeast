import { useEffect, useState } from 'react'
import { api } from '../api/client'
import AdminAIModal from '@/components/AdminAIModal'
import CreateProblemModal from '@/components/CreateProblemModal'
import { useAuth } from '@/hooks/useAuth'
import ConfirmModal from '@/components/ConfirmModal'

type Problem = {
  _id: string
  title: string
  statement: string
  constraints?: string
  marks?: number
  examples?: { input: string; output: string; title?: string }[]
  visible_testcases?: { input: string; output: string; title?: string }[]
  hidden_testcases?: { input: string; output: string }[]
  createdAt?: string
}

export default function Problems() {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDifficulty, setSelectedDifficulty] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; problemId?: string }>({ open: false })
  const [editing, setEditing] = useState<Problem | null>(null)

  useEffect(() => {
    loadProblems()
  }, [])

  const loadProblems = async () => {
    try {
      const res = await api.get('/problems')
      setProblems(res.data.problems || [])
    } catch (e) {
      console.error('Failed to load problems:', e)
    } finally {
      setLoading(false)
    }
  }

  // Difficulty field not yet in problem model — search only for now
  const filteredProblems = problems.filter(problem => {
    const matchesSearch = problem.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         problem.statement.toLowerCase().includes(searchTerm.toLowerCase())
    // Pass-through until difficulty field added to schema
    return matchesSearch
  })

  const requestDeleteProblem = (problemId: string) => {
    setConfirmDelete({ open: true, problemId })
  }

  // List endpoint strips hidden_testcases — fetch the full problem before editing
  const startEdit = async (problem: Problem) => {
    try {
      const res = await api.get(`/problems/${problem._id}`)
      setEditing(res.data.problem || problem)
    } catch {
      setEditing(problem)
    }
  }

  const confirmDeleteProblem = async () => {
    if (!confirmDelete.problemId) return
    try {
      await api.delete(`/problems/${confirmDelete.problemId}`)
      setConfirmDelete({ open: false })
      loadProblems()
    } catch (e) {
      console.error('Failed to delete problem:', e)
      setConfirmDelete({ open: false })
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Problems</h1>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map((i) => (
            <div key={i} className="glass-card neon-border p-4 animate-pulse">
              <div className="h-4 bg-surface rounded mb-2"></div>
              <div className="h-3 bg-surface rounded mb-2"></div>
              <div className="h-3 bg-surface rounded w-2/3"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Problems</h1>
            <p className="text-sm text-slate-500 mt-1">Manage your DSA bank — Nike minimal • 8pt grid</p>
          </div>
          {user?.role === 'admin' && (
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-sm font-medium" onClick={() => setShowCreate(true)}>Create Problem</button>
              <button className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 rounded-lg text-sm font-medium" onClick={() => setOpen(true)}>AI Generate</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search problems..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus-ring placeholder:text-slate-400"
          />
        </div>
        <select
          value={selectedDifficulty}
          onChange={(e) => setSelectedDifficulty(e.target.value)}
          className="bg-surface border border-borderToken rounded-md p-2 focus-ring"
          aria-label="Filter by difficulty"
          title="Difficulty filtering coming soon — currently shows all"
        >
          <option value="all">All Difficulties</option>
          <option value="easy">Easy (soon)</option>
          <option value="medium">Medium (soon)</option>
          <option value="hard">Hard (soon)</option>
        </select>
      </div>

      {filteredProblems.length === 0 ? (
        <div className="glass-card neon-border p-8 text-center">
          <p className="text-textSecondary">
            {searchTerm ? 'No problems match your search.' : 'No problems created yet.'}
          </p>
          {user?.role === 'admin' && (
            <p className="text-sm text-textSecondary mt-2">
              Create your first problem to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProblems.map((problem) => (
            <div key={problem._id} className="glass-card neon-border p-4 hover:scale-105 transition-transform">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-lg">{problem.title}</h3>
                {user?.role === 'admin' && (
                  <div className="flex gap-1">
                    <button 
                      onClick={() => startEdit(problem)}
                      className="p-1 text-accentSecondary hover:text-accentSecondary/70"
                      title="Edit"
                      aria-label={`Edit ${problem.title}`}
                    >
                      ✏️
                    </button>
                    <button 
                      onClick={() => requestDeleteProblem(problem._id)}
                      className="p-1 text-rose-400 hover:text-rose-300"
                      title="Delete"
                      aria-label={`Delete ${problem.title}`}
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>
              
              <p className="text-sm text-textSecondary line-clamp-3 mb-3">
                {problem.statement}
              </p>

              {problem.constraints && (
                <div className="mb-2">
                  <span className="text-xs text-warmAccent font-medium">Constraints:</span>
                  <p className="text-xs text-textSecondary mt-1">{problem.constraints}</p>
                </div>
              )}

              {problem.examples && problem.examples.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-warmAccent font-medium">Example:</span>
                  <div className="text-xs text-textSecondary mt-1 space-y-1">
                    <div>Input: {problem.examples[0].input}</div>
                    <div>Output: {problem.examples[0].output}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-textSecondary">
                <span>{problem.visible_testcases?.length || 0} test cases · {problem.marks ?? 1} marks</span>
                {problem.createdAt && (
                  <span>{new Date(problem.createdAt).toLocaleDateString()}</span>
                )}
              </div>

               <div className="mt-3 flex gap-2">
                <button 
                  onClick={async () => {
                    // List strips hidden_testcases — fetch full problem so details show them
                    let full = problem
                    try {
                      const res = await api.get(`/problems/${problem._id}`)
                      full = res.data.problem || problem
                    } catch {}
                    setSelectedProblem(full)
                    setShowDetails(true)
                  }}
                  className="flex-1 bg-accentPrimary/20 hover:bg-accentPrimary/30 text-accentPrimary px-2 py-1 rounded text-xs transition"
                  aria-label={`View details for ${problem.title}`}
                >
                  View Details
                </button>
                <button 
                  onClick={() => {
                    // Navigate to assessments where solving happens — prevents dead button
                    window.location.href = '/assessments'
                  }}
                  className="flex-1 bg-accentSecondary/20 hover:bg-accentSecondary/30 text-accentSecondary px-2 py-1 rounded text-xs transition"
                  aria-label={`Start solving ${problem.title}`}
                >
                  Start Solving
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showDetails && selectedProblem && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60" role="dialog" aria-modal="true" onClick={() => setShowDetails(false)}>
          <div className="glass-card w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{selectedProblem.title}</h2>
              <button className="text-textSecondary hover:text-textPrimary" onClick={() => setShowDetails(false)} aria-label="Close details">✕</button>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-sm text-warmAccent mb-2">Problem Statement</h3>
                <p className="text-textSecondary whitespace-pre-wrap">{selectedProblem.statement}</p>
              </div>

              {selectedProblem.constraints && (
                <div>
                  <h3 className="font-semibold text-sm text-warmAccent mb-2">Constraints</h3>
                  <p className="text-textSecondary whitespace-pre-wrap">{selectedProblem.constraints}</p>
                </div>
              )}

              {selectedProblem.examples && selectedProblem.examples.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm text-warmAccent mb-2">Examples</h3>
                  <div className="space-y-2">
                    {selectedProblem.examples.map((ex, idx) => (
                      <div key={idx} className="bg-surface/50 p-3 rounded-md">
                        {ex.title && <div className="text-xs font-semibold text-warmAccent mb-1">{ex.title}</div>}
                        <div className="text-sm text-textSecondary">
                          <span className="font-medium">Input:</span> {ex.input}
                        </div>
                        <div className="text-sm text-textSecondary">
                          <span className="font-medium">Output:</span> {ex.output}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-sm text-warmAccent mb-2">
                    Visible Test Cases ({selectedProblem.visible_testcases?.length || 0})
                  </h3>
                  <div className="space-y-2">
                    {selectedProblem.visible_testcases?.map((tc, idx) => (
                      <div key={idx} className="bg-surface/50 p-3 rounded-md">
                        {tc.title && <div className="text-xs font-semibold text-warmAccent mb-1">{tc.title}</div>}
                        <div className="text-sm text-textSecondary">
                          <span className="font-medium">Input:</span> {tc.input}
                        </div>
                        <div className="text-sm text-textSecondary">
                          <span className="font-medium">Output:</span> {tc.output}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-warmAccent mb-2">
                    Hidden Test Cases ({selectedProblem.hidden_testcases?.length || 0})
                  </h3>
                  <div className="space-y-2">
                    {selectedProblem.hidden_testcases?.map((tc, idx) => (
                      <div key={idx} className="bg-surface/50 p-3 rounded-md">
                        <div className="text-sm text-textSecondary">
                          <span className="font-medium">Input:</span> {tc.input}
                        </div>
                        <div className="text-sm text-textSecondary">
                          <span className="font-medium">Output:</span> {tc.output}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {open && (
        <AdminAIModal 
          onClose={() => setOpen(false)} 
          onGenerated={() => {
            loadProblems()
            setOpen(false)
          }} 
        />
      )}
      {showCreate && (
        <CreateProblemModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            loadProblems()
          }}
        />
      )}
      {editing && (
        <CreateProblemModal
          problem={editing}
          onClose={() => setEditing(null)}
          onCreated={() => {
            setEditing(null)
            loadProblems()
          }}
        />
      )}

      <ConfirmModal
        open={confirmDelete.open}
        title="Delete Problem"
        message="Are you sure you want to delete this problem? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDeleteProblem}
        onCancel={() => setConfirmDelete({ open: false })}
      />
    </div>
  )
}


