import Foundation

@main
struct Hello {
  static func main() async throws {
    // Use Foundation: build an ISO-8601 timestamp.
    let formatter = ISO8601DateFormatter()
    let timestamp = formatter.string(from: Date())

    // Use Swift concurrency: a trivial async hop through a Task.
    let greeting = await Task.detached { "Hello from Swift on Windows" }.value

    // Use Foundation again: read the host machine name from the environment.
    let host = ProcessInfo.processInfo.environment["COMPUTERNAME"] ?? "unknown-host"

    print("\(timestamp) \(greeting) on \(host)")
  }
}
