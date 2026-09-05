import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const nativeSensors = {
    isAvailable: vi.fn(),
    callSync: vi.fn(),
    addListener: vi.fn(),
  };
  return {
    nativeSensors,
    createNativeModule: vi.fn(() => nativeSensors),
  };
});

vi.mock('@stingjs/modules-core', () => ({
  createNativeModule: mocks.createNativeModule,
}));

import { Sensors } from './index.js';

beforeEach(() => {
  mocks.nativeSensors.isAvailable.mockReset();
  mocks.nativeSensors.callSync.mockReset();
  mocks.nativeSensors.addListener.mockReset();
});

describe('Sensors', () => {
  it('binds to the Sensors native module', () => {
    expect(mocks.createNativeModule).toHaveBeenCalledWith('Sensors');
  });

  it('checks sensor availability through the sync bridge', () => {
    mocks.nativeSensors.callSync.mockReturnValue(true);
    expect(Sensors.hasSensor('accelerometer')).toBe(true);
    expect(mocks.nativeSensors.callSync).toHaveBeenCalledWith('hasSensor', ['accelerometer']);
  });

  it('sets a validated update interval', () => {
    Sensors.setUpdateInterval('gyroscope', 25);
    expect(mocks.nativeSensors.callSync).toHaveBeenCalledWith('setUpdateInterval', ['gyroscope', 25]);
    expect(() => Sensors.setUpdateInterval('gyroscope', 0)).toThrow(TypeError);
  });

  it('uses shared subscriptions for normalized accelerometer readings', () => {
    const remove = vi.fn();
    mocks.nativeSensors.addListener.mockReturnValue({ remove });
    const listener = vi.fn();
    const subscription = Sensors.addAccelerometerListener(listener);

    expect(mocks.nativeSensors.addListener).toHaveBeenCalledWith('accelerometer', expect.any(Function));
    const nativeListener = mocks.nativeSensors.addListener.mock.calls[0]?.[1];
    const reading = { x: 0.1, y: -0.2, z: 1.0, timestamp: 42.5 };
    nativeListener(reading);
    expect(listener).toHaveBeenCalledWith(reading);

    subscription.remove();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('subscribes independently to gyroscope readings', () => {
    mocks.nativeSensors.addListener.mockReturnValue({ remove: vi.fn() });
    Sensors.addGyroscopeListener(vi.fn());
    expect(mocks.nativeSensors.addListener).toHaveBeenCalledWith('gyroscope', expect.any(Function));
  });
});
