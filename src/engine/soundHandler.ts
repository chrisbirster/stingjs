type SoundOptions = {
	volume?: number;
	loop?: boolean;
};

export function playSound(
	sound: HTMLAudioElement,
	{ volume = 1, loop }: SoundOptions = {},
): void {
	sound.volume = volume;
	sound.loop = loop ?? sound.loop;

	if (sound.currentTime > 0) sound.currentTime = 0;
	if (sound.paused) void sound.play();
}

export function stopSound(sound: HTMLAudioElement): void {
	sound.pause();
	sound.currentTime = 0;
}
