import { f32, u16, u8 } from 'bitecs/serialization';

export const AnimationPlayer = {
	animation: u16([]),
	frame: u16([]),
	elapsed: f32([]),
	playing: u8([]),
};
