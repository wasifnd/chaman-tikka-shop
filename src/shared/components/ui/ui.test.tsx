// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Alert } from './Alert';
import { Button } from './Button';
import { Input } from './Input';
import { Skeleton } from './Skeleton';

afterEach(cleanup);

describe('Button', () => {
  it('defaults to type=button and fires clicks', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Order</Button>);
    const button = screen.getByRole('button', { name: 'Order' });
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled and busy while loading', () => {
    render(<Button loading>Saving</Button>);
    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('respects an explicit disabled prop and custom variant', () => {
    render(
      <Button disabled variant="ghost">
        Nope
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Nope' })).toBeDisabled();
  });
});

describe('Input', () => {
  it('associates the label with the field', () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('exposes the error to assistive tech', () => {
    render(<Input label="Email" error="Enter a valid email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid email');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email');
  });

  it('has no error markup when valid', () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Alert and Skeleton', () => {
  it('renders an alert and a hidden skeleton', () => {
    const { container } = render(
      <>
        <Alert>Oops</Alert>
        <Skeleton className="h-4 w-10" />
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Oops');
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('h-4', 'w-10');
  });
});
