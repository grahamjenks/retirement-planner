/**
 * What a pot is for tax. A savings pot (ISA, LISA, ordinary savings) is funded
 * from money already taxed, so taking it back out is a return of capital and
 * free. A pension pot — a SIPP, or an old workplace pot being managed
 * separately — is funded before tax, so HMRC tops contributions up and takes
 * its share back on the way out.
 */
export type PotKind = 'savings' | 'pension'

/**
 * A step in a pot's contribution schedule: pay in this much a year, from this
 * age of the pot's owner onwards, until a later step says otherwise.
 *
 * An amount of 0 is a pause, not an end — contributions resume at the next
 * step. Stopping for good is what `contributionEndAge` is for.
 */
export interface ContributionStep {
  id: string
  fromAge: number
  amount: number
}

export interface SavingsPot {
  id: string
  name: string
  /**
   * Pension pots are locked to `accessibleFromAge` like any other, but their
   * withdrawals are taxed as pension income with the usual tax-free share,
   * and `bonusRatePct` is tax relief rather than a government bonus.
   */
  kind: PotKind
  balance: number
  annualContribution: number
  growthRate: number // nominal annual %
  /** Age from which this pot can be drawn on. LISAs are locked until 60. */
  accessibleFromAge: number
  /** When true, `accessibleFromAge` is ignored and tracks the retirement age. */
  accessAtRetirement: boolean
  /**
   * Top-up added to each contribution. 25 for a LISA's government bonus, and
   * also 25 for a SIPP, where basic-rate relief is claimed at source: pay in
   * £800 of taxed income and £1,000 lands.
   */
  bonusRatePct: number
  /**
   * Contribution ceiling the top-up applies to — £4,000 for a LISA. Pension
   * relief has no practical ceiling at these amounts, so a SIPP leaves this
   * at `NO_BONUS_CAP`.
   */
  bonusCapAnnual: number
  /**
   * Changes to `annualContribution` at set ages, in the same shape as the
   * household's spending changes: the base amount applies until the first
   * step, then each step replaces it from its age on.
   *
   * This is also how a pot that is not being paid into *yet* is expressed —
   * a base amount of 0 and a step at the age the payments start — so there is
   * no separate start age to keep in step with this list.
   */
  contributionSchedule: ContributionStep[]
  /** Age at which contributions must stop, e.g. 50 for a LISA. */
  contributionEndAge: number
  /** When true, `contributionEndAge` is ignored and tracks the retirement age. */
  contributionEndsAtRetirement: boolean
  /** Whose age governs the access and contribution ages above. */
  ownerId: string
}

/**
 * Defined contribution builds a pot you draw down. Defined benefit (e.g. the
 * Civil Service Nuvos scheme) builds an annual income paid from a set age —
 * there is no pot, so it can never be drawn on early or run out.
 */
export type PensionType = 'dc' | 'db'

/**
 * One tranche of defined-benefit pension. Someone can hold several with
 * different rules — a civil servant moved from Nuvos to alpha in 2015 keeps
 * preserved Nuvos benefits payable at 65 alongside alpha accruing to their
 * State Pension Age.
 */
export interface DbScheme {
  id: string
  name: string
  /** Annual pension already built up in this scheme, in today's money. */
  accruedAnnualPension: number
  /** Share of salary added each year. Nuvos 2.3%, alpha 2.32%. */
  accrualRatePct: number
  /** False for a preserved scheme that no longer builds up. */
  accruing: boolean
  /** Age the pension starts. Ignored when `followsStatePensionAge` is set. */
  normalPensionAge: number
  /** alpha's pension age tracks the State Pension Age. */
  followsStatePensionAge: boolean
  /** One-off tax-free lump sum paid when the pension starts. */
  lumpSum: number
}

export interface Person {
  id: string
  name: string
  currentAge: number
  retirementAge: number
  lifeExpectancy: number

