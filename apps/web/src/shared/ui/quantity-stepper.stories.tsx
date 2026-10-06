import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { QuantityStepper } from './quantity-stepper';

const meta = {
  title: 'UI/QuantityStepper',
  component: QuantityStepper,
  args: { value: 2, max: 5, onChange: () => undefined },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <QuantityStepper {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof QuantityStepper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AtMinimum: Story = { args: { value: 1 } };
export const AtMaximum: Story = { args: { value: 5 } };
export const Disabled: Story = { args: { disabled: true } };
