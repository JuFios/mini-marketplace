import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from './form-field';
import { Input } from './input';

describe('FormField', () => {
  it('labels the control', () => {
    render(<FormField label="Email">{(control) => <Input {...control} />}</FormField>);

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('describes the control by its hint and error, and flags it invalid', () => {
    render(
      <FormField label="Email" hint="Used to log in" error="Enter a valid email address">
        {(control) => <Input {...control} />}
      </FormField>,
    );

    const input = screen.getByLabelText('Email');
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('Used to log in Enter a valid email address');
  });

  it('leaves the control valid and undescribed without hint or error', () => {
    render(<FormField label="Email">{(control) => <Input {...control} />}</FormField>);

    const input = screen.getByLabelText('Email');
    expect(input).toBeValid();
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});
