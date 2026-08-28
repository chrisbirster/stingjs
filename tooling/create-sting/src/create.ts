import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT_EXTENSIONS = new Set([
  '', '.bat', '.gitignore', '.json', '.kts', '.kt', '.md', '.properties', '.ts', '.tsx', '.xml', '.sh',
]);

export interface CreateStingProjectOptions {
  targetDir: string;
  projectName?: string;
  androidPackage?: string;
  runtimeArtifactsDir?: string;
  force?: boolean;
}

export interface CreatedStingProject {
  targetDir: string;
  projectName: string;
  androidPackage: string;
  runtimeArtifactsDir: string;
}

function packagePath(packageName: string): string {
  return packageName.replaceAll('.', '/');
}

function defaultProjectName(targetDir: string): string {
  return basename(resolve(targetDir))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sting-app';
}

function validateProjectName(value: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(value)) {
    throw new Error(`Invalid project name: ${value}. Use lowercase letters, numbers, dots, underscores, and hyphens.`);
  }
  return value;
}

function validateAndroidPackage(value: string): string {
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(value)) {
    throw new Error(`Invalid Android package: ${value}. Example: com.example.myapp`);
  }
  return value;
}

function resolveRuntimeArtifacts(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.STING_ANDROID_HOST_ARTIFACTS,
    fileURLToPath(new URL('../runtime/android', import.meta.url)),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const directory = resolve(candidate);
    if (
      existsSync(join(directory, 'sting-runtime.aar')) &&
      existsSync(join(directory, 'sting-quickjs.aar'))
    ) {
      return directory;
    }
  }

  throw new Error(
    'Sting Android host artifacts were not found. Pass --runtime-artifacts <dir>, set STING_ANDROID_HOST_ARTIFACTS, or package the AARs under runtime/android.',
  );
}

function assertTargetAvailable(targetDir: string, force: boolean): void {
  if (!existsSync(targetDir)) return;
  const entries = readdirSync(targetDir);
  if (entries.length > 0 && !force) {
    throw new Error(`Target directory is not empty: ${targetDir}. Pass --force to overwrite generated files.`);
  }
}

function textExtension(path: string): string {
  const name = basename(path);
  if (name === '.gitignore') return '.gitignore';
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index);
}

function render(value: string, replacements: Record<string, string>): string {
  let result = value;
  for (const [key, replacement] of Object.entries(replacements)) {
    result = result.replaceAll(`__${key}__`, replacement);
  }
  return result;
}

function copyTemplateDirectory(
  sourceRoot: string,
  targetRoot: string,
  replacements: Record<string, string>,
): void {
  for (const entry of readdirSync(sourceRoot)) {
    const source = join(sourceRoot, entry);
    const renderedEntry = render(entry, replacements).replace(/\.tpl$/, '');
    const target = join(targetRoot, renderedEntry);
    const stat = statSync(source);

    if (stat.isDirectory()) {
      mkdirSync(target, { recursive: true });
      copyTemplateDirectory(source, target, replacements);
      continue;
    }

    mkdirSync(dirname(target), { recursive: true });
    if (TEXT_EXTENSIONS.has(textExtension(renderedEntry))) {
      writeFileSync(target, render(readFileSync(source, 'utf8'), replacements), 'utf8');
    } else {
      copyFileSync(source, target);
    }
  }
}

export function createStingProject(options: CreateStingProjectOptions): CreatedStingProject {
  const targetDir = resolve(options.targetDir);
  const projectName = validateProjectName(options.projectName ?? defaultProjectName(targetDir));
  const androidPackage = validateAndroidPackage(
    options.androidPackage ?? `run.stingjs.apps.${projectName.replace(/[^a-z0-9_]/g, '_')}`,
  );
  const runtimeArtifactsDir = resolveRuntimeArtifacts(options.runtimeArtifactsDir);
  const force = options.force ?? false;

  assertTargetAvailable(targetDir, force);
  mkdirSync(targetDir, { recursive: true });

  const templateRoot = fileURLToPath(new URL('../template', import.meta.url));
  copyTemplateDirectory(templateRoot, targetDir, {
    PROJECT_NAME: projectName,
    PROJECT_DISPLAY_NAME: projectName.replace(/[-_]+/g, ' '),
    ANDROID_PACKAGE: androidPackage,
    ANDROID_PACKAGE_PATH: packagePath(androidPackage),
  });

  const libs = join(targetDir, 'android', 'app', 'libs');
  mkdirSync(libs, { recursive: true });
  cpSync(join(runtimeArtifactsDir, 'sting-runtime.aar'), join(libs, 'sting-runtime.aar'));
  cpSync(join(runtimeArtifactsDir, 'sting-quickjs.aar'), join(libs, 'sting-quickjs.aar'));

  return { targetDir, projectName, androidPackage, runtimeArtifactsDir };
}
