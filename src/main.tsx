import { render } from 'preact';
import '@fontsource/instrument-sans/latin-400.css';
import '@fontsource/instrument-sans/latin-500.css';
import '@fontsource/instrument-sans/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './ui/tokens.css';
import './ui/app.css';
import { App } from './app/App';
import { measureViewportGap } from './ui/viewport';

measureViewportGap();
render(<App />, document.getElementById('app')!);
