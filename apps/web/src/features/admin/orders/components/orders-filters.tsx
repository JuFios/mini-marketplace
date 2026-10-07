import { useState } from 'react';
import { isOrderStatus } from '@/features/orders/filters';
import { STATUS_LABELS } from '@/features/orders/status';
import { useUrlDraft } from '@/shared/hooks/use-url-draft';
import { ORDER_STATUSES } from '@/shared/api/types';
import { Button, FormField, Input, Select } from '@/shared/ui';
import { isDayRangeOrdered, type AdminOrderFilters } from '../filters';

export interface OrdersFiltersProps {
  /** What the URL currently says; the email box and the dates start from it and then run ahead. */
  filters: AdminOrderFilters;
  onChange: (patch: Partial<AdminOrderFilters>) => void;
  onReset: () => void;
  isFiltered: boolean;
}

export function OrdersFilters({ filters, onChange, onReset, isFiltered }: OrdersFiltersProps) {
  const [email, setEmail] = useUrlDraft(filters.customerEmail, (value) =>
    onChange({ customerEmail: value }),
  );
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const rangeError = isDayRangeOrdered(from, to) ? undefined : 'Must not be before the start date';

  // A date field is empty until a whole valid date is entered, so every change is final; an
  // inverted range is shown with its error and simply not applied.
  function changeDates(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    if (isDayRangeOrdered(nextFrom, nextTo)) onChange({ from: nextFrom, to: nextTo });
  }

  function reset() {
    setEmail('');
    setFrom('');
    setTo('');
    onReset();
  }

  return (
    <form
      role="search"
      aria-label="Filter orders"
      onSubmit={(event) => event.preventDefault()}
      className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <FormField label="Customer email">
        {(control) => (
          <Input
            type="search"
            placeholder="Part of an email"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            {...control}
          />
        )}
      </FormField>
      <FormField label="Status">
        {(control) => (
          <Select
            value={filters.status}
            onChange={(event) =>
              onChange({ status: isOrderStatus(event.target.value) ? event.target.value : '' })
            }
            {...control}
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <FormField label="From">
        {(control) => (
          <Input
            type="date"
            value={from}
            onChange={(event) => changeDates(event.target.value, to)}
            {...control}
          />
        )}
      </FormField>
      <FormField label="To" error={rangeError}>
        {(control) => (
          <Input
            type="date"
            value={to}
            onChange={(event) => changeDates(from, event.target.value)}
            {...control}
          />
        )}
      </FormField>
      {isFiltered && (
        <div className="sm:col-span-2 lg:col-span-4">
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset filters
          </Button>
        </div>
      )}
    </form>
  );
}
