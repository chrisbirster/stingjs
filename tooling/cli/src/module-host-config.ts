import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadStingConfig } from './config.js';
import type { DiscoveredStingModule, StingModulePlan } from './modules.js';

const ROOT_START = '<!-- STING MODULES ROOT BEGIN -->';
const ROOT_END = '<!-- STING MODULES ROOT END -->';
const APP_START = '<!-- STING MODULES APP BEGIN -->';
const APP_END = '<!-- STING MODULES APP END -->';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function stripManagedBlock(source: string, start: string, end: string): string {
  const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.replace(new RegExp(`\\s*${escapedStart}[\\s\\S]*?${escapedEnd}\\s*`, 'g'), '\n');
}

function indentBlock(source: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return source
    .trim()
    .split('\n')
    .map(line => `${prefix}${line.trim()}`)
    .join('\n');
}

export function renderAndroidHostManifest(
  baseManifest: string,
  plan: StingModulePlan,
  moduleManifests: readonly string[],
): string {
  let rendered = stripManagedBlock(baseManifest, ROOT_START, ROOT_END);
  rendered = stripManagedBlock(rendered, APP_START, APP_END);

  const rootEntries = new Set<string>();
  for (const permission of plan.android.permissions) {
    rootEntries.add(`<uses-permission android:name="${escapeXml(permission)}" />`);
  }
  for (const manifest of moduleManifests) {
    for (const match of manifest.matchAll(/<uses-feature\b[^>]*\/>/g)) {
      rootEntries.add(match[0].trim());
    }
  }

  const applicationEntries = new Set<string>();
  for (const manifest of moduleManifests) {
    const application = manifest.match(/<application\b[^>]*>([\s\S]*?)<\/application>/);
    const inner = application?.[1]?.trim();
    if (inner) applicationEntries.add(inner);
  }

  if (rootEntries.size > 0) {
    const block = [
      `    ${ROOT_START}`,
      ...[...rootEntries].sort().map(entry => indentBlock(entry, 4)),
      `    ${ROOT_END}`,
    ].join('\n');
    if (!/<application\b/.test(rendered)) throw new Error('Android manifest is missing an <application> element');
    rendered = rendered.replace(/\s*(<application\b)/, `\n${block}\n    $1`);
  }

  if (applicationEntries.size > 0) {
    const block = [
      `        ${APP_START}`,
      ...[...applicationEntries].sort().map(entry => indentBlock(entry, 8)),
      `        ${APP_END}`,
    ].join('\n');
    if (!/<\/application>/.test(rendered)) throw new Error('Android manifest is missing a closing </application> element');
    rendered = rendered.replace(/\s*(<\/application>)/, `\n${block}\n    $1`);
  }

  return `${rendered.trimEnd()}\n`;
}

function defaultUsageDescription(key: string, appName: string): string {
  switch (key) {
    case 'NSCameraUsageDescription':
      return `${appName} uses the camera when you choose camera features.`;
    case 'NSLocationWhenInUseUsageDescription':
      return `${appName} uses your location while the app is in use.`;
    case 'NSContactsUsageDescription':
      return `${appName} accesses contacts when you choose contact features.`;
    case 'NSMicrophoneUsageDescription':
      return `${appName} uses the microphone when you choose audio recording features.`;
    default:
      return `${appName} uses this capability when requested by an installed Sting module.`;
  }
}

export function renderIOSInfoPlist(
  plan: StingModulePlan,
  appName = 'This app',
  overrides: Readonly<Record<string, string>> = {},
): string {
  const usageDescriptions = plan.ios.requiredInfoPlistKeys.map(key => [
    key,
    overrides[key] ?? defaultUsageDescription(key, appName),
  ] as const);

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '    <key>CFBundleDevelopmentRegion</key>',
    '    <string>$(DEVELOPMENT_LANGUAGE)</string>',
    '    <key>CFBundleExecutable</key>',
    '    <string>$(EXECUTABLE_NAME)</string>',
    '    <key>CFBundleIdentifier</key>',
    '    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>',
    '    <key>CFBundleInfoDictionaryVersion</key>',
    '    <string>6.0</string>',
    '    <key>CFBundleName</key>',
    '    <string>$(PRODUCT_NAME)</string>',
    '    <key>CFBundlePackageType</key>',
    '    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>',
    '    <key>CFBundleShortVersionString</key>',
    '    <string>$(MARKETING_VERSION)</string>',
    '    <key>CFBundleVersion</key>',
    '    <string>$(CURRENT_PROJECT_VERSION)</string>',
    '    <key>UILaunchScreen</key>',
    '    <dict/>',
    '    <key>UIApplicationSupportsIndirectInputEvents</key>',
    '    <true/>',
  ];
  for (const [key, value] of usageDescriptions) {
    lines.push(`    <key>${escapeXml(key)}</key>`, `    <string>${escapeXml(value)}</string>`);
  }
  lines.push('</dict>', '</plist>', '');
  return lines.join('\n');
}

export async function synchronizeModuleHostConfiguration(
  projectRoot: string,
  records: readonly DiscoveredStingModule[],
  plan: StingModulePlan,
  generatedRoot: string,
): Promise<void> {
  const moduleManifests: string[] = [];
  for (const record of records) {
    const path = join(record.root, 'android', 'src', 'main', 'AndroidManifest.xml');
    if (await exists(path)) moduleManifests.push(await readFile(path, 'utf8'));
  }

  const androidManifestPath = join(projectRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (await exists(androidManifestPath)) {
    const base = await readFile(androidManifestPath, 'utf8');
    await writeFile(androidManifestPath, renderAndroidHostManifest(base, plan, moduleManifests), 'utf8');
  }

  const loaded = await loadStingConfig(projectRoot);
  const appName = loaded?.config.name?.trim() || 'This app';
  const infoPlist = loaded?.config.ios?.infoPlist ?? {};
  await writeFile(
    join(generatedRoot, 'ios', 'Info.plist'),
    renderIOSInfoPlist(plan, appName, infoPlist),
    'utf8',
  );
}
