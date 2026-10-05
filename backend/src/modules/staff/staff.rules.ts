export function isStaffEligibleForServices(
  workStatus: string,
  assignedServiceIds: Iterable<string>,
  requestedServiceIds: readonly string[]
): boolean {
  if (workStatus !== 'ON_DUTY') return false;
  const assigned = new Set(assignedServiceIds);
  return requestedServiceIds.every((serviceId) => assigned.has(serviceId));
}