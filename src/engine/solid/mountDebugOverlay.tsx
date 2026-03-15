import { render } from 'solid-js/web';
import { DebugOverlay } from './DebugOverlay';
import { registerDebugOverlayHotkey } from './debugState';

export function mountDebugOverlay(): void {
	const root = document.createElement('div');
	root.id = 'stingjs-debug-root';
	document.body.appendChild(root);

	registerDebugOverlayHotkey();
	render(() => <DebugOverlay />, root);
}
