import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

export interface BuildWatcher {
  child: ChildProcess;
  close(): void;
}

export function npmExecutable(platform = process.platform): string {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function npmShell(platform = process.platform): boolean {
  return platform === 'win32';
}

export function startBuildWatcher(projectRoot: string): BuildWatcher {
  const executable = npmExecutable();
  const shell = npmShell();
  const initial = spawnSync(executable, ['run', 'build'], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    shell,
  });
  if (initial.error) throw new Error(`Failed to build Sting app: ${initial.error.message}`);
  if (initial.status !== 0) throw new Error(`Initial Sting build exited with code ${initial.status}`);

  const child = spawn(executable, ['run', 'build', '--', '--watch'], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    shell,
  });

  child.once('error', (error) => {
    console.error(`sting: build watcher failed: ${error.message}`);
  });
  child.once('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`sting: build watcher exited with code ${code}`);
    } else if (signal && signal !== 'SIGTERM') {
      console.error(`sting: build watcher exited from signal ${signal}`);
    }
  });

  return {
    child,
    close: () => {
      if (!child.killed) child.kill('SIGTERM');
    },
  };
}
