import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export interface StingIosConfig {
  project?: string;
  scheme?: string;
  bundleIdentifier?: string;
  configuration?: string;
}

export interface StingAndroidConfig {
  directory?: string;
  package?: string;
  variant?: string;
}

export interface StingConfig {
  name?: string;
  bundle?: string;
  ios?: StingIosConfig;
  android?: StingAndroidConfig;
}

export interface LoadedStingConfig {
  path: string;
  config: StingConfig;
}

const CONFIG_NAMES = [
  'sting.config.ts',
  'sting.config.mts',
  'sting.config.js',
  'sting.config.mjs',
  'sting.config.cjs',
] as const;

export function defineConfig(config: StingConfig): StingConfig {
  return config;
}

export function findStingConfig(projectRoot: string): string | undefined {
  const root = resolve(projectRoot);
  for (const name of CONFIG_NAMES) {
    const candidate = join(root, name);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function validateConfig(value: unknown, sourcePath: string): StingConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${basename(sourcePath)} must default-export a Sting config object.`);
  }

  const config = value as StingConfig;
  if (config.name !== undefined && typeof config.name !== 'string') {
    throw new Error(`${basename(sourcePath)}: name must be a string.`);
  }
  if (config.bundle !== undefined && typeof config.bundle !== 'string') {
    throw new Error(`${basename(sourcePath)}: bundle must be a string.`);
  }
  if (config.ios !== undefined && (config.ios === null || typeof config.ios !== 'object' || Array.isArray(config.ios))) {
    throw new Error(`${basename(sourcePath)}: ios must be an object.`);
  }
  if (config.android !== undefined && (config.android === null || typeof config.android !== 'object' || Array.isArray(config.android))) {
    throw new Error(`${basename(sourcePath)}: android must be an object.`);
  }

  return config;
}

function transpileTypeScript(sourcePath: string): string {
  const source = readFileSync(sourcePath, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: sourcePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      verbatimModuleSyntax: true,
    },
  });

  const errors = (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    const formatted = ts.formatDiagnostics(errors, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    });
    throw new Error(`Could not load ${basename(sourcePath)}:\n${formatted}`);
  }
  return result.outputText;
}

async function importTypeScriptConfig(sourcePath: string): Promise<unknown> {
  const directory = dirname(sourcePath);
  const temporaryPath = join(
    directory,
    `.sting.config.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.mjs`,
  );
  writeFileSync(temporaryPath, transpileTypeScript(sourcePath), 'utf8');
  try {
    const moduleUrl = `${pathToFileURL(temporaryPath).href}?t=${Date.now()}`;
    const loaded = await import(moduleUrl) as { default?: unknown };
    return loaded.default;
  } finally {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Best-effort cleanup. The generated file is uniquely named and ignored by Sting tooling.
    }
  }
}

export async function loadStingConfig(projectRoot = process.cwd()): Promise<LoadedStingConfig | undefined> {
  const sourcePath = findStingConfig(projectRoot);
  if (!sourcePath) return undefined;

  const extension = sourcePath.endsWith('.ts') || sourcePath.endsWith('.mts');
  const value = extension
    ? await importTypeScriptConfig(sourcePath)
    : (await import(`${pathToFileURL(sourcePath).href}?t=${Date.now()}`) as { default?: unknown }).default;

  return {
    path: sourcePath,
    config: validateConfig(value, sourcePath),
  };
}
