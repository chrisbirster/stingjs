import { u16, u8 } from 'bitecs/serialization';

export const OverlapState = {
	active: u8([]),
	entered: u8([]),
	exited: u8([]),
	count: u16([]),
};
