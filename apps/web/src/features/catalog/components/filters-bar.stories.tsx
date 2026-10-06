import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ACCESSORIES } from '@/test/fixtures';
import { DEFAULT_FILTERS } from '../filters';
import { FiltersBar } from './filters-bar';

const meta = {
  title: 'Catalog/FiltersBar',
  component: FiltersBar,
  args: {
    filters: DEFAULT_FILTERS,
    categories: [ACCESSORIES, { id: 'c2', name: 'Monitors', productCount: 4 }],
    onChange: fn(),
    onReset: fn(),
    isFiltered: false,
  },
} satisfies Meta<typeof FiltersBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Filtered: Story = {
  args: {
    filters: {
      ...DEFAULT_FILTERS,
      search: 'mouse',
      minPrice: '5',
      maxPrice: '50',
      sort: 'price_asc',
    },
    isFiltered: true,
  },
};
export const CategoriesLoading: Story = { args: { categories: undefined } };
