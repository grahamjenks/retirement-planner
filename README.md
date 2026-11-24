# Retirement Planner

A client-side calculator for projecting when a household can afford to retire,
based on pensions, savings, mortgage and spending plans.

## Running it

```bash
npm install
npm run dev
```

## Checks

```bash
npm test          # the projection engine, tax, storage and the optimiser
npm run build     # type-checks with `tsc -b`, then builds
npm run lint
```

`npm test` covers `src/lib` — the parts that decide what the numbers say. The
figures in those tests are worked out by hand in the comments rather than
captured from a previous run, so a change that shifts them has to argue with
the arithmetic rather than just re-record it.

Note that a bare `tsc --noEmit` reports nothing here: the root `tsconfig.json`
is `files: []` plus project references, so `tsc -b` is the real type check.

All three run in CI on every push and pull request.

## How it works

- Everything is modelled in **today's money** (real terms): pots grow at their
  inflation-adjusted rate, and living costs, desired income, state pensions,
  mortgage payments and accrued defined-benefit pensions hold their real value.
  Salaries are the exception — each person has their own growth rate, so pay can
  outpace inflation.
- **The household can hold two people**, each with their own age, retirement
  age, salary, life expectancy and state pension age. The projection runs by
  calendar year, so staggered retirements work naturally: one person's salary
  keeps supporting the household after the other stops.
- **Two pension types.** A *defined contribution* pot (workplace scheme, SIPP)
  is invested, accessible from 55/57, and drawn down. A *defined benefit*
  scheme (Civil Service Nuvos or alpha, NHS, teachers') has no pot at all — each
  year worked accrues a share of salary (Nuvos: 2.3%) as extra annual pension,
  paid for life from its normal pension age (Nuvos: 65). It can't be drawn
  early and can't run out.
- **Savings pots are shared**, each with its own balance, contribution, growth
  rate, access age and contribution end age. A Lifetime ISA is locked until 60,
  takes a 25% bonus on the first £4,000/yr, and closes to contributions at 50.
  Age rules follow whichever person owns the pot.
- **A pot is taxed according to what it is.** An ISA or cash pot pays nothing
  on the way out. A SIPP or other pension is taxed as income when drawn, with
  the usual tax-free quarter. A general investment account is outside any
  wrapper, so selling realises a capital gain — say what the holdings cost and
  the plan works out the tax. Leave that figure alone and it tracks the
  balance, which assumes no gain rather than taxing a guess.
- **Spending is shared**, switching from working-age living costs to retirement
  spending once everyone has retired, with optional step-changes at set ages.
- **One-off events** are lump sums that happen in a single year — an inheritance
  arriving, a gift given away, or a payment into a pension. Each one names an
  age, an amount and where it lands: a savings pot, or someone's DC pension,
  where it is locked until their access age like the rest of the pot. The money
  comes from outside the plan rather than from income or another pot, and the
  amount you enter is the amount that lands. Money out never takes a pot below
  zero.
- **Most you could spend** is the ceiling on retirement living costs: the
  highest flat yearly figure the plan still meets every year to the end, with
  pots and pensions run down to nothing rather than left over. It is found by
  searching for the level at which the plan just stops falling short. Being a
  flat ceiling it ignores any spending step-changes, and like the retirement
  figure it sits alongside the mortgage rather than including it.
- Each year, salaries, state pensions and DB pensions are counted first; any
  gap is drawn from unlocked pots and DC pensions — either spread across them
  proportionally, or in an order you choose.

## Tax

Income tax is applied to pension income — the state pension, salary-based
pensions, and the taxable share of DC drawdown. ISA and cash savings
withdrawals are returns of capital and are not taxed.

Capital gains tax is applied to general investment accounts. Each sale carries
the pot's average cost, so the gain is the pot's unrealised gain scaled by the
share being sold; gains above the £3,000 annual exempt amount are charged at
18% on whatever basic-rate band the owner's income leaves free and 24% above
it. Because the charge is worked out year by year, spreading a sale across
several years to use more than one exempt amount shows up as the saving it is.

Rates and bands are editable under **Income tax**, and the whole thing can be
switched off.

Salaries are held as take-home pay. If you haven't entered your own figure,
it's estimated from gross by taking off pension contributions first, then
income tax and National Insurance — the sidebar shows the working. Enter the
number from your payslip to override it.

## Not modelled

Tax relief and the annual allowance on money paid into a pension: a one-off
payment lands at face value, so enter the gross figure if you want relief
counted, and check the £60,000 allowance yourself.

Dividend and interest tax inside a general investment account: only the gain
on a sale is charged, not the income the holdings throw off along the way.
Capital losses are not carried against gains either — a pot worth less than it
cost simply realises nothing.

Survivor benefits, and any change in spending after a first death. Life
expectancy differs per person, but spending continues at the full rate for the
whole projection. Contributions to a salary-based scheme aren't deducted from
take-home pay.

## Data & privacy

No backend, no analytics. Every input lives only in this browser's
`localStorage`. Use **Export backup** to save a JSON copy, **Import backup** to
restore, or **Reset** to erase. Older single-person saves and backups are
migrated automatically.
