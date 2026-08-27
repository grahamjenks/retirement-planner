import { potsExhaustedRow, simulate } from './projection'
import type { Assumptions } from './types'

/**
 * Deterministic RNG. The chart must not reshuffle on every re-render, and a
 * result you cannot reproduce is not much use for a decision — so the seed is
 * explicit rather than Math.random.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal via Box-Muller, drawn from a seeded uniform. */
function normal(rand: () => number): number {
  let u = 0
  let v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export interface MonteCarloOptions {
  trials: number
  /** Standard deviation of annual real returns, in percentage points. */
  volatilityPct: number
  seed: number
}

export interface MonteCarloBand {
  year: number
  age: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}

export interface MonteCarloResult {
  trials: number
  /** Share of runs that funded every year without a shortfall. */
  successRate: number
  bands: MonteCarloBand[]
  /** Ages the pots ran dry, for runs that failed — sorted. */
  runsDryAges: number[]
  medianEnd: number
  p10End: number
  p90End: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

/**
 * Runs the plan many times with randomly ordered returns.
 *
 * The point is sequence risk: the same average return can succeed or fail
 * depending on *when* the bad years land. A crash early in drawdown is far more
 * damaging than the same crash at 85, because units are being sold to live on.
 */
export function runMonteCarlo(a: Assumptions, opts: MonteCarloOptions): MonteCarloResult {
  const rand = mulberry32(opts.seed)
  const sigma = Math.max(0, opts.volatilityPct) / 100

  const baseline = simulate(a)
  const years = baseline.length
  if (years === 0) {
    return {
      trials: 0,
      successRate: 0,
      bands: [],
      runsDryAges: [],
      medianEnd: 0,
      p10End: 0,
      p90End: 0,
    }
  }

  const totalsByYear: number[][] = Array.from({ length: years }, () => [])
  const runsDryAges: number[] = []
  let successes = 0

  for (let trial = 0; trial < opts.trials; trial++) {
    const shocks = Array.from({ length: years }, () => normal(rand) * sigma)
    const rows = simulate(a, undefined, shocks)

    rows.forEach((r, i) => {
      if (i < years) totalsByYear[i].push(r.totalPot)
    })

    const failed = rows.some((r) => r.depleted)
    if (!failed) successes++
    const dry = potsExhaustedRow(rows)
    if (dry) runsDryAges.push(dry.people[0].age)
  }

  const bands: MonteCarloBand[] = totalsByYear.map((values, i) => {
    const sorted = [...values].sort((x, y) => x - y)
    return {
      year: baseline[i].year,
      age: baseline[i].age,
      p10: percentile(sorted, 0.1),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
    }
  })

  const ends = [...totalsByYear[years - 1]].sort((x, y) => x - y)
  return {
    trials: opts.trials,
    successRate: opts.trials > 0 ? successes / opts.trials : 0,
    bands,
    runsDryAges: runsDryAges.sort((x, y) => x - y),
    medianEnd: percentile(ends, 0.5),
    p10End: percentile(ends, 0.1),
    p90End: percentile(ends, 0.9),
  }
}
