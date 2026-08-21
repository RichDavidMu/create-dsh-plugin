/**
 * Programmatic surface of `create-dsh-plugin`, for callers that generate a
 * project from code rather than the command line (a test harness, a higher-level
 * template, an internal platform tool).
 * @module create-dsh-plugin
 */

export { parseArgs, validatePluginName, validateScope, type ScaffoldRequest } from './args.ts'
export {
  assertWritableTarget,
  initGitRepository,
  resolveTemplateRoots,
  scaffold,
  type ScaffoldResult,
  type TemplateRoots,
} from './scaffold.ts'
export { materialize, materializeFiles, rewriteManifest, snakeCase, substitute, targetName, TEMPLATE_ROLE, TEMPLATE_SCOPE, TEMPLATE_TOOL, type Naming } from './copy.ts'
export { formatTrace, sourceUrlFor, tracePackage, type PackageTrace } from './trace.ts'
export {
  dshRange,
  scaffoldVersion,
  FRAMEWORK_VERSIONS,
  NODE_ENGINES,
  PACKAGE_MANAGER,
  TOOLCHAIN_VERSIONS,
} from './versions.ts'
