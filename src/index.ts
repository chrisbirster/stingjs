import { mountDebugOverlay } from 'engine/solid/mountDebugOverlay';
import { TemplateExample } from 'game/TemplateExample';

window.addEventListener('load', () => {
	mountDebugOverlay();
	new TemplateExample().start();
});
