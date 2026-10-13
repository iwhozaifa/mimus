import { expect, test } from '@playwright/test';

const LIMITED_USE =
  "Mimus's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.";

// Google's verification reviewers load these signed out, so none of them
// may redirect to /sign-in.
test('the Privacy Policy is public and carries the Google Limited Use disclosure', async ({
  page,
}) => {
  await page.goto('/privacy');
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Google user data/i })).toBeVisible();
  await expect(page.getByText(LIMITED_USE)).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Google API Services User Data Policy' }),
  ).toHaveAttribute('href', 'https://developers.google.com/terms/api-services-user-data-policy');
});

test('the Terms of Service is public', async ({ page }) => {
  await page.goto('/terms');
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
});

test('the account deletion instructions are public', async ({ page }) => {
  await page.goto('/account-deletion');
  await expect(page).toHaveURL(/\/account-deletion$/);
  await expect(
    page.getByRole('heading', { level: 1, name: /Deleting your Mimus account/i }),
  ).toBeVisible();
});

test('the signed-out homepage explains Mimus and links to both policies', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /Mimus/ })).toBeVisible();
  await expect(page.getByText(/read-only/i).first()).toBeVisible();

  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
    'href',
    '/privacy',
  );
  await expect(footer.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
    'href',
    '/terms',
  );
});

test('the sign-in page links to the Terms and Privacy Policy', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('link', { name: 'Terms of Service' }).first()).toHaveAttribute(
    'href',
    '/terms',
  );
  await expect(page.getByRole('link', { name: 'Privacy Policy' }).first()).toHaveAttribute(
    'href',
    '/privacy',
  );
});
