import { formatCurrency, formatMonthly } from '../lib/format'
import { realRate, retirementBaselineAnnual, workingCostsAnnual } from '../lib/projection'
import type { Assumptions } from '../lib/types'

interface PrintHeaderProps {
  assumptions: Assumptions
}

/**
 * Only shown on paper. A printed plan gets separated from the app, so it has to
 * carry its own assumptions — otherwise the numbers can't be checked, or
 * reproduced, months later.
 */
export function PrintHeader({ assumptions: a }: PrintHeaderProps) {
  const printed = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="print-only hidden print-block mb-4">
      <div className="mb-3 flex items-baseline justify-between border-b border-slate-300 pb-2">
        <h1 className="text-lg font-bold">Retirement Plan</h1>
        <span className="text-xs text-slate-500">
          Prepared {printed} · today's money, after {a.inflationRate}% inflation
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-xs">
        <div>
          <p className="mb-1 font-semibold">People</p>
          <ul className="space-y-0.5">
            {a.people.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong> — {p.currentAge} now, retires {p.retirementAge}, to{' '}
                {p.lifeExpectancy}
                <br />
                {formatCurrency(p.currentAnnualIncome)} gross ·{' '}
                {p.pensionType === 'db'
                  ? p.dbSchemes.map((s) => s.name).join(' + ') || 'no scheme'
                  : `${formatCurrency(p.currentPensionPot)} pot, ${
                      p.employeePensionPct + p.employerPensionPct
                    }%`}
                <br />
                State pension {formatCurrency(p.statePensionAnnual)} at {p.statePensionAge}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-1 font-semibold">Savings &amp; growth</p>
          <ul className="space-y-0.5">
            {a.pots.map((pot) => (
              <li key={pot.id}>
                <strong>{pot.name}</strong> — {formatCurrency(pot.balance)}, {formatCurrency(
                  pot.annualContribution,
                )}
                /yr, {pot.growthRate}% ({(realRate(pot.growthRate, a.inflationRate) * 100).toFixed(2)}%
                real)
              </li>
            ))}
            <li>Inflation {a.inflationRate}%</li>
            <li>
              Drawdown:{' '}
              {a.drawdownStrategy === 'priority' ? 'in a set order' : 'spread across all pots'}
            </li>
          </ul>
        </div>

        <div>
          <p className="mb-1 font-semibold">Spending &amp; tax</p>
          <ul className="space-y-0.5">
            <li>
              Working: {formatCurrency(workingCostsAnnual(a))}/yr (
              {formatMonthly(workingCostsAnnual(a))}/mth)
            </li>
            <li>
              Retired: {formatCurrency(retirementBaselineAnnual(a))}/yr (
              {formatMonthly(retirementBaselineAnnual(a))}/mth)
            </li>
            <li>
              Mortgage {formatCurrency(a.mortgageAnnualPayment)}/yr for {a.mortgageYearsRemaining}{' '}
              more years
            </li>
            <li>
              Tax {a.tax.enabled ? 'applied' : 'off'} — allowance{' '}
              {formatCurrency(a.tax.personalAllowance)}, {a.tax.basicRatePct}/{a.tax.higherRatePct}%,{' '}
              {a.tax.pensionTaxFreePct}% of drawdown tax-free
            </li>
          </ul>
        </div>
      </div>

      <p className="mt-2 border-t border-slate-300 pt-2 text-[10px] text-slate-500">
        A planning estimate, not financial advice. Assumes contributions, costs, state and
        salary-based pensions hold their real value; salaries grow at their own rate. Tax on pension
        income only. Investment returns are assumed steady unless the Monte Carlo section says
        otherwise.
      </p>
    </div>
  )
}
