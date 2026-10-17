// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderAdmin, useApiMock } from '../testing/harness';
import { AdminForm, DateTimeField, DeleteButton, ImageField } from './form-parts';

afterEach(cleanup);

describe('AdminForm', () => {
  it('has Save and Cancel, and shows the general error above the fields', () => {
    const onCancel = vi.fn();
    renderAdmin(
      <AdminForm
        onSubmit={(e) => {
          e.preventDefault();
        }}
        formError="Something broke"
        saving={false}
        onCancel={onCancel}
      >
        <input aria-label="Field" />
      </AdminForm>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something broke');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('locks both buttons while saving and says so', () => {
    renderAdmin(
      <AdminForm onSubmit={() => undefined} formError={null} saving onCancel={() => undefined}>
        <span />
      </AdminForm>,
    );
    expect(screen.getByRole('button', { name: 'Saving' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('omits Cancel when there is nowhere to go back to', () => {
    renderAdmin(
      <AdminForm onSubmit={() => undefined} formError={null} saving={false}>
        <span />
      </AdminForm>,
    );
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('submits through the form', () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => {
      e.preventDefault();
    });
    renderAdmin(
      <AdminForm onSubmit={onSubmit} formError={null} saving={false}>
        <span />
      </AdminForm>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});

describe('DeleteButton', () => {
  it('needs a second tap, and nothing is deleted by the first', () => {
    const onConfirm = vi.fn();
    renderAdmin(<DeleteButton label="Delete Naan" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Naan' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirm: Delete Naan' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm: Delete Naan' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    // and it goes back to the first state
    expect(screen.getByRole('button', { name: 'Delete Naan' })).toBeInTheDocument();
  });

  it('can be backed out of', () => {
    const onConfirm = vi.fn();
    renderAdmin(<DeleteButton label="Delete Naan" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Naan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete Naan' })).toBeInTheDocument();
  });

  it('can be disabled', () => {
    renderAdmin(<DeleteButton label="Delete Naan" onConfirm={() => undefined} disabled />);
    expect(screen.getByRole('button', { name: 'Delete Naan' })).toBeDisabled();
  });
});

describe('DateTimeField', () => {
  it('shows an instant as Karachi time', () => {
    renderAdmin(
      <DateTimeField label="Starts" value="2026-10-17T13:30:00.000Z" onChange={() => undefined} />,
    );
    expect(screen.getByLabelText('Starts (Karachi time)')).toHaveValue('2026-10-17T18:30');
  });

  it('is empty when there is no date', () => {
    renderAdmin(<DateTimeField label="Starts" value={null} onChange={() => undefined} />);
    expect(screen.getByLabelText('Starts (Karachi time)')).toHaveValue('');
  });

  it('turns what was typed (Karachi time) back into an instant, and empty into nothing', () => {
    const onChange = vi.fn();
    // Like a real form, the value kept by the parent is what the box shows.
    function Harness() {
      const [value, setValue] = useState<string | null>(null);
      return (
        <DateTimeField
          label="Ends"
          value={value}
          onChange={(iso) => {
            onChange(iso);
            setValue(iso);
          }}
        />
      );
    }
    renderAdmin(<Harness />);
    const input = screen.getByLabelText('Ends (Karachi time)');
    fireEvent.change(input, { target: { value: '2026-10-18T09:00' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-10-18T04:00:00.000Z');
    expect(input).toHaveValue('2026-10-18T09:00');
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('shows an error message', () => {
    renderAdmin(
      <DateTimeField label="Ends" value={null} onChange={() => undefined} error="Too early" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Too early');
  });
});

describe('ImageField', () => {
  const api = useApiMock();
  const field = (uploadsEnabled: boolean, onUploaded = vi.fn()) =>
    renderAdmin(
      <ImageField
        inputProps={{ name: 'photo' }}
        onUploaded={onUploaded}
        uploadsEnabled={uploadsEnabled}
      />,
    );

  it('explains how to add a photo when uploads are not set up', () => {
    field(false);
    expect(screen.getByLabelText('Photo address')).toBeInTheDocument();
    expect(screen.getByText(/not set up yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/upload a photo/i)).toBeNull();
  });

  it('uploads a chosen photo and hands back its address', async () => {
    api.succeed('POST', '/api/v1/admin/uploads/sign', {
      cloudName: 'demo',
      apiKey: 'k',
      timestamp: 1,
      folder: 'bbq-store',
      signature: 's',
    });
    // The second request goes to Cloudinary, not to us.
    const original = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        if (input.startsWith('https://api.cloudinary.com')) {
          return Response.json({
            secure_url: 'https://res.cloudinary.com/demo/image/upload/new.png',
          });
        }
        return original(input, init);
      }),
    );

    const onUploaded = vi.fn();
    field(true, onUploaded);
    fireEvent.change(screen.getByLabelText(/upload a photo/i), {
      target: { files: [new File(['x'], 'p.png', { type: 'image/png' })] },
    });
    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith(
        'https://res.cloudinary.com/demo/image/upload/new.png',
      );
    });
  });

  it('shows why an upload failed and does not change the address', async () => {
    const onUploaded = vi.fn();
    field(true, onUploaded);
    fireEvent.change(screen.getByLabelText(/upload a photo/i), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose an image file');
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('does nothing when the file picker is cancelled', () => {
    const onUploaded = vi.fn();
    field(true, onUploaded);
    fireEvent.change(screen.getByLabelText(/upload a photo/i), { target: { files: [] } });
    expect(onUploaded).not.toHaveBeenCalled();
    expect(api.calls).toHaveLength(0);
  });
});
