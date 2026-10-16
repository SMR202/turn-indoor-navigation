import CoreBluetooth
import ExpoModulesCore

/// Foreground scan for TURN beacons only (see ADR-0007). Android phones advertise manufacturer data
/// company 0xFFFF + "TURN" + version 1 + ASCII tag. iOS cannot filter by manufacturer data in the
/// controller, so every other advertisement is discarded here immediately and never stored or returned.
final class TurnBleScanner: NSObject, CBCentralManagerDelegate {
  private var central: CBCentralManager?
  private var completion: (([String: Any]) -> Void)?
  private var samples: [String: [[String: Double]]] = [:]
  private var startUptime: TimeInterval = 0
  private var durationSeconds: Double = 8
  private var finishItem: DispatchWorkItem?
  private var stateItem: DispatchWorkItem?
  private var scanning = false
  private let okStatus = "Fresh BLE scan"

  var isBusy: Bool { completion != nil }

  func begin(durationMs: Int, completion: @escaping ([String: Any]) -> Void) {
    guard durationMs >= 2000 && durationMs <= 30000 else {
      completion(["status": "Invalid BLE scan duration.", "completed": false, "readings": []])
      return
    }
    self.completion = completion
    durationSeconds = Double(durationMs) / 1000.0
    samples = [:]
    scanning = false
    // The system Bluetooth prompt appears here on first use; give the user time to answer it.
    let waiting = DispatchWorkItem { [weak self] in
      self?.finish("Bluetooth did not become ready. Check Bluetooth is on and allowed for TURN, then retry.", failed: true)
    }
    stateItem = waiting
    DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: waiting)
    central = CBCentralManager(delegate: self, queue: .main, options: [CBCentralManagerOptionShowPowerAlertKey: true])
  }

  func cancel(_ status: String) {
    finish(status, failed: true)
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    guard completion != nil, !scanning else { return }
    switch central.state {
    case .poweredOn:
      scanning = true
      stateItem?.cancel()
      startUptime = ProcessInfo.processInfo.systemUptime
      central.scanForPeripherals(
        withServices: nil,
        options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
      )
      let item = DispatchWorkItem { [weak self] in
        guard let self = self else { return }
        self.finish(self.okStatus, failed: false)
      }
      finishItem = item
      DispatchQueue.main.asyncAfter(deadline: .now() + durationSeconds, execute: item)
    case .unauthorized:
      finish("Allow Bluetooth for TURN in iPhone Settings, then retry.", failed: true)
    case .poweredOff:
      finish("Turn on Bluetooth, then retry.", failed: true)
    case .unsupported:
      finish("This device does not support Bluetooth LE.", failed: true)
    default:
      break // unknown/resetting: wait for the next update or the timeout
    }
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    guard scanning, let data = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data else { return }
    let rssi = RSSI.intValue
    if rssi == 127 || rssi > 20 || rssi < -127 { return } // 127 means unavailable
    let bytes = [UInt8](data)
    // company id (little endian 0xFFFF) + "TURN" + version 1 + tag(1...12)
    guard bytes.count >= 8, bytes.count <= 19,
      bytes[0] == 0xFF, bytes[1] == 0xFF,
      bytes[2] == 0x54, bytes[3] == 0x55, bytes[4] == 0x52, bytes[5] == 0x4E,
      bytes[6] == 1
    else { return }
    let tagBytes = Array(bytes[7...])
    let valid = tagBytes.allSatisfy { ($0 >= 0x30 && $0 <= 0x39) || ($0 >= 0x41 && $0 <= 0x5A) || ($0 >= 0x61 && $0 <= 0x7A) }
    guard valid, let tag = String(bytes: tagBytes, encoding: .ascii) else { return }
    let t = ProcessInfo.processInfo.systemUptime - startUptime
    if t < 0 || t > durationSeconds + 1 { return }
    if samples[tag] == nil && samples.count >= 32 { return }
    var list = samples[tag] ?? []
    if list.count >= 600 { return }
    list.append(["t": t, "rssi": Double(rssi)])
    samples[tag] = list
  }

  private func finish(_ status: String, failed: Bool) {
    guard let done = completion else { return }
    completion = nil
    finishItem?.cancel()
    stateItem?.cancel()
    finishItem = nil
    stateItem = nil
    if scanning { central?.stopScan() }
    scanning = false
    central?.delegate = nil
    central = nil
    // A failed or interrupted scan carries no evidence; it is never reported as "heard nothing".
    let readings: [[String: Any]] = failed ? [] : samples.map { ["id": $0.key, "samples": $0.value] }
    samples = [:]
    done(["status": status, "completed": !failed, "readings": readings])
  }
}

