# Retirement Planner

A client-side calculator for projecting when a household can afford to retire,
based on pensions, savings, mortgage and spending plans.

## Running it

```bash
npm install
npm run dev
```

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
pensions, and the taxable share of DC drawdown. ISA and savings withdrawals are
returns of capital and are not taxed. Rates and bands are editable under
**Income tax**, and the whole thing can be switched off.

Salaries are held as take-home pay. If you haven't entered your own figure,
it's estimated from gross by taking off pension contributions first, then
income tax and National Insurance — the sidebar shows the working. Enter the
number from your payslip to override it.

## Not modelled

Tax relief and the annual allowance on money paid into a pension: a one-off
payment lands at face value, so enter the gross figure if you want relief
counted, and check the £60,000 allowance yourself.

Survivor benefits, and any change in spending after a first death. Life
expectancy differs per person, but spending continues at the full rate for the
whole projection. Contributions to a salary-based scheme aren't deducted from
take-home pay.

## Data & privacy

No backend, no analytics. Every input lives only in this browser's
`localStorage`. Use **Export backup** to save a JSON copy, **Import backup** to
restore, or **Reset** to erase. Older single-person saves and backups are
migrated automatically.
