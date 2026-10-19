package expo.modules.turnmotion

import android.Manifest
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import android.view.WindowManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * TURN BLE. Advertises the TURN manufacturer payload (test company id 0xFFFF + "TURN" + version +
 * ASCII beacon tag) and scans for it and for commercial Eddystone-UID beacons (service 0xFEAA,
 * frame 0x00), whose 6-byte instance id becomes a 12-hex-digit tag. Every other device is filtered
 * in the controller and never reaches JavaScript. Foreground use only.
 */
class TurnBleModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private val companyId = 0xFFFF
  private val magic = byteArrayOf(0x54, 0x55, 0x52, 0x4E)
  private val version: Byte = 1
  private val tagPattern = Regex("^[A-Za-z0-9]{1,12}$")
  private val eddystone = ParcelUuid.fromString("0000FEAA-0000-1000-8000-00805F9B34FB")
  private val okStatus = "Fresh BLE scan"

  private var pending: Promise? = null
  private var scanCallback: ScanCallback? = null
  private var scanStartNanos = 0L
  private var scanDurationSeconds = 8.0
  private val samples = LinkedHashMap<String, MutableList<Map<String, Double>>>()
  private val finishScan = Runnable { finish(okStatus) }

  // Continuous TURN-only stream for proximity detection: batches every 500 ms, bounded, token-checked.
  private var streamCallback: ScanCallback? = null
  private var streamToken: String? = null
  private var streamStartNanos = 0L
  private val streamBuffer = ArrayList<Map<String, Any>>()
  private var streamDropped = 0
  private val flushStream = object : Runnable {
    override fun run() {
      val token = streamToken ?: return
      if (streamBuffer.isNotEmpty() || streamDropped > 0) {
        sendEvent("onSamples", mapOf("token" to token, "samples" to streamBuffer.toList(), "dropped" to streamDropped))
        streamBuffer.clear()
        streamDropped = 0
      }
      handler.postDelayed(this, 500)
    }
  }

  private var advertiser: BluetoothLeAdvertiser? = null
  private var advertiseCallback: AdvertiseCallback? = null
  private var advertisedTag: String? = null

  override fun definition() = ModuleDefinition {
    Name("TurnBle")
    Constant("revision") { "turn-ble-2" }
    Events("onSamples")
    Function("capabilities") { capabilities() }
    AsyncFunction("startStream") { token: String, promise: Promise -> handler.post { beginStream(token, promise) } }
    Function("stopStream") { handler.post { endStream("stopped") }; Unit }
    AsyncFunction("scan") { durationMs: Int, promise: Promise -> handler.post { beginScan(durationMs, promise) } }
    Function("cancelScan") { handler.post { finish("BLE scan cancelled.", failed = true) }; Unit }
    AsyncFunction("startAdvertising") { tag: String, power: String, promise: Promise ->
      handler.post { beginAdvertising(tag, power, promise) }
    }
    Function("stopAdvertising") { handler.post { endAdvertising() }; Unit }
    Function("advertisingState") { mapOf("advertising" to (advertisedTag != null), "tag" to advertisedTag) }
    OnActivityEntersBackground {
      handler.post { endStream("backgrounded") }
      handler.post { finish("BLE scan interrupted when the app left the foreground.", failed = true) }
    }
    OnDestroy { handler.post { finish("BLE scan stopped.", failed = true); endStream("stopped"); endAdvertising() } }
  }

  private fun context(): Context? = appContext.reactContext?.applicationContext

  private fun granted(context: Context, permission: String) =
    context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  private fun adapterOf(context: Context) =
    (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  private fun capabilities(): Map<String, Any> {
    val context = context()
      ?: return mapOf("sdk" to Build.VERSION.SDK_INT, "bluetoothOn" to false, "canScan" to false, "canAdvertise" to false, "locationOn" to false)
    val adapter = adapterOf(context)
    val location = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    return mapOf(
      "sdk" to Build.VERSION.SDK_INT,
      "bluetoothOn" to (adapter?.isEnabled == true),
      "canScan" to (adapter != null && context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)),
      "canAdvertise" to (adapter?.isMultipleAdvertisementSupported == true),
      "locationOn" to location.isLocationEnabled,
    )
  }

  private fun beginScan(durationMs: Int, promise: Promise) {
    if (pending != null) { promise.reject("SCAN_BUSY", "A BLE scan is already running.", null); return }
    val context = context()
    if (context == null) { promise.reject("NO_CONTEXT", "Android context unavailable.", null); return }
    pending = promise
    try {
      check(durationMs in 2000..30000) { "Invalid BLE scan duration." }
      if (Build.VERSION.SDK_INT >= 31)
        check(granted(context, Manifest.permission.BLUETOOTH_SCAN)) { "Nearby devices permission is required for beacon scanning." }
      check(granted(context, Manifest.permission.ACCESS_FINE_LOCATION)) { "Precise location permission is required for beacon scanning." }
      val location = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      check(location.isLocationEnabled) { "Turn on phone Location services to scan beacons." }
      val adapter = adapterOf(context)
      check(adapter != null && adapter.isEnabled) { "Turn on Bluetooth, then retry." }
      val scanner = adapter.bluetoothLeScanner
      check(scanner != null) { "Bluetooth LE scanning is unavailable." }
      samples.clear()
      scanDurationSeconds = durationMs / 1000.0
      val filter = ScanFilter.Builder()
        .setManufacturerData(companyId, magic, byteArrayOf(-1, -1, -1, -1)).build()
      val uidFilter = ScanFilter.Builder()
        .setServiceData(eddystone, byteArrayOf(0x00), byteArrayOf(-1)).build()
      val settings = ScanSettings.Builder()
        .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).setReportDelay(0).build()
      val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) { record(result) }
        override fun onBatchScanResults(results: MutableList<ScanResult>) { results.forEach { record(it) } }
        override fun onScanFailed(errorCode: Int) {
          finish(
            if (errorCode == SCAN_FAILED_SCANNING_TOO_FREQUENTLY) "Android is limiting BLE scans. Wait 30 seconds and retry."
            else "BLE scan failed (code $errorCode).",
            failed = true,
          )
        }
      }
      scanCallback = callback
      scanStartNanos = SystemClock.elapsedRealtimeNanos()
      scanner.startScan(listOf(filter, uidFilter), settings, callback)
      handler.postDelayed(finishScan, durationMs.toLong())
    } catch (error: Exception) {
      finish(error.message ?: "BLE unavailable.", failed = true)
    }
  }

  private fun parseTag(result: ScanResult): String? {
    val record = result.scanRecord ?: return null
    val payload = record.getManufacturerSpecificData(companyId)
    if (payload != null) {
      if (payload.size < 6 || payload.size > 5 + 12 || payload[4] != version) return null
      for (i in magic.indices) if (payload[i] != magic[i]) return null
      val tag = String(payload, 5, payload.size - 5, Charsets.US_ASCII)
      return if (tagPattern.matches(tag)) tag else null
    }
    // Eddystone-UID: frame type 0x00, tx power, 10-byte namespace, 6-byte instance.
    val uid = record.getServiceData(eddystone) ?: return null
    if (uid.size < 18 || uid[0] != 0x00.toByte()) return null
    return (12 until 18).joinToString("") { "%02X".format(uid[it].toInt() and 0xFF) }
  }

  private fun beginStream(token: String, promise: Promise) {
    val context = context()
    try {
      check(context != null) { "Android context unavailable." }
      check(pending == null) { "A BLE scan is already running." }
      check(token.length in 8..80) { "Invalid stream token." }
      if (Build.VERSION.SDK_INT >= 31)
        check(granted(context, Manifest.permission.BLUETOOTH_SCAN)) { "Nearby devices permission is required for beacon scanning." }
      check(granted(context, Manifest.permission.ACCESS_FINE_LOCATION)) { "Precise location permission is required for beacon scanning." }
      val location = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      check(location.isLocationEnabled) { "Turn on phone Location services to scan beacons." }
      val adapter = adapterOf(context)
      check(adapter != null && adapter.isEnabled) { "Turn on Bluetooth, then retry." }
      val scanner = adapter.bluetoothLeScanner
      check(scanner != null) { "Bluetooth LE scanning is unavailable." }
      endStream("restarted")
      val filter = ScanFilter.Builder().setManufacturerData(companyId, magic, byteArrayOf(-1, -1, -1, -1)).build()
      val uidFilter = ScanFilter.Builder().setServiceData(eddystone, byteArrayOf(0x00), byteArrayOf(-1)).build()
      val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).setReportDelay(0).build()
      val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
          val tag = parseTag(result) ?: return
          val t = (result.timestampNanos - streamStartNanos) / 1e9
          if (t < 0.0) return
          if (streamBuffer.size >= 2000) { streamDropped++; return }
          streamBuffer.add(mapOf("t" to t, "id" to tag, "rssi" to result.rssi.toDouble()))
        }
        override fun onScanFailed(errorCode: Int) {
          val failedToken = streamToken
          endStream("failed")
          if (failedToken != null) sendEvent("onSamples", mapOf("token" to failedToken, "samples" to emptyList<Map<String, Any>>(), "dropped" to 0, "failure" to "BLE stream failed (code $errorCode)."))
        }
      }
      streamCallback = callback
      streamToken = token
      streamStartNanos = SystemClock.elapsedRealtimeNanos()
      streamBuffer.clear()
      streamDropped = 0
      scanner.startScan(listOf(filter, uidFilter), settings, callback)
      handler.postDelayed(flushStream, 500)
      promise.resolve(mapOf("token" to token))
    } catch (error: Exception) {
      promise.reject("STREAM_FAILED", error.message ?: "BLE unavailable.", null)
    }
  }

  private fun endStream(reason: String) {
    val callback = streamCallback
    handler.removeCallbacks(flushStream)
    streamCallback = null
    streamToken = null
    streamBuffer.clear()
    if (callback != null) {
      try {
        val context = context()
        if (context != null) adapterOf(context)?.bluetoothLeScanner?.stopScan(callback)
      } catch (_: Exception) {}
    }
  }

  private fun record(result: ScanResult) {
    val tag = parseTag(result) ?: return
    val t = (result.timestampNanos - scanStartNanos) / 1e9
    // Reject cached or pre-start results; the capture window must be fresh.
    if (t < 0.0 || t > scanDurationSeconds + 1.0) return
    if (!samples.containsKey(tag) && samples.size >= 32) return
    val list = samples.getOrPut(tag) { mutableListOf() }
    if (list.size >= 600) return
    list.add(mapOf("t" to t, "rssi" to result.rssi.toDouble()))
  }

  private fun finish(status: String, failed: Boolean = false) {
    val promise = pending ?: return
    pending = null
    handler.removeCallbacks(finishScan)
    scanCallback?.let {
      try {
        val context = context()
        if (context != null) adapterOf(context)?.bluetoothLeScanner?.stopScan(it)
      } catch (_: Exception) {}
    }
    scanCallback = null
    // A failed or interrupted scan is not "heard nothing": completed=false carries no evidence.
    val readings = if (failed) emptyList() else samples.map { (tag, list) -> mapOf("id" to tag, "samples" to list.toList()) }
    samples.clear()
    promise.resolve(mapOf("status" to status, "completed" to !failed, "readings" to readings))
  }

  private fun beginAdvertising(tag: String, power: String, promise: Promise) {
    try {
      val context = context()
      check(context != null) { "Android context unavailable." }
      check(tagPattern.matches(tag)) { "Beacon names use 1-12 letters or digits." }
      if (Build.VERSION.SDK_INT >= 31)
        check(granted(context, Manifest.permission.BLUETOOTH_ADVERTISE)) { "Nearby devices permission is required to act as a beacon." }
      val adapter = adapterOf(context)
      check(adapter != null && adapter.isEnabled) { "Turn on Bluetooth, then retry." }
      check(adapter.isMultipleAdvertisementSupported) { "This phone cannot advertise Bluetooth LE. Use another phone as a beacon." }
      endAdvertising()
      val le = adapter.bluetoothLeAdvertiser
      check(le != null) { "Bluetooth LE advertising is unavailable." }
      val level = when (power) {
        "low" -> AdvertiseSettings.ADVERTISE_TX_POWER_LOW
        "medium" -> AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM
        else -> AdvertiseSettings.ADVERTISE_TX_POWER_HIGH
      }
      val settings = AdvertiseSettings.Builder()
        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
        .setTxPowerLevel(level).setConnectable(false).setTimeout(0).build()
      val data = AdvertiseData.Builder().setIncludeDeviceName(false).setIncludeTxPowerLevel(false)
        .addManufacturerData(companyId, magic + byteArrayOf(version) + tag.toByteArray(Charsets.US_ASCII)).build()
      val callback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
          advertiser = le
          advertisedTag = tag
          appContext.currentActivity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
          promise.resolve(mapOf("advertising" to true, "tag" to tag))
        }
        override fun onStartFailure(errorCode: Int) {
          advertiseCallback = null
          promise.reject("ADVERTISE_FAILED", "Could not start beacon (code $errorCode).", null)
        }
      }
      advertiseCallback = callback
      le.startAdvertising(settings, data, callback)
    } catch (error: Exception) {
      promise.reject("ADVERTISE_FAILED", error.message ?: "Beacon unavailable.", null)
    }
  }

  private fun endAdvertising() {
    val callback = advertiseCallback
    val le = advertiser
    advertiseCallback = null
    advertiser = null
    advertisedTag = null
    if (callback != null) {
      try {
        val target = le ?: context()?.let { adapterOf(it)?.bluetoothLeAdvertiser }
        target?.stopAdvertising(callback)
      } catch (_: Exception) {}
    }
    appContext.currentActivity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }
}
