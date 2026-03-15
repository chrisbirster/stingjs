import type { AssetCollections } from '../types';

type DomAssetCollectionOptions = {
	images?: string[];
	audio?: string[];
};

function getRequiredImage(selector: string): HTMLImageElement {
	const element = document.querySelector(selector);

	if (!(element instanceof HTMLImageElement)) {
		throw new Error(`Unable to find image asset: ${selector}`);
	}

	return element;
}

function getRequiredAudio(selector: string): HTMLAudioElement {
	const element = document.querySelector(selector);

	if (!(element instanceof HTMLAudioElement)) {
		throw new Error(`Unable to find audio asset: ${selector}`);
	}

	return element;
}

export function createDomAssetCollections({
	images = [],
	audio = [],
}: DomAssetCollectionOptions): AssetCollections {
	return {
		images: images.map(getRequiredImage),
		audio: audio.map(getRequiredAudio),
	};
}
