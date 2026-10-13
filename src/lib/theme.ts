// Light/dark theme: the visitor's choice is kept in localStorage under
// THEME_STORAGE_KEY ('light' | 'dark'; absent means follow the system).
// THEME_SCRIPT runs inline in <head> before first paint so the page never
// flashes the wrong theme; ThemeToggle updates the same key and class.
export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mimus-theme';

export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_STORAGE_KEY}');var d=c==='dark'||(c!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
