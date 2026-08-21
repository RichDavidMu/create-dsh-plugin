#!/usr/bin/env node
/**
 * `create-dsh-plugin` entry point.
 * @module create-dsh-plugin/bin
 */

import { parseArgs } from './args.ts'
import { initGitRepository, scaffold } from './scaffold.ts'
import { scaffoldVersion } from './versions.ts'

const request = parseArgs(process.argv.slice(2), scaffoldVersion())

try {
  const result = scaffold(request)
  const initialized = initGitRepository(result.directory)
  process.stdout.write(
    `create-dsh-plugin: generated ${result.written.length} files in ${result.directory}\n`
    + `  dsh version   ${result.dshVersion}\n`
    + `  plugin        ${result.pluginPackage}\n`
    + `  bundle        ${result.bundlePackage}\n`
    + `  git           ${initialized ? 'initialized' : 'not initialized (already a repository, or git unavailable)'}\n`
    + '\nNext:\n'
    + `  cd ${request.directory}\n`
    + '  pnpm install\n'
    + '  pnpm run check          # typecheck + lint + test + build\n'
    + '  cat docs/plugin-authoring.md   # everything needed to write a plugin, no dsh checkout required\n'
    + '  cat README.md                  # how to load this plugin into a dsh profile\n',
  )
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`)
  process.exit(1)
}
