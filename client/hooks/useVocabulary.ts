import { useEffect, useState } from 'react'
import type { Vocabulary } from '../lib/detect.ts'

/** Loaded once; the search box degrades to a plain input if it never arrives. */
export function useVocabulary(): Vocabulary | null {
  const [vocab, setVocab] = useState<Vocabulary | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/vocabulary')
      .then((r) => (r.ok ? r.json() : null))
      .then((v: Vocabulary | null) => { if (live && v) setVocab(v) })
      .catch(() => { /* the input works fine without it */ })
    return () => { live = false }
  }, [])

  return vocab
}
