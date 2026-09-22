import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteRateLimitedError } from '@/data/write-limit';
import { WAIT_A_MINUTE } from '@/queries/errors';
import { TEST_USER } from '@/test/factories';
import { NameField } from './NameField';

/**
 * The name control (SPEC §4.6) through the real form, schema and mutation —
 * only the write itself and the toast are stubs. What it asserts is the copy,
 * what reaches the column, and where focus goes, since those are the parts a
 * change to any of the three could break quietly.
 */

const setName = vi.fn();
const success = vi.fn();

// `use-mutations` imports `data/auth`, which subscribes at import time — hence
// the auth stub beside the insert the error path would use.
vi.mock('@/data/client', () => ({
  AUTH_STORAGE_KEY: 'aj-hunt-auth',
  supabase: {
    from: () => ({ insert: async () => ({ error: null }) }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
  },
}));
vi.mock('@/queries/use-session', () => ({
  useSignedInUser: () => TEST_USER,
  useIsSignedIn: () => true,
  isSignedInNow: () => true,
}));
vi.mock('@/data/profile', () => ({ setName: (...a: unknown[]) => setName(...a) }));
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => success(...a) } }));

function renderField({ name = 'Dev A', stored = null as string | null } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <NameField name={name} stored={stored} />
    </QueryClientProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

const editButton = () => screen.getByRole('button', { name: 'Edit name' });
const field = () => screen.getByLabelText('Your name');
const save = () => screen.getByRole('button', { name: 'Save' });
const heading = (name: string) => screen.getByRole('heading', { level: 1, name });

beforeEach(() => {
  setName.mockReset();
  setName.mockResolvedValue(undefined);
  success.mockReset();
});

describe('at rest', () => {
  it('shows the name as the screen heading, with one control to change it', () => {
    renderField({ name: 'Dev A' });
    expect(heading('Dev A')).toBeTruthy();
    expect(editButton()).toBeTruthy();
    expect(screen.queryByLabelText('Your name')).toBeNull();
  });

  it('keeps the heading while editing — it is the h1 the section is labelled by', async () => {
    const { user } = renderField({ name: 'Dev A' });
    await user.click(editButton());
    expect(heading('Dev A')).toBeTruthy();
  });
});

describe('the field', () => {
  it('starts from the stored name, not the one derived from the email', async () => {
    const { user } = renderField({ name: 'Dev A', stored: null });
    await user.click(editButton());
    // "Dev A" is the fallback here, and adopting it would store a name the user never chose.
    expect(field()).toHaveProperty('value', '');
  });

  it('starts from the name the column holds when there is one', async () => {
    const { user } = renderField({ name: 'Albert', stored: 'Albert' });
    await user.click(editButton());
    expect(field()).toHaveProperty('value', 'Albert');
  });

  it('takes focus on opening, so the keyboard lands where the typing goes', async () => {
    const { user } = renderField();
    await user.click(editButton());
    await waitFor(() => expect(document.activeElement).toBe(field()));
  });
});

describe('saving', () => {
  it('writes the trimmed name and says so', async () => {
    const { user } = renderField();
    await user.click(editButton());
    await user.type(field(), '  Albert  ');
    await user.click(save());

    await waitFor(() => expect(setName).toHaveBeenCalledWith(TEST_USER.id, 'Albert'));
    expect(success).toHaveBeenCalledWith('Name updated.');
  });

  it('writes null for an emptied field, which is how the name is cleared', async () => {
    const { user } = renderField({ name: 'Albert', stored: 'Albert' });
    await user.click(editButton());
    await user.clear(field());
    await user.click(save());

    await waitFor(() => expect(setName).toHaveBeenCalledWith(TEST_USER.id, null));
    expect(success).toHaveBeenCalledWith('Name removed.');
  });

  it('closes and returns focus to the button that opened it', async () => {
    const { user } = renderField();
    await user.click(editButton());
    await user.type(field(), 'Albert');
    await user.click(save());

    await waitFor(() => expect(screen.queryByLabelText('Your name')).toBeNull());
    expect(document.activeElement).toBe(editButton());
  });
});

describe('cancelling', () => {
  it('writes nothing, keeps the name, and returns focus', async () => {
    const { user } = renderField({ name: 'Albert', stored: 'Albert' });
    await user.click(editButton());
    await user.clear(field());
    await user.type(field(), 'Something else');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(setName).not.toHaveBeenCalled();
    expect(heading('Albert')).toBeTruthy();
    expect(document.activeElement).toBe(editButton());
  });

  it('discards the edit, so reopening starts from the stored name again', async () => {
    const { user } = renderField({ name: 'Albert', stored: 'Albert' });
    await user.click(editButton());
    await user.clear(field());
    await user.type(field(), 'Typo');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(editButton());

    expect(field()).toHaveProperty('value', 'Albert');
  });
});

describe('when it will not save', () => {
  it('refuses a name past the column cap, with the copy, and writes nothing', async () => {
    const { user } = renderField();
    await user.click(editButton());
    await user.type(field(), 'x'.repeat(121));
    await user.click(save());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Keep this under 120 characters.');
    expect(setName).not.toHaveBeenCalled();
    // The field stays open, holding what was typed.
    expect(field()).toHaveProperty('value', 'x'.repeat(121));
  });

  it('shows the plain message and a reference for a failure, keeping the field open', async () => {
    setName.mockRejectedValue(new Error('boom'));
    const { user } = renderField();
    await user.click(editButton());
    await user.type(field(), 'Albert');
    await user.click(save());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't save your name.");
    expect(alert.textContent).toMatch(/Error reference [0-9a-f]{8}/);
    expect(alert.textContent).not.toContain('boom'); // never the raw failure (§8.1)
    expect(field()).toHaveProperty('value', 'Albert');
    expect(success).not.toHaveBeenCalled();
  });

  it('asks the user to wait when the write limit refuses it, and reports nothing (§7.1)', async () => {
    setName.mockRejectedValue(new WriteRateLimitedError());
    const { user } = renderField();
    await user.click(editButton());
    await user.type(field(), 'Albert');
    await user.click(save());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(WAIT_A_MINUTE);
    // Nothing was reported, so there is no reference to quote (§8.1).
    expect(alert.textContent).not.toMatch(/Error reference/);
  });
});

describe('axe', () => {
  it('is clean at rest, editing, and in its error state', async () => {
    setName.mockRejectedValue(new Error('boom'));
    const { user, container } = renderField();
    expect((await axe.run(container)).violations).toEqual([]);

    await user.click(editButton());
    expect((await axe.run(container)).violations).toEqual([]);

    await user.type(field(), 'Albert');
    await user.click(save());
    await screen.findByRole('alert');
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
