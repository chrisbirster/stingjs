import QRCode from 'qrcode';

export function shouldRenderTerminalQr(
  args: readonly string[],
  stdoutIsTTY: boolean | undefined,
): boolean {
  if (args.includes('--no-qr')) return false;
  if (args.includes('--qr')) return true;
  return stdoutIsTTY === true;
}

export async function renderTerminalQr(value: string): Promise<string> {
  return QRCode.toString(value, {
    type: 'terminal',
    small: true,
    errorCorrectionLevel: 'M',
    margin: 2,
  });
}
