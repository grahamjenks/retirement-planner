import { defaultTaxSettings, type TaxSettings } from './tax'
import { pensionSourceId } from './types'
import type {
  Assumptions,
  DbScheme,
  DrawdownStrategy,
  OneOffEvent,
  PensionType,
  PotKind,
  ContributionStep,
  Person,
  Property,
  SavingsPot,
  SpendingBand,
} from './types'

const STORAGE_KEY = 'retirement-planner:assumptions:v3'
const LEGACY_V2 = 'retirement-planner:assumptions:v2'
const LEGACY_V1 = 'retirement-planner:assumptions:v1'

export const NO_CONTRIBUTION_LIMIT = 200

/** A pension pot's relief has no practical ceiling at these amounts. */
export const NO_BONUS_CAP = 1_000_000

/*
 * Ceilings on anything arriving as a list.
 *
 * Every scalar from a file is already clamped, because an age is a loop bound.
 * A list is a loop bound too, and a worse one: the hero runs a retirement
 * search per person, and each search is a full projection over every person
 * and every pot, so the cost of a file grows faster than its size. A crafted
 * backup with a few hundred people wedges the tab — and because the import is
 * saved before the expensive render, it wedges it again on every later visit.
 * These are generous against any real household and cheap against that.
 */
const MAX_PEOPLE = 10
const MAX_POTS = 20
const MAX_PROPERTIES = 20
const MAX_SPENDING_CHANGES = 50
const MAX_ONE_OFF_EVENTS = 50
const MAX_DB_SCHEMES = 10
export const MAX_CONTRIBUTION_STEPS = 20
const MAX_NAME = 60

