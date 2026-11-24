import { useState } from 'preact/hooks';
import { DeviceCheck } from '../spike/DeviceCheck';
import { Home } from '../screens/Home';
import { InstallScreen } from '../screens/onboarding/Install';
import { ImportPreview } from '../screens/plans/ImportPreview';
import { PlanDetail } from '../screens/plans/PlanDetail';
import { SettingsScreen } from '../screens/settings/Settings';
import { Toast } from '../ui/components';
import { back, route, toast } from './router';
import { UpdateBanner } from './UpdateBanner';

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function readBrowserOk(): boolean {
  try {
    return sessionStorage.getItem('teto-browser-ok') === '1';
  } catch {
    return false;
  }
}

export function App() {
  const [browserOk, setBrowserOk] = useState(() => isStandalone() || readBrowserOk());

  if (!browserOk) {
    return (
      <InstallScreen
        onContinue={() => {
          try {
            sessionStorage.setItem('teto-browser-ok', '1');
          } catch {
            /* private mode */
          }
          setBrowserOk(true);
        }}
      />
    );
  }

  const r = route.value;
  let screen;
  switch (r.name) {
    case 'home':
      screen = <Home />;
      break;
    case 'settings':
      screen = <SettingsScreen />;
      break;
    case 'import':
      screen = <ImportPreview key={r.text} text={r.text} source={r.source} />;
      break;
    case 'plan':
      screen = <PlanDetail id={r.id} />;
      break;
    case 'device-check':
      screen = <DeviceCheck onBack={back} />;
      break;
  }

  return (
    <>
      <UpdateBanner />
      {screen}
      <Toast message={toast.value} />
    </>
  );
}
