'use client';

import { THEME_STORAGE_KEY, type ThemeChoice } from '@/src/lib/theme';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const ICONS = { system: Monitor, light: Sun, dark: Moon };

// Every toggle on the page re-reads the choice when any of them changes it.
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice) {
  const dark =
    choice === 'dark' ||
    (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

function choose(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage can be blocked; the theme still changes for this page.
  }
  apply(choice);
  listeners.forEach((listener) => listener());
}

// Cycles System -> Light -> Dark. The choice lives in this browser only;
// the server always renders "system" and the inline script in the root
// layout has already applied the stored one before paint.
export function ThemeToggle({ className = '' }: { className?: string }) {
  const choice = useSyncExternalStore(subscribe, readChoice, () => 'system' as const);

  // While following the system, follow it live too.
  useEffect(() => {
    if (choice !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [choice]);

  const Icon = ICONS[choice];

  return (
    <button
      type="button"
      aria-label={`Theme: ${choice}`}
      title={`Theme: ${choice} (click to change)`}
      onClick={() => choose(NEXT[choice])}
      className={`inline-flex size-9 items-center justify-center rounded-pill text-ink-muted transition-colors hover:bg-paper-raised hover:text-ink ${className}`}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
