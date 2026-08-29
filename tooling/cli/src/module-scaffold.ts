import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { validateModuleManifest, type AndroidModuleFactory, type StingModuleManifest } from './modules.js';

export interface ScaffoldModuleOptions {
  targetDir: string;
  moduleName?: string;
  packageName?: string;
  androidPackage?: string;
  androidFactory?: AndroidModuleFactory;
  force?: boolean;
}

export interface ScaffoldedModule {
  targetDir: string;
  moduleName: string;
  packageName: string;
  androidPackage: string;
  manifest: StingModuleManifest;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'native-module';
}

function swiftType(value: string): string {
  const words = value.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const result = words.map(word => word[0]!.toUpperCase() + word.slice(1)).join('');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(result)) {
    throw new Error(`Invalid module name: ${value}`);
  }
  return result;
}

function validatePackageName(value: string): string {
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value)) {
    throw new Error(`Invalid npm package name: ${value}`);
  }
  return value;
}

function validateAndroidPackage(value: string): string {
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(value)) {
    throw new Error(`Invalid Android package: ${value}`);
  }
  return value;
}

async function assertTarget(targetDir: string, force: boolean): Promise<void> {
  try {
    const entries = await readdir(targetDir);
    if (entries.length > 0 && !force) {
      throw new Error(`Target directory is not empty: ${targetDir}. Pass --force to overwrite generated files.`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, content, 'utf8');
}

export async function scaffoldStingModule(options: ScaffoldModuleOptions): Promise<ScaffoldedModule> {
  const targetDir = resolve(options.targetDir);
  const baseSlug = slug(basename(targetDir));
  const moduleName = swiftType(options.moduleName ?? baseSlug);
  const packageName = validatePackageName(options.packageName ?? `sting-${baseSlug}`);
  const androidPackage = validateAndroidPackage(
    options.androidPackage ?? `com.example.sting.${baseSlug.replaceAll('-', '_')}`,
  );
  const androidFactory = options.androidFactory ?? 'context';
  await assertTarget(targetDir, options.force ?? false);

  const iosType = `${moduleName}Module`;
  const androidType = `${androidPackage}.${moduleName}Module`;
  const manifest = validateModuleManifest({
    schemaVersion: 1,
    name: moduleName,
    package: packageName,
    version: '0.1.0',
    ios: { module: iosType, factory: 'default', permissions: [] },
    android: { module: androidType, factory: androidFactory, permissions: [] },
    capabilities: ['sync-functions'],
  }, `${packageName}/sting-module.json`);

  await mkdir(targetDir, { recursive: true });
  await write(join(targetDir, 'package.json'), `${JSON.stringify({
    name: packageName,
    version: '0.1.0',
    type: 'module',
    files: ['dist', 'sting-module.json', 'ios', 'android', 'Package.swift', 'README.md'],
    scripts: {
      build: 'tsc -p tsconfig.json',
      typecheck: 'tsc -p tsconfig.json --noEmit',
      test: 'node --test dist/*.test.js',
    },
    dependencies: { '@stingjs/modules-core': '0.1.0' },
    devDependencies: { typescript: '5.9.2', '@types/node': '^22.0.0' },
    engines: { node: '>=22.12.0' },
    license: 'MIT',
  }, null, 2)}\n`);
  await write(join(targetDir, 'sting-module.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await write(join(targetDir, 'tsconfig.json'), `{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "declaration": true
  },
  "include": ["src/**/*.ts"]
}\n`);
  await write(join(targetDir, 'src', 'index.ts'), `import { createNativeModule } from '@stingjs/modules-core';

const native${moduleName} = createNativeModule('${moduleName}');

export const ${moduleName} = {
  ping(): string {
    return native${moduleName}.callSync<string>('ping') ?? '';
  },
};
`);
  await write(join(targetDir, 'src', 'index.test.ts'), `import assert from 'node:assert/strict';
import test from 'node:test';

test('${moduleName} package exports its public surface', async () => {
  const module = await import('./index.js');
  assert.ok(module.${moduleName});
});
`);
  await write(join(targetDir, 'ios', `${iosType}.swift`), `import StingRuntime

public final class ${iosType}: StingNativeModule {
    public let name = "${moduleName}"
    public let version = "0.1.0"

    public init() {}

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        guard method == "ping" else {
            throw StingNativeModuleError(code: "E_METHOD_NOT_FOUND", message: "${moduleName} does not implement \\(method)")
        }
        return "pong"
    }
}
`);
  await write(join(targetDir, 'Package.swift'), `// swift-tools-version: 5.10

import PackageDescription

// Sting applications consume this package's ios/ sources through manifest-driven
// autolinking. This descriptor keeps the native source layout explicit for editors
// and package tooling without embedding a Sting monorepo-relative dependency.
let package = Package(
    name: "Sting${moduleName}",
    platforms: [.iOS(.v16)],
    products: [.library(name: "Sting${moduleName}", targets: ["Sting${moduleName}"])],
    targets: [.target(name: "Sting${moduleName}", path: "ios")]
)
`);
  await write(join(targetDir, 'android', 'build.gradle.kts'), `plugins {
    id("com.android.library")
}

android {
    namespace = "${androidPackage}"
    compileSdk = 36
    defaultConfig { minSdk = 23 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// The application autolinker compiles android/src/main/java into the host against
// Sting's packaged runtime AAR; this project intentionally has no monorepo path.
`);
  const androidConstructor = androidFactory === 'context'
    ? `(context: Context)`
    : `()`;
  const contextImport = androidFactory === 'context' ? 'import android.content.Context\n' : '';
  await write(
    join(targetDir, 'android', 'src', 'main', 'java', ...androidPackage.split('.'), `${moduleName}Module.kt`),
    `package ${androidPackage}\n\n${contextImport}import run.stingjs.runtime.StingNativeModule\nimport run.stingjs.runtime.StingNativeModuleError\n\nclass ${moduleName}Module${androidConstructor} : StingNativeModule {\n    override val name = "${moduleName}"\n    override val version = "0.1.0"\n\n    override fun callSync(method: String, arguments: List<Any?>): Any? {\n        if (method != "ping") throw StingNativeModuleError("E_METHOD_NOT_FOUND", "${moduleName} does not implement $method")\n        return "pong"\n    }\n}\n`,
  );
  await write(join(targetDir, 'README.md'), `# ${packageName}\n\nA Sting native module scaffold.\n\n- JavaScript API: \`src/index.ts\`\n- Manifest/autolinking contract: \`sting-module.json\`\n- iOS implementation: \`ios/${iosType}.swift\`\n- Android implementation: \`android/src/main/java/.../${moduleName}Module.kt\`\n\nDeclare capabilities and static platform permissions in \`sting-module.json\`. Runtime authorization uses \`permissionStatus()\` / \`requestPermission()\` on the shared native module contract. Lifecycle/background hooks, async functions, events, native objects, and native views all use the public Sting runtime contracts rather than engine-specific APIs.\n`);

  return { targetDir, moduleName, packageName, androidPackage, manifest };
}
