import CoreMotion
import Foundation
import StingRuntime

public final class SensorsModule: StingNativeModule {
    public let name = "Sensors"
    public let version = "0.1.0"

    private let motion = CMMotionManager()
    private let queue: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "run.stingjs.modules.sensors"
        queue.maxConcurrentOperationCount = 1
        queue.qualityOfService = .userInteractive
        return queue
    }()
    private let lock = NSLock()
    private var accelerometerInterval: TimeInterval = 1.0 / 60.0
    private var gyroscopeInterval: TimeInterval = 1.0 / 60.0

    public init() {}

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        switch method {
        case "hasSensor":
            let type = try sensorType(arguments, index: 0)
            switch type {
            case "accelerometer": return motion.isAccelerometerAvailable
            case "gyroscope": return motion.isGyroAvailable
            default: fatalError("validated sensor type")
            }
        case "setUpdateInterval":
            let type = try sensorType(arguments, index: 0)
            guard arguments.count > 1, let raw = number(arguments[1]), raw.isFinite, raw > 0 else {
                throw invalidArgument("Sensor update interval must be a positive finite number of milliseconds")
            }
            let interval = max(raw / 1000.0, 0.001)
            lock.lock()
            if type == "accelerometer" {
                accelerometerInterval = interval
                motion.accelerometerUpdateInterval = interval
            } else {
                gyroscopeInterval = interval
                motion.gyroUpdateInterval = interval
            }
            lock.unlock()
            return nil
        default:
            throw StingNativeModuleError(
                code: "E_METHOD_NOT_FOUND",
                message: "Sensors does not implement synchronous method \(method)"
            )
        }
    }

    public func setEventEnabled(
        event: String,
        enabled: Bool,
        emit: @escaping StingNativeModuleEventEmitter
    ) throws {
        let type = try validateSensorType(event)
        if type == "accelerometer" {
            if !enabled {
                motion.stopAccelerometerUpdates()
                return
            }
            guard motion.isAccelerometerAvailable else {
                throw unavailable(type)
            }
            lock.lock()
            let interval = accelerometerInterval
            lock.unlock()
            motion.accelerometerUpdateInterval = interval
            motion.startAccelerometerUpdates(to: queue) { [weak self] data, error in
                if error != nil {
                    self?.motion.stopAccelerometerUpdates()
                    return
                }
                guard let data else { return }
                emit([
                    "x": data.acceleration.x,
                    "y": data.acceleration.y,
                    "z": data.acceleration.z,
                    "timestamp": data.timestamp,
                ])
            }
            return
        }

        if !enabled {
            motion.stopGyroUpdates()
            return
        }
        guard motion.isGyroAvailable else {
            throw unavailable(type)
        }
        lock.lock()
        let interval = gyroscopeInterval
        lock.unlock()
        motion.gyroUpdateInterval = interval
        motion.startGyroUpdates(to: queue) { [weak self] data, error in
            if error != nil {
                self?.motion.stopGyroUpdates()
                return
            }
            guard let data else { return }
            emit([
                "x": data.rotationRate.x,
                "y": data.rotationRate.y,
                "z": data.rotationRate.z,
                "timestamp": data.timestamp,
            ])
        }
    }

    public func applicationLifecycleDidChange(_ event: StingApplicationLifecycleEvent) {
        guard event == .runtimeDisposing else { return }
        motion.stopAccelerometerUpdates()
        motion.stopGyroUpdates()
        queue.cancelAllOperations()
    }

    private func sensorType(_ arguments: [Any], index: Int) throws -> String {
        guard arguments.count > index, let type = arguments[index] as? String else {
            throw invalidArgument("Sensor type must be accelerometer or gyroscope")
        }
        return try validateSensorType(type)
    }

    private func validateSensorType(_ type: String) throws -> String {
        guard type == "accelerometer" || type == "gyroscope" else {
            throw invalidArgument("Unsupported sensor type: \(type)")
        }
        return type
    }

    private func number(_ value: Any) -> Double? {
        if let value = value as? Double { return value }
        if let value = value as? NSNumber { return value.doubleValue }
        return nil
    }

    private func invalidArgument(_ message: String) -> StingNativeModuleError {
        StingNativeModuleError(code: "E_INVALID_ARGUMENT", message: message)
    }

    private func unavailable(_ type: String) -> StingNativeModuleError {
        StingNativeModuleError(
            code: "E_SENSOR_UNAVAILABLE",
            message: "The \(type) sensor is not available on this device",
            details: ["sensor": type]
        )
    }
}
