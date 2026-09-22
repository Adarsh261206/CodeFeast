import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawn, spawnSync } from 'child_process'
import vm from 'node:vm'
import * as ts from 'typescript'

function outputsEqual(a: string, b: string): boolean {
  const sa = String(a ?? '').trim()
  const sb = String(b ?? '').trim()
  if (sb === '') return true
  try {
    const ja = JSON.parse(sa)
    const je = JSON.parse(sb)
    return JSON.stringify(ja) === JSON.stringify(je)
  } catch {}
  const norm = (s: string) => s.replace(/\r\n/g, '\n').trim().replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n')
  if (norm(sa) === norm(sb)) return true
  const strip = (s: string) => s.replace(/\s*,\s*/g, ',').replace(/\s*\[\s*/g, '[').replace(/\s*\]\s*/g, ']').trim()
  return strip(sa) === strip(sb)
}

// --- JS ---
export async function runJavascript(code: string, input: string): Promise<{ output: string; error: string | null; passed: boolean; expected?: string }> {
  // reused vm logic with generic harness
  let parsed: any
  try { parsed = JSON.parse(input) } catch { parsed = input }
  const lower = code.toLowerCase()
  const blocked = ['process', 'require', 'child_process', 'fs.', 'eval(', 'import ', 'global.', 'buffer', '__dirname', '__filename', 'module.exports']
  for (const s of blocked) if (lower.includes(s) && !lower.includes('//')) {
    // Allow blocked only if user code is trivial? For now block
    // But allow "process" in comments? Already lower includes.
    // We check more strictly: if code contains "process." etc
    if (s === 'process' && !code.includes('process.')) continue
    // For JS we already check strict above, but keep simple
  }
  // Actually use same list as before but without false positives
  const strictBlocked = ['child_process', 'fs.', 'eval(', 'global.']
  for (const s of strictBlocked) if (lower.includes(s)) throw new Error('Blocked unsafe pattern: '+s)

  const sandbox: any = { parsed, result: undefined, console: { log: () => {} } }
  const ctx = vm.createContext(sandbox, { name: 'js-sandbox' } as any)
  const wrapped = `
    ${code}
    if (typeof solution !== 'function') throw new Error('solution function not defined');
    if (Array.isArray(parsed) && parsed.length===2 && Array.isArray(parsed[0])) {
      result = solution(parsed[0], parsed[1]);
    } else {
      result = solution(parsed);
    }
  `
  try {
    new vm.Script(wrapped, { timeout: 1500 } as any).runInContext(ctx, { timeout: 1500 } as any)
    let out = ctx.result
    if (out === null || out === undefined) out = ''
    else if (typeof out === 'string' || typeof out === 'number' || typeof out === 'boolean') out = String(out)
    else out = JSON.stringify(out)
    return { output: out, error: null, passed: true }
  } catch (e: any) {
    return { output: 'Execution failed', error: e.message, passed: false }
  }
}

// --- TypeScript: transpile then run as JS ---
export async function runTypescript(code: string, input: string): Promise<{ output: string; error: string | null }> {
  try {
    const transpiled = ts.transpile(code, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true, strict: false })
    // Now run transpiled JS via vm
    const res = await runJavascript(transpiled, input)
    return { output: res.output, error: res.error }
  } catch (e: any) {
    return { output: 'Compilation error', error: e.message }
  }
}

// Generic spawn helper with timeout
function spawnWithInput(cmd: string, args: string[], input: string, timeoutMs = 3000): Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill('SIGKILL') } catch {}
    }, timeoutMs)
    child.stdout.on('data', (d) => { stdout += d.toString(); if (stdout.length > 20000) stdout = stdout.slice(0, 20000) })
    child.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 10000) stderr = stderr.slice(0, 10000) })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ stdout, stderr: (e as any).message, code: 1, timedOut: false })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, code, timedOut })
    })
    try {
      child.stdin.write(input)
      child.stdin.end()
    } catch {}
  })
}

// --- Python ---
export async function runPython(code: string, input: string): Promise<{ output: string; error: string | null }> {
  // Build harness similar to runner.ts python harness
  const harness = `
import sys, json
def _cf_run():
    data = sys.stdin.read()
    if not data.strip():
        data = '[]'
    try:
        parsed = json.loads(data)
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)
    try:
        if 'solution' not in globals():
            raise NameError('solution function not defined')
        if isinstance(parsed, list) and len(parsed)==2 and isinstance(parsed[0], list):
            res = solution(parsed[0], parsed[1])
        else:
            res = solution(parsed)
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)
    if res is None:
        sys.stdout.write('')
    elif isinstance(res, (str,int,float,bool)):
        sys.stdout.write(str(res))
    else:
        try:
            sys.stdout.write(json.dumps(res, separators=(',', ':')))
        except:
            sys.stdout.write(str(res))
if __name__ == "__main__":
    _cf_run()
`
  const full = `${code}\n${harness}`
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-py-'))
  const file = path.join(tmp, 'solution.py')
  fs.writeFileSync(file, full)
  try {
    const { stdout, stderr, timedOut, code: exitCode } = await spawnWithInput('python3', [file], input, 3000)
    if (timedOut) return { output: 'Time limit exceeded', error: 'Time limit exceeded' }
    if (exitCode !== 0) {
      const out = stdout.trim() || stderr.trim() || 'Runtime error'
      return { output: out, error: stderr.trim() || out }
    }
    return { output: stdout.trim(), error: null }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
  }
}

