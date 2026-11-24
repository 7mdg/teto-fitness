import { useRegisterSW } from 'virtual:pwa-register/preact';
import { Button } from '../ui/components';

/** Shows when a new version is waiting. Never reloads on its own (SPEC §3: no reload mid-workout). */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div class="screen" style={{ minHeight: 0, paddingBottom: 0, gap: 0 }}>
      <div class="update-banner">
        <span>New version available</span>
        <Button variant="primary" onClick={() => void updateServiceWorker(true)}>
          Update
        </Button>
      </div>
    </div>
  );
}