/** A name from untrusted input: a string, non-empty, and a sane length. */
const name = (v: unknown, fallback: string) =>
  typeof v === 'string' && v.trim() ? v.slice(0, MAX_NAME) : fallback

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`
}

const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/** Oldest age any field accepts. The projection runs a year at a time, so an
 *  age read straight from a file is a loop bound — see MAX_PROJECTION_YEARS. */
const MAX_AGE = 120

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v))

/** An age from untrusted input: finite, and inside a human lifetime. */
const age = (v: unknown, fallback: number) => clamp(num(v, fallback), 0, MAX_AGE)

/** A percentage rate from untrusted input, wide enough for any real plan but
 *  not wide enough to overflow a compounding term. */
const rate = (v: unknown, fallback: number) => clamp(num(v, fallback), -100, 1000)

export function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: newId(),
    name: 'Me',
    currentAge: 40,
    retirementAge: 60,
    lifeExpectancy: 90,
    currentAnnualIncome: 45000,
    takeHomePay: 0,
    salaryGrowthRate: 3.5,
    statePensionAge: 67,
    statePensionAnnual: 11500,
    pensionType: 'dc',
    currentPensionPot: 0,
    employeePensionPct: 5,
    employerPensionPct: 5,
    pensionSchedule: [],
    pensionGrowthRate: 5,
    pensionAccessAge: 57,
    dbSchemes: [],
    ...overrides,
  }
}

function makeScheme(overrides: Partial<DbScheme> = {}): DbScheme {
  return {
    id: newId(),
    name: 'Pension scheme',
    accruedAnnualPension: 0,
    accrualRatePct: 2.3,
    accruing: true,
    normalPensionAge: 65,
    followsStatePensionAge: false,
    lumpSum: 0,
    ...overrides,
  }
}

export interface DbSchemePreset {
  label: string
  description: string
  build: () => DbScheme
}

export const dbSchemePresets: DbSchemePreset[] = [
  {
    label: 'Civil Service — Nuvos (preserved)',
    description: 'Closed in 2015. 2.3% accrual, payable at 65. No longer building up.',
    build: () =>
      makeScheme({
        name: 'Nuvos (preserved)',
        accrualRatePct: 2.3,
        accruing: false,
        normalPensionAge: 65,
      }),
  },
  {
    label: 'Civil Service — alpha',
    description: 'From 2015. 2.32% accrual, payable at State Pension Age.',
    build: () =>
      makeScheme({
        name: 'alpha',
        accrualRatePct: 2.32,
        accruing: true,
        followsStatePensionAge: true,
      }),
  },
  {
    label: 'Other career-average scheme',
    description: 'NHS, teachers, local government or similar.',
    build: () => makeScheme({ name: 'Career average scheme', accrualRatePct: 1.85 }),
  },
]

/** A civil servant who moved from Nuvos to alpha in 2015 holds both. */
export function makeNuvosPartner(): Person {
  return makePerson({
    name: 'Partner',
    pensionType: 'db',
    currentPensionPot: 0,
    dbSchemes: [dbSchemePresets[0].build(), dbSchemePresets[1].build()],
  })
}

export function makeDbScheme(overrides: Partial<DbScheme> = {}): DbScheme {
  return makeScheme(overrides)
}

function coerceScheme(raw: unknown, index: number): DbScheme {
  const d = (raw ?? {}) as Partial<DbScheme>
  const base = makeScheme()
  return {
    id: typeof d.id === 'string' && d.id ? d.id : `scheme-${index}-${newId()}`,
    name: name(d.name, `Scheme ${index + 1}`),
    accruedAnnualPension: num(d.accruedAnnualPension, base.accruedAnnualPension),
    accrualRatePct: rate(d.accrualRatePct, base.accrualRatePct),
    accruing: d.accruing !== false,
    normalPensionAge: age(d.normalPensionAge, base.normalPensionAge),
    followsStatePensionAge: d.followsStatePensionAge === true,
    lumpSum: num(d.lumpSum, base.lumpSum),
  }
}

export interface PotPreset {
  label: string
  description: string
  defaults: Omit<SavingsPot, 'id' | 'ownerId'>
}

const basePot = {
  kind: 'savings' as const,
  balance: 0,
  costBasis: 0,
  contributionSchedule: [] as ContributionStep[],
  annualContribution: 0,
  accessibleFromAge: 0,
  accessAtRetirement: false,
  bonusRatePct: 0,
  bonusCapAnnual: 0,
  contributionEndAge: NO_CONTRIBUTION_LIMIT,
  contributionEndsAtRetirement: false,
}

export const potPresets: PotPreset[] = [
  {
    label: 'Cash ISA',
    description: 'Tax-free cash savings, accessible any time.',
    defaults: { ...basePot, name: 'Cash ISA', growthRate: 3 },
  },
  {
    label: 'Stocks & Shares ISA',
    description: 'Tax-free investments, accessible any time.',
    defaults: { ...basePot, name: 'Stocks & Shares ISA', growthRate: 5 },
  },
  {
    label: 'Lifetime ISA (LISA)',
    description: '25% government bonus on up to £4,000/yr. Locked until 60.',
    defaults: {
      ...basePot,
      name: 'Lifetime ISA',
      growthRate: 5,
      annualContribution: 4000,
      accessibleFromAge: 60,
      bonusRatePct: 25,
      bonusCapAnnual: 4000,
      contributionEndAge: 50,
    },
  },
  {
    label: 'SIPP (self-invested pension)',
    description:
      'Basic-rate relief tops contributions up by 25%. Locked until 57, then taxed like any pension.',
    defaults: {
      ...basePot,
      kind: 'pension' as const,
      name: 'SIPP',
      growthRate: 5,
      accessibleFromAge: 57,
      bonusRatePct: 25,
      bonusCapAnnual: NO_BONUS_CAP,
      // Relief stops at 75; nobody in this model is contributing that late,
      // but the figure is the real one rather than "no limit".
      contributionEndAge: 75,
    },
  },
  {
    label: 'Old workplace pension',
    description: 'A pot from a previous job, no longer contributed to.',
    defaults: {
      ...basePot,
      kind: 'pension' as const,
      name: 'Old workplace pension',
      growthRate: 5,
      accessibleFromAge: 57,
      contributionEndAge: 0,
    },
  },
  {
    label: 'General investment account',
    description: 'Investments outside a wrapper. Gains are taxed when you sell.',
    defaults: {
      ...basePot,
      kind: 'taxable' as const,
      name: 'General investment account',
      growthRate: 5,
    },
  },
  {
    label: 'Cash savings',
    description: 'Everyday savings and emergency fund.',
    defaults: { ...basePot, name: 'Cash savings', growthRate: 2 },
  },
]

function buildDefaults(): Assumptions {
  const me = makePerson({
    id: 'person-me',
    name: 'Me',
    currentAge: 40,
    retirementAge: 60,
    currentAnnualIncome: 50000,
    currentPensionPot: 100000,
  })
  const pots: SavingsPot[] = [
    {
      ...potPresets[0].defaults,
      id: 'pot-cash-isa',
      ownerId: me.id,
      balance: 10000,
      annualContribution: 1500,
    },
    {
      ...potPresets[1].defaults,
      id: 'pot-ss-isa',
      ownerId: me.id,
      balance: 10000,
      annualContribution: 1500,
    },
  ]
  const home = makeProperty({
    id: 'property-home',
    name: 'Home',
    ownerId: me.id,
    value: 350000,
    mortgageBalance: 150000,
    mortgageAnnualPayment: 12000,
    mortgageYearsRemaining: 15,
    proceedsTargetId: pots[0].id,
  })
  return {
    people: [me],
    pots,
    properties: [home],
    drawdownStrategy: 'proportional',
    drawdownOrder: [...pots.map((p) => p.id), pensionSourceId(me.id)],
    inflationRate: 2.5,
    tax: { ...defaultTaxSettings },
    livingCostsMonthly: 1500,
    livingCostsAnnualExtras: 4000,
    retirementMonthly: 1900,
    retirementAnnualExtras: 5200,
    spendingChanges: [],
    oneOffEvents: [],
  }
}

export const defaultAssumptions: Assumptions = buildDefaults()

function coercePerson(raw: unknown, index: number): Person {
  const p = (raw ?? {}) as Partial<Person>
  const base = makePerson()
  return {
    ...base,
    id: typeof p.id === 'string' && p.id ? p.id : `person-${index}-${newId()}`,
    name: name(p.name, `Person ${index + 1}`),
    currentAge: age(p.currentAge, base.currentAge),
    retirementAge: age(p.retirementAge, base.retirementAge),
    lifeExpectancy: age(p.lifeExpectancy, base.lifeExpectancy),
    currentAnnualIncome: num(p.currentAnnualIncome, base.currentAnnualIncome),
    takeHomePay: num(p.takeHomePay, base.takeHomePay),
    salaryGrowthRate: rate(p.salaryGrowthRate, base.salaryGrowthRate),
    statePensionAge: age(p.statePensionAge, base.statePensionAge),
    statePensionAnnual: num(p.statePensionAnnual, base.statePensionAnnual),
    pensionType: (p.pensionType === 'db' ? 'db' : 'dc') as PensionType,
    currentPensionPot: num(p.currentPensionPot, base.currentPensionPot),
    employeePensionPct: rate(p.employeePensionPct, base.employeePensionPct),
    employerPensionPct: rate(p.employerPensionPct, base.employerPensionPct),
    pensionSchedule: Array.isArray(p.pensionSchedule)
      ? p.pensionSchedule.slice(0, MAX_CONTRIBUTION_STEPS).map(coerceContributionStep)
      : [],
    pensionGrowthRate: rate(p.pensionGrowthRate, base.pensionGrowthRate),
    pensionAccessAge: age(p.pensionAccessAge, base.pensionAccessAge),
    dbSchemes: Array.isArray(p.dbSchemes)
      ? p.dbSchemes.slice(0, MAX_DB_SCHEMES).map(coerceScheme)
      : legacySchemeFrom(raw),
  }
}

/** Folds the old single-scheme fields into a one-element list. */
function legacySchemeFrom(raw: unknown): DbScheme[] {
  const p = (raw ?? {}) as Record<string, unknown>
  const accrued = num(p.dbAccruedAnnualPension, 0)
  const rate = num(p.dbAccrualRatePct, 0)
  if (accrued <= 0 && rate <= 0) return []
  return [
    coerceScheme(
      {
        name: 'Pension scheme',
        accruedAnnualPension: accrued,
        accrualRatePct: rate || 2.3,
        accruing: true,
        normalPensionAge: age(p.dbNormalPensionAge, 65),
        lumpSum: num(p.dbLumpSum, 0),
      },
      0,
    ),
  ]
}

/** The name the GIA preset has always created pots under. */
const GIA_PRESET_NAME = 'General investment account'

/**
 * A general investment account used to be stored as an ordinary savings pot,
 * because the preset was identical to the Stocks & Shares ISA one — so plans
 * saved before this hold a GIA that is modelled as tax-free.
 *
 * Those are moved across on load. Nothing about the projection changes when
 * they are: the base cost defaults to the balance, so the pot carries no gain
 * and owes no tax until someone says what they actually paid. What they get
 * is the field to say it in.
 */
function coercePotKind(p: Partial<SavingsPot>): PotKind {
  if (p.kind === 'pension' || p.kind === 'taxable') return p.kind
  if (typeof p.name === 'string' && p.name.trim() === GIA_PRESET_NAME) return 'taxable'
  return 'savings'
}

function coercePot(raw: unknown, index: number, ownerFallback: string): SavingsPot {
  const p = (raw ?? {}) as Partial<SavingsPot>
  const base = potPresets[0].defaults
  const kind = coercePotKind(p)
  const balance = num(p.balance, base.balance)
  /*
   * A pot that was not taxable when it was saved has no base cost worth
   * reading — either the field is absent entirely, or it holds the 0 that
   * every non-taxable pot carries. Either way the balance is the only honest
   * answer: it assumes no gain, so promoting a pot changes no projection
   * until someone says what they actually paid.
   */
  const costBasis = p.kind === 'taxable' ? num(p.costBasis, balance) : balance
  return {
    id: typeof p.id === 'string' && p.id ? p.id : `pot-${index}-${newId()}`,
    name: name(p.name, `Pot ${index + 1}`),
    kind,
    balance,
    costBasis,
    annualContribution: num(p.annualContribution, base.annualContribution),
    growthRate: rate(p.growthRate, base.growthRate),
    accessibleFromAge: age(p.accessibleFromAge, base.accessibleFromAge),
    accessAtRetirement: p.accessAtRetirement === true,
    bonusRatePct: rate(p.bonusRatePct, base.bonusRatePct),
    bonusCapAnnual: num(p.bonusCapAnnual, base.bonusCapAnnual),
    contributionSchedule: Array.isArray(p.contributionSchedule)
      ? p.contributionSchedule.slice(0, MAX_CONTRIBUTION_STEPS).map(coerceContributionStep)
      : [],
    contributionEndAge: age(p.contributionEndAge, base.contributionEndAge),
    contributionEndsAtRetirement: p.contributionEndsAtRetirement === true,
    ownerId: typeof p.ownerId === 'string' && p.ownerId ? p.ownerId : ownerFallback,
  }
}

export function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: newId(),
    name: 'Home',
    value: 350000,
    growthRate: 3,
    mortgageBalance: 0,
    mortgageAnnualPayment: 0,
    mortgageYearsRemaining: 0,
    isMainHome: true,
    sellAtAge: null,
    replacementValue: 0,
    // Agent and legal fees run to roughly 2-3% of a sale; the rest of the
    // allowance is there for moving costs, and for any tax on a gain where
    // the property is not the one you live in.
    sellingCostsPct: 3,
    proceedsTargetId: '',
    ownerId: '',
    ...overrides,
  }
}

function coerceProperty(raw: unknown, index: number, ownerFallback: string): Property {
  const pr = (raw ?? {}) as Partial<Property>
  const base = makeProperty()
  const sellAt = pr.sellAtAge
  return {
    id: typeof pr.id === 'string' && pr.id ? pr.id : `property-${index}-${newId()}`,
    name: name(pr.name, `Property ${index + 1}`),
    value: Math.max(0, num(pr.value, base.value)),
    growthRate: rate(pr.growthRate, base.growthRate),
    mortgageBalance: Math.max(0, num(pr.mortgageBalance, 0)),
    mortgageAnnualPayment: Math.max(0, num(pr.mortgageAnnualPayment, 0)),
    mortgageYearsRemaining: age(pr.mortgageYearsRemaining, 0),
    isMainHome: pr.isMainHome === true,
    // null means "never sold", which is different from "sell at age 0".
    sellAtAge: typeof sellAt === 'number' && Number.isFinite(sellAt) ? age(sellAt, 60) : null,
    replacementValue: Math.max(0, num(pr.replacementValue, 0)),
    sellingCostsPct: clamp(num(pr.sellingCostsPct, base.sellingCostsPct), 0, 100),
    proceedsTargetId:
      typeof pr.proceedsTargetId === 'string' ? pr.proceedsTargetId.slice(0, MAX_NAME) : '',
    ownerId: typeof pr.ownerId === 'string' && pr.ownerId ? pr.ownerId : ownerFallback,
  }
}

function coerceContributionStep(raw: unknown, index: number): ContributionStep {
  const c = (raw ?? {}) as Partial<ContributionStep>
  return {
    id: typeof c.id === 'string' && c.id ? c.id : `step-${index}-${newId()}`,
    fromAge: age(c.fromAge, 0),
    amount: Math.max(0, num(c.amount, 0)),
  }
}

function coerceBand(raw: unknown, index: number): SpendingBand {
  const b = (raw ?? {}) as Partial<SpendingBand>
  return {
    id: typeof b.id === 'string' && b.id ? b.id : `band-${index}-${newId()}`,
    fromAge: age(b.fromAge, 60),
    amount: num(b.amount, 0),
  }
}

function coerceOneOff(raw: unknown, index: number, targetFallback: string): OneOffEvent {
  // Records written before pensions could receive a lump sum name the
  // destination `potId`; it only ever held a savings pot id, so it carries
  // straight over.
  const e = (raw ?? {}) as Partial<OneOffEvent> & { potId?: unknown }
  const target = [e.targetId, e.potId].find((v): v is string => typeof v === 'string' && v !== '')
  return {
    id: typeof e.id === 'string' && e.id ? e.id : `oneoff-${index}-${newId()}`,
    name: name(e.name, 'Inheritance'),
    atAge: age(e.atAge, 60),
    amount: num(e.amount, 0),
    targetId: target ?? targetFallback,
  }
}

/**
 * Resolves the monthly/extras pair, falling back to an older single annual
 * figure by splitting it into whole months plus the remainder — so the yearly
 * total is preserved exactly across the upgrade.
 */
function splitCosts(
  parsed: Record<string, unknown>,
  monthlyKey: string,
  extrasKey: string,
  legacyAnnualKey: string,
  fallbackMonthly: number,
  fallbackExtras: number,
): { monthly: number; extras: number } {
  const hasNew = typeof parsed[monthlyKey] === 'number' || typeof parsed[extrasKey] === 'number'
  if (hasNew) {
    return {
      monthly: num(parsed[monthlyKey], fallbackMonthly),
      extras: num(parsed[extrasKey], fallbackExtras),
    }
  }
  const legacy = parsed[legacyAnnualKey]
  if (typeof legacy === 'number' && Number.isFinite(legacy)) {
    const monthly = Math.round(legacy / 12)
    return { monthly, extras: Math.max(0, legacy - monthly * 12) }
  }
  return { monthly: fallbackMonthly, extras: fallbackExtras }
}

function coerceTax(raw: unknown): TaxSettings {
  const t = (raw ?? {}) as Partial<TaxSettings>
  return {
    enabled: t.enabled !== false,
    personalAllowance: num(t.personalAllowance, defaultTaxSettings.personalAllowance),
    basicBandWidth: num(t.basicBandWidth, defaultTaxSettings.basicBandWidth),
    basicRatePct: num(t.basicRatePct, defaultTaxSettings.basicRatePct),
    higherBandWidth: num(t.higherBandWidth, defaultTaxSettings.higherBandWidth),
    higherRatePct: num(t.higherRatePct, defaultTaxSettings.higherRatePct),
    additionalRatePct: num(t.additionalRatePct, defaultTaxSettings.additionalRatePct),
    taperThreshold: num(t.taperThreshold, defaultTaxSettings.taperThreshold),
    pensionTaxFreePct: num(t.pensionTaxFreePct, defaultTaxSettings.pensionTaxFreePct),
    cgtAnnualExempt: num(t.cgtAnnualExempt, defaultTaxSettings.cgtAnnualExempt),
    cgtBasicRatePct: num(t.cgtBasicRatePct, defaultTaxSettings.cgtBasicRatePct),
    cgtHigherRatePct: num(t.cgtHigherRatePct, defaultTaxSettings.cgtHigherRatePct),
    taxFreeLumpSumAllowance: num(
      t.taxFreeLumpSumAllowance,
      defaultTaxSettings.taxFreeLumpSumAllowance,
    ),
  }
}

export function coerceAssumptions(raw: unknown): Assumptions {
  const parsed = (raw ?? {}) as Record<string, unknown>
  const fallback = buildDefaults()

  const people = Array.isArray(parsed.people) && parsed.people.length > 0
    ? parsed.people.slice(0, MAX_PEOPLE).map(coercePerson)
    : fallback.people
  const ownerFallback = people[0].id
  const validOwners = new Set(people.map((p) => p.id))

  const pots = Array.isArray(parsed.pots)
    ? parsed.pots.slice(0, MAX_POTS).map((p, i) => coercePot(p, i, ownerFallback))
    : fallback.pots
  // A pot whose owner was deleted falls back to the first person.
  pots.forEach((pot) => {
    if (!validOwners.has(pot.ownerId)) pot.ownerId = ownerFallback
  })
  // Somewhere a one-off lump sum can land: any savings pot, or a DC pension.
  const oneOffTargets = [
    ...pots.map((p) => p.id),
    ...people.filter((p) => p.pensionType === 'dc').map((p) => pensionSourceId(p.id)),
  ]
  const validOneOffTargets = new Set(oneOffTargets)

  // Records saved before costs were split carry a single annual figure.
  const working = splitCosts(
    parsed,
    'livingCostsMonthly',
    'livingCostsAnnualExtras',
    'livingCostsAnnual',
    fallback.livingCostsMonthly,
    fallback.livingCostsAnnualExtras,
  )
  const retired = splitCosts(
    parsed,
    'retirementMonthly',
    'retirementAnnualExtras',
    'desiredRetirementIncomeAnnual',
    fallback.retirementMonthly,
    fallback.retirementAnnualExtras,
  )

  return {
    people,
    pots,
    properties: coerceProperties(parsed, pots, ownerFallback),
    drawdownStrategy:
      parsed.drawdownStrategy === 'priority'
        ? 'priority'
        : ('proportional' as DrawdownStrategy),
    drawdownOrder: Array.isArray(parsed.drawdownOrder)
      ? parsed.drawdownOrder
          .slice(0, MAX_POTS + MAX_PEOPLE)
          .filter((id): id is string => typeof id === 'string')
      : [...pots.map((p) => p.id), ...people.map((p) => pensionSourceId(p.id))],
    inflationRate: num(parsed.inflationRate, fallback.inflationRate),
    tax: coerceTax(parsed.tax),
    livingCostsMonthly: working.monthly,
    livingCostsAnnualExtras: working.extras,
    retirementMonthly: retired.monthly,
    retirementAnnualExtras: retired.extras,
    spendingChanges: Array.isArray(parsed.spendingChanges)
      ? parsed.spendingChanges.slice(0, MAX_SPENDING_CHANGES).map(coerceBand)
      : [],
    // An event whose destination was deleted — a pot removed, or someone
    // switched to a salary-based pension — falls back to the first one left.
    // With nowhere at all for the money to land it is dropped.
    oneOffEvents:
      Array.isArray(parsed.oneOffEvents) && oneOffTargets.length > 0
        ? parsed.oneOffEvents
            .slice(0, MAX_ONE_OFF_EVENTS)
            .map((e, i) => coerceOneOff(e, i, oneOffTargets[0]))
            .map((e) =>
              validOneOffTargets.has(e.targetId) ? e : { ...e, targetId: oneOffTargets[0] },
            )
        : [],
  }
}

/**
 * Properties, with the household mortgage folded in.
 *
 * Plans saved before properties existed carry a single mortgage payment and a
 * term, and nothing that owns them. Rather than keep two ways to model debt,
 * that pair becomes the mortgage on a Home worth nothing in particular — the
 * payments and the payoff year carry over exactly, and the value is there to
 * be corrected.
 */
function coerceProperties(
  parsed: Record<string, unknown>,
  pots: SavingsPot[],
  ownerFallback: string,
): Property[] {
  if (Array.isArray(parsed.properties)) {
    return parsed.properties
      .slice(0, MAX_PROPERTIES)
      .map((pr, i) => coerceProperty(pr, i, ownerFallback))
  }
  const payment = Math.max(0, num(parsed.mortgageAnnualPayment, 0))
  const years = age(parsed.mortgageYearsRemaining, 0)
  if (payment <= 0 && years <= 0) return []
  return [
    makeProperty({
      id: `property-${newId()}`,
      name: 'Home',
      ownerId: ownerFallback,
      // What is left to pay, as a starting point for a figure only the owner
      // knows. The payments and the term are the parts carried over exactly.
      mortgageBalance: payment * years,
      mortgageAnnualPayment: payment,
      mortgageYearsRemaining: years,
      proceedsTargetId: pots[0]?.id ?? '',
    }),
  ]
}

/** Folds a single-person v2 record into the new household shape. */
function migrateV2(raw: Record<string, unknown>): Assumptions {
  const me = makePerson({
    id: 'person-me',
    name: 'Me',
    currentAge: num(raw.currentAge, 40),
    retirementAge: num(raw.targetRetirementAge, 60),
    lifeExpectancy: num(raw.lifeExpectancy, 90),
    currentAnnualIncome: num(raw.currentAnnualIncome, 45000),
    salaryGrowthRate: num(raw.salaryGrowthRate, 3.5),
    statePensionAge: num(raw.statePensionAge, 67),
    statePensionAnnual: num(raw.statePensionAnnual, 11500),
    pensionType: 'dc',
    currentPensionPot: num(raw.currentPensionPot, 0),
    employeePensionPct: num(raw.employeePensionPct, 5),
    employerPensionPct: num(raw.employerPensionPct, 5),
    pensionGrowthRate: num(raw.pensionGrowthRate, 5),
    pensionAccessAge: num(raw.pensionAccessAge, 57),
  })

  const rawPots = Array.isArray(raw.pots) ? raw.pots : []
  const pots = rawPots.map((p, i) => coercePot(p, i, me.id))

  // v2 stored the pension as the bare id "pension".
  const order = (Array.isArray(raw.drawdownOrder) ? raw.drawdownOrder : [])
    .filter((id): id is string => typeof id === 'string')
    .map((id) => (id === 'pension' ? pensionSourceId(me.id) : id))

  return coerceAssumptions({
    people: [me],
    pots,
    drawdownStrategy: raw.drawdownStrategy,
    drawdownOrder: order,
    inflationRate: num(raw.inflationRate, 2.5),
    livingCostsAnnual: num(raw.livingCostsAnnual, 22000),
    desiredRetirementIncomeAnnual: num(raw.desiredRetirementIncomeAnnual, 28000),

    spendingChanges: raw.spendingChanges,
    mortgageAnnualPayment: num(raw.mortgageAnnualPayment, 12000),
    mortgageYearsRemaining: num(raw.mortgageYearsRemaining, 15),
  })
}

/** Folds the original v1 record (single savings pot, flat contribution) forward. */
function migrateV1(raw: Record<string, unknown>): Assumptions {
  const income = num(raw.currentAnnualIncome, 45000)
  const oldContribution = num(raw.annualPensionContribution, 0)
  const totalPct = income > 0 ? (oldContribution / income) * 100 : 10
  const half = Math.round((totalPct / 2) * 10) / 10

  return migrateV2({
    ...raw,
    employeePensionPct: half,
    employerPensionPct: half,
    pots: [
      {
        id: newId(),
        name: 'Savings & investments',
        balance: num(raw.currentSavings, 0),
        annualContribution: num(raw.annualSavingsContribution, 0),
        growthRate: num(raw.savingsGrowthRate, 4),
        accessibleFromAge: 0,
        accessAtRetirement: false,
        bonusRatePct: 0,
        bonusCapAnnual: 0,
        contributionEndAge: NO_CONTRIBUTION_LIMIT,
        contributionEndsAtRetirement: false,
      },
    ],
  })
}

export function loadAssumptions(): Assumptions {
  if (typeof window === 'undefined') return defaultAssumptions
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return coerceAssumptions(JSON.parse(raw))

    const v2 = window.localStorage.getItem(LEGACY_V2)
    if (v2) {
      const migrated = migrateV2(JSON.parse(v2))
      saveAssumptions(migrated)
      return migrated
    }
    const v1 = window.localStorage.getItem(LEGACY_V1)
    if (v1) {
      const migrated = migrateV1(JSON.parse(v1))
      saveAssumptions(migrated)
      return migrated
    }
    return defaultAssumptions
  } catch {
    return defaultAssumptions
  }
}

export function saveAssumptions(a: Assumptions): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(a))
  } catch {
    // Storage unavailable (private browsing, quota) — the session still works.
  }
}

export function clearAssumptions(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_V2)
    window.localStorage.removeItem(LEGACY_V1)
  } catch {
    // Storage unavailable — reset still clears what's on screen.
  }
}

export function exportAssumptions(a: Assumptions): void {
  const blob = new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `retirement-plan-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function importAssumptions(file: File): Promise<Assumptions> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new Error("That file isn't JSON. Pick a backup exported from this planner.")
  }
  // Everything below reads properties, and `in` throws outright on a primitive.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error("That file doesn't look like a saved plan. Pick a backup exported from this planner.")
  }

  const record = parsed as Record<string, unknown>
  if (Array.isArray(record.people)) return coerceAssumptions(record)
  if (Array.isArray(record.pots)) return migrateV2(record)
  if ('currentSavings' in record) return migrateV1(record)
  return coerceAssumptions(record)
}
