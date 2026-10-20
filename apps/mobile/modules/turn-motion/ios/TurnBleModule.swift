import CoreBluetooth
import CoreLocation
import ExpoModulesCore

/// One advertisement as TURN understands it: the most specific tag, alternative tags and, for the
/// setup screen, a description of the frame.
struct TurnSeen {
  let id: String
  let alt: [String]
  let info: [String: Any]
}

/// "NM" + the last ten letters/digits of an advertised name (beacons that only differ by name).
func turnNameTag(_ name: String?) -> String? {
  guard let name = name else { return nil }
  let clean = name.unicodeScalars.filter { $0.isASCII && CharacterSet.alphanumerics.contains($0) }
  guard !clean.isEmpty else { return nil }
  return "NM" + String(String(clean).suffix(10))
}

/// TURN phone beacons (manufacturer data company 0xFFFF + "TURN" + version 1 + ASCII tag) and
/// Eddystone-UID (service 0xFEAA, frame 0x00; the 6-byte instance becomes a 12-hex-digit tag).
/// iBeacon frames never reach CoreBluetooth; they are ranged with Core Location instead. With
/// `discover` (the setup screen only) named devices are reported too; TURN never stores them.
func turnBeaconIdentity(_ advertisementData: [String: Any], name peripheralName: String?, discover: Bool) -> TurnSeen? {
  let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? peripheralName
  let named = turnNameTag(name)
  var withName: [String: Any] = [:]
  if let name = name { withName["name"] = name }
  if let data = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
    let bytes = [UInt8](data)
    // company id (little endian 0xFFFF) + "TURN" + version 1 + tag(1...12)
    if bytes.count >= 8, bytes.count <= 19,
      bytes[0] == 0xFF, bytes[1] == 0xFF,
      bytes[2] == 0x54, bytes[3] == 0x55, bytes[4] == 0x52, bytes[5] == 0x4E,
      bytes[6] == 1
    {
      let tagBytes = Array(bytes[7...])
      let valid = tagBytes.allSatisfy { ($0 >= 0x30 && $0 <= 0x39) || ($0 >= 0x41 && $0 <= 0x5A) || ($0 >= 0x61 && $0 <= 0x7A) }
      if valid, let tag = String(bytes: tagBytes, encoding: .ascii) {
        return TurnSeen(id: tag, alt: [], info: ["kind": "turn"])
      }
    }
  }
  if let services = advertisementData[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data],
    let uid = services[CBUUID(string: "FEAA")]
  {
    let bytes = [UInt8](uid)
    if bytes.count >= 18, bytes[0] == 0x00 {
      let tag = bytes[12..<18].map { String(format: "%02X", $0) }.joined()
      let namespace = bytes[2..<12].map { String(format: "%02X", $0) }.joined()
      var info: [String: Any] = ["kind": "eddystone", "namespace": namespace, "tx": Int(Int8(bitPattern: bytes[1]))]
      info.merge(withName) { a, _ in a }
      return TurnSeen(id: tag, alt: named.map { [$0] } ?? [], info: info)
    }
  }
  guard discover, let id = named else { return nil }
  var info: [String: Any] = ["kind": "other"]
  info.merge(withName) { a, _ in a }
  return TurnSeen(id: id, alt: [], info: info)
}

/// Kept for one-shot scans (fingerprints): TURN and Eddystone-UID tags only.
func turnBeaconTag(_ advertisementData: [String: Any]) -> String? {
  turnBeaconIdentity(advertisementData, name: nil, discover: false)?.id
}

/// Foreground scan for TURN beacons only (see ADR-0007). iOS cannot filter by manufacturer data in
/// the controller, so every other advertisement is discarded here and never stored or returned.
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
    guard scanning, let tag = turnBeaconTag(advertisementData) else { return }
    let rssi = RSSI.intValue
    if rssi == 127 || rssi > 20 || rssi < -127 { return } // 127 means unavailable
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

/// iBeacon ranging through Core Location (the only way iOS exposes iBeacon). Needs "While Using"
/// location permission; about one reading per beacon per second.
final class TurnIBeaconRanger: NSObject, CLLocationManagerDelegate {
  private var manager: CLLocationManager?
  private var constraints: [CLBeaconIdentityConstraint] = []
  private var ranging = false
  var onBeacons: (([CLBeacon]) -> Void)?
  var onNotice: ((String) -> Void)?

  func start(uuids: [UUID]) {
    stop()
    guard !uuids.isEmpty else { return }
    guard CLLocationManager.isRangingAvailable() else {
      onNotice?("This iPhone cannot range iBeacons.")
      return
    }
    let manager = CLLocationManager()
    manager.delegate = self
    self.manager = manager
    constraints = uuids.map { CLBeaconIdentityConstraint(uuid: $0) }
    authorizationChanged(manager)
  }

