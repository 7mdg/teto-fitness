import { Button } from '../../ui/components';
import { Icon, Mark } from '../../ui/icons';

export function InstallScreen(props: { onContinue: () => void }) {
  return (
    <main class="screen">
      <div class="hero">
        <Mark width={140} />
        <span class="wordmark">T.E.T.O.</span>
        <h1 class="h1">Install TETO Fitness</h1>
        <p class="lead">Add it to your Home Screen first. Your data lives in the installed app, not in this Safari tab.</p>
      </div>
      <ol class="steps card">
        <li>
          <span class="step-n">1</span>
          <span>Tap <Icon name="share" size={18} label="Share" style={{ verticalAlign: '-3px' }} /> Share in Safari's toolbar</span>
        </li>
        <li>
          <span class="step-n">2</span>
          <span>Choose <b>Add to Home Screen</b> <Icon name="plusSquare" size={18} style={{ verticalAlign: '-3px' }} /></span>
        </li>
        <li>
          <span class="step-n">3</span>
          <span>Open <b>TETO</b> from your Home Screen</span>
        </li>
      </ol>
      <Button variant="ghost" full onClick={props.onContinue}>
        Continue in the browser
      </Button>
    </main>
  );
}
