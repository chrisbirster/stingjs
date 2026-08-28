import Dispatch
import Foundation

public struct StingPerformanceMetricSnapshot: Equatable, Sendable {
    public let name: String
    public let samplesMilliseconds: [Double]

    public init(name: String, samplesMilliseconds: [Double]) {
        self.name = name
        self.samplesMilliseconds = samplesMilliseconds
    }
}

public struct StingPerformanceSnapshot: Equatable, Sendable {
    public let metrics: [StingPerformanceMetricSnapshot]

    public init(metrics: [StingPerformanceMetricSnapshot]) {
        self.metrics = metrics
    }

    public func samples(for metric: String) -> [Double] {
        metrics.first(where: { $0.name == metric })?.samplesMilliseconds ?? []
    }
}

/// Opt-in runtime diagnostics for benchmark and profiling hosts.
///
/// Sting does not allocate or record per-operation samples unless a runtime is
/// created with performance diagnostics enabled. Durations use a monotonic
/// native clock and are intentionally measured at the native boundary rather
/// than inferred from JavaScript timers.
public final class StingPerformanceDiagnostics: @unchecked Sendable {
    private let lock = NSLock()
    private let nowNanoseconds: () -> UInt64
    private var samples: [String: [Double]] = [:]

    public convenience init() {
        self.init(nowNanoseconds: { DispatchTime.now().uptimeNanoseconds })
    }

    init(nowNanoseconds: @escaping () -> UInt64) {
        self.nowNanoseconds = nowNanoseconds
    }

    public func reset() {
        lock.lock()
        samples.removeAll(keepingCapacity: true)
        lock.unlock()
    }

    public func snapshot() -> StingPerformanceSnapshot {
        lock.lock()
        let current = samples
        lock.unlock()

        let metrics = current.keys.sorted().map { name in
            StingPerformanceMetricSnapshot(
                name: name,
                samplesMilliseconds: current[name] ?? []
            )
        }
        return StingPerformanceSnapshot(metrics: metrics)
    }

    @discardableResult
    func measure<T>(_ metric: String, operation: () throws -> T) rethrows -> T {
        let start = nowNanoseconds()
        defer {
            record(metric, durationNanoseconds: elapsedNanoseconds(since: start))
        }
        return try operation()
    }

    func timestampNanoseconds() -> UInt64 {
        nowNanoseconds()
    }

    func record(_ metric: String, durationNanoseconds: UInt64) {
        append(metric: metric, durationNanoseconds: durationNanoseconds)
    }

    func elapsedNanoseconds(since start: UInt64) -> UInt64 {
        let end = nowNanoseconds()
        return end >= start ? end - start : 0
    }

    private func append(metric: String, durationNanoseconds: UInt64) {
        let milliseconds = Double(durationNanoseconds) / 1_000_000.0
        lock.lock()
        samples[metric, default: []].append(milliseconds)
        lock.unlock()
    }
}
