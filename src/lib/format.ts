const currencyFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
})

const compactCurrencyFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

export function formatCurrencyCompact(value: number): string {
  return compactCurrencyFormatter.format(value)
}

/** Monthly equivalent of an annual figure, for costs people think of per month. */
export function formatMonthly(annual: number): string {
  return formatCurrency(annual / 12)
}

/**
 * Labels something as a particular person's — but only when the household has
 * more than one person it could belong to.
 *
 * On a one-person plan the name is noise, and since a new plan names that
 * person "Me", every legend and heading ends up saying "Me: pension" to
 * someone who never typed a name at all.
 */
export function ownedLabel(what: string, name: string, householdSize: number): string {
  if (householdSize > 1) return `${name}: ${what}`
  return what.charAt(0).toUpperCase() + what.slice(1)
}

/**
 * One person's age for a tooltip or a row heading: named only when there is
 * someone else in the list to tell them apart from.
 */
export function personAge(name: string, age: number, householdSize: number): string {
  return householdSize > 1 ? `${name} ${age}` : String(age)
}
