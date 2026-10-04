import { executeLocal, normalizeInput } from '../src/lib/localRunner'

let pass = 0, fail = 0
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) { pass++; console.log(`  PASS ${name}`) }
  else { fail++; console.log(`  FAIL ${name}  ${detail ?? ''}`) }
}

// --- Two Sum regression (display form input) ---
const twoSumInput = normalizeInput('[2,7,11,15], 9')
check('twosum normalize', twoSumInput === '[[2,7,11,15],9]', twoSumInput)

const twoSumSols: Record<string, string> = {
  javascript: `function solution(nums, target){const m={};for(let i=0;i<nums.length;i++){if(m[target-nums[i]]!==undefined)return [m[target-nums[i]],i];m[nums[i]]=i}return []}`,
  python: `def solution(nums, target):
    m = {}
    for i, n in enumerate(nums):
        if target - n in m: return [m[target-n], i]
        m[n] = i
    return []`,
  go: `package main

import (
    "fmt"
    "encoding/json"
    "io"
    "os"
)

func solution(nums []int, target int) []int {
    m := map[int]int{}
    for i, n := range nums {
        if j, ok := m[target-n]; ok { return []int{j, i} }
        m[n] = i
    }
    return []int{}
}

func main() {
    data, _ := io.ReadAll(os.Stdin)
    var arr []interface{}
    json.Unmarshal(data, &arr)
    nums := []int{}
    for _, v := range arr[0].([]interface{}) { nums = append(nums, int(v.(float64))) }
    target := int(arr[1].(float64))
    res := solution(nums, target)
    b, _ := json.Marshal(res)
    fmt.Print(string(b))
}`,
}
console.log('Two Sum regression:')
for (const [lang, code] of Object.entries(twoSumSols)) {
  const { output, error } = await executeLocal(lang, code, twoSumInput)
  check(lang, !error && output.replace(/\s/g,'') === '[0,1]', `got="${output}" err="${error}"`)
}

// --- Number regression (Double) ---
console.log('Number (Double) regression:')
{
  const { output, error } = await executeLocal('python', 'def solution(n):\n    return n*2', normalizeInput('5'))
  check('python-double', !error && output.trim() === '10', `got="${output}" err="${error}"`)
}

// --- Array regression (Product Except Self) ---
console.log('Array (Product) regression:')
{
  const code = `def solution(nums):
    n = len(nums); out = [1]*n
    pre = 1
    for i in range(n): out[i] = pre; pre *= nums[i]
    suf = 1
    for i in range(n-1, -1, -1): out[i] *= suf; suf *= nums[i]
    return out`
  const { output, error } = await executeLocal('python', code, normalizeInput('[1,2,3,4]'))
  check('python-product', !error && output.replace(/\s/g,'') === '[24,12,8,6]', `got="${output}" err="${error}"`)
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