/// Continuous TURN-only stream for proximity detection (batches every 500 ms, bounded).
final class TurnBleStream: NSObject, CBCentralManagerDelegate {
  private var central: CBCentralManager?
  private var buffer: [[String: Any]] = []
  private var dropped = 0
  private var startUptime: TimeInterval = 0
  private var token: String?
  private var timer: Timer?
  private var emit: (([String: Any]) -> Void)?
  private var scanning = false

  var isActive: Bool { token != nil }

  func start(token: String, emit: @escaping ([String: Any]) -> Void) {
    stop()
    self.token = token
    self.emit = emit
    buffer = []
    dropped = 0
    scanning = false
    central = CBCentralManager(delegate: self, queue: .main, options: [CBCentralManagerOptionShowPowerAlertKey: true])
  }

  func stop() {
    timer?.invalidate()
    timer = nil
    if scanning { central?.stopScan() }
    scanning = false
    central?.delegate = nil
    central = nil
    token = nil
    emit = nil
    buffer = []
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    guard token != nil, !scanning else { return }
    switch central.state {
    case .poweredOn:
      scanning = true
      startUptime = ProcessInfo.processInfo.systemUptime
      central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
      timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.flush() }
    case .unauthorized:
      fail("Allow Bluetooth for TURN in iPhone Settings, then retry.")
    case .poweredOff:
      fail("Turn on Bluetooth, then retry.")
    case .unsupported:
      fail("This device does not support Bluetooth LE.")
    default:
      break
    }
  }

  private func fail(_ message: String) {
    let t = token
    let send = emit
    stop()
    if let t = t { send?(["token": t, "samples": [], "dropped": 0, "failure": message]) }
  }

  private func flush() {
    guard let t = token, !buffer.isEmpty || dropped > 0 else { return }
    emit?(["token": t, "samples": buffer, "dropped": dropped])
    buffer = []
    dropped = 0
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    guard scanning, let data = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data else { return }
    let rssi = RSSI.intValue
    if rssi == 127 || rssi > 20 || rssi < -127 { return }
    let bytes = [UInt8](data)
    guard bytes.count >= 8, bytes.count <= 19,
      bytes[0] == 0xFF, bytes[1] == 0xFF,
      bytes[2] == 0x54, bytes[3] == 0x55, bytes[4] == 0x52, bytes[5] == 0x4E,
      bytes[6] == 1
    else { return }
    let tagBytes = Array(bytes[7...])
    let valid = tagBytes.allSatisfy { ($0 >= 0x30 && $0 <= 0x39) || ($0 >= 0x41 && $0 <= 0x5A) || ($0 >= 0x61 && $0 <= 0x7A) }
    guard valid, let tag = String(bytes: tagBytes, encoding: .ascii) else { return }
    if buffer.count >= 2000 { dropped += 1; return }
    buffer.append(["t": ProcessInfo.processInfo.systemUptime - startUptime, "id": tag, "rssi": Double(rssi)])
  }
}

public final class TurnBleModule: Module {
  private let stream = TurnBleStream()
  private let scanner = TurnBleScanner()

  public func definition() -> ModuleDefinition {
    Name("TurnBle")

    Constant("revision") { "turn-ble-ios-2" }

    Events("onSamples")

    AsyncFunction("startStream") { (token: String, promise: Promise) in
      DispatchQueue.main.async {
        if token.count < 8 || token.count > 80 {
          promise.reject("STREAM_FAILED", "Invalid stream token.")
          return
        }
        self.stream.start(token: token) { payload in self.sendEvent("onSamples", payload) }
        promise.resolve(["token": token])
      }
    }

    Function("stopStream") {
      DispatchQueue.main.async { self.stream.stop() }
    }

    Function("capabilities") { () -> [String: Any] in
      let auth = CBCentralManager.authorization
      return [
        "sdk": 0,
        "bluetoothOn": auth != .denied && auth != .restricted,
        "canScan": true,
        "canAdvertise": false,
        "locationOn": true
      ]
    }

    AsyncFunction("scan") { (durationMs: Int, promise: Promise) in
      DispatchQueue.main.async {
        if self.scanner.isBusy {
          promise.reject("SCAN_BUSY", "A BLE scan is already running.")
          return
        }
        self.scanner.begin(durationMs: durationMs) { result in promise.resolve(result) }
      }
    }

    Function("cancelScan") {
      DispatchQueue.main.async { self.scanner.cancel("BLE scan cancelled.") }
    }

    OnAppEntersBackground {
      DispatchQueue.main.async { self.stream.stop() }
      DispatchQueue.main.async { self.scanner.cancel("BLE scan interrupted when the app left the foreground.") }
    }

    OnDestroy {
      DispatchQueue.main.async { self.stream.stop() }
      DispatchQueue.main.async { self.scanner.cancel("BLE scan stopped.") }
    }
  }
}
