package run.stingjs.modules.sensors

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeModuleEventEmitter

class SensorsModule(context: Context) : StingNativeModule {
    override val name = "Sensors"
    override val version = "0.1.0"

    private val manager = context.applicationContext.getSystemService(SensorManager::class.java)
    private val handler = Handler(Looper.getMainLooper())
    private val lock = Any()
    private val intervalsMicros = mutableMapOf(
        "accelerometer" to DEFAULT_INTERVAL_US,
        "gyroscope" to DEFAULT_INTERVAL_US,
    )
    private val observers = mutableMapOf<String, Observer>()

    override fun callSync(method: String, arguments: List<Any?>): Any? = when (method) {
        "hasSensor" -> manager.getDefaultSensor(sensorType(arguments.getOrNull(0))) != null
        "setUpdateInterval" -> {
            val type = sensorName(arguments.getOrNull(0))
            val raw = (arguments.getOrNull(1) as? Number)?.toDouble()
                ?: throw invalidArgument("Sensor update interval must be a positive finite number of milliseconds")
            if (!raw.isFinite() || raw <= 0.0) {
                throw invalidArgument("Sensor update interval must be a positive finite number of milliseconds")
            }
            val micros = (raw * 1000.0).coerceAtLeast(1000.0).coerceAtMost(Int.MAX_VALUE.toDouble()).toInt()
            synchronized(lock) { intervalsMicros[type] = micros }
            restartIfObserved(type)
            null
        }
        else -> throw StingNativeModuleError(
            code = "E_METHOD_NOT_FOUND",
            message = "Sensors does not implement synchronous method $method",
        )
    }

    override fun setEventEnabled(
        event: String,
        enabled: Boolean,
        emit: StingNativeModuleEventEmitter,
    ) {
        val type = sensorName(event)
        val previous = synchronized(lock) { observers.remove(type) }
        if (previous != null) manager.unregisterListener(previous)
        if (!enabled) return

        val sensor = manager.getDefaultSensor(sensorType(type))
            ?: throw unavailable(type)
        val observer = Observer(type, emit)
        val interval = synchronized(lock) { intervalsMicros.getValue(type) }
        val registered = manager.registerListener(observer, sensor, interval, handler)
        if (!registered) throw unavailable(type)
        synchronized(lock) { observers[type] = observer }
    }

    private fun restartIfObserved(type: String) {
        val current = synchronized(lock) { observers[type] } ?: return
        val sensor = manager.getDefaultSensor(sensorType(type)) ?: return
        val interval = synchronized(lock) { intervalsMicros.getValue(type) }
        manager.unregisterListener(current)
        if (!manager.registerListener(current, sensor, interval, handler)) {
            synchronized(lock) { observers.remove(type) }
            throw unavailable(type)
        }
    }

    private inner class Observer(
        private val type: String,
        private val emit: StingNativeModuleEventEmitter,
    ) : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            if (event.values.size < 3) return
            val scale = if (type == "accelerometer") SensorManager.GRAVITY_EARTH.toDouble() else 1.0
            emit(
                mapOf(
                    "x" to event.values[0].toDouble() / scale,
                    "y" to event.values[1].toDouble() / scale,
                    "z" to event.values[2].toDouble() / scale,
                    "timestamp" to event.timestamp.toDouble() / 1_000_000_000.0,
                ),
            )
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    }

    private fun sensorName(value: Any?): String {
        val type = value as? String ?: throw invalidArgument("Sensor type must be accelerometer or gyroscope")
        if (type != "accelerometer" && type != "gyroscope") {
            throw invalidArgument("Unsupported sensor type: $type")
        }
        return type
    }

    private fun sensorType(value: Any?): Int = sensorType(sensorName(value))

    private fun sensorType(type: String): Int = when (type) {
        "accelerometer" -> Sensor.TYPE_ACCELEROMETER
        "gyroscope" -> Sensor.TYPE_GYROSCOPE
        else -> throw invalidArgument("Unsupported sensor type: $type")
    }

    private fun invalidArgument(message: String) = StingNativeModuleError(
        code = "E_INVALID_ARGUMENT",
        message = message,
    )

    private fun unavailable(type: String) = StingNativeModuleError(
        code = "E_SENSOR_UNAVAILABLE",
        message = "The $type sensor is not available on this device",
        details = mapOf("sensor" to type),
    )

    companion object {
        private const val DEFAULT_INTERVAL_US = 16_667
    }
}
