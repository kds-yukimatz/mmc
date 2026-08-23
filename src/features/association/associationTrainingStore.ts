import { create } from 'zustand'
import type { AssociationRecord, TrainingMode } from '../../domain/association'

interface AssociationResult {
  matched: string[]
  missed: string[]
  score: number
}

interface AssociationTrainingState {
  queue: AssociationRecord[]
  index: number
  mode: Exclude<TrainingMode, 'question'>
  answers: string[]
  result: AssociationResult | null
  startedAt: number
  start: (records: AssociationRecord[], mode: Exclude<TrainingMode, 'question'>) => void
  addAnswer: (value: string) => void
  removeAnswer: (value: string) => void
  setResult: (result: AssociationResult) => void
  next: () => void
}

export const useAssociationTrainingStore = create<AssociationTrainingState>((set) => ({
  queue: [],
  index: 0,
  mode: 'theme',
  answers: [],
  result: null,
  startedAt: Date.now(),
  start: (queue, mode) => set({ queue, mode, index: 0, answers: [], result: null, startedAt: Date.now() }),
  addAnswer: (value) => set((state) => ({
    answers: value.trim() && !state.answers.includes(value.trim()) ? [...state.answers, value.trim()] : state.answers,
  })),
  removeAnswer: (value) => set((state) => ({ answers: state.answers.filter((item) => item !== value) })),
  setResult: (result) => set({ result }),
  next: () => set((state) => ({ index: state.index + 1, answers: [], result: null, startedAt: Date.now() })),
}))
