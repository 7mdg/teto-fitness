import { navigate } from '../app/router';
import { db } from '../db/db';
import { useLive } from '../db/live';
import { Card, Row, Section, TopBar } from '../ui/components';
import { WelcomeScreen } from './onboarding/Welcome';
import { Today } from './today/Today';

export function Home() {
  const plans = useLive(() => db.plans.toArray(), []);
  if (plans === undefined) return <main class="screen" />;
  if (plans.length === 0) return <WelcomeScreen />;

  const active = plans.find((p) => p.status === 'active');
  if (active) return <Today record={active} />;
  return (
    <main class="screen has-tabs">
      <TopBar brand />
      <div class="stack">
        <h1 class="h1">No active plan</h1>
        <p class="lead">Pick one of your plans, or import a new one in Settings.</p>
      </div>
      <Section title="Your plans">
        <Card class="flush">
          {plans.map((p) => (
            <Row key={p.id} title={p.json.metadata.name} detail={p.status} chevron onClick={() => navigate({ name: 'plan', id: p.id })} />
          ))}
        </Card>
      </Section>
    </main>
  );
}

export function useHasPlans(): boolean | undefined {
  const count = useLive(() => db.plans.count(), []);
  return count === undefined ? undefined : count > 0;
}
