import { useState } from 'preact/hooks';
import { back, showToast } from '../../app/router';
import { db } from '../../db/db';
import { useLive } from '../../db/live';
import { activatePlan, archivePlan, deletePlan, exportPlanJson, setStartDate } from '../../features/plans/repository';
import { formatLong } from '../../features/schedule/dates';
import { shareFile } from '../../utils/files';
import { Button, Card, Dialog, Section, Tag, TopBar } from '../../ui/components';
import { PlanOverview } from './PlanOverview';

export function PlanDetail({ id }: { id: string }) {
  const record = useLive(() => db.plans.get(id), [id]);
  const [dialog, setDialog] = useState<null | 'delete' | 'archive' | 'export'>(null);
  const [date, setDate] = useState<string | null>(null);

  if (record === undefined) return <main class="screen"><TopBar onBack={back} /></main>;
  if (!record) {
    return (
      <main class="screen">
        <TopBar onBack={back} />
        <p class="lead">This plan no longer exists.</p>
      </main>
    );
  }

  const plan = record.json;
  const startValue = date ?? record.startDate;

  async function doExport(includeProfile: boolean) {
    setDialog(null);
    const res = await shareFile(`${plan.metadata.id}-r${plan.metadata.revision}.json`, 'application/json', exportPlanJson(plan, { includeProfile }));
    if (res === 'downloaded') showToast('Plan downloaded');
  }

  return (
    <main class="screen">
      <TopBar onBack={back} right={<Tag tone={record.status === 'active' ? 'acc' : 'mut'}>{record.status}</Tag>} />
      <PlanOverview record={record} />

      <Section title="Start date">
        <Card class="stack">
          <div class="field">
            <label for="plan-start">Week 1 starts</label>
            <input id="plan-start" class="input num" type="date" value={startValue} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
          </div>
          <p class="muted small">{formatLong(startValue)}. Weeks and phases follow this date; past sessions keep their dates.</p>
          {date && date !== record.startDate && (
            <Button
              variant="primary"
              onClick={async () => {
                await setStartDate(record.id, date);
                setDate(null);
                showToast('Start date changed');
              }}
            >
              Save start date
            </Button>
          )}
        </Card>
      </Section>

      <Section title="Plan">
        <div class="stack">
          {record.status !== 'active' && (
            <Button
              variant="primary"
              full
              onClick={async () => {
                await activatePlan(record.id);
                showToast('Plan activated');
              }}
            >
              Make active
            </Button>
          )}
          <Button full icon="share" onClick={() => (plan.profile ? setDialog('export') : void doExport(false))}>
            Export plan file
          </Button>
          {record.status !== 'archived' && (
            <Button full onClick={() => setDialog('archive')}>
              Archive
            </Button>
          )}
          <Button variant="danger" full onClick={() => setDialog('delete')}>
            Delete plan
          </Button>
        </div>
      </Section>

      <Dialog
        open={dialog === 'export'}
        title="Include your profile?"
        onClose={() => setDialog(null)}
        actions={
          <>
            <Button variant="primary" full onClick={() => void doExport(false)}>
              Without profile (for sharing)
            </Button>
            <Button full onClick={() => void doExport(true)}>
              Include profile
            </Button>
          </>
        }
      >
        <p>The profile holds your height, starting weight and goals.</p>
      </Dialog>

      <Dialog
        open={dialog === 'archive'}
        title="Archive this plan?"
        onClose={() => setDialog(null)}
        actions={
          <>
            <Button
              variant="primary"
              full
              onClick={async () => {
                setDialog(null);
                await archivePlan(record.id);
                showToast('Plan archived');
              }}
            >
              Archive
            </Button>
            <Button variant="ghost" full onClick={() => setDialog(null)}>
              Cancel
            </Button>
          </>
        }
      >
        <p>It stops being scheduled. You can make it active again any time.</p>
      </Dialog>

      <Dialog
        open={dialog === 'delete'}
        title="Delete this plan?"
        onClose={() => setDialog(null)}
        actions={
          <>
            <Button
              variant="danger"
              full
              onClick={async () => {
                setDialog(null);
                await deletePlan(record.id);
                showToast('Plan deleted');
                back();
              }}
            >
              Delete plan
            </Button>
            <Button variant="ghost" full onClick={() => setDialog(null)}>
              Cancel
            </Button>
          </>
        }
      >
        <p>Removes the plan's configuration from this phone. Your logged workouts, measurements and habits are kept.</p>
      </Dialog>
    </main>
  );
}
