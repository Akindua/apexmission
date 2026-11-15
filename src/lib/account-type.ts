/**
 * Account-type helpers derived from the profile's company_id.
 *
 * Only evaluated after the profile has finished loading (profileHydrated === true
 * and operatorProfile !== null). A personal account has company_id === null; a
 * company account has company_id set.
 */
export function isCompanyAccount(companyId: string | null): boolean {
  return Boolean(companyId);
}

export function isPersonalAccount(companyId: string | null): boolean {
  return !Boolean(companyId);
}
