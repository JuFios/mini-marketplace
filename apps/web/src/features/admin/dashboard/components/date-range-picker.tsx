import { Button, FormField, Input } from '@/shared/ui';
import { getRangeError, type DateRange } from '../date-range';

export interface DateRangePickerProps {
  /** What the inputs show, valid or not. */
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Ready-made ranges in days, offered as buttons. */
  presets: ReadonlyArray<{ label: string; days: number }>;
  onPreset: (days: number) => void;
}

export function DateRangePicker({ value, onChange, presets, onPreset }: DateRangePickerProps) {
  const error = getRangeError(value);

  return (
    <div className="flex flex-wrap items-start gap-4">
      <FormField label="From" className="w-44">
        {(control) => (
          <Input
            type="date"
            value={value.from}
            onChange={(event) => onChange({ ...value, from: event.target.value })}
            {...control}
          />
        )}
      </FormField>
      <FormField label="To" error={error ?? undefined} className="w-44">
        {(control) => (
          <Input
            type="date"
            value={value.to}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
            {...control}
          />
        )}
      </FormField>
      <div className="flex flex-wrap gap-2 pt-6">
        {presets.map((preset) => (
          <Button
            key={preset.days}
            variant="secondary"
            size="sm"
            onClick={() => onPreset(preset.days)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
