import { Show } from 'solid-js';
import { gameDebugSnapshot, overlayVisible, toggleDebugOverlay } from './debugState';

export function DebugOverlay() {
	return (
		<Show when={overlayVisible()}>
			<aside
				style={{
					position: 'fixed',
					top: '16px',
					right: '16px',
					'z-index': '9999',
					width: '280px',
					padding: '14px 16px',
					'border-radius': '14px',
					background: 'rgb(12 16 24 / 0.88)',
					color: '#dff7ef',
					'font-family': '"IBM Plex Mono", monospace',
					'font-size': '12px',
					'line-height': '1.5',
					'box-shadow': '0 14px 36px rgb(0 0 0 / 0.35)',
					border: '1px solid rgb(130 255 212 / 0.18)',
					'backdrop-filter': 'blur(10px)',
				}}
			>
				<div
					style={{
						display: 'flex',
						'justify-content': 'space-between',
						'align-items': 'center',
						'margin-bottom': '10px',
					}}
				>
					<strong style={{ 'font-size': '13px', color: '#90ffd8' }}>stingjs debug</strong>
					<button
						type="button"
						onClick={toggleDebugOverlay}
						style={{
							border: '0',
							background: 'transparent',
							color: '#90ffd8',
							cursor: 'pointer',
							'font-family': 'inherit',
							'font-size': '12px',
						}}
					>
						hide
					</button>
				</div>

				<div>scene: {gameDebugSnapshot().scene}</div>
				<div>fps: {gameDebugSnapshot().fps.toFixed(1)}</div>
				<div>frame: {gameDebugSnapshot().frameMs.toFixed(2)}ms</div>
				<div>
					camera: {Math.round(gameDebugSnapshot().camera.x)}, {Math.round(gameDebugSnapshot().camera.y)}
				</div>
				<div>
					assets: img {gameDebugSnapshot().assets.images.loaded}/{gameDebugSnapshot().assets.images.total}
					{' '}audio {gameDebugSnapshot().assets.audio.loaded}/{gameDebugSnapshot().assets.audio.total}
				</div>

				<div style={{ 'margin-top': '10px', color: '#8fb3ac' }}>selected</div>
				<Show
					when={gameDebugSnapshot().selectedEntity}
					fallback={<div style={{ color: '#7e8f89' }}>none</div>}
				>
					{(selectedEntity) => (
						<div>
							<div>id: {selectedEntity().id}</div>
							<div>label: {selectedEntity().label ?? 'entity'}</div>
							<Show when={selectedEntity().position}>
								{(position) => (
									<div>
										pos: {Math.round(position().x)}, {Math.round(position().y)}
									</div>
								)}
							</Show>
							<Show when={selectedEntity().velocity}>
								{(velocity) => (
									<div>
										vel: {Math.round(velocity().x)}, {Math.round(velocity().y)}
									</div>
								)}
							</Show>
						</div>
					)}
				</Show>

				<div style={{ 'margin-top': '10px', color: '#7e8f89' }}>press ` to toggle</div>
			</aside>
		</Show>
	);
}
