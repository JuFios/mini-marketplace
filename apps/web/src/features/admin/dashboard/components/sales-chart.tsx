import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SalesDay } from '@/shared/api/types';
import { formatMoney } from '@/shared/lib/money';

export interface SalesChartProps {
  days: SalesDay[];
}

/** `2026-10-07` → `10-07`: the year is in the range picker, and the axis has little room. */
const shortDay = (day: string) => day.slice(5);

/**
 * Revenue per day as bars. The API's amounts are decimal strings; here, and only for drawing,
 * they become numbers (a bar's height does not need cent-exact arithmetic), while every figure
 * shown as text still goes through `formatMoney` with the string.
 */
export function SalesChart({ days }: SalesChartProps) {
  const data = days.map((day) => ({ ...day, amount: Number(day.revenue) }));

  return (
    <div
      role="img"
      aria-label={`Revenue per day from ${days[0]?.date ?? ''} to ${days.at(-1)?.date ?? ''}`}
      className="h-72 w-full text-brand-600"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="date" tickFormatter={shortDay} tick={{ fontSize: 12 }} minTickGap={16} />
          <YAxis
            width={56}
            tick={{ fontSize: 12 }}
            tickFormatter={(value: number) => `$${value}`}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(_value, _name, item) => [
              formatMoney((item.payload as { revenue: string }).revenue),
              'Revenue',
            ]}
          />
          <Bar
            dataKey="amount"
            fill="currentColor"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
