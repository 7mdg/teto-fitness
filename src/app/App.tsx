import { useEffect, useState } from 'preact/hooks';
import { getActiveSession } from '../features/training/session';
import { DeviceCheck } from '../spike/DeviceCheck';
import { Home, useHasPlans } from '../screens/Home';
import { InstallScreen } from '../screens/onboarding/Install';
import { ImportPreview } from '../screens/plans/ImportPreview';
import { PlanDetail } from '../screens/plans/PlanDetail';
import { ExerciseHistory, ProgressScreen, SessionDetail } from '../screens/progress/Progress';
import { HabitsSettings } from '../screens/settings/HabitsSettings';
import { SettingsScreen } from '../screens/settings/Settings';
import { SummaryScreen } from '../screens/workout/Summary';
import { WorkoutScreen } from '../screens/workout/Workout';
import { Toast } from '../ui/components';
import { back, navigate, route, TAB_ROUTES, toast } from './router';
import { TabBar } from './TabBar';
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
  const hasPlans = useHasPlans();

  // Opening the app with a workout in progress goes straight back into it (SPEC §8.3).
  useEffect(() => {
    void getActiveSession().then((s) => {
      if (s && route.value.name === 'home') navigate({ name: 'workout', sessionId: s.id });
    });
  }, []);

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
    case 'progress':
      screen = <ProgressScreen />;
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
    case 'workout':
      screen = <WorkoutScreen sessionId={r.sessionId} />;
      break;
    case 'summary':
      screen = <SummaryScreen sessionId={r.sessionId} />;
      break;
    case 'session':
      screen = <SessionDetail id={r.id} />;
      break;
    case 'exercise':
      screen = <ExerciseHistory id={r.id} />;
      break;
    case 'habits':
      screen = <HabitsSettings />;
      break;
    case 'device-check':
      screen = <DeviceCheck onBack={back} />;
      break;
  }

  const showTabs = hasPlans && (TAB_ROUTES as readonly string[]).includes(r.name);

  return (
    <>
      {r.name !== 'workout' && <UpdateBanner />}
      {screen}
      {showTabs && <TabBar />}
      <Toast message={toast.value} />
    </>
  );
}
