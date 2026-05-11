// swift-tools-version:6.0
import PackageDescription

let package = Package(
  name: "hello",
  // Swift concurrency (`async`/`await`, `Task.detached`) requires
  // macOS 12+ at runtime; the integration test exercises the binary on
  // macOS-15 runners.
  platforms: [.macOS(.v12)],
  targets: [
    .executableTarget(name: "hello", path: "Sources/hello")
  ]
)
