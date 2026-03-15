import type { AssetCollections, AssetManifest } from '../types';

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();

		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`Unable to load image asset: ${src}`));
		image.src = src;
	});
}

function loadAudio(src: string): Promise<HTMLAudioElement> {
	return new Promise((resolve, reject) => {
		const audio = new Audio();
		const cleanup = () => {
			audio.removeEventListener('canplaythrough', handleReady);
			audio.removeEventListener('loadeddata', handleReady);
			audio.removeEventListener('error', handleError);
		};
		const handleReady = () => {
			cleanup();
			resolve(audio);
		};
		const handleError = () => {
			cleanup();
			reject(new Error(`Unable to load audio asset: ${src}`));
		};

		audio.preload = 'auto';
		audio.addEventListener('canplaythrough', handleReady, { once: true });
		audio.addEventListener('loadeddata', handleReady, { once: true });
		audio.addEventListener('error', handleError, { once: true });
		audio.src = src;
		audio.load();

		if (audio.readyState >= 2) {
			cleanup();
			resolve(audio);
		}
	});
}

export async function loadAssetCollections({
	images = [],
	audio = [],
}: AssetManifest): Promise<AssetCollections> {
	const [loadedImages, loadedAudio] = await Promise.all([
		Promise.all(images.map(loadImage)),
		Promise.all(audio.map(loadAudio)),
	]);

	return {
		images: loadedImages,
		audio: loadedAudio,
	};
}
