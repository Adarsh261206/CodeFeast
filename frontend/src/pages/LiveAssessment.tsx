import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import Editor from '@/components/Editor'
import Toast from '@/components/Toast'
import ConfirmModal from '@/components/ConfirmModal'

type Problem = {
  _id: string
  title: string
  statement: string
  constraints?: string
  examples?: { input: string; output: string }[]
  visible_testcases?: { input: string; output: string }[]
  hidden_testcases?: { input: string; output: string }[]
}

type Assessment = {
  _id: string
  title: string
  description: string
  duration: number
  problems: string[]
  startDate: string
  endDate: string
}

export default function LiveAssessment() {
  const { assessmentId } = useParams()
  const navigate = useNavigate()
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0)
  const [selectedLanguage, setSelectedLanguage] = useState('javascript')
  const [code, setCode] = useState('')
  const [codeByLang, setCodeByLang] = useState<Record<string,string>>({})
  const [executionResults, setExecutionResults] = useState<any[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const [customOutput, setCustomOutput] = useState<string | null>(null)
  const [customError, setCustomError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'sample' | 'custom'>('sample')
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(true)
  const [securityWarnings, setSecurityWarnings] = useState<string[]>([])
  const [fullscreenExits, setFullscreenExits] = useState(0)
  const [blurCount, setBlurCount] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [toast, setToast] = useState<{msg: string; type?: 'success'|'error'|'info'}|null>(null)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Security refs
  const blurCountRef = useRef(0)
  const fullscreenExitCountRef = useRef(0)
  const lastFullscreenStateRef = useRef<boolean | null>(null)
  const lastBlurAtRef = useRef<number>(0)
  const recentWarningKeysRef = useRef<Set<string>>(new Set())
  const userGestureDetectedRef = useRef(false)
  const assessmentStartAtRef = useRef<number>(Date.now())
  const problemStartAtRef = useRef<number>(Date.now())
  const keystrokesRef = useRef(0)
  const pasteEventsRef = useRef(0)
  const activeTypingMsRef = useRef(0)
  const attemptCountRef = useRef(0)
  const lastExecMsRef = useRef<number[]>([])

  const getElapsedSeconds = () => {
    const elapsedMs = Date.now() - assessmentStartAtRef.current
    return Math.max(0, Math.floor(elapsedMs / 1000))
  }

  const getProblemElapsedSeconds = () => {
    const elapsedMs = Date.now() - problemStartAtRef.current
    return Math.max(0, Math.floor(elapsedMs / 1000))
  }

  const getKpm = () => {
    const activeMinutes = activeTypingMsRef.current / 60000
    if (activeMinutes <= 0) return 0
    return Math.round(keystrokesRef.current / activeMinutes)
  }

  const handleEditorStats = (stats: { keystrokes: number; pasteEvents: number; activeTypingMs: number }) => {
    keystrokesRef.current = stats.keystrokes
    pasteEventsRef.current = stats.pasteEvents
    activeTypingMsRef.current = stats.activeTypingMs
  }

  const resetProblemTiming = () => {
    problemStartAtRef.current = Date.now()
    attemptCountRef.current = 0
    lastExecMsRef.current = []
  }

  // Kill-switch to block any further interaction once a violation is detected
  const disableAllInteractions = () => {
    try {
      // Don't block overlay itself — add class to app container only
      const appRoot = document.getElementById('root')
      if (appRoot) (appRoot as HTMLElement).style.pointerEvents = 'none'
      ;(document.documentElement as HTMLElement).style.userSelect = 'none'

      const prevent = (e: Event) => {
        // Allow events on termination overlay (z-index 9999)
        const target = e.target as HTMLElement
        if (target && target.closest && target.closest('[data-termination-overlay]')) return
        e.preventDefault()
        e.stopPropagation()
      }

      const events: (keyof DocumentEventMap)[] = [
        'click', 'dblclick', 'contextmenu', 'auxclick',
        'mousedown', 'mouseup', 'mousemove', 'wheel',
        'touchstart', 'touchend', 'touchmove',
        'pointerdown', 'pointerup', 'pointermove',
        'keydown', 'keypress', 'keyup'
      ]
      events.forEach(evt => document.addEventListener(evt, prevent, true))

      // Best-effort: exit fullscreen to reveal termination overlay universally
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    } catch (_) {
      // Ignore any errors; this is a best-effort kill switch
    }
  }

  const pushWarning = (key: string, message: string) => {
    // Avoid spamming the same warning key repeatedly
    if (recentWarningKeysRef.current.has(key)) return
    recentWarningKeysRef.current.add(key)
    setTimeout(() => {
      // Allow the same warning again after a short window
      recentWarningKeysRef.current.delete(key)
    }, 1500)
    setSecurityWarnings(prev => {
      const next = [...prev, message]
      // cap at 20 to avoid unbounded memory
      return next.length > 20 ? next.slice(-20) : next
    })
  }
  const securityViolationRef = useRef(false)

  useEffect(() => {
    if (assessmentId) {
      loadAssessment()
    } else {
      loadSampleProblem()
    }
  }, [assessmentId])

  useEffect(() => {
    if (assessment && assessment.duration > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleAutoSubmit()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [assessment])

  // Fullscreen enforcement
  useEffect(() => {
    const requestFullscreen = async (shouldWarn = false) => {
      try {
        await document.documentElement.requestFullscreen()
        lastFullscreenStateRef.current = true
      } catch (e) {
        if (shouldWarn) {
          pushWarning('fs-failed', 'Failed to enter fullscreen mode')
        }
      }
    }

    const handleFirstUserGesture = () => {
      userGestureDetectedRef.current = true
      if (!document.fullscreenElement && !securityViolationRef.current) {
        requestFullscreen(true)
      }
    }

    const addUserGestureListeners = () => {
      document.addEventListener('pointerdown', handleFirstUserGesture, { once: true })
      document.addEventListener('keydown', handleFirstUserGesture, { once: true })
      document.addEventListener('touchstart', handleFirstUserGesture, { once: true })
    }

    const removeUserGestureListeners = () => {
      document.removeEventListener('pointerdown', handleFirstUserGesture as any)
      document.removeEventListener('keydown', handleFirstUserGesture as any)
      document.removeEventListener('touchstart', handleFirstUserGesture as any)
    }

    const handleFullscreenChange = () => {
      const isActive = !!document.fullscreenElement
      // Ignore duplicate events with the same state
      if (lastFullscreenStateRef.current === isActive) return
      lastFullscreenStateRef.current = isActive

      if (isActive) {
        setSecurityWarnings(prev => prev.filter(w => !w.includes('Fullscreen exit detected')))
        removeUserGestureListeners()
      } else {
        const next = fullscreenExitCountRef.current + 1
        fullscreenExitCountRef.current = next
        setFullscreenExits(next)
        pushWarning(`fs-exit-${next}`, `Fullscreen exit detected (${next}/3)`)
        if (next >= 3) {
          handleSecurityViolation('Multiple fullscreen exits detected')
        } else {
          setTimeout(() => {
            if (!document.fullscreenElement && !securityViolationRef.current) {
              requestFullscreen(false)
            }
          }, 1000)
          // Also allow user to re-trigger via gesture after an exit
          addUserGestureListeners()
        }
      }
    }

    const fullscreenCheckInterval = setInterval(() => {
      if (!document.fullscreenElement && !securityViolationRef.current && document.visibilityState === 'visible') {
        // Less aggressive: 10s and only when visible
        requestFullscreen(false)
      }
    }, 10000)

    // Initial attempt (silent); some browsers require a user gesture
    requestFullscreen(false)
    // Prepare a one-time user gesture fallback
    addUserGestureListeners()
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      clearInterval(fullscreenCheckInterval)
      removeUserGestureListeners()
    }
  }, [])

  // Tab/window blur detection
  useEffect(() => {
    const handleBlur = () => {
      if (securityViolationRef.current) return
      const now = Date.now()
      // Throttle blur/visibility spikes within 600ms window
      if (now - lastBlurAtRef.current < 1000) return
      lastBlurAtRef.current = now
      const next = blurCountRef.current + 1
      blurCountRef.current = next
      setBlurCount(next)
      const warning = `Tab/window focus lost (${next}/5)`
      pushWarning(`blur-${next}`, warning)
      if (next >= 5) {
        handleSecurityViolation('Multiple tab/window switches detected')
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' && !securityViolationRef.current) {
        handleBlur()
      }
    }

    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Keyboard shortcuts prevention
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (securityViolationRef.current) return
      
      if (
        (e.ctrlKey || e.metaKey) && (
          e.key === 'c' || e.key === 'v' || e.key === 'x' || e.key === 'a' ||
          e.key === 'z' || e.key === 'y' || e.key === 's' || e.key === 'o' ||
          e.key === 'n' || e.key === 'w'
        )
      ) {
        e.preventDefault()
        e.stopPropagation()
        const warning = `Keyboard shortcut blocked: ${e.ctrlKey ? 'Ctrl' : 'Cmd'}+${e.key.toUpperCase()}`
        setSecurityWarnings(prev => [...prev, warning])
      }

      if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
        ((e.ctrlKey || e.metaKey) && e.key === 'u')
      ) {
        e.preventDefault()
        e.stopPropagation()
        const warning = 'Developer tools access blocked'
        setSecurityWarnings(prev => [...prev, warning])
      }
    }

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const warning = 'Right-click context menu blocked'
      setSecurityWarnings(prev => [...prev, warning])
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('contextmenu', handleContextMenu, true)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('contextmenu', handleContextMenu, true)
    }
  }, [])

  const handleSecurityViolation = async (reason: string) => {
    if (securityViolationRef.current) return
    
    securityViolationRef.current = true
    const violationMessage = `SECURITY VIOLATION: ${reason}`
    setSecurityWarnings(prev => [...prev, violationMessage])
    
    // Notify backend for audit/force-end
    try {
      await api.post('/reports/force-end', {
        reason,
        assessmentId,
        problemId: problems[currentProblemIndex]?._id,
        language: selectedLanguage,
        timeTakenSec: getElapsedSeconds(),
        security: {
          tabSwitches: blurCountRef.current,
          fullscreenExits: fullscreenExitCountRef.current
        }
      })
    } catch (e) {
      // non-blocking
      console.error('Failed to notify backend about force-end:', e)
    }
    
    // Immediately disable interactions
    disableAllInteractions();
    
    // Show termination overlay — escape reason to prevent XSS
    const escapeHtml = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    const overlay = document.createElement('div')
    overlay.setAttribute('data-termination-overlay','true')
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(220, 38, 38, 0.95);
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      font-family: Arial, sans-serif;
      text-align: center;
    `
    const safeReason = escapeHtml(String(reason).slice(0,200))
    overlay.innerHTML = `
      <div style="font-size: 3rem; margin-bottom: 1rem;">🚨</div>
      <h1 style="font-size: 2rem; margin-bottom: 1rem;">SECURITY VIOLATION DETECTED</h1>
      <p style="font-size: 1.2rem; margin-bottom: 1rem;">Reason: ${safeReason}</p>
      <p style="font-size: 1rem; margin-bottom: 2rem;">Your assessment has been terminated.</p>
      <p style="font-size: 0.9rem; opacity: 0.8;">Redirecting to assessments page...</p>
    `
    document.body.appendChild(overlay)
    
    // Reliable redirect (hard) so overlay and listeners are cleared
    setTimeout(() => {
      window.location.replace('/');
    }, 1500);
  }

  const handleEndTest = async () => {
    setShowEndConfirm(true)
  }

  const confirmEndTest = async () => {
    setShowEndConfirm(false)
    try {
      await api.post('/reports/force-end', { 
        reason: 'User requested end',
        assessmentId,
        problemId: problems[currentProblemIndex]?._id
      });
      setToast({ msg: 'Assessment ended successfully', type: 'success' })
      setTimeout(() => window.location.replace('/'), 800)
    } catch (e) {
      console.error('Failed to end assessment:', e)
      setToast({ msg: 'Assessment ended (local termination)', type: 'info' })
      setTimeout(() => window.location.replace('/'), 800)
    }
  }

  const loadAssessment = async () => {
    try {
      const [assessmentRes, problemsRes] = await Promise.all([
        api.get(`/assessments/${assessmentId}`),
        api.get('/problems')
      ])
      
      const assessmentData = assessmentRes.data.assessment
      const allProblems = problemsRes.data.problems
      
      const assessmentProblems = allProblems.filter((p: any) => 
        assessmentData.problems.includes(p._id)
      )
      
      setAssessment(assessmentData)
      setProblems(assessmentProblems)
      setTimeLeft(assessmentData.duration * 60)
      resetProblemTiming()
      // init code for first problem with current language
      const firstTitle = assessmentProblems[0]?.title
      const tpl = generateCodeTemplate(selectedLanguage, assessmentProblems[0])
      setCode(tpl)
      setCodeByLang({ [selectedLanguage]: tpl })
      setLoading(false)
    } catch (e) {
      setError('Failed to load assessment')
      setLoading(false)
    }
  }

  const loadSampleProblem = async () => {
    try {
      const res = await api.get('/problems/sample')
      const prob = res.data.problem
      setProblems([prob])
      const tpl = generateCodeTemplate(selectedLanguage, prob)
      setCode(tpl)
      setCodeByLang({ [selectedLanguage]: tpl })
      setLoading(false)
    } catch (e) {
      setError('Failed to load problem')
      setLoading(false)
    }
  }

  const handleAutoSubmit = async () => {
    if (!isSubmitted) {
      await onSubmit()
    }
  }

  const onRun = async () => {
    if (!problems[currentProblemIndex]) return
    const tcs = problems[currentProblemIndex].visible_testcases || []
    if (tcs.length === 0) {
      setToast({ msg: 'No visible test cases for this problem (hidden only). Try Run with Custom Input.', type: 'info' })
      return
    }
    if (!code.trim()) {
      setToast({ msg: 'Write some code before running.', type: 'error' })
      return
    }
    try {
      setIsExecuting(true)
      setExecutionResults([])
      attemptCountRef.current++
      const runStart = Date.now()
      const res = await api.post('/runner/execute', {
        code,
        language: selectedLanguage,
        testcases: tcs
      })
      
      const results = res.data.results || []
      const totalExecMs = Date.now() - runStart
      lastExecMsRef.current.push(totalExecMs)
      if (lastExecMsRef.current.length > 20) lastExecMsRef.current = lastExecMsRef.current.slice(-20)
      setExecutionResults(results)
      
      const passed = results.filter((r: any) => r.passed).length
      const total = results.length
      
      if (total === 0) {
        setToast({ msg: 'No results returned', type: 'error' })
      } else if (passed === total) {
        setToast({ msg: `All ${total} test cases passed!`, type: 'success' })
      } else {
        // show first failing reason
        const fail = results.find((r:any)=> !r.passed)
        const hint = fail?.error ? ` — ${fail.error}` : ''
        setToast({ msg: `${passed}/${total} passed${hint}`, type: 'error' })
      }
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.response?.data?.details || 'Failed to execute'
      setToast({ msg: String(msg).slice(0,120), type: 'error' })
    } finally {
      setIsExecuting(false)
    }
  }

  const onRunCustom = async () => {
    if (!customInput.trim()) {
      setToast({ msg: 'Enter custom input first', type: 'info' })
      return
    }
    if (!code.trim()) {
      setToast({ msg: 'Write code before running', type: 'error' })
      return
    }
    setCustomOutput(null)
    setCustomError(null)
    try {
      setIsExecuting(true)
      attemptCountRef.current++
      const res = await api.post('/runner/execute', {
        code,
        language: selectedLanguage,
        testcases: [{ input: customInput, output: '' }]
      })
      const first = (res.data.results || [])[0]
      if (first) {
        // For custom, show stdout regardless of passed; only show error if stderr present
        setCustomOutput(first.output ?? 'No output')
        if (first.error) {
          // ignore "No output" pseudo-error, only real errors
          const isRealError = !String(first.error).includes('No output') && first.output !== 'No output' ? first.error : null
          // Actually if output is Compilation error etc, it's in output, not error
          if (isRealError) setCustomError(first.error)
          else if (first.output === 'Compilation error' || first.output === 'Runtime error' || first.output === 'Time limit exceeded') {
            setCustomError(first.output + (first.error ? ': '+first.error : ''))
          }
        }
        // also handle case where Judge0 returns stderr as error but output is stdout
        if (first.passed === false && first.error && !first.output) {
          setCustomError(first.error)
        }
      } else {
        setCustomOutput('No output')
      }
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Execution failed'
      setCustomError(String(msg))
    } finally {
      setIsExecuting(false)
    }
  }

  const onSubmit = async () => {
    if (!problems[currentProblemIndex] || isSubmitted) return
    
    try {
      const res = await api.post('/assessments/submit', {
        assessmentId,
        problemId: problems[currentProblemIndex]._id,
        code,
        language: selectedLanguage,
        results: executionResults,
        timeTakenSec: getElapsedSeconds(),
        problemTimeSec: getProblemElapsedSeconds(),
        keystrokes: keystrokesRef.current,
        pasteEvents: pasteEventsRef.current,
        activeTypingSec: Math.round(activeTypingMsRef.current / 1000),
        kpm: getKpm(),
        attempts: attemptCountRef.current,
        avgExecMs: lastExecMsRef.current.length > 0
          ? Math.round(lastExecMsRef.current.reduce((a,b)=>a+b,0) / lastExecMsRef.current.length)
          : 0,
        security: {
          tabSwitches: blurCountRef.current,
          fullscreenExits: fullscreenExitCountRef.current
        }
      })
      
      setIsSubmitted(true)
      // If there is another problem, move to it instead of ending the test
      const hasNext = currentProblemIndex < problems.length - 1
      if (hasNext) {
        setToast({ msg: `Problem ${currentProblemIndex + 1} submitted. Moving to next problem...`, type: 'success' })
        // Small delay so user sees the toast
        setTimeout(() => {
          nextProblem()
        }, 400)
      } else {
        setToast({ msg: `All problems submitted!`, type: 'success' })
        // Finish the assessment (same behavior as before for last problem)
        setTimeout(() => window.location.replace('/'), 800)
      }
    } catch (e) {
      console.error('Failed to submit:', e)
      setToast({ msg: 'Failed to submit. Please try again.', type: 'error' })
    }
  }

  const nextProblem = () => {
    if (currentProblemIndex < problems.length - 1) {
      const nextIdx = currentProblemIndex + 1
      setCurrentProblemIndex(nextIdx)
      const tpl = generateCodeTemplate(selectedLanguage, problems[nextIdx])
      setCode(tpl)
      setCodeByLang({ [selectedLanguage]: tpl })
      setExecutionResults([])
      setCustomOutput(null); setCustomError(null)
      setIsSubmitted(false)
      resetProblemTiming()
    }
  }

  const prevProblem = () => {
    if (currentProblemIndex > 0) {
      const prevIdx = currentProblemIndex - 1
      setCurrentProblemIndex(prevIdx)
      const tpl = generateCodeTemplate(selectedLanguage, problems[prevIdx])
      setCode(tpl)
      setCodeByLang({ [selectedLanguage]: tpl })
      setExecutionResults([])
      setCustomOutput(null); setCustomError(null)
      setIsSubmitted(false)
      resetProblemTiming()
    }
  }

  const detectProblemShape = (problem?: Problem): 'twosum' | 'array' | 'number' | 'generic' => {
    const first = (problem?.visible_testcases?.[0]?.input || problem?.examples?.[0]?.input || '').trim()
    if (!first) return 'generic'
    try {
      const p = JSON.parse(first)
      if (Array.isArray(p)) {
        if (p.length === 2 && Array.isArray(p[0])) return 'twosum'
        return 'array'
      }
      if (typeof p === 'number') return 'number'
      return 'generic'
    } catch {
      const m = first.match(/^(\[.*\]),\s*(.+)$/)
      if (m) return 'twosum'
      if (/^\[.*\]$/.test(first)) return 'array'
      if (/^-?\d+$/.test(first)) return 'number'
      return 'generic'
    }
  }

  const generateCodeTemplate = (lang: string, problem?: Problem) => {
    const problemName = problem?.title || 'Problem'
    const shape = detectProblemShape(problem)

    switch (lang) {
      case 'javascript':
        if (shape === 'number') return `// ${problemName}
function solution(n) {
  // Your code here
  return 0;
}`
        if (shape === 'array') return `// ${problemName}
function solution(nums) {
  // Your code here
  return [];
}`
        return `// ${problemName}
function solution(nums, target) {
  // Your code here
  return [];
}`

      case 'typescript':
        if (shape === 'number') return `// ${problemName}
function solution(n: number): number {
  // Your code here
  return 0;
}`
        if (shape === 'array') return `// ${problemName}
function solution(nums: number[]): number[] {
  // Your code here
  return [];
}`
        return `// ${problemName}
function solution(nums: number[], target: number): number[] {
  // Your code here
  return [];
}`

      case 'python':
        if (shape === 'number') return `# ${problemName}
def solution(n):
    # Your code here
    return 0`
        if (shape === 'array') return `# ${problemName}
def solution(nums):
    # Your code here
    return []`
        return `# ${problemName}
def solution(nums, target):
    # Your code here
    return []`

      case 'java':
        if (shape === 'number') return `// ${problemName}
import java.util.*; import java.io.*; import java.util.stream.Collectors;
public class Main {
    // Implement your logic here
    public static long solution(long n) {
        // Your code here
        return 0;
    }
    public static void main(String[] args) throws Exception {
        BufferedReader br=new BufferedReader(new InputStreamReader(System.in));
        String input=br.lines().collect(Collectors.joining()).trim();
        if(input.isEmpty()) return;
        long n=Long.parseLong(input.trim());
        System.out.print(solution(n));
    }
}`
        if (shape === 'array') return `// ${problemName}
import java.util.*; import java.io.*; import java.util.stream.Collectors;
public class Main {
    // Implement your logic here
    public static long[] solution(long[] nums) {
        // Your code here
        return new long[]{};
    }
    public static void main(String[] args) throws Exception {
        BufferedReader br=new BufferedReader(new InputStreamReader(System.in));
        String input=br.lines().collect(Collectors.joining()).trim();
        if(input.isEmpty()) return;
        String inner=input.substring(1, input.length()-1).trim();
        String[] p = inner.isEmpty() ? new String[0] : inner.split(",");
        long[] nums=new long[p.length];
        for(int i=0;i<p.length;i++) nums[i]=Long.parseLong(p[i].trim());
        long[] ans=solution(nums);
        System.out.print(Arrays.toString(ans).replace(" ", ""));
    }
}`
        return `// ${problemName} — read JSON [nums, target] from STDIN, print result as JSON
import java.util.*; import java.io.*; import java.util.stream.Collectors;
public class Main {
    // Implement your logic here
    public static int[] solution(int[] nums, int target) {
        // Your code here
        Map<Integer,Integer> m=new HashMap<>();
        for(int i=0;i<nums.length;i++){
            int need=target-nums[i];
            if(m.containsKey(need)) return new int[]{m.get(need), i};
            m.put(nums[i], i);
        }
        return new int[]{};
    }
    public static void main(String[] args) throws Exception {
        BufferedReader br=new BufferedReader(new InputStreamReader(System.in));
        String input=br.lines().collect(Collectors.joining()).trim();
        if(input.isEmpty()) return;
        // Parse JSON: [[2,7,11,15],9]
        try{
            // naive JSON parse for [nums, target]
            String inner=input.substring(1, input.length()-1).trim(); // strip outer [ ]
            // find split between nums array and target: last "],"
            int split=inner.lastIndexOf("],");
            String numsStr, targetStr;
            if(split!=-1){
                numsStr=inner.substring(0, split+1).trim();
                targetStr=inner.substring(split+2).trim();
            } else {
                // fallback: split by comma
                int comma=inner.lastIndexOf(",");
                numsStr=inner.substring(0, comma).trim();
                targetStr=inner.substring(comma+1).trim();
            }
            numsStr=numsStr.substring(1, numsStr.length()-1).trim(); // remove [ ]
            int[] nums;
            if(numsStr.isEmpty()) nums=new int[0];
            else{
                String[] p=numsStr.split(",");
                nums=new int[p.length];
                for(int i=0;i<p.length;i++) nums[i]=Integer.parseInt(p[i].trim());
            }
            int target=Integer.parseInt(targetStr);
            int[] ans=solution(nums, target);
            System.out.print(Arrays.toString(ans).replace(" ", "")); // JSON-like without spaces e.g. [0,1]
        }catch(Exception e){ System.err.print(e.getMessage()); System.exit(1); }
    }
}`

      case 'cpp':
        if (shape === 'number') return `// ${problemName}
#include <iostream>
#include <string>
#include <sstream>
using namespace std;
// Your logic here
long long solution(long long n){
    // Your code here
    return 0;
}
int main(){
    ios::sync_with_stdio(false); cin.tie(nullptr);
    string all, line;
    while(getline(cin, line)) all+=line;
    stringstream ss(all); long long n; ss>>n;
    cout<<solution(n);
    return 0;
}`
        if (shape === 'array') return `// ${problemName}
#include <iostream>
#include <vector>
#include <string>
#include <sstream>
using namespace std;
// Your logic here
vector<long long> solution(vector<long long>& nums){
    // Your code here
    return {};
}
int main(){
    ios::sync_with_stdio(false); cin.tie(nullptr);
    string all, line;
    while(getline(cin, line)) all+=line;
    auto trim=[](string s){ size_t a=s.find_first_not_of(" \\t\\n\\r"); if(a==string::npos) return string(""); size_t b=s.find_last_not_of(" \\t\\n\\r"); return s.substr(a,b-a+1); };
    all=trim(all);
    if(all.empty()) return 0;
    string inner=all.substr(1, all.size()-2);
    vector<long long> nums;
    if(!inner.empty()){
        stringstream ss(inner); string tok;
        while(getline(ss, tok, ',')){ try{ nums.push_back(stoll(trim(tok))); }catch(...){} }
    }
    auto ans=solution(nums);
    cout<<"[";
    for(size_t i=0;i<ans.size();i++){ if(i) cout<<","; cout<<ans[i]; }
    cout<<"]";
    return 0;
}`
        return `// ${problemName} — read JSON [nums, target] from STDIN, print result
#include <iostream>
#include <vector>
#include <unordered_map>
#include <string>
#include <sstream>
#include <algorithm>
using namespace std;
// Your logic here
vector<int> solution(vector<int>& nums, int target){
    unordered_map<int,int> m;
    for(int i=0;i<(int)nums.size();i++){
        int need=target-nums[i];
        if(m.count(need)) return {m[need], i};
        m[nums[i]]=i;
    }
    return {};
}
int main(){
    ios::sync_with_stdio(false); cin.tie(nullptr);
    string all, line;
    while(getline(cin, line)) all+=line;
    auto trim=[](string s){ size_t a=s.find_first_not_of(" \\t\\n\\r"); if(a==string::npos) return string(""); size_t b=s.find_last_not_of(" \\t\\n\\r"); return s.substr(a,b-a+1); };
    all=trim(all);
    if(all.empty()) return 0;
    try{
        string inner=all.substr(1, all.size()-2);
        size_t split=inner.rfind("],");
        string numsStr, targetStr;
        if(split!=string::npos){ numsStr=trim(inner.substr(0, split+1)); targetStr=trim(inner.substr(split+2)); }
        else { size_t c=inner.rfind(","); numsStr=trim(inner.substr(0,c)); targetStr=trim(inner.substr(c+1)); }
        numsStr=trim(numsStr.substr(1, numsStr.size()-2));
        vector<int> nums;
        if(!numsStr.empty()){
            stringstream ss(numsStr); string tok;
            while(getline(ss, tok, ',')) nums.push_back(stoi(trim(tok)));
        }
        int target=stoi(targetStr);
        vector<int> ans=solution(nums, target);
        cout<<"[";
        for(size_t i=0;i<ans.size();i++){ if(i) cout<<","; cout<<ans[i]; }
        cout<<"]";
    }catch(exception &e){ cerr<<e.what(); return 1; }
    return 0;
}`

      case 'csharp':
        if (shape === 'number') return `// ${problemName}
using System; using System.Linq;
class Program{
    static long Solution(long n){
        // Your code here
        return 0;
    }
    static void Main(){
        string input=Console.In.ReadToEnd().Trim();
        if(string.IsNullOrEmpty(input)) return;
        long n=long.Parse(input.Trim());
        Console.Write(Solution(n));
    }
}`
        if (shape === 'array') return `// ${problemName}
using System; using System.Linq;
class Program{
    static long[] Solution(long[] nums){
        // Your code here
        return new long[0];
    }
    static void Main(){
        string input=Console.In.ReadToEnd().Trim();
        if(string.IsNullOrEmpty(input)) return;
        string inner=input.Substring(1, input.Length-2).Trim();
        long[] nums = inner.Length==0 ? new long[0] : inner.Split(',').Select(s=>long.Parse(s.Trim())).ToArray();
        var ans=Solution(nums);
        Console.Write("["+string.Join(",", ans)+"]");
    }
}`
        return `// ${problemName} — read JSON [nums, target] from STDIN
using System; using System.Linq; using System.Collections.Generic;
class Program{
    static int[] Solution(int[] nums, int target){
        // Your code here
        var m=new Dictionary<int,int>();
        for(int i=0;i<nums.Length;i++){
            int need=target-nums[i];
            if(m.ContainsKey(need)) return new int[]{m[need], i};
            m[nums[i]]=i;
        }
        return new int[]{};
    }
    static void Main(){
        string input=Console.In.ReadToEnd().Trim();
        if(string.IsNullOrEmpty(input)) return;
        try{
            string inner=input.Substring(1, input.Length-2).Trim();
            int split=inner.LastIndexOf("],");
            string numsStr, targetStr;
            if(split!=-1){ numsStr=inner.Substring(0, split+1).Trim(); targetStr=inner.Substring(split+2).Trim(); }
            else{ int c=inner.LastIndexOf(","); numsStr=inner.Substring(0,c).Trim(); targetStr=inner.Substring(c+1).Trim(); }
            numsStr=numsStr.Substring(1, numsStr.Length-2).Trim();
            int[] nums = numsStr.Length==0 ? new int[0] : numsStr.Split(',').Select(s=>int.Parse(s.Trim())).ToArray();
            int target=int.Parse(targetStr);
            var ans=Solution(nums, target);
            Console.Write("["+string.Join(",", ans)+"]");
        }catch(Exception e){ Console.Error.Write(e.Message); Environment.Exit(1); }
    }
}`

      case 'php':
        if (shape === 'number') return `<?php
// ${problemName}
function solution($n) {
    // Your code here
    return 0;
}
?>`
        if (shape === 'array') return `<?php
// ${problemName}
function solution($nums) {
    // Your code here
    return [];
}
?>`
        return `<?php
// ${problemName}
function solution($nums, $target) {
    // Your code here
    return [];
}
?>`

      case 'ruby':
        if (shape === 'number') return `# ${problemName}
def solution(n)
  # Your code here
  0
end`
        if (shape === 'array') return `# ${problemName}
def solution(nums)
  # Your code here
  []
end`
        return `# ${problemName}
def solution(nums, target)
  # Your code here
  []
end`

      case 'go':
        if (shape === 'number') return `// ${problemName}
func solution(n int64) int64 {
    // Your code here
    return 0
}`
        if (shape === 'array') return `// ${problemName}
func solution(nums []int64) []int64 {
    // Your code here
    return []int64{}
}`
        return `// ${problemName}
func solution(nums []int, target int) []int {
    // Your code here
    return []int{}
}`

      case 'rust':
        return `// ${problemName}
pub fn solution(input: Vec<i64>) -> Vec<i64> {
    // Your code here
    vec![]
}`

      case 'swift':
        return `// ${problemName}
func solution(_ nums: [Int], _ target: Int) -> [Int] {
    // Your code here
    return []
}`

      case 'kotlin':
        return `// ${problemName}
fun solution(nums: IntArray, target: Int): IntArray {
    // Your code here
    return intArrayOf()
}`

      case 'html':
        return `<!-- ${problemName} -- HTML is markup, not DSA logic -->
<!-- For DSA, use JS/Python. For HTML preview, this code will be returned as output -->
<div>Hello CodeFeast</div>
<!-- This will be echoed as output for HTML language -->`

      default:
        return `// ${problemName}
function solution(input) {
  // Your code here
  return input;
}`
    }
  }

  const handleCodeChange = (val: string) => {
    setCode(val)
    setCodeByLang(prev => ({ ...prev, [selectedLanguage]: val }))
  }

  const handleLanguageChange = (newLanguage: string) => {
    // save current language code
    setCodeByLang(prev => ({ ...prev, [selectedLanguage]: code }))
    const existing = codeByLang[newLanguage]
    if (existing && existing.trim().length>0) {
      setCode(existing)
    } else {
      setCode(generateCodeTemplate(newLanguage, problems[currentProblemIndex]))
    }
    setSelectedLanguage(newLanguage)
  }

  const getCustomPlaceholder = () => {
    const prob = problems[currentProblemIndex]
    const ex = prob?.examples?.[0]?.input || prob?.visible_testcases?.[0]?.input
    if (ex) {
      // For JS/Python the input is JSON [nums, target]; for Java/CPP same JSON via stdin
      return `Example: ${ex}\n\nEnter custom input as shown above.\nFor Two Sum style: [[2,7,11,15], 9]\nFor Product Except Self: [1,2,3,4]\nLeave empty expected — just shows output.`
    }
    return `Enter custom input (JSON).\nExample for Two Sum: [[2,7,11,15], 9]\nThe runner passes this as STDIN.`
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-8 bg-surface rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-surface rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-surface rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-rose-400 text-lg">{error}</div>
      </div>
    )
  }

  const currentProblem = problems[currentProblemIndex]

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Exam Top Bar - minimal, sticky, edge-to-edge, only workspace */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white grid place-items-center font-bold text-xs">CF</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">{assessment ? assessment.title : 'Assessment'}</div>
              <div className="text-xs text-slate-500 truncate hidden sm:block">{assessment ? assessment.description : 'Secure exam workspace'}</div>
            </div>
            <span className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${document.fullscreenElement ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${document.fullscreenElement ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {document.fullscreenElement ? 'Fullscreen' : 'Fullscreen required'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <div className="text-lg font-mono font-semibold text-slate-900 leading-none">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</div>
              <div className="text-xs text-slate-500">Time left</div>
            </div>
            <div className="sm:hidden text-sm font-mono font-semibold text-slate-900">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</div>
            <button onClick={handleEndTest} className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium shadow-sm">End Test</button>
          </div>
        </div>
        {/* Compact security bar */}
        <div className="border-t border-slate-100 bg-slate-50/50">
          <div className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-slate-500">Fullscreen <b className={fullscreenExits>=2 ? 'text-amber-600' : 'text-slate-900'}>{fullscreenExits}/3</b></span>
            <span className="hidden sm:inline w-px h-3 bg-slate-200" />
            <span className="text-slate-500">Tabs <b className={blurCount>=3 ? 'text-amber-600' : 'text-slate-900'}>{blurCount}/5</b></span>
            <span className="hidden sm:inline w-px h-3 bg-slate-200" />
            <span className={`inline-flex items-center gap-1 font-medium ${securityViolationRef.current ? 'text-rose-600' : 'text-emerald-600'}`}>● {securityViolationRef.current ? 'VIOLATED' : 'SECURE'}</span>
            <span className="ml-auto font-mono text-slate-600">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')} left</span>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto p-4 md:p-6 space-y-6">
        {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Security Warnings */}
      {securityWarnings.length > 0 && (
        <div className="glass-card neon-border p-4 border-l-4 border-amber-400">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-amber-400">Security Warnings</h3>
            <span className="text-xs text-amber-300 bg-amber-500/20 px-2 py-1 rounded">
              {securityWarnings.length} warning{securityWarnings.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {securityWarnings.slice(-8).map((warning, index) => (
              <div key={index} className={`text-sm ${
                warning.includes('SECURITY VIOLATION') 
                  ? 'text-rose-400 font-semibold' 
                  : 'text-amber-300'
              }`}>
                {warning.includes('SECURITY VIOLATION') ? '🚨 ' : '⚠️ '}
                {warning}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Exam Grid — Odoo/Nike split */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Problem */}
        <div className="space-y-6 lg:sticky lg:top-[104px] lg:h-fit">
          {problems.length > 1 && (
            <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between">
              <button onClick={prevProblem} disabled={currentProblemIndex === 0} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm disabled:opacity-40 hover:bg-slate-50">← Previous</button>
              <div className="text-sm font-medium text-slate-700">Problem {currentProblemIndex + 1} of {problems.length}</div>
              <button onClick={nextProblem} disabled={currentProblemIndex === problems.length - 1} className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm disabled:opacity-40 hover:bg-black">Next →</button>
            </div>
          )}
          {currentProblem && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900">{currentProblem.title}</h2>
              <div className="prose max-w-none prose-slate mt-3">
                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed text-sm">{currentProblem.statement}</p>
                {currentProblem.constraints && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                    <h3 className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Constraints</h3>
                    <p className="text-sm text-slate-700 mt-1">{currentProblem.constraints}</p>
                  </div>
                )}
                {currentProblem.examples && currentProblem.examples.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Example</h3>
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-sm">
                      <div><span className="font-semibold text-slate-900">Input:</span> <span className="text-slate-700">{currentProblem.examples[0].input}</span></div>
                      <div className="mt-1"><span className="font-semibold text-slate-900">Output:</span> <span className="text-slate-700">{currentProblem.examples[0].output}</span></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Sample Tests + Custom Input Tabs — below sample test as requested */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-200">
              <button onClick={()=>setActiveTab('sample')} className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab==='sample' ? 'bg-white text-slate-900 border-b-2 border-slate-900 -mb-px' : 'bg-slate-50 text-slate-500 hover:text-slate-700'}`}>Sample Tests</button>
              <button onClick={()=>setActiveTab('custom')} className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab==='custom' ? 'bg-white text-slate-900 border-b-2 border-slate-900 -mb-px' : 'bg-slate-50 text-slate-500 hover:text-slate-700'}`}>Custom Input</button>
            </div>
            <div className="p-5">
              {activeTab === 'sample' ? (
                <>
                  {currentProblem && currentProblem.visible_testcases && currentProblem.visible_testcases.length >0 ? (
                    <div className="space-y-2">
                      {currentProblem.visible_testcases.slice(0,3).map((tc, i)=>(
                        <div key={i} className="flex items-center gap-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                          <span className="text-slate-500">#{i+1}</span>
                          <span className="truncate">in: {tc.input}</span>
                          <span className="ml-auto text-slate-400">→</span>
                          <span className="truncate">{tc.output}</span>
                        </div>
                      ))}
                      {currentProblem.visible_testcases.length>3 && <div className="text-xs text-slate-400 text-center">+{currentProblem.visible_testcases.length-3} more hidden</div>}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">No sample tests for this problem</div>
                  )}
                </>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-500">Run with your own <b className="text-slate-700">STDIN</b> — e.g. <code className="bg-slate-100 border rounded px-1">[[2,7,11,15], 9]</code></p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600">{selectedLanguage}</span>
                  </div>
                  <textarea value={customInput} onChange={(e) => setCustomInput(e.target.value)} placeholder={getCustomPlaceholder()} className="w-full h-28 bg-white border border-slate-200 rounded-lg p-3 font-mono text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10" aria-label="Custom input" />
                  <div className="flex gap-2 mt-3">
                    <button onClick={onRunCustom} disabled={isExecuting || !customInput.trim()} className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-sm font-medium disabled:opacity-40">Run with Input</button>
                    <button onClick={() => { setCustomInput(''); setCustomOutput(null); setCustomError(null) }} className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm">Clear</button>
                    {customOutput !== null && <button onClick={()=> navigator.clipboard.writeText(customOutput || '')} className="ml-auto px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm">Copy</button>}
                  </div>
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Output</div>
                    <pre className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm font-mono whitespace-pre-wrap break-all min-h-[56px]">{customOutput ?? '—'}</pre>
                    {customError && <div className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 whitespace-pre-wrap break-all">Error: {customError}</div>}
                    {customOutput && !customError && <div className="mt-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">✓ Executed — not judged</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Editor + Results */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Your Solution</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSuggestionsEnabled(s => !s)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${suggestionsEnabled ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  title="Toggle autocomplete / intellisense"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {suggestionsEnabled ? 'Autocomplete On' : 'Autocomplete Off'}
                </button>
                <select value={selectedLanguage} onChange={(e) => handleLanguageChange(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10">
                  <option value="javascript">JavaScript</option>
                  <option value="typescript">TypeScript</option>
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                  <option value="cpp">C++</option>
                  <option value="csharp">C#</option>
                  <option value="go">Go</option>
                  <option value="ruby">Ruby</option>
                  <option value="php">PHP</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={onRun} disabled={isSubmitted || isExecuting} className="flex-1 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 rounded-lg text-sm font-medium disabled:opacity-40"> {isExecuting ? 'Running...' : 'Run Code'}</button>
              <button onClick={onSubmit} disabled={isSubmitted} className="flex-1 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-sm font-medium disabled:opacity-40">{isSubmitted ? 'Submitted' : 'Submit Solution'}</button>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <Editor value={code} onChange={handleCodeChange} language={selectedLanguage} height="420px" suggestionsEnabled={suggestionsEnabled} onStats={handleEditorStats} />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-900">Test Results</h3>
            {executionResults.length === 0 ? (
              <div className="text-sm text-slate-500 mt-3 py-8 text-center border border-dashed border-slate-200 rounded-lg">Run the code to see results. Use Custom Input tab for your own cases.</div>
            ) : (
              <div className="space-y-2 mt-3">
                {executionResults.map((result, index) => (
                  <div key={index} className={`p-3 rounded-xl border text-xs ${result.passed ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-bold ${result.passed ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>{result.passed ? '✓' : '✗'}</span>
                      <span className="text-sm font-medium text-slate-900">Test Case {index + 1}</span>
                      <span className="ml-auto font-mono text-slate-500 truncate">in: {String(result.testcase ?? result.input ?? '').slice(0,40)}</span>
                    </div>
                    <div className="mt-2 font-mono bg-white border border-slate-200 rounded-lg p-2 break-all">
                      <span className="text-slate-500">Output:</span> <span className="text-slate-900">{String(result.output)}</span>
                    </div>
                    {!result.passed && (
                      <div className="mt-1 font-mono bg-white border border-slate-200 rounded-lg p-2 break-all">
                        <span className="text-slate-500">Expected:</span> <span className="text-slate-900">{String(result.expected)}</span>
                      </div>
                    )}
                    {result.error && <div className="mt-1 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 break-all">⚠ {String(result.error).slice(0,200)}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm End Test */}
      <ConfirmModal
        open={showEndConfirm}
        title="End Test"
        message="Are you sure you want to end this assessment? This action cannot be undone."
        confirmText="End Test"
        cancelText="Cancel"
        onConfirm={confirmEndTest}
        onCancel={() => setShowEndConfirm(false)}
      />
      </div>
    </div>
  )
}
