import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, Panel, SkeletonRegion, TableSkeleton, formatMoney } from '../shared/ui';
import { staffApi, type StaffServiceInfo } from './staffApi';

/**
 * The services the signed-in staff member is assigned to perform.
 *
 * The API resolves the assignment from the authenticated account, so this
 * list cannot contain another staff member's services.
 */
export function StaffServicesPanel() {
  const [services, setServices] = useState<StaffServiceInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    staffApi.listServices()
      .then((loaded) => {
        if (!active) return;
        setServices(loaded);
        setLoading(false);
      })
      .catch((cause) => {
        if (!active) return;
        setLoadError(cause instanceof Error ? cause.message : 'Your services could not be loaded.');
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <SkeletonRegion label="Loading your services">
        <TableSkeleton rows={3} columns={4} />
      </SkeletonRegion>
    );
  }
  if (loadError) return <ErrorState>{loadError}</ErrorState>;

  return (
    <Panel
      title="Services I Can Perform"
      meta={`${(services ?? []).length} assigned`}
      className="table-panel large-table"
    >
      {(services ?? []).length === 0 ? (
        <EmptyState>No services are assigned to you yet. A manager assigns services to staff members.</EmptyState>
      ) : (
        <div className="table-scroll">
          <table role="table" className="responsive-table staff-services-table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">Service</th>
                <th role="columnheader" scope="col">Category</th>
                <th role="columnheader" scope="col">Duration</th>
                <th role="columnheader" scope="col">Price</th>
                <th role="columnheader" scope="col">Availability</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {(services ?? []).map((service) => (
                <tr role="row" key={service.id}>
                  <td role="cell" data-label="Service" data-primary>{service.name}</td>
                  <td role="cell" data-label="Category">{service.categoryName}</td>
                  <td role="cell" data-label="Duration">{service.durationMinutes} min</td>
                  <td role="cell" data-label="Price">{formatMoney(service.price)}</td>
                  <td role="cell" data-label="Availability">
                    <span className={`status-badge ${service.isActive ? 'status-completed' : 'status-cancelled'}`}>
                      {service.isActive ? 'Active' : 'Archived'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
