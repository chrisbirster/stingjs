import { spawnSync } from 'node:child_process';
import { collectDevices, type StingDevice } from './platform.js';

const STING_GO_ANDROID_PACKAGE = 'run.stingjs.go';

export interface OpenStingGoOptions {
  requestedDevice?: string;
  hostPlatform?: NodeJS.Platform;
  devices?: StingDevice[];
}

export interface OpenCommand {
  command: string;
  args: string[];
}

function isReady(device: StingDevice): boolean {
  return device.platform === 'android'
    ? device.state === 'device'
    : device.state === 'booted';
}

export function selectStingGoOpenDevice(
  devices: StingDevice[],
  hostPlatform: NodeJS.Platform = process.platform,
  requestedDevice?: string,
): StingDevice {
  const ready = devices.filter(isReady);

  if (requestedDevice) {
    const normalized = requestedDevice.toLowerCase();
    const match = ready.find((device) =>
      device.id === requestedDevice || device.name.toLowerCase() === normalized);
    if (match) return match;

    const known = devices.find((device) =>
      device.id === requestedDevice || device.name.toLowerCase() === normalized);
    if (known) {
      throw new Error(`${known.name} (${known.id}) is not ready for Sting Go; current state: ${known.state}`);
    }

    const available = ready.map((device) => `${device.name} (${device.id})`).join(', ');
    throw new Error(`No ready Sting Go device matches "${requestedDevice}"${available ? `. Ready: ${available}` : ''}`);
  }

  if (hostPlatform === 'darwin') {
    const bootedIos = ready.find((device) => device.platform === 'ios');
    if (bootedIos) return bootedIos;
  }

  const android = ready.find((device) => device.platform === 'android');
  if (android) return android;

  const ios = ready.find((device) => device.platform === 'ios');
  if (ios) return ios;

  throw new Error('No ready Sting Go target found. Boot an iOS Simulator or connect an authorized Android device, then run `sting devices`.');
}

export function stingGoOpenCommand(device: StingDevice, stingGoUrl: string): OpenCommand {
  if (device.platform === 'ios') {
    return {
      command: 'xcrun',
      args: ['simctl', 'openurl', device.id, stingGoUrl],
    };
  }

  return {
    command: 'adb',
    args: [
      '-s', device.id,
      'shell', 'am', 'start', '-W',
      '-a', 'android.intent.action.VIEW',
      '-d', stingGoUrl,
      '-p', STING_GO_ANDROID_PACKAGE,
    ],
  };
}

export function openStingGo(
  stingGoUrl: string,
  options: OpenStingGoOptions = {},
): StingDevice {
  const hostPlatform = options.hostPlatform ?? process.platform;
  const devices = options.devices ?? collectDevices(hostPlatform);
  const device = selectStingGoOpenDevice(devices, hostPlatform, options.requestedDevice);
  const command = stingGoOpenCommand(device, stingGoUrl);
  const result = spawnSync(command.command, command.args, {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.error) {
    throw new Error(`Failed to open Sting Go on ${device.name}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`Could not open Sting Go on ${device.name}${detail ? `: ${detail}` : ''}`);
  }

  return device;
}
