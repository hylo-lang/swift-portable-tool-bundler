// Platform-specific allow-lists of dynamic libraries that may be copied into
// the portable bundle. Anything not on these lists is assumed to be a system
// library and is ignored. Ported from swift-bundler's GenericWindowsBundler
// and GenericLinuxBundler.

/** Windows DLL allow-list (base name including `.dll`, case-insensitive). */
export const WINDOWS_DLL_ALLOWLIST: readonly string[] = [
  "swiftCore",
  "swiftCRT",
  "swiftDispatch",
  "swiftDistributed",
  "swiftObservation",
  "swiftRegexBuilder",
  "swiftRemoteMirror",
  "swiftSwiftOnoneSupport",
  "swiftSynchronization",
  "swiftWinSDK",
  "Foundation",
  "FoundationXML",
  "FoundationNetworking",
  "FoundationEssentials",
  "FoundationInternationalization",
  "BlocksRuntime",
  "_FoundationICU",
  "_InternalSwiftScan",
  "_InternalSwiftStaticMirror",
  "swift_Concurrency",
  "swift_RegexParser",
  "swift_StringProcessing",
  "swift_Differentiation",
  "concrt140",
  "msvcp140",
  "msvcp140_1",
  "msvcp140_2",
  "msvcp140_atomic_wait",
  "msvcp140_codecvt_ids",
  "vccorlib140",
  "vcruntime140",
  "vcruntime140_1",
  "vcruntime140_threads",
  "dispatch",
].map((n) => `${n}.dll`);

/**
 * Linux shared-object allow-list. Matched against the file name stripped of
 * `.so*` suffixes (e.g. `libFoo.so.1.2.3` matches `libFoo`).
 */
export const LINUX_SO_ALLOWLIST: readonly string[] = [
  "libswiftCore",
  "libswiftGlibc",
  "libswiftDispatch",
  "libswiftDistributed",
  "libswiftObservation",
  "libswiftRegexBuilder",
  "libswiftRemoteMirror",
  "libswiftSynchronization",
  "libswiftSwiftOnoneSupport",
  "libBlocksRuntime",
  "libdispatch",
  "libswift_Volatile",
  "libswift_Concurrency",
  "libswift_RegexParser",
  "libswift_StringProcessing",
  "libswift_Backtracing",
  "libswift_Builtin_float",
  "libswift_Differentiation",
  "lib_FoundationICU",
  "lib_InternalSwiftScan",
  "lib_InternalSwiftStaticMirror",
  "libFoundation",
  "libFoundationXML",
  "libFoundationEssentials",
  "libFoundationNetworking",
  "libFoundationInternationalization",
  "libicuuc",
  "libicudata",
  "libicuucswift",
  "libicui18nswift",
  "libicudataswift",
];

/**
 * Case-insensitive membership check for the Windows allow-list.
 */
export function isAllowedWindowsDll(name: string): boolean {
  const lower = name.toLowerCase();
  return WINDOWS_DLL_ALLOWLIST.some((n) => n.toLowerCase() === lower);
}

/**
 * Strips `.so*` suffix and checks membership against `LINUX_SO_ALLOWLIST`.
 * e.g. `libFoundation.so.6.2` -> `libFoundation` -> matches.
 */
export function isAllowedLinuxSo(fileName: string): boolean {
  const stem = fileName.split(".so")[0];
  return LINUX_SO_ALLOWLIST.includes(stem);
}
