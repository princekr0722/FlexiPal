import { GoogleGenAI } from '@google/genai'
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
let ok = 0, fail = 0
const lat: number[] = []
for (let i = 1; i <= 6; i++) {
  const t0 = Date.now()
  try {
    const r = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts: [{ text: 'Reply with JSON {"ok":true}' }] }],
      config: { responseMimeType: 'application/json', temperature: 0 },
    })
    const ms = Date.now() - t0; lat.push(ms); ok++
    console.log(`  probe ${i}: OK ${ms}ms  ${r.text?.slice(0, 40).replace(/\n/g, '')}`)
  } catch (e) {
    fail++
    const m = (e as Error).message
    const code = /"code":\s*(\d+)/.exec(m)?.[1] ?? '?'
    console.log(`  probe ${i}: FAIL ${Date.now() - t0}ms  HTTP ${code}`)
  }
  await new Promise(r => setTimeout(r, 1500))
}
console.log(`\navailability: ${ok}/${ok + fail} succeeded${lat.length ? ` · median ${lat.sort((a,b)=>a-b)[Math.floor(lat.length/2)]}ms` : ''}`)
