import { readFileSync, writeFileSync } from 'fs';
import importCwd from 'import-cwd';
import walkSync from 'walk-sync';
import { join } from 'path';

const fileGlobs = [
  // 'app/**/*.css',
  // 'addon/**/*.css',
  // 'tests/**/*.css',
  // 'vendor/**/*.css',
  // 'app/**/*.scss',
  // 'addon/**/*.scss',
  // 'tests/**/*.scss',
  // 'vendor/**/*.scss',
  '**/*.css'
];

const stylelintRegex = /stylelint-disable (.*) \*\//;

function ignoreError(errors, filePath) {
  const ruleIds = errors
    .filter(error => error.severity === 'error')
    .map(error => error.rule);

  let uniqueIds = [...new Set(ruleIds)];

  if (!uniqueIds.length) {
    // no errors to ignore
    return;
  }

  const file = readFileSync(filePath, 'utf8');

  const firstLine = file.split('\n')[0];

  if (firstLine.match(stylelintRegex)) {
    const matched = firstLine.match(stylelintRegex);
    const existing = matched[1].split(',')
      .map(item => item.trim())
      .filter(item => item.length);

    uniqueIds = [...new Set([...ruleIds, ...existing])];

    writeFileSync(filePath, file.replace(/^.*\n/, `/* stylelint-disable ${uniqueIds.join(', ')} */\n`));
  } else {
    writeFileSync(filePath, `/* stylelint-disable ${uniqueIds.join(', ')} */\n${file}`);
  }
}

export async function ignoreAll(directory) {
  // this is only used for internal testing, lint-to-the-future never passes a
  // directory
  const cwd = directory || process.cwd();

  const stylelint = importCwd('stylelint');

  const result = await stylelint.lint({
    files: fileGlobs,
    cwd,
  });

  const erroredResults = result.results.filter(err => err.errored);

  erroredResults.forEach((err) => {
    ignoreError(
      err.warnings,
      err.source,
    );
  });
}

export function list(directory) {
  // this is only used for internal testing, lint-to-the-future never passes a
  // directory
  const cwd = directory || process.cwd();

  let ignoreFile;

  try {
    ignoreFile = readFileSync(join(cwd, '.gitignore'), 'utf8')
      .split('\n')
      .filter((line) => line.length)
      .filter((line) => !line.startsWith('#'))
      // walkSync can't handle these
      .filter((line) => !line.startsWith('!'))
      .map((line) => line.replace(/^\//, ''))
      .map((line) => line.replace(/\/$/, '/*'));
  } catch (e) {
    // noop
  }

  const files = walkSync(cwd, {
    globs: fileGlobs,
    ignore: ignoreFile || ['**/node_modules/*'],
  });

  const output = {};

  files.forEach((filePath) => {
    const file = readFileSync(join(cwd, filePath), 'utf8');
    const firstLine = file.split('\n')[0];

    if (!firstLine.match(stylelintRegex)) {
      return;
    }

    const matched = firstLine.match(stylelintRegex);

    const ignoreRules = matched[1].split(',')
      .map(item => item.trim())
      .filter(item => item.length);

    ignoreRules.forEach((rule) => {
      if (output[rule]) {
        output[rule].push(filePath);
      } else {
        output[rule] = [filePath];
      }
    });
  });

  return output;
}
