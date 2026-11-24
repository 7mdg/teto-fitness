import { render } from 'preact';
import './ui/tokens.css';
import { DeviceCheck } from './spike/DeviceCheck';

render(<DeviceCheck />, document.getElementById('app')!);
