import { mountDebugOverlay } from 'engine/solid/mountDebugOverlay';
import { TemplateExample } from 'game/TemplateExample';

window.addEventListener('load', () => {
	mountDebugOverlay();
	void new TemplateExample().start();
});
