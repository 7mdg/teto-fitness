import { useEffect, useState } from 'preact/hooks';
import prompt from '../../../docs/AI_GENERATOR_PROMPT.md?raw';
import { back, showToast } from '../../app/router';
import { shareFile } from '../../utils/files';
import { Button, Card, Row, Section, TopBar } from '../../ui/components';
import { chooseFileAndPreview, EXAMPLES } from '../onboarding/loadPlan';

const BASE = import.meta.env.BASE_URL;

/** Everything needed to have ChatGPT or Claude write a valid plan (SPEC §7). */
export function PlanGenerator() {
  const [schema, setSchema] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Prefetch so the copy happens synchronously inside the tap (iOS requires a user gesture).
  useEffect(() => {
    void fetch(`${BASE}schemas/teto-plan.v1.schema.json`)
      .then((r) => r.text())
      .then(setSchema);
  }, []);

  const fullPrompt = schema ? `${prompt.split('## The user\'s request')[0]}## JSON Schema\n${schema}\n\n## The user's request\n` : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullPrompt);
      setCopied(true);
      showToast('Prompt copied');
    } catch {
      await shareFile('teto-plan-prompt.txt', 'text/plain', fullPrompt);
    }
  }

  async function shareRemote(path: string, name: string) {
    const text = await (await fetch(`${BASE}${path}`)).text();
    await shareFile(name, 'application/json', text);
  }

  return (
    <main class="screen">
      <TopBar title="Plan generator" onBack={back} />
      <div class="stack">
        <h1 class="h1">Make a plan with AI</h1>
        <ol class="gen-steps">
          <li>Copy the prompt and paste it into ChatGPT or Claude.</li>
          <li>Below it, describe your goal, days, time per session, equipment and experience.</li>
          <li>Save the reply as a <code>.json</code> file in Files, then import it here.</li>
        </ol>
      </div>
      <Button variant="primary" class="big" full disabled={!schema} onClick={() => void copy()}>
        {copied ? 'Copied: paste it into your AI' : 'Copy AI prompt'}
      </Button>
      <Button full icon="file" onClick={() => void chooseFileAndPreview()}>
        Import generated plan
      </Button>

      <Section title="Change an existing plan">
        <Card>
          <p class="small">
            Export your plan (Settings → your plan → Export plan file), give it to the AI with the prompt and the changes you want. It keeps every id and raises the revision, so the
            app shows what changed and keeps your history.
          </p>
        </Card>
      </Section>

      <Section title="Files">
        <Card class="flush">
          <Row title="JSON Schema" detail="The exact format rules" chevron onClick={() => void shareRemote('schemas/teto-plan.v1.schema.json', 'teto-plan.v1.schema.json')} />
          {EXAMPLES.map((ex) => (
            <Row key={ex.file} title={`Example: ${ex.name}`} detail={ex.detail} chevron onClick={() => void shareRemote(`examples/${ex.file}`, ex.file)} />
          ))}
        </Card>
      </Section>
    </main>
  );
}
