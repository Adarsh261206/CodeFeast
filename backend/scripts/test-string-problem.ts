import { executeLocal, normalizeInput } from '../src/lib/localRunner'

const INPUT_QUOTED = '"leet**cod*e"'
const INPUT_RAW = 'leet**cod*e'
const EXPECTED = 'lecoe'

const leetcodeCpp = `class Solution {
public:
    string removeStars(string s) {
        string res;
        for (char c : s) {
            if (c == '*') { if (!res.empty()) res.pop_back(); }
            else res.push_back(c);
        }
        return res;
    }
};`

const sols: Record<string, string> = {
  javascript: `function solution(s){let r="";for(const c of s){if(c==="*"){r=r.slice(0,-1)}else r+=c}return r}`,
  typescript: `function solution(s: string): string { let r = ""; for (const c of s) { if (c === "*") r = r.slice(0, -1); else r += c; } return r; }`,
  python: `def solution(s):
    r = ""
    for c in s:
        if c == "*":
            r = r[:-1]
        else:
            r += c
    return r`,
  java: `import java.util.*; import java.io.*; import java.util.stream.Collectors;
public class Main {
    public static String solution(String s) {
        StringBuilder r = new StringBuilder();
        for (char c : s.toCharArray()) {
            if (c == '*') { if (r.length() > 0) r.deleteCharAt(r.length()-1); }
            else r.append(c);
        }
        return r.toString();
    }
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String input = br.lines().collect(Collectors.joining()).trim();
        if (input.length() >= 2 && input.charAt(0) == '"' && input.charAt(input.length()-1) == '"') input = input.substring(1, input.length()-1);
        System.out.print(solution(input));
    }
}`,
  cpp: `#include <iostream>
#include <string>
using namespace std;
class Solution {
public:
    string solution(string s) {
        string r;
        for (char c : s) { if (c=='*') { if(!r.empty()) r.pop_back(); } else r.push_back(c); }
        return r;
    }
};
int main(){
    string s, line;
    while(getline(cin, line)) s+=line;
    if(s.size()>=2 && s.front()=='"' && s.back()=='"') s=s.substr(1, s.size()-2);
    Solution sol;
    cout<<sol.solution(s);
    return 0;
}`,
  csharp: `using System;
class Program{
    static string Solution(string s){
        var r = new System.Text.StringBuilder();
        foreach (char c in s) { if (c=='*') { if(r.Length>0) r.Length--; } else r.Append(c); }
        return r.ToString();
    }
    static void Main(){
        string input=Console.In.ReadToEnd();
        if(input.Length>=2 && input[0]=='"' && input[input.Length-1]=='"') input=input.Substring(1, input.Length-2);
        Console.Write(Solution(input));
    }
}`,
  go: `package main

import (
    "fmt"
    "io"
    "os"
    "strings"
)

func solution(s string) string {
    var r []byte
    for i := 0; i < len(s); i++ {
        if s[i] == '*' { if len(r) > 0 { r = r[:len(r)-1] } } else { r = append(r, s[i]) }
    }
    return string(r)
}

func main() {
    data, _ := io.ReadAll(os.Stdin)
    s := strings.TrimSpace(string(data))
    if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' { s = s[1 : len(s)-1] }
    fmt.Print(solution(s))
}`,
  ruby: `def solution(s)
  r = ""
  s.each_char { |c| c == "*" ? r = r[0...-1] : r += c }
  r
end`,
  php: `<?php
function solution($s) {
    $r = "";
    for ($i = 0; $i < strlen($s); $i++) {
        if ($s[$i] === "*") { if ($r !== "") $r = substr($r, 0, -1); }
        else $r .= $s[$i];
    }
    return $r;
}
?>`
}

let pass = 0, fail = 0
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) { pass++; console.log(`  PASS ${name}`) }
  else { fail++; console.log(`  FAIL ${name}  ${detail ?? ''}`) }
}

// 1. normalizeInput
console.log('normalizeInput:')
check('raw string gets quoted', normalizeInput(INPUT_RAW) === JSON.stringify(INPUT_RAW), normalizeInput(INPUT_RAW))
check('quoted string passes through', normalizeInput(INPUT_QUOTED) === INPUT_QUOTED, normalizeInput(INPUT_QUOTED))
check('number untouched', normalizeInput('5') === '5')
check('twosum display form', normalizeInput('[1,2], 9') === '[[1,2],9]', normalizeInput('[1,2], 9'))
check('array passes', normalizeInput('[1,2,3]') === '[1,2,3]')

// 2. outputsEqual indirectly: all langs must PASS testcases via executeLocal
console.log('string problem across languages (input quoted):')
for (const [lang, code] of Object.entries(sols)) {
  const { output, error } = await executeLocal(lang, code, normalizeInput(INPUT_QUOTED))
  check(lang, !error && output.trim() === EXPECTED, `got="${output}" err="${error}"`)
}

console.log('same with RAW input (no quotes in DB):')
for (const [lang, code] of Object.entries(sols)) {
  const { output, error } = await executeLocal(lang, code, normalizeInput(INPUT_RAW))
  check(lang, !error && output.trim() === EXPECTED, `got="${output}" err="${error}"`)
}

// 3. User's exact LeetCode paste (no main)
console.log('LeetCode-style C++ paste without main:')
{
  const { output, error } = await executeLocal('cpp', leetcodeCpp, normalizeInput(INPUT_QUOTED))
  check('cpp-leetcodesubmit', !error && output.trim() === EXPECTED, `got="${output}" err="${error}"`)
}

const leetcodeJava = `class Solution {
    public String removeStars(String s) {
        StringBuilder r = new StringBuilder();
        for (char c : s.toCharArray()) {
            if (c == '*') { if (r.length() > 0) r.deleteCharAt(r.length()-1); }
            else r.append(c);
        }
        return r.toString();
    }
}`
console.log('LeetCode-style Java paste without Main:')
{
  const { output, error } = await executeLocal('java', leetcodeJava, normalizeInput(INPUT_QUOTED))
  check('java-leetcodesubmit', !error && output.trim() === EXPECTED, `got="${output}" err="${error}"`)
}

const leetcodePy = `class Solution:
    def removeStars(self, s: str) -> str:
        r = ""
        for c in s:
            if c == "*":
                r = r[:-1]
            else:
                r += c
        return r`
console.log('LeetCode-style Python class paste:')
{
  const { output, error } = await executeLocal('python', leetcodePy, normalizeInput(INPUT_QUOTED))
  check('python-leetcodesubmit', !error && output.trim() === EXPECTED, `got="${output}" err="${error}"`)
}

const leetcodeJs = `var removeStars = function(s) {
    let r = "";
    for (const c of s) { if (c === "*") r = r.slice(0, -1); else r += c; }
    return r;
};`
console.log('LeetCode-style JS function paste:')
{
  const { output, error } = await executeLocal('javascript', leetcodeJs, normalizeInput(INPUT_QUOTED))
  check('js-leetcodesubmit', !error && output.trim() === EXPECTED, `got="${output}" err="${error}"`)
}

// 4. outputsEqual behavior via runner-equivalent logic (string quote tolerance)
const unq = (s: string) => { try { const j = JSON.parse(s); return typeof j === 'string' ? j : s } catch { return s } }
console.log('quote-tolerant compare:')
check('lecoe vs "lecoe"', unq('lecoe') === unq('"lecoe"'))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
