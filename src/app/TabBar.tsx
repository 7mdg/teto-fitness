import { Icon, type IconName } from '../ui/icons';
import { resetTo, route } from './router';

const TABS: { name: 'home' | 'progress' | 'settings'; label: string; icon: IconName }[] = [
  { name: 'home', label: 'Today', icon: 'today' },
  { name: 'progress', label: 'Progress', icon: 'chart' },
  { name: 'settings', label: 'Settings', icon: 'settings' },
];

export function TabBar() {
  const current = route.value.name;
  return (
    <nav class="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.name}
          type="button"
          class="tab"
          aria-current={current === t.name ? 'page' : undefined}
          onClick={() => current !== t.name && resetTo({ name: t.name })}
        >
          <Icon name={t.icon} size={22} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
