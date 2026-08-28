#!/usr/bin/env node
import { createStingProject } from './create.js';

interface ParsedArgs {
  targetDir?: string;
  projectName?: string;
  androidPackage?: string;
  iosBundleIdentifier?: string;
  runtimeArtifactsDir?: string;
  iosRuntimeArtifactsDir?: string;
  force: boolean;
  help: boolean;
}

function usage(): string {
  return `Usage: create-sting <directory> [options]\n\nOptions:\n  --name <name>                       npm/project name\n  --android-package <package>         Android application package\n  --ios-bundle-identifier <id>        iOS application bundle identifier\n  --runtime-artifacts <dir>           Directory containing sting-runtime.aar and sting-quickjs.aar\n  --ios-runtime-artifacts <dir>       Directory containing the packaged StingQuickJSRuntime host\n  --force                             Allow writing into a non-empty target directory\n  -h, --help                          Show this help\n`;
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { force: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '--force') {
      result.force = true;
    } else if (
      arg === '--name' ||
      arg === '--android-package' ||
      arg === '--ios-bundle-identifier' ||
      arg === '--runtime-artifacts' ||
      arg === '--ios-runtime-artifacts'
    ) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value.`);
      index += 1;
      if (arg === '--name') result.projectName = value;
      if (arg === '--android-package') result.androidPackage = value;
      if (arg === '--ios-bundle-identifier') result.iosBundleIdentifier = value;
      if (arg === '--runtime-artifacts') result.runtimeArtifactsDir = value;
      if (arg === '--ios-runtime-artifacts') result.iosRuntimeArtifactsDir = value;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!result.targetDir) {
      result.targetDir = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return result;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    process.exitCode = 0;
  } else if (!args.targetDir) {
    process.stderr.write(usage());
    process.exitCode = 1;
  } else {
    const created = createStingProject({
      targetDir: args.targetDir,
      projectName: args.projectName,
      androidPackage: args.androidPackage,
      iosBundleIdentifier: args.iosBundleIdentifier,
      runtimeArtifactsDir: args.runtimeArtifactsDir,
      iosRuntimeArtifactsDir: args.iosRuntimeArtifactsDir,
      force: args.force,
    });
    process.stdout.write(`Created ${created.projectName} in ${created.targetDir}\n\nNext steps:\n  cd ${args.targetDir}\n  npm install\n  sting doctor\n  sting test\n  sting run ios\n  sting run android\n`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`create-sting: ${message}\n`);
  process.exitCode = 1;
}
