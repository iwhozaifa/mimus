import { expect, test } from '@playwright/test';

test('the landing page tells the Mimus story, signed out', async ({ page }) => {
  await page.goto('/');

  const header = page.getByRole('banner');
  await expect(header.getByRole('img', { name: 'Mimus' })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mimus');
  await expect(page.getByRole('link', { name: 'Get started' }).first()).toHaveAttribute(
    'href',
    '/sign-in',
  );

  for (const section of [
    'How it works',
    'Works with the tools you already use',
    'Scheduling, on your terms',
    'Private by default',
  ]) {
    await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible();
  }
  for (const level of [
    'Draft only',
    'Approve every send',
    'Offers go out automatically',
    'Fully automatic',
  ]) {
    await expect(page.getByText(level, { exact: false }).first()).toBeVisible();
  }

  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('img', { name: 'Mimus' })).toBeVisible();
});

test('the brand icons are served', async ({ request }) => {
  const icon = await request.get('/icon.svg');
  expect(icon.ok()).toBe(true);
  expect(await icon.text()).toContain('#15AC75');
  expect((await request.get('/apple-icon.png')).ok()).toBe(true);
});

test('dark mode follows the system on a first visit', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
});

test('the theme toggle cycles light, dark and system, and remembers the choice', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const toggle = page.getByRole('banner').getByRole('button', { name: /theme/i });

  await expect(toggle).toHaveAccessibleName('Theme: system');
  await toggle.click();
  await expect(toggle).toHaveAccessibleName('Theme: light');
  await toggle.click();
  await expect(toggle).toHaveAccessibleName('Theme: dark');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  // Remembered across pages and reloads, without a flash of the other theme.
  await page.goto('/privacy');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  await page.goto('/');
  await page.getByRole('banner').getByRole('button', { name: /theme/i }).click();
  await expect(
    page.getByRole('banner').getByRole('button', { name: /theme/i }),
  ).toHaveAccessibleName('Theme: system');
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
});
