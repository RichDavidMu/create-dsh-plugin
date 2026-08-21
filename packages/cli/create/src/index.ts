/**
 * Programmatic surface of `@rdmu/create-dsh-plugin`, for callers that generate a
 * project from code rather than the command line (a test harness, a higher-level
 * template, an internal platform tool).
 * @module @rdmu/create-dsh-plugin
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
export { cloneRemoteFor, formatTrace, releaseTag, sourceUrlFor, tracePackage, type PackageTrace } from './trace.ts'
export {
  cloneArgs,
  formatPlan,
  indexArgs,
  localSnapshotOf,
  planGraph,
  resolutionRoots,
  snapshotFor,
  traceFromRoots,
  traceReference,
  GRAPH_DIR,
  REFERENCE_PACKAGES,
  SOURCE_ROOT,
  type GraphPlan,
  type SourceSnapshot,
} from './dsh-source.ts'
export { quoteForShell, runGraph, type GraphIo } from './graph-runner.ts'
export {
  dshRange,
  scaffoldVersion,
  FRAMEWORK_VERSIONS,
  NODE_ENGINES,
  PACKAGE_MANAGER,
  TOOLCHAIN_VERSIONS,
} from './versions.ts'
