export type DevelopmentCommand = 'start' | 'dev';

export interface DevelopmentMode {
  command: DevelopmentCommand;
  watch: boolean;
  title: string;
  guidance: string;
}

export function resolveDevelopmentMode(
  command: DevelopmentCommand,
  args: readonly string[],
): DevelopmentMode {
  const watch = command === 'dev' || args.includes('--watch');

  return {
    command,
    watch,
    title: command === 'dev' ? 'Sting development session' : 'Sting development server',
    guidance: command === 'dev'
      ? 'Scan the QR code or open the Sting Go URL to begin developing.'
      : 'Open the Sting Go URL on a device connected to the same network.',
  };
}