  /** Gross salary — drives pension accrual and contribution percentages. */
  currentAnnualIncome: number
  /**
   * Annual pay actually reaching the bank, after tax, NI and pension
   * contributions. This is what the household can spend. 0 means "same as
   * gross", which overstates spendable income.
   */
  takeHomePay: number
  salaryGrowthRate: number // nominal annual %

  statePensionAge: number
  statePensionAnnual: number

  pensionType: PensionType

  // --- Defined contribution ---
  currentPensionPot: number
  employeePensionPct: number
  employerPensionPct: number
  pensionGrowthRate: number // nominal annual %
  pensionAccessAge: number

  // --- Defined benefit (career average, e.g. Nuvos and alpha) ---
  dbSchemes: DbScheme[]
}

/**
 * A home or other property.
 *
 * Deliberately not a pot: you cannot take £500 a year out of a house. Its
 * value sits in the plan as wealth, and the only way it becomes spendable is
 * selling — which is why `sellAtAge` and `replacementValue` carry the whole
 * feature. Buying something smaller releases the difference; buying nothing
 * releases the lot.
 */
export interface Property {
  id: string
  name: string
  /** What it would fetch today, before any costs of selling. */
  value: number
  /** Nominal annual house price growth, reduced by inflation like any rate. */
  growthRate: number
  /** Still owed on it. Cleared from the proceeds when it is sold. */
  mortgageBalance: number
  /** Yearly mortgage payment while there are years left to run. */
  mortgageAnnualPayment: number
  mortgageYearsRemaining: number
  /** The one you live in. Informational: no tax treatment hangs on it. */
  isMainHome: boolean
  /** Owner's age at which it is sold, or null to keep it for the whole plan. */
  sellAtAge: number | null
  /**
   * What is bought in its place, in today's money. 0 sells outright; a smaller
   * figure than `value` is a downsize, and the difference is what is released.
   */
  replacementValue: number
  /** Agent, legal and moving costs, plus any tax on the gain, as % of value. */
  sellingCostsPct: number
  /** Where the released money lands: a pot id, or `pension:<personId>`. */
  proceedsTargetId: string
  /** Whose age `sellAtAge` refers to. */
  ownerId: string
}

/** How each year's income shortfall is taken from the available sources. */
export type DrawdownStrategy = 'proportional' | 'priority'

/** Identifies a person's DC pension within `Assumptions.drawdownOrder`. */
export function pensionSourceId(personId: string): string {
  return `pension:${personId}`
}

export function personIdFromSource(sourceId: string): string | null {
  return sourceId.startsWith('pension:') ? sourceId.slice('pension:'.length) : null
}

/**
 * A one-off lump sum moving in or out of a savings pot or a DC pension at a
 * set age — an inheritance or a windfall coming in, a gift or a big one-time
 * cost going out, or a lump sum paid into a pension. Unlike a spending change
 * it happens once, in a single year.
 *
 * The money comes from outside the plan: it is not taken from income or from
 * another pot, so paying into a pension here is new money arriving, not a
 * transfer. The amount is what lands — no tax relief is added.
 */
export interface OneOffEvent {
  id: string
  name: string
  /** Age of the first person in the year it happens. */
  atAge: number
  /** Positive money in, negative money out. */
  amount: number
  /**
   * Where it lands, or is taken from: a savings pot id, or `pension:<personId>`
   * for someone's DC pension — the same source ids `drawdownOrder` uses.
   */
  targetId: string
}

/**
 * A change in planned household spending at a given age of the first person.
 */
export interface SpendingBand {
  id: string
  fromAge: number
  amount: number
}

import type { TaxSettings } from './tax'

export interface Assumptions {
  /** Everyone in the household. The first person anchors the age axis. */
  people: Person[]

  /** Savings and investments, shared across the household. */
  pots: SavingsPot[]

  /** Homes and other property. Wealth, but not something you can draw on. */
  properties: Property[]

  drawdownStrategy: DrawdownStrategy
  /** Source ids in priority order — pot ids plus `pension:<personId>`. */
  drawdownOrder: string[]

