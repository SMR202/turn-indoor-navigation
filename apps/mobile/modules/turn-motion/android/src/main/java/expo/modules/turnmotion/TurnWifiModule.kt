package expo.modules.turnmotion

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest

/** One user-requested fresh scan. No SSIDs, cached results or background polling. */
class TurnWifiModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private var pending: Promise? = null
  private var receiver: BroadcastReceiver? = null
  private var scanContext: Context? = null
  private val timeout = Runnable { finish("Wi-Fi scan timed out. Android may limit scans; wait two minutes and retry.", emptyList()) }

  override fun definition() = ModuleDefinition {
    Name("TurnWifi")
    Constant("revision") { "turn-wifi-1" }
    AsyncFunction("scan") { salt: String, promise: Promise ->
      handler.post { begin(salt, promise) }
    }
    Function("cancel") { handler.post { finish("Wi-Fi scan cancelled.", emptyList()) }; Unit }
    OnActivityEntersBackground { handler.post { finish("Wi-Fi scan interrupted when the app left the foreground.", emptyList()) } }
    OnDestroy { handler.post { finish("Wi-Fi scan stopped.", emptyList()) } }
  }

  @Suppress("DEPRECATION")
  private fun begin(salt: String, promise: Promise) {
    if (pending != null) { promise.reject("SCAN_BUSY", "A Wi-Fi scan is already running.", null); return }
    val context = appContext.reactContext?.applicationContext
    if (context == null) { promise.reject("NO_CONTEXT", "Android context unavailable.", null); return }
    pending = promise
    scanContext = context
    try {
      check(salt.length in 8..160) { "Invalid survey profile." }
      check(context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) { "Precise location permission is required for Wi-Fi fingerprinting." }
      val location = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      check(location.isLocationEnabled) { "Turn on phone Location services to scan Wi-Fi." }
      val wifi = context.getSystemService(Context.WIFI_SERVICE) as WifiManager
      check(wifi.isWifiEnabled) { "Turn on Wi-Fi, then retry." }
      val started = SystemClock.elapsedRealtimeNanos() / 1000L
      val listener = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, intent: Intent?) {
          if (intent?.action != WifiManager.SCAN_RESULTS_AVAILABLE_ACTION) return
          if (!intent.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED, false)) {
            finish("No new Wi-Fi scan. Android may be throttling; wait two minutes and retry.", emptyList()); return
          }
          try {
            val now = SystemClock.elapsedRealtimeNanos() / 1000L
            val readings = wifi.scanResults.filter { it.timestamp >= started && now - it.timestamp in 0L..10_000_000L && !it.BSSID.isNullOrEmpty() }
              .distinctBy { it.BSSID }.sortedByDescending { it.level }.take(100).map {
                val digest = MessageDigest.getInstance("SHA-256").digest((salt + ":" + it.BSSID.lowercase()).toByteArray())
                mapOf("id" to digest.joinToString("") { b -> "%02x".format(b.toInt() and 255) },
                  "rssi" to it.level, "frequencyMHz" to it.frequency, "ageSeconds" to (now - it.timestamp) / 1_000_000.0)
              }
            finish(if (readings.isEmpty()) "No fresh Wi-Fi readings available." else "Fresh Wi-Fi scan", readings)
          } catch (error: Exception) { finish(error.message ?: "Wi-Fi scan failed.", emptyList()) }
        }
      }
      receiver = listener
      if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(listener, IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION), Context.RECEIVER_EXPORTED)
      else context.registerReceiver(listener, IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION))
      handler.postDelayed(timeout, 15000)
      if (!wifi.startScan()) finish("Android declined a new Wi-Fi scan. Wait two minutes and retry; magnetic capture still works.", emptyList())
    } catch (error: Exception) { finish(error.message ?: "Wi-Fi unavailable.", emptyList()) }
  }

  private fun finish(status: String, readings: List<Map<String, Any>>) {
    val promise = pending ?: return
    pending = null
    handler.removeCallbacks(timeout)
    receiver?.let { try { scanContext?.unregisterReceiver(it) } catch (_: Exception) {} }
    receiver = null
    scanContext = null
    promise.resolve(mapOf("status" to status, "readings" to readings))
  }
}
