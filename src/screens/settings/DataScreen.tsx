import { useState } from 'preact/hooks';
import { back, resetTo, showToast } from '../../app/router';
import { db } from '../../db/db';
import { useLive } from '../../db/live';
import { buildCsvFiles, checkBackup, createBackup, markBackedUp, restoreBackup, restoreLatestSnapshot, type BackupFile } from '../../features/backup/backup';
import { pickTextFile, shareFile, shareFiles } from '../../utils/files';
import { Button, Card, Dialog, Row, Section, Tag, TopBar } from '../../ui/components';

const localStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function exportBackup() {
  const backup = await createBackup(db, __APP_VERSION__);
  const res = await shareFile(`teto-backup-${localStamp()}.json`, 'application/json', JSON.stringify(backup));
  if (res !== 'cancelled') {
    await markBackedUp();
    showToast(res === 'shared' ? 'Backup saved' : 'Backup downloaded');
  }
}

/** Shared restore flow: pick → validate → choose merge/replace → restore. */
export function useRestoreFlow() {
  const [pending, setPending] = useState<{ backup: BackupFile; counts: Record<string, number>; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    setError(null);
    const picked = await pickTextFile();
    if (!picked) return;
    const check = checkBackup(picked.text);
    if (!check.ok) return setError(check.error);
    setPending({ backup: check.backup, counts: check.counts, name: picked.name });
  }
  async function apply(mode: 'merge' | 'replace') {
    if (!pending) return;
    await restoreBackup(pending.backup, mode);
    setPending(null);
    showToast('Backup restored');
    resetTo({ name: 'home' });
  }
  const dialog = (
    <>
      <Dialog
        open={!!pending}
        title="Restore backup?"
        onClose={() => setPending(null)}
        actions={
          <>
            <Button variant="primary" full onClick={() => void apply('merge')}>
              Merge with this phone
            </Button>
            <Button variant="danger" full onClick={() => void apply('replace')}>
              Replace everything
            </Button>
            <Button variant="ghost" full onClick={() => setPending(null)}>
              Cancel
            </Button>
          </>
        }
      >
        {pending && (
          <>
            <p>
              {pending.name} · {pending.backup.exportedAt.slice(0, 10)}
            </p>
            <p class="num">
              {pending.counts.workouts} workouts · {pending.counts.sets} sets · {pending.counts.measurements} measurements · {pending.counts.plans} plans
            </p>
            <p class="small">Merge keeps what is on this phone and adds the backup; where both have the same item, the newer one wins. Replace makes this phone match the backup exactly. Either way, a safety copy is kept so you can undo.</p>
          </>
        )}
      </Dialog>
      <Dialog
        open={!!error}
        title="Can't restore this file"
        onClose={() => setError(null)}
        actions={
          <Button variant="ghost" full onClick={() => setError(null)}>
            OK
          </Button>
        }
      >
        <p>{error}</p>
      </Dialog>
    </>
  );
  return { start, dialog };
}

export function DataScreen() {
  const meta = useLive(() => db.meta.get('meta'), []);
  const snapshots = useLive(() => db.snapshots.count(), []);
  const restore = useRestoreFlow();

  return (
    <main class="screen">
      <TopBar title="Data" onBack={back} />

      <Section title="Backup">
        <Card class="stack">
          <p class="small">
            Your data lives only on this phone. Deleting the app deletes it. Save a backup to Files or iCloud Drive now and then.
          </p>
          <p class="small muted">Last backup: {meta?.lastBackupAt ? new Date(meta.lastBackupAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never'}</p>
          <Button variant="primary" full icon="share" onClick={() => void exportBackup()}>
            Save backup
          </Button>
          <Button full icon="file" onClick={() => void restore.start()}>
            Restore backup
          </Button>
          {!!snapshots && (
            <Button
              variant="ghost"
              full
              onClick={async () => {
                if (await restoreLatestSnapshot()) {
                  showToast('Last restore undone');
                  resetTo({ name: 'home' });
                }
              }}
            >
              Undo last restore
            </Button>
          )}
        </Card>
      </Section>

      <Section title="Export">
        <Card class="flush">
          <Row
            title="Export as CSV"
            detail="Sessions, sets, measurements and habits for Excel, Sheets or an AI"
            chevron
            onClick={async () => {
              const files = await buildCsvFiles();
              const res = await shareFiles(files.map((f) => ({ ...f, type: 'text/csv' })));
              if (res === 'downloaded') showToast('CSV files downloaded');
            }}
          />
        </Card>
      </Section>

      <Section title="Storage">
        <Card class="flush">
          <Row
            title="Persistent storage"
            detail={meta?.persistGranted ? 'iOS will not clear data on its own. Deleting the app still removes it.' : 'iOS may clear data when storage runs low. Keep a backup.'}
            trailing={meta?.persistGranted ? <Tag tone="lime">granted</Tag> : <Tag>not granted</Tag>}
          />
        </Card>
      </Section>
      {restore.dialog}
    </main>
  );
}
