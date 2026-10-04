import { executeLocal } from '../src/lib/localRunner'

let pass = 0, fail = 0
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) { pass++; console.log(`  PASS ${name}`) }
  else { fail++; console.log(`  FAIL ${name}  ${detail ?? ''}`) }
}

// Mirror of localRunner outputsEqual so expected-vs-got compare is consistent.
function eq(a: string, b: string): boolean {
  const sa = String(a ?? '').trim()
  const sb = String(b ?? '').trim()
  if (sb === '') return true
  try { return JSON.stringify(JSON.parse(sa)) === JSON.stringify(JSON.parse(sb)) } catch {}
  const unq = (s: string) => { try { const j = JSON.parse(s); return typeof j === 'string' ? j : s } catch { return s } }
  if (unq(sa) === unq(sb)) return true
  const strip = (s: string) => s.replace(/\s*,\s*/g, ',').replace(/\s*\[\s*/g, '[').replace(/\s*\]\s*/g, ']').trim()
  return strip(sa) === strip(sb)
}

const INPUT = {
  string: '"leet**cod*e"',
  number: '7',
  array: '[1,2,3]',
  twosum: '[[2,7,11,15],9]',
}
const EXPECTED: Record<keyof typeof INPUT, string> = {
  string: '"lecoe"',
  number: '49',
  array: '6',
  twosum: '[0,1]',
}

type Shape = keyof typeof INPUT
const SHAPES: Shape[] = ['string', 'number', 'array', 'twosum']

// ================= PART A: frontend templates (verbatim copies of generateCodeTemplate) =================
// Templates must execute without compile/runtime errors (empty returns are fine).

const templates: Record<string, Record<Shape, string>> = {
  javascript: {
    string: `// T
function solution(s) {
  // Your code here
  return "";
}`,
    number: `// T
function solution(n) {
  // Your code here
  return 0;
}`,
    array: `// T
function solution(nums) {
  // Your code here
  return [];
}`,
    twosum: `// T
function solution(nums, target) {
  // Your code here
  return [];
}`,
  },
  typescript: {
    string: `// T
class Solution {
    solution(s: string): string {
        return "";
    }
}`,
    number: `// T
class Solution {
    solution(n: number): number {
        return 0;
    }
}`,
    array: `// T
class Solution {
    solution(nums: number[]): number[] {
        return [];
    }
}`,
    twosum: `// T
class Solution {
    solution(nums: number[], target: number): number[] {
        return [];
    }
}`,
  },
  python: {
    string: `# T
class Solution:
    def solution(self, s):
        return ""`,
    number: `# T
class Solution:
    def solution(self, n):
        return 0`,
    array: `# T
class Solution:
    def solution(self, nums):
        return []`,
    twosum: `# T
class Solution:
    def solution(self, nums, target):
        return []`,
  },
  java: {
    string: `// T
class Solution {
    public String solution(String s) {
        return "";
    }
}`,
    number: `// T
class Solution {
    public long solution(long n) {
        return 0;
    }
}`,
    array: `// T
class Solution {
    public long[] solution(long[] nums) {
        return new long[]{};
    }
}`,
    twosum: `// T
class Solution {
    public int[] solution(int[] nums, int target) {
        return new int[]{};
    }
}`,
  },
  cpp: {
    string: `// T
#include <string>
using namespace std;

class Solution {
public:
    string solution(string s) {
        return "";
    }
};`,
    number: `// T
class Solution {
public:
    long long solution(long long n) {
        return 0;
    }
};`,
    array: `// T
#include <vector>
using namespace std;

class Solution {
public:
    vector<long long> solution(vector<long long>& nums) {
        return {};
    }
};`,
    twosum: `// T
#include <vector>
using namespace std;

class Solution {
public:
    vector<int> solution(vector<int>& nums, int target) {
        return {};
    }
};`,
  },
  csharp: {
    string: `// T
public class Solution {
    public string solution(string s) {
        return "";
    }
}`,
    number: `// T
public class Solution {
    public long solution(long n) {
        return 0;
    }
}`,
    array: `// T
public class Solution {
    public long[] solution(long[] nums) {
        return new long[0];
    }
}`,
    twosum: `// T
public class Solution {
    public int[] solution(int[] nums, int target) {
        return new int[0];
    }
}`,
  },
  go: {
    string: `// T
func solution(s string) string {
    return ""
}`,
    number: `// T
func solution(n int64) int64 {
    return 0
}`,
    array: `// T
func solution(nums []int64) []int64 {
    return []int64{}
}`,
    twosum: `// T
func solution(nums []int, target int) []int {
    return []int{}
}`,
  },
  ruby: {
    string: `# T
def solution(s)
  ""
end`,
    number: `# T
def solution(n)
  0
end`,
    array: `# T
def solution(nums)
  []
end`,
    twosum: `# T
def solution(nums, target)
  []
end`,
  },
  php: {
    string: `<?php
// T
class Solution {
    function solution($s) {
        return "";
    }
}
?>`,
    number: `<?php
// T
class Solution {
    function solution($n) {
        return 0;
    }
}
?>`,
    array: `<?php
// T
class Solution {
    function solution($nums) {
        return [];
    }
}
?>`,
    twosum: `<?php
// T
class Solution {
    function solution($nums, $target) {
        return [];
    }
}
?>`,
  },
}

