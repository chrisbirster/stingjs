import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateCaptureToEvidence } from './candidate-capture.mjs';

export async function runCandidateEvidenceCli(argv = process.argv.slice(2)) {
  const [capturePath, outputDirectory] = argv;
  if (!capturePath || !outputDirectory) {
    throw new Error(
      'Usage: node benchmarks/results/candidate-evidence-cli.mjs <capture-document.json> <output-directory>',
    );
  }

  const source = resolve(capturePath);
  let document;
  try {
    document = JSON.parse(await readFile(source, 'utf8'));
  } catch (error) {
    throw new Error(`${source}: invalid capture document JSON: ${error.message}`);
  }

  const files = candidateCaptureToEvidence(document, source);
  const destination = resolve(outputDirectory);
  await mkdir(destination, { recursive: true });

  for (const { filename, result } of files) {
    await writeFile(
      resolve(destination, filename),
      `${JSON.stringify(result, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
  }

  process.stdout.write(`${files.length} evidence file(s) written to ${destination}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath === modulePath) {
  runCandidateEvidenceCli().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
