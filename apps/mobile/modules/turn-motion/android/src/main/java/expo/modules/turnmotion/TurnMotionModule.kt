package expo.modules.turnmotion

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Foreground IMU capture. Never uses Choreographer or retains mutable SensorEvents. */
class TurnMotionModule : Module() {
  private var capture: Capture? = null
  private val lock = Any()

  override fun definition() = ModuleDefinition {
    Name("TurnMotion")
    Constant("revision") { "turn-android-imu-1" }
    Events("onBatch", "onFailure")

    AsyncFunction("start") { token: String ->
      synchronized(lock) {
        check(capture == null) { "A motion session is already running." }
        val context = appContext.reactContext ?: error("Android context unavailable.")
        val manager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val sensors = TYPES.map { type ->
          manager.getDefaultSensor(type) ?: error("Required Android sensor unavailable: $type")
        }
        val next = Capture(token, manager)
        capture = next
        try {
          sensors.forEach { sensor ->
            check(manager.registerListener(next, sensor, 20_000, 0, next.handler)) {
              "Could not start Android sensor ${sensor.type}."
            }
          }
          next.schedule()
        } catch (error: Exception) {
          capture = null
          next.close()
          throw error
        }
      }
    }
    Function("acknowledge") { token: String, sequence: Int ->
      synchronized(lock) { capture?.takeIf { it.token == token }?.acknowledge(sequence) }
    }
    Function("stop") { token: String -> stop(token) }
    OnStopObserving { stop(null) }
    OnActivityEntersBackground { stop(null, "App left the foreground. Re-anchor before resuming.") }
    OnDestroy { stop(null) }
  }

  private fun stop(token: String?, reason: String? = null) = synchronized(lock) {
    val active = capture
    if (active != null && (token == null || active.token == token)) {
      capture = null
      active.close()
      if (reason != null) sendEvent("onFailure", mapOf("token" to active.token, "message" to reason))
    }
  }

  private inner class Capture(val token: String, private val manager: SensorManager) : SensorEventListener {
    private val thread = HandlerThread("TURN-IMU").apply { start() }
    val handler = Handler(thread.looper)
    @Volatile private var closed = false
    private val pending = ArrayList<Map<String, Any>>()
    private var sequence = 0
    private var awaitingAck: Int? = null
    private val flush = object : Runnable {
      override fun run() {
        if (closed) return
        if (awaitingAck == null && pending.isNotEmpty()) {
          val samples = pending.toList()
          pending.clear()
          sequence += 1
          awaitingAck = sequence
          sendEvent("onBatch", mapOf("token" to token, "sequence" to sequence, "samples" to samples))
        }
        handler.postDelayed(this, 100)
      }
    }

    fun schedule() { handler.postDelayed(flush, 100) }
    fun acknowledge(value: Int) {
      handler.post { if (awaitingAck == value) awaitingAck = null }
    }
    fun close() {
      closed = true
      manager.unregisterListener(this)
      handler.removeCallbacksAndMessages(null)
      thread.quitSafely()
    }
    override fun onSensorChanged(event: SensorEvent) {
      if (closed) return
      // One unacknowledged batch plus a bounded queue: never silently drop data.
      if (pending.size >= 1000) {
        stop(token, "Motion processing fell behind; sensor buffer filled. Send this recording for diagnosis.")
        return
      }
      val values = if (event.sensor.type == Sensor.TYPE_ROTATION_VECTOR) {
        val matrix = FloatArray(9)
        val orientation = FloatArray(3)
        SensorManager.getRotationMatrixFromVector(matrix, event.values)
        SensorManager.getOrientation(matrix, orientation)
        // Match expo-sensors Android Euler convention; radians.
        listOf(-orientation[0].toDouble(), -orientation[1].toDouble(), orientation[2].toDouble())
      } else {
        event.values.take(3).map { it.toDouble() }
      }
      pending.add(mapOf("type" to event.sensor.type, "timestamp" to event.timestamp / 1e9, "values" to values))
    }
    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) = Unit
  }

  companion object {
    private val TYPES = intArrayOf(Sensor.TYPE_ACCELEROMETER, Sensor.TYPE_GYROSCOPE,
      Sensor.TYPE_LINEAR_ACCELERATION, Sensor.TYPE_ROTATION_VECTOR, Sensor.TYPE_GRAVITY)
  }
}
