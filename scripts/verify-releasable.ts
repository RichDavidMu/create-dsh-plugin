/**
 * Pre-release gate: refuse to publish a version that cannot be published, with a
 * message that says what to do about it.
 *
 * `npm publish` already fails on a duplicate version and on a name it does not
 * own, but it fails late — after CI has spent minutes on checks and a smoke test —
 * and its errors name HTTP codes rather than the fix. These checks run first and
 * cost nothing.
 *
 * Usage: `pnpm run verify-releasable`
 * @module scripts/verify-releasable
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoRoot = new URL('..', import.meta.url)

/**
 * Run one npm command and return its trimmed stdout.
 *
 * A non-zero exit is how the registry reports "no such package", so it is an
 * ordinary answer rather than a failure — hence `undefined` instead of a throw.
 * @param args - npm CLI arguments.
 * @returns the trimmed stdout, or `undefined` when npm failed or is absent.
 */
function npm(args: readonly string[]): string | undefined {
  const result = spawnSync('npm', args, { encoding: 'utf8' })
  if (result.error !== undefined || result.status !== 0) return undefined
  return result.stdout.trim()
}

/**
 * Read one manifest from the repository.
 * @param relative - path relative to the repository root.
 * @returns the parsed name and version fields.
 */
function manifest(relative: string): { name?: string; version?: string } {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, repoRoot)), 'utf8')) as {
    name?: string
    version?: string
  }
}

const failures: string[] = []

const { name, version } = manifest('packages/cli/create/package.json')
if (name === undefined || version === undefined) {
  throw new Error('verify-releasable: packages/cli/create/package.json declares no name or version')
}

// 1. The version contract: this scaffold's version IS the dsh version generated
//    projects depend on, so all three manifests must agree before it ships.
for (const relative of ['package.json', 'packages/example/plugin-hello/package.json']) {
  const other = manifest(relative)
  if (other.version !== version) {
    failures.push(
      `${relative} is at ${String(other.version)} but packages/cli/create/package.json is at ${version};`
      + ' the scaffold version IS the targeted dsh version and every manifest must state the same one',
    )
  }
}

// 2. The version must not already exist. A republish is an E403 from
//    `npm publish`; catching it here explains the fix instead.
if (npm(['view', `${name}@${version}`, 'version']) === version) {
  failures.push(`${name}@${version} is already published; bump the version in all three manifests before releasing`)
}

// 3. The name must be one the authenticated account may publish. This is the only
//    failure a version bump cannot fix, so it is worth naming rather than letting
//    it surface as a bare 403 after every other gate has run.
const maintainers = npm(['view', name, 'maintainers', '--json'])
if (maintainers !== undefined && maintainers.length > 0) {
  const listed = (JSON.parse(maintainers) as (string | { name?: string })[])
    .map(entry => (typeof entry === 'string' ? entry.split(' ')[0] : entry.name) ?? '')
    .filter(entry => entry.length > 0)
  const account = npm(['whoami'])
  if (account === undefined) {
    process.stdout.write(
      `verify-releasable: ${name} already exists on npm, maintained by ${listed.join(', ')}.`
      + ' Not authenticated here, so publish rights cannot be confirmed locally — CI will.\n',
    )
  } else if (!listed.includes(account)) {
    failures.push(
      `${name} on npm is maintained by ${listed.join(', ')}, not by the authenticated account "${account}".`
      + ' Publishing will be refused. Either rename the package or have a maintainer add you.',
    )
  }
}

if (failures.length > 0) {
  process.stderr.write(`verify-releasable: cannot publish\n${failures.map(line => `  - ${line}`).join('\n')}\n`)
  process.exit(1)
}

process.stdout.write(`verify-releasable: ${name}@${version} is releasable\n`)
