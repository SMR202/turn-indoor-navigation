Pod::Spec.new do |s|
  s.name           = 'TurnMotion'
  s.version        = '0.1.0'
  s.summary        = 'TURN local native modules (BLE and iBeacon scanning on iOS)'
  s.description    = 'Foreground-only scan for venue beacons (TURN, Eddystone, iBeacon via Core Location). No background mode, no unrelated devices stored.'
  s.license        = { :type => 'MIT' }
  s.author         = 'TURN'
  s.homepage       = 'https://github.com/SMR202/turn-indoor-navigation'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/SMR202/turn-indoor-navigation.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreBluetooth', 'CoreLocation'

  s.source_files = '**/*.{h,m,swift}'
end
