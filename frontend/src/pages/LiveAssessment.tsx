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

  const getElapsedSeconds = () => {
    const elapsedMs = Date.now() - assessmentStartAtRef.current
    return Math.max(0, Math.floor(elapsedMs / 1000))
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
      // init code for first problem with current language
      const firstTitle = assessmentProblems[0]?.title
      const tpl = generateCodeTemplate(selectedLanguage, firstTitle)
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
      const tpl = generateCodeTemplate(selectedLanguage, prob?.title)
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
      const res = await api.post('/runner/execute', {
        code,
        language: selectedLanguage,
        testcases: tcs
      })
      
      const results = res.data.results || []
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
      const tpl = generateCodeTemplate(selectedLanguage, problems[nextIdx]?.title)
      setCode(tpl)
      setCodeByLang({ [selectedLanguage]: tpl })
      setExecutionResults([])
      setCustomOutput(null); setCustomError(null)
      setIsSubmitted(false)
    }
  }

  const prevProblem = () => {
    if (currentProblemIndex > 0) {
      const prevIdx = currentProblemIndex - 1
      setCurrentProblemIndex(prevIdx)
      const tpl = generateCodeTemplate(selectedLanguage, problems[prevIdx]?.title)
      setCode(tpl)
      setCodeByLang({ [selectedLanguage]: tpl })
      setExecutionResults([])
      setCustomOutput(null); setCustomError(null)
      setIsSubmitted(false)
    }
  }

  const generateCodeTemplate = (lang: string, problemTitle?: string) => {
    const problemName = problemTitle || 'Two Sum'
    
    switch (lang) {
      case 'javascript':
        return `// ${problemName}
function solution(nums, target) {
  // Your code here
  return [];
}`

      case 'typescript':
        return `// ${problemName}
function solution(nums: number[], target: number): number[] {
  // Your code here
  return [];
}`

      case 'python':
        return `# ${problemName}
def solution(nums, target):
    # Your code here
    return []`

      case 'java':
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
        return `<?php
// ${problemName}
function solution($nums, $target) {
    // Your code here
    return [];
}
?>`

      case 'ruby':
        return `# ${problemName}
def solution(nums, target)
  # Your code here
  []
end`

      case 'go':
        return `// ${problemName}
package main
func solution(nums []int, target int) []int {
    // Your code here
    return []int{}
}`

      case 'rust':
        return `// ${problemName}
pub fn solution(nums: Vec<i32>, target: i32) -> Vec<i32> {
    // Your code here
    vec![]
}`

      case 'swift':
        return `// ${problemName}
class Solution {
    func solution(_ nums: [Int], _ target: Int) -> [Int] {
        // Your code here
        return []
    }
}`

      case 'kotlin':
        return `// ${problemName}
class Solution {
    fun solution(nums: IntArray, target: Int): IntArray {
        // Your code here
        return intArrayOf()
    }
}`

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
      setCode(generateCodeTemplate(newLanguage, problems[currentProblemIndex]?.title))
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
    <div className="space-y-6">
      {toast && (
        <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}
      {/* Assessment Header */}
      {assessment && (
        <div className="glass-card neon-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{assessment.title}</h1>
              <p className="text-textSecondary">{assessment.description}</p>
            </div>
            <div className="flex items-center gap-4">
              {/* Fullscreen Status */}
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${document.fullscreenElement ? 'bg-green-400' : 'bg-rose-400'}`}></div>
                <span className="text-sm">
                  {document.fullscreenElement ? 'Fullscreen Active' : 'Fullscreen Required'}
                </span>
              </div>
              
              <div className="text-right">
                <div className="text-2xl font-mono text-accentPrimary">
                  {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                </div>
                <div className="text-sm text-textSecondary">Time Remaining</div>
              </div>
              <button
                onClick={handleEndTest}
                className="px-4 py-2 bg-rose-500/80 hover:bg-rose-500 rounded-md text-white font-medium"
              >
                End Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security Status Summary */}
      <div className="glass-card neon-border p-4 mb-4">
        <h3 className="text-lg font-semibold mb-3">Security Status Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-textSecondary">Fullscreen Exits:</span>
            <span className={`ml-2 font-mono ${fullscreenExits >= 3 ? 'text-rose-400' : 'text-textPrimary'}`}>
              {fullscreenExits}/3
            </span>
          </div>
          <div>
            <span className="text-textSecondary">Tab Switches:</span>
            <span className={`ml-2 font-mono ${blurCount >= 5 ? 'text-rose-400' : 'text-textPrimary'}`}>
              {blurCount}/5
            </span>
          </div>
          <div>
            <span className="text-textSecondary">Status:</span>
            <span className={`ml-2 font-mono ${securityViolationRef.current ? 'text-rose-400' : 'text-green-400'}`}>
              {securityViolationRef.current ? 'VIOLATED' : 'SECURE'}
            </span>
          </div>
          <div>
            <span className="text-textSecondary">Time Left:</span>
            <span className="ml-2 font-mono text-textPrimary">
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>

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

      {/* Problem Navigation */}
      {problems.length > 1 && (
        <div className="glass-card neon-border p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={prevProblem}
              disabled={currentProblemIndex === 0}
              className="px-3 py-1 bg-surface disabled:opacity-50 rounded"
            >
              ← Previous
            </button>
            <div className="text-sm text-textSecondary">
              Problem {currentProblemIndex + 1} of {problems.length}
            </div>
            <button
              onClick={nextProblem}
              disabled={currentProblemIndex === problems.length - 1}
              className="px-3 py-1 bg-surface disabled:opacity-50 rounded"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Problem Statement */}
      {currentProblem && (
        <div className="glass-card neon-border p-6">
          <h2 className="text-xl font-semibold mb-4">{currentProblem.title}</h2>
          <div className="prose max-w-none prose-slate">
            <p className="text-slate-700 whitespace-pre-wrap mb-4 leading-relaxed">{currentProblem.statement}</p>
            
            {currentProblem.constraints && (
              <div className="mb-4">
                <h3 className="font-semibold text-warmAccent mb-2">Constraints:</h3>
                <p className="text-textSecondary">{currentProblem.constraints}</p>
              </div>
            )}
            
            {currentProblem.examples && currentProblem.examples.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-warmAccent mb-2">Example:</h3>
                <div className="bg-surface/50 p-3 rounded">
                  <div className="text-sm">
                    <span className="font-medium">Input:</span> {currentProblem.examples[0].input}
                  </div>
                  <div className="text-sm mt-1">
                    <span className="font-medium">Output:</span> {currentProblem.examples[0].output}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Code Editor */}
      <div className="glass-card neon-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Your Solution</h3>
          <div className="flex items-center gap-4">
            <select
              value={selectedLanguage}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="bg-surface border border-borderToken rounded px-3 py-1"
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
              <option value="csharp">C#</option>
            </select>
            <button
              onClick={onRun}
              disabled={isSubmitted || isExecuting}
              className="px-4 py-2 bg-accentSecondary/80 hover:bg-accentSecondary disabled:opacity-50 rounded"
            >
              {isExecuting ? 'Running...' : 'Run Code'}
            </button>
            <button
              onClick={onSubmit}
              disabled={isSubmitted}
              className="px-4 py-2 bg-accentPrimary/80 hover:bg-accentPrimary disabled:opacity-50 rounded"
            >
              {isSubmitted ? 'Submitted' : 'Submit Solution'}
            </button>
          </div>
        </div>
        
        <Editor
          value={code}
          onChange={handleCodeChange}
          language={selectedLanguage}
          height="400px"
        />
      </div>

      {/* Execution Results */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass-card neon-border p-6">
          <h3 className="text-lg font-semibold mb-4">Test Results</h3>
          {executionResults.length === 0 ? (
            <div className="text-sm text-textSecondary">Run the code to see results.</div>
          ) : (
            <div className="space-y-2">
              {executionResults.map((result, index) => (
                <div key={index} className={`p-3 rounded border ${result.passed ? 'bg-green-500/10 border-green-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
                  <div className="flex items-center gap-2">
                    <span className={result.passed ? 'text-green-400' : 'text-rose-400'}>
                      {result.passed ? '✓' : '✗'}
                    </span>
                    <span className="text-sm font-medium">Test Case {index + 1}</span>
                    <span className="ml-auto text-xs text-textSecondary truncate">in: {String(result.testcase ?? result.input ?? '').slice(0,60)}</span>
                  </div>
                  <div className="text-xs font-mono mt-2 break-all bg-surface/50 rounded p-1.5">
                    <span className="text-textSecondary">Output:</span> {String(result.output)}
                  </div>
                  {!result.passed && (
                    <>
                      <div className="text-xs font-mono mt-1 break-all bg-surface/50 rounded p-1.5">
                        <span className="text-textSecondary">Expected:</span> {String(result.expected)}
                      </div>
                      {result.error && (
                        <div className="text-xs text-amber-300 mt-1 break-all">Error: {String(result.error).slice(0,300)}</div>
                      )}
                      <div className="text-[11px] text-textSecondary mt-1">Note: comparison is JSON &amp; whitespace tolerant (e.g. [0,1] ≈ [0, 1]).</div>
                    </>
                  )}
                  {result.passed && result.error && (
                    <div className="text-xs text-amber-300 mt-1">Warning: {String(result.error).slice(0,200)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card neon-border p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Custom Input</h3>
            <span className="text-xs text-textSecondary border border-borderToken rounded px-2 py-0.5">{selectedLanguage}</span>
          </div>
          <p className="text-xs text-textSecondary mb-2">
            Runs your current code with <b>STDIN</b> = your input. For <code>solution(nums,target)</code> problems, use JSON like <code>[[2,7,11,15], 9]</code>. See example above.
          </p>
          <textarea
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder={getCustomPlaceholder()}
            className="w-full h-28 bg-surface border border-borderToken rounded p-2 mb-3 font-mono text-sm"
            aria-label="Custom input"
          />
          <div className="flex gap-2 mb-3">
            <button onClick={onRunCustom} disabled={isExecuting || !customInput.trim()} className="px-3 py-1.5 bg-accentSecondary/80 hover:bg-accentSecondary disabled:opacity-50 rounded text-sm">
              {isExecuting ? 'Running...' : 'Run with Input'}
            </button>
            <button onClick={() => { setCustomInput(''); setCustomOutput(null); setCustomError(null) }} className="px-3 py-1.5 bg-surface rounded border border-borderToken text-sm">Clear</button>
            {customOutput !== null && (
              <button onClick={()=> navigator.clipboard.writeText(customOutput || '')} className="ml-auto px-3 py-1.5 bg-surface rounded border border-borderToken text-sm">Copy output</button>
            )}
          </div>
          <div>
            <div className="text-sm font-medium mb-1 flex items-center gap-2">
              Output
              {customOutput === null ? <span className="text-xs text-textSecondary">(no run yet)</span> : null}
            </div>
            <pre className="bg-surface/50 rounded p-3 text-xs whitespace-pre-wrap break-all min-h-[56px] border border-borderToken overflow-x-auto">{customOutput ?? '—'}</pre>
            {customError && (
              <div className="text-xs text-rose-300 mt-2 whitespace-pre-wrap break-all border border-rose-500/30 bg-rose-500/10 rounded p-2">Error: {customError}</div>
            )}
            {customOutput && !customError && (
              <div className="text-xs text-emerald-300 mt-2">✓ Executed — output shown above (not judged against expected).</div>
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
  )
}