  inflationRate: number // nominal annual %

  /** Income tax applied to pension income (salaries are entered net). */
  tax: TaxSettings

  // Shared household spending, in today's money.
  // Regular costs are entered monthly; one-off yearly items (holidays,
  // renovations) are entered as an annual figure on top.
  livingCostsMonthly: number
  livingCostsAnnualExtras: number
  retirementMonthly: number
  retirementAnnualExtras: number
  /** Later step-changes, expressed as a total for the year. */
  spendingChanges: SpendingBand[]

  /** One-off lump sums in or out of a pot, e.g. an inheritance or a gift. */
  oneOffEvents: OneOffEvent[]

}

/** One person's position in a given projection year. */
export interface PersonYear {
  id: string
  name: string
  age: number
  retired: boolean
  /** Gross pay this year. */
  salary: number
  /** Spendable pay this year, after tax, NI and pension contributions. */
  takeHome: number
  /** DC only: paid in this year. */
  pensionContribution: number
  /** DC only: pot balance after growth and any withdrawal. */
  pensionPot: number
  /** DC only: taken from the pot this year. */
  pensionWithdrawal: number
  /** DB only: per-scheme position this year. */
  dbSchemes: { id: string; name: string; accrued: number; income: number }[]
  /** DB only: total pension being paid this year. */
  dbIncome: number
  statePension: number
  /** Income tax due on this person's pension income this year. */
  taxPaid: number
  /** Gross DC withdrawal that was taxable (the non tax-free share). */
  taxablePensionWithdrawal: number
}

export interface YearRow {
  /** Calendar year. */
  year: number
  /** Years from now (0 = this year). */
  t: number
  /** Age of the first person, used for age-based labelling and spending bands. */
  age: number
  people: PersonYear[]

  /** Pot balance at the start of the year, before growth and contributions. */
  potStartBalances: number[]
  /** Growth earned on the starting balance this year. */
  potInterest: number[]
  /** Pot balance at the end of the year. */
  potBalances: number[]
  potWithdrawals: number[]
  potContributions: number[]
  /** One-off lump sums applied this year: positive in, negative out. */
  potOneOffs: number[]
  potsTotal: number

  /** End-of-year value of each property. */
  propertyValues: number[]
  /** Still owed on each property at the end of the year. */
  propertyMortgages: number[]
  /** Property value less what is still owed — wealth, but not spendable. */
  propertyEquityTotal: number
  /**
   * Released into a pot by selling or downsizing this year, after costs and
   * paying off the mortgage. Zero in every other year.
   */
  propertyReleased: number

  /** Combined DC pension pots. */
  pensionsTotal: number
  /** Pots plus DC pensions: what the plan can actually draw on. */
  totalPot: number
  /** `totalPot` plus property equity. */
  netWorth: number
  /** Portion of `totalPot` not accessible this year. */
  lockedBalance: number

  /** Combined take-home pay — the part of salary the household can spend. */
  salaryTotal: number
  /** Combined gross pay, for reference. */
  grossSalaryTotal: number
  statePensionTotal: number
  dbIncomeTotal: number
  /** Salary + state pensions + DB pensions, before any drawdown. */
  guaranteedIncome: number
  /** Total income tax across the household this year. */
  taxPaid: number
  /** Gross income less tax — what's actually available to spend. */
  netIncome: number

  mortgagePayment: number
  mortgageActive: boolean
  /**
   * Paid into savings pots this year. Money moved into a pot has left the
   * spendable budget, so it is part of `outgoings` rather than a separate
   * total. Pension contributions are not included: they come out before
   * take-home pay, so they never reach the budget in the first place.
   */
  potContributionsTotal: number
  outgoings: number
  /** True once every person has passed their retirement age. */
  householdRetired: boolean

  withdrawal: number
  shortfall: number
  depleted: boolean
  blockedByLock: boolean
}
