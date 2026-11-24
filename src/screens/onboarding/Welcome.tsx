import { Button, Card, Row, Section } from '../../ui/components';
import { Mark } from '../../ui/icons';
import { chooseFileAndPreview, EXAMPLES, previewExample } from './loadPlan';

export function WelcomeScreen() {
  return (
    <main class="screen">
      <div class="hero">
        <Mark width={150} />
        <span class="wordmark">T.E.T.O.</span>
        <p class="lead">Import a plan to start. You can make one with ChatGPT or Claude, or start from an example.</p>
      </div>
      <Button variant="primary" class="big" full icon="file" onClick={() => void chooseFileAndPreview()}>
        Import plan
      </Button>
      <Section title="Examples">
        <Card class="flush">
          {EXAMPLES.map((ex) => (
            <Row key={ex.file} title={ex.name} detail={ex.detail} chevron onClick={() => void previewExample(ex.file)} />
          ))}
        </Card>
      </Section>
    </main>
  );
}
