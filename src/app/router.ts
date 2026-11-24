import { signal } from '@preact/signals';

export type Route =
  | { name: 'home' }
  | { name: 'progress' }
  | { name: 'settings' }
  | { name: 'import'; text: string; source: string }
  | { name: 'plan'; id: string }
  | { name: 'workout'; sessionId: string }
  | { name: 'summary'; sessionId: string }
  | { name: 'session'; id: string }
  | { name: 'exercise'; id: string }
  | { name: 'habits' }
  | { name: 'month' }
  | { name: 'data' }
  | { name: 'profile' }
  | { name: 'generator' }
  | { name: 'device-check' };

export const TAB_ROUTES = ['home', 'progress', 'settings'] as const;

const stack = signal<Route[]>([{ name: 'home' }]);
export const route = signal<Route>({ name: 'home' });
export const toast = signal<string | null>(null);

export function navigate(r: Route) {
  stack.value = [...stack.value, r];
  route.value = r;
  window.scrollTo(0, 0);
}

export function back() {
  const next = stack.value.length > 1 ? stack.value.slice(0, -1) : [{ name: 'home' } as Route];
  stack.value = next;
  route.value = next[next.length - 1]!;
  window.scrollTo(0, 0);
}

export function resetTo(r: Route) {
  stack.value = [r];
  route.value = r;
  window.scrollTo(0, 0);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), 2600);
}
