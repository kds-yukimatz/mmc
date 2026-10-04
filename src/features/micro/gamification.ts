import type { Attempt } from './domain'
import { addDays, localDate } from './engine'

export type FruitStampDay = { date: string; earned: boolean }

export function rollingFruitStamps(
  attempts: Attempt[],
  today = localDate(),
): FruitStampDay[] {
  const dates = Array.from({ length: 7 }, (_, index) =>
    addDays(today, index - 6),
  )
  const window = new Set(dates)
  const earned = new Set(
    attempts
      .map((attempt) => localDate(attempt.answeredAt))
      .filter((date) => window.has(date)),
  )
  return dates.map((date) => ({ date, earned: earned.has(date) }))
}
