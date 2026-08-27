import { spawnSync } from 'node:child_process';

export type DevicePlatform = 'android' | 'ios';
export type DeviceKind = 'physical' | 'emulator' | 'simulator';

export interface StingDevice {
  platform: DevicePlatform;
  id: string;
  name: string;
  kind: DeviceKind;
  state: string;
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
}

interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export function runCommand(command: string, args: string[] = []): CommandResult {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    ok: !result.error && result.status === 0,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
  };
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0]?.trim() ?? '';
}

function checkCommand(name: string, command: string, args: string[], required: boolean): DoctorCheck {
  const result = runCommand(command, args);
  const detail = firstLine(result.stdout || result.stderr) || (result.ok ? 'available' : 'not found');
  return { name, ok: result.ok, detail, required };
}

export function collectDoctorChecks(platform = process.platform): DoctorCheck[] {
  const [major, minor] = process.versions.node.split('.').map(Number);
  const nodeOk = major > 22 || (major === 22 && minor >= 12);
  const checks: DoctorCheck[] = [
    { name: 'node', ok: nodeOk, detail: process.version, required: true },
    checkCommand('npm', 'npm', ['--version'], true),
    checkCommand('zig', 'zig', ['version'], true),
    checkCommand('java', 'java', ['-version'], false),
    checkCommand('adb', 'adb', ['version'], false),
  ];

  if (platform === 'darwin') {
    checks.push(checkCommand('xcode', 'xcodebuild', ['-version'], false));
    checks.push(checkCommand('simctl', 'xcrun', ['simctl', 'help'], false));
  }

  return checks;
}

export function parseAdbDevices(output: string): StingDevice[] {
  const devices: StingDevice[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('List of devices attached')) continue;
    const parts = line.split(/\s+/);
    const [id, state] = parts;
    if (!id || !state) continue;
    const modelToken = parts.find((part) => part.startsWith('model:'));
    const name = modelToken?.slice('model:'.length).replaceAll('_', ' ') || id;
    devices.push({
      platform: 'android',
      id,
      name,
      kind: id.startsWith('emulator-') ? 'emulator' : 'physical',
      state,
    });
  }
  return devices;
}

interface SimctlDevice {
  state?: string;
  isAvailable?: boolean;
  name?: string;
  udid?: string;
}

interface SimctlPayload {
  devices?: Record<string, SimctlDevice[]>;
}

export function parseSimctlDevices(output: string): StingDevice[] {
  let payload: SimctlPayload;
  try {
    payload = JSON.parse(output) as SimctlPayload;
  } catch {
    return [];
  }

  const devices: StingDevice[] = [];
  for (const runtimeDevices of Object.values(payload.devices ?? {})) {
    for (const device of runtimeDevices) {
      if (device.isAvailable === false || !device.udid || !device.name) continue;
      devices.push({
        platform: 'ios',
        id: device.udid,
        name: device.name,
        kind: 'simulator',
        state: (device.state ?? 'unknown').toLowerCase(),
      });
    }
  }
  return devices;
}

export function collectDevices(platform = process.platform): StingDevice[] {
  const devices: StingDevice[] = [];
  const adb = runCommand('adb', ['devices', '-l']);
  if (adb.ok) devices.push(...parseAdbDevices(adb.stdout));

  if (platform === 'darwin') {
    const simctl = runCommand('xcrun', ['simctl', 'list', 'devices', 'available', '-j']);
    if (simctl.ok) devices.push(...parseSimctlDevices(simctl.stdout));
  }

  return devices;
}