// ================= PART B: LeetCode ORIGINAL pastes (original method names) =================

const leetcode: Record<string, Record<Shape, string>> = {
  javascript: {
    string: `var removeStars = function(s) {
    let r = "";
    for (const c of s) { if (c === "*") r = r.slice(0, -1); else r += c; }
    return r;
};`,
    number: `var squareNum = function(n) {
    return n * n;
};`,
    array: `var sumArray = function(nums) {
    return nums.reduce((a, b) => a + b, 0);
};`,
    twosum: `function twoSum(nums, target) {
    const m = new Map();
    for (let i = 0; i < nums.length; i++) {
        const need = target - nums[i];
        if (m.has(need)) return [m.get(need), i];
        m.set(nums[i], i);
    }
    return [];
}`,
  },
  typescript: {
    string: `function removeStars(s: string): string {
    let r = "";
    for (const c of s) { if (c === "*") r = r.slice(0, -1); else r += c; }
    return r;
}`,
    number: `function squareNum(n: number): number {
    return n * n;
}`,
    array: `function sumArray(nums: number[]): number {
    return nums.reduce((a, b) => a + b, 0);
}`,
    twosum: `function twoSum(nums: number[], target: number): number[] {
    const m = new Map<number, number>();
    for (let i = 0; i < nums.length; i++) {
        const need = target - nums[i];
        if (m.has(need)) return [m.get(need)!, i];
        m.set(nums[i], i);
    }
    return [];
}`,
  },
  python: {
    string: `class Solution:
    def removeStars(self, s):
        r = ""
        for c in s:
            if c == "*":
                r = r[:-1]
            else:
                r += c
        return r`,
    number: `class Solution:
    def squareNum(self, n):
        return n * n`,
    array: `class Solution:
    def sumArray(self, nums):
        return sum(nums)`,
    twosum: `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, x in enumerate(nums):
            if target - x in seen:
                return [seen[target - x], i]
            seen[x] = i
        return []`,
  },
  java: {
    string: `class Solution {
    public String removeStars(String s) {
        StringBuilder r = new StringBuilder();
        for (char c : s.toCharArray()) {
            if (c == '*') { if (r.length() > 0) r.deleteCharAt(r.length() - 1); }
            else r.append(c);
        }
        return r.toString();
    }
}`,
    number: `class Solution {
    public long squareNum(long n) {
        return n * n;
    }
}`,
    array: `class Solution {
    public int sumArray(int[] nums) {
        int s = 0;
        for (int x : nums) s += x;
        return s;
    }
}`,
    twosum: `class Solution {
    public int[] twoSum(int[] nums, int target) {
        for (int i = 0; i < nums.length; i++)
            for (int j = i + 1; j < nums.length; j++)
                if (nums[i] + nums[j] == target) return new int[]{i, j};
        return new int[]{};
    }
}`,
  },
  cpp: {
    string: `class Solution {
public:
    string removeStars(string s) {
        string res;
        for (char c : s) { if (c == '*') { if (!res.empty()) res.pop_back(); } else res.push_back(c); }
        return res;
    }
};`,
    number: `class Solution {
public:
    long long squareNum(long long n) {
        return n * n;
    }
};`,
    array: `class Solution {
public:
    int sumArray(vector<int>& nums) {
        int s = 0;
        for (int x : nums) s += x;
        return s;
    }
};`,
    twosum: `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        for (int i = 0; i < (int)nums.size(); i++)
            for (int j = i + 1; j < (int)nums.size(); j++)
                if (nums[i] + nums[j] == target) return {i, j};
        return {};
    }
};`,
  },
  csharp: {
    string: `public class Solution {
    public string removeStars(string s) {
        var r = new System.Text.StringBuilder();
        foreach (char c in s) { if (c == '*') { if (r.Length > 0) r.Length--; } else r.Append(c); }
        return r.ToString();
    }
}`,
    number: `public class Solution {
    public long squareNum(long n) {
        return n * n;
    }
}`,
    array: `public class Solution {
    public int sumArray(int[] nums) {
        int s = 0;
        foreach (int x in nums) s += x;
        return s;
    }
}`,
    twosum: `public class Solution {
    public int[] twoSum(int[] nums, int target) {
        for (int i = 0; i < nums.Length; i++)
            for (int j = i + 1; j < nums.Length; j++)
                if (nums[i] + nums[j] == target) return new int[]{i, j};
        return new int[0];
    }
}`,
  },
  go: {
    string: `func removeStars(s string) string {
    var r []byte
    for i := 0; i < len(s); i++ {
        if s[i] == '*' {
            if len(r) > 0 { r = r[:len(r)-1] }
        } else {
            r = append(r, s[i])
        }
    }
    return string(r)
}`,
    number: `func squareNum(n int64) int64 {
    return n * n
}`,
    array: `func sumArray(nums []int) int {
    s := 0
    for _, x := range nums { s += x }
    return s
}`,
    twosum: `func twoSum(nums []int, target int) []int {
    m := map[int]int{}
    for i, x := range nums {
        if j, ok := m[target-x]; ok { return []int{j, i} }
        m[x] = i
    }
    return []int{}
}`,
  },
  ruby: {
    string: `def remove_stars(s)
  r = ""
  s.each_char { |c| c == "*" ? r = r[0...-1] : r += c }
  r
end`,
    number: `def square_num(n)
  n * n
end`,
    array: `def sum_array(nums)
  nums.sum
end`,
    twosum: `def two_sum(nums, target)
  m = {}
  nums.each_with_index do |x, i|
    j = m[target - x]
    return [j, i] if j
    m[x] = i
  end
  []
end`,
  },
  php: {
    string: `<?php
class Solution {
    function removeStars($s) {
        $r = "";
        for ($i = 0; $i < strlen($s); $i++) {
            if ($s[$i] === "*") { if ($r !== "") $r = substr($r, 0, -1); }
            else $r .= $s[$i];
        }
        return $r;
    }
}
?>`,
    number: `<?php
class Solution {
    function squareNum($n) {
        return $n * $n;
    }
}
?>`,
    array: `<?php
class Solution {
    function sumArray($nums) {
        return array_sum($nums);
    }
}
?>`,
    twosum: `<?php
class Solution {
    function twoSum($nums, $target) {
        $m = [];
        foreach ($nums as $i => $x) {
            $need = $target - $x;
            if (array_key_exists($need, $m)) return [$m[$need], $i];
            $m[$x] = $i;
        }
        return [];
    }
}
?>`,
  },
}

const LANGS = Object.keys(templates)

console.log('=== PART A: templates must execute without error ===')
for (const lang of LANGS) {
  for (const shape of SHAPES) {
    const { error } = await executeLocal(lang, templates[lang][shape], INPUT[shape])
    check(`template/${lang}/${shape}`, !error, `err="${error}"`)
  }
}

console.log('\n=== PART B: LeetCode original pastes must produce correct output ===')
for (const lang of LANGS) {
  for (const shape of SHAPES) {
    const { output, error } = await executeLocal(lang, leetcode[lang][shape], INPUT[shape])
    check(`leetcode/${lang}/${shape}`, !error && eq(output, EXPECTED[shape]), `got="${output}" err="${error}"`)
  }
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