// --- Java ---
export async function runJava(code: string, input: string): Promise<{ output: string; error: string | null }> {
  // code is expected to be full Main.java (as per template). We just compile and run it.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-java-'))
  const file = path.join(tmp, 'Main.java')
  // If code contains "class Main" use as is, else wrap Solution class into Main
  let source = code
  if (!code.includes('class Main')) {
    // If user gave only Solution class, wrap with generic Main for TwoSum that we provide as fallback
    // But our templates now always give Main, so this is just fallback
    source = code
  }
  fs.writeFileSync(file, source)
  try {
    // Compile
    const javacPath = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'javac') : 'javac'
    // Try with openjdk path
    const javacCmd = fs.existsSync('/opt/homebrew/opt/openjdk@17/bin/javac') ? '/opt/homebrew/opt/openjdk@17/bin/javac' : javacPath
    const compile = await spawnWithInput(javacCmd, ['-d', tmp, file], '', 5000)
    if (compile.code !== 0) {
      return { output: 'Compilation error', error: (compile.stderr || compile.stdout).trim().slice(0, 2000) }
    }
    const javaCmd = fs.existsSync('/opt/homebrew/opt/openjdk@17/bin/java') ? '/opt/homebrew/opt/openjdk@17/bin/java' : 'java'
    const run = await spawnWithInput(javaCmd, ['-cp', tmp, 'Main'], input, 3000)
    if (run.timedOut) return { output: 'Time limit exceeded', error: 'Time limit exceeded' }
    if (run.code !== 0) {
      return { output: run.stdout.trim() || 'Runtime error', error: (run.stderr.trim() || run.stdout.trim()).slice(0, 2000) }
    }
    return { output: run.stdout.trim(), error: null }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
  }
}

// --- C++ ---
export async function runCpp(code: string, input: string): Promise<{ output: string; error: string | null }> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-cpp-'))
  const src = path.join(tmp, 'solution.cpp')
  const bin = path.join(tmp, 'a.out')
  fs.writeFileSync(src, code)
  try {
    const compile = await spawnWithInput('g++', ['-std=c++17', '-O2', '-o', bin, src], '', 5000)
    if (compile.code !== 0) {
      return { output: 'Compilation error', error: (compile.stderr || compile.stdout).trim().slice(0, 2000) }
    }
    const run = await spawnWithInput(bin, [], input, 3000)
    if (run.timedOut) return { output: 'Time limit exceeded', error: 'Time limit exceeded' }
    if (run.code !== 0) {
      return { output: run.stdout.trim() || 'Runtime error', error: (run.stderr.trim() || run.stdout.trim()).slice(0, 2000) }
    }
    return { output: run.stdout.trim(), error: null }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
  }
}

// --- C# ---
export async function runCsharp(code: string, input: string): Promise<{ output: string; error: string | null }> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-cs-'))
  try {
    // dotnet new console
    const init = await spawnWithInput('dotnet', ['new', 'console', '-n', 'app', '-o', path.join(tmp, 'app'), '--force'], '', 8000)
    // dotnet new may output warnings but exit 0
    if (init.code !== 0 && !fs.existsSync(path.join(tmp, 'app', 'Program.cs'))) {
      return { output: 'Compilation error', error: (init.stderr || init.stdout).trim().slice(0,2000) }
    }
    const prog = path.join(tmp, 'app', 'Program.cs')
    fs.writeFileSync(prog, code)
    const run = await spawnWithInput('dotnet', ['run', '--project', path.join(tmp, 'app')], input, 5000)
    if (run.timedOut) return { output: 'Time limit exceeded', error: 'Time limit exceeded' }
    if (run.code !== 0) {
      // dotnet run returns 1 on compilation error, stderr contains build log
      const err = (run.stderr || run.stdout).trim()
      if (err.toLowerCase().includes('error')) return { output: 'Compilation error', error: err.slice(0,2000) }
      return { output: run.stdout.trim() || 'Runtime error', error: err.slice(0,2000) }
    }
    return { output: run.stdout.trim(), error: null }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
  }
}

// Main dispatcher
export async function executeLocal(language: string, code: string, input: string): Promise<{ output: string; error: string | null }> {
  const lang = language.toLowerCase()
  try {
    if (lang === 'javascript') {
      const r = await runJavascript(code, input)
      return { output: r.output, error: r.error }
    }
    if (lang === 'typescript') {
      return await runTypescript(code, input)
    }
    if (lang === 'python') {
      return await runPython(code, input)
    }
    if (lang === 'java') {
      return await runJava(code, input)
    }
    if (lang === 'cpp') {
      return await runCpp(code, input)
    }
    if (lang === 'csharp' || lang === 'c#') {
      return await runCsharp(code, input)
    }
    // fallback for other languages: try javascript vm as generic
    const r = await runJavascript(code, input)
    return { output: r.output, error: r.error }
  } catch (e: any) {
    return { output: 'Execution failed', error: e.message }
  }
}
