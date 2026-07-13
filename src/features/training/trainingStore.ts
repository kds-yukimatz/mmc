import { create } from 'zustand'
import type { GradingResult } from '../../domain/grading'
import type { Question } from '../../domain/question'

interface SessionState {
  queue: Question[]
  index: number
  inputCuts: string[]
  inputKeywords: string[]
  result: GradingResult | null
  startedAt: number
  start: (questions: Question[]) => void
  addCut: (value: string) => void
  addKeyword: (value: string) => void
  removeCut: (value: string) => void
  removeKeyword: (value: string) => void
  setResult: (result: GradingResult | null) => void
  next: () => void
}

export const useTrainingStore = create<SessionState>((set) => ({
  queue: [], index: 0, inputCuts: [], inputKeywords: [], result: null, startedAt: Date.now(),
  start: (queue) => set({ queue, index: 0, inputCuts: [], inputKeywords: [], result: null, startedAt: Date.now() }),
  addCut: (value) => set((state) => ({ inputCuts: value.trim() && !state.inputCuts.includes(value.trim()) ? [...state.inputCuts, value.trim()] : state.inputCuts })),
  addKeyword: (value) => set((state) => ({ inputKeywords: value.trim() && !state.inputKeywords.includes(value.trim()) ? [...state.inputKeywords, value.trim()] : state.inputKeywords })),
  removeCut: (value) => set((state) => ({ inputCuts: state.inputCuts.filter((item) => item !== value) })),
  removeKeyword: (value) => set((state) => ({ inputKeywords: state.inputKeywords.filter((item) => item !== value) })),
  setResult: (result) => set({ result }),
  next: () => set((state) => ({ index: state.index + 1, inputCuts: [], inputKeywords: [], result: null, startedAt: Date.now() })),
}))