  private func authorizationChanged(_ manager: CLLocationManager) {
    switch manager.authorizationStatus {
    case .notDetermined:
      manager.requestWhenInUseAuthorization()
    case .authorizedWhenInUse, .authorizedAlways:
      guard !ranging else { return }
      ranging = true
      for c in constraints { manager.startRangingBeacons(satisfying: c) }
    default:
      onNotice?("Allow Location (While Using) for TURN in iPhone Settings to hear iBeacons such as April beacons.")
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    guard manager === self.manager else { return }
    authorizationChanged(manager)
  }

  func locationManager(_ manager: CLLocationManager, didRange beacons: [CLBeacon], satisfying constraint: CLBeaconIdentityConstraint) {
    onBeacons?(beacons)
  }

  func locationManager(_ manager: CLLocationManager, didFailRangingFor constraint: CLBeaconIdentityConstraint, error: Error) {
    onNotice?("iBeacon ranging failed: \(error.localizedDescription)")
  }

  func stop() {
    if let manager = manager {
      if ranging { for c in constraints { manager.stopRangingBeacons(satisfying: c) } }
      manager.delegate = nil
    }
    manager = nil
    constraints = []
    ranging = false
  }
}

/// Continuous beacon stream (batches every 500 ms, bounded): CoreBluetooth for TURN and
/// Eddystone frames (and named devices in discovery), Core Location for iBeacon.
final class TurnBleStream: NSObject, CBCentralManagerDelegate {
  private var central: CBCentralManager?
  private let ranger = TurnIBeaconRanger()
  private var buffer: [[String: Any]] = []
  private var dropped = 0
  private var notices: [String] = []
  private var startUptime: TimeInterval = 0
  private var token: String?
  private var timer: Timer?
  private var emit: (([String: Any]) -> Void)?
  private var scanning = false
  private var discover = false

  var isActive: Bool { token != nil }

  func start(token: String, discover: Bool, uuids: [UUID], emit: @escaping ([String: Any]) -> Void) {
    stop()
    self.token = token
    self.emit = emit
    self.discover = discover
    buffer = []
    dropped = 0
    notices = []
    scanning = false
    startUptime = ProcessInfo.processInfo.systemUptime
    timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.flush() }
    ranger.onBeacons = { [weak self] beacons in self?.ranged(beacons) }
    ranger.onNotice = { [weak self] message in
      guard let self = self, !self.notices.contains(message) else { return }
      self.notices.append(message)
    }
    ranger.start(uuids: uuids)
    central = CBCentralManager(delegate: self, queue: .main, options: [CBCentralManagerOptionShowPowerAlertKey: true])
  }

  func stop() {
    timer?.invalidate()
    timer = nil
    ranger.stop()
    ranger.onBeacons = nil
    ranger.onNotice = nil
    if scanning { central?.stopScan() }
    scanning = false
    central?.delegate = nil
    central = nil
    token = nil
    emit = nil
    buffer = []
    notices = []
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    guard token != nil, !scanning else { return }
    switch central.state {
    case .poweredOn:
      scanning = true
      central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
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
    guard let t = token, !buffer.isEmpty || dropped > 0 || !notices.isEmpty else { return }
    var payload: [String: Any] = ["token": t, "samples": buffer, "dropped": dropped]
    if !notices.isEmpty { payload["notices"] = notices }
    emit?(payload)
    buffer = []
    dropped = 0
    notices = []
  }

  private func append(_ sample: [String: Any]) {
    if buffer.count >= 2000 { dropped += 1; return }
    buffer.append(sample)
  }

  private func ranged(_ beacons: [CLBeacon]) {
    guard token != nil else { return }
    let t = ProcessInfo.processInfo.systemUptime - startUptime
    // Beacons sharing one identity cannot be told apart on iOS; say how many share it.
    var shared: [String: Int] = [:]
    for b in beacons { shared["\(b.uuid)|\(b.major)|\(b.minor)", default: 0] += 1 }
    var index: [String: Int] = [:]
    for b in beacons {
      let rssi = b.rssi
      if rssi == 0 || rssi > 20 || rssi < -127 { continue } // 0 means not measured in this second
      let major = b.major.intValue, minor = b.minor.intValue
      let identity = "\(b.uuid)|\(b.major)|\(b.minor)"
      let n = index[identity, default: 0]
      index[identity] = n + 1
      var sample: [String: Any] = [
        "t": t, "id": String(format: "IB%04X%04X", UInt32(major), UInt32(minor)), "rssi": Double(rssi),
      ]
      if discover {
        sample["key"] = "ib:\(identity)|\(n)"
        sample["info"] = [
          "kind": "ibeacon", "uuid": b.uuid.uuidString, "major": major, "minor": minor,
          "shared": shared[identity] ?? 1, "accuracy": b.accuracy,
        ]
      }
      append(sample)
    }
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    guard scanning, let seen = turnBeaconIdentity(advertisementData, name: peripheral.name, discover: discover) else { return }
    let rssi = RSSI.intValue
    if rssi == 127 || rssi > 20 || rssi < -127 { return }
    var sample: [String: Any] = [
      "t": ProcessInfo.processInfo.systemUptime - startUptime, "id": seen.id, "rssi": Double(rssi),
    ]
    if !seen.alt.isEmpty { sample["alt"] = seen.alt }
    if discover {
      sample["info"] = seen.info
      sample["key"] = peripheral.identifier.uuidString
    }
    append(sample)
  }
}

public final class TurnBleModule: Module {
  private let stream = TurnBleStream()
  private let scanner = TurnBleScanner()

  public func definition() -> ModuleDefinition {
    Name("TurnBle")

    Constant("revision") { "turn-ble-ios-3" }

    Events("onSamples")

    AsyncFunction("startStream") { (token: String, promise: Promise) in
      DispatchQueue.main.async {
        if token.count < 8 || token.count > 80 {
          promise.reject("STREAM_FAILED", "Invalid stream token.")
          return
        }
        self.stream.start(token: token, discover: false, uuids: []) { payload in self.sendEvent("onSamples", payload) }
        promise.resolve(["token": token])
      }
    }

    AsyncFunction("startStreamWith") { (token: String, discover: Bool, uuids: [String], promise: Promise) in
      DispatchQueue.main.async {
        if token.count < 8 || token.count > 80 {
          promise.reject("STREAM_FAILED", "Invalid stream token.")
          return
        }
        let parsed = uuids.prefix(20).compactMap { UUID(uuidString: $0) }
        self.stream.start(token: token, discover: discover, uuids: parsed) { payload in self.sendEvent("onSamples", payload) }
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
