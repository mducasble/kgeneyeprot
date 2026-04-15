Pod::Spec.new do |s|
  s.name           = 'ExpoKgenAdvancedCapture'
  s.version        = '1.0.0'
  s.summary        = 'Native iOS advanced capture module for KGeN Data Collector'
  s.description    = 'Provides ARKit-based head pose tracking, camera calibration capture, and scene depth recording for egocentric data collection.'
  s.homepage       = 'https://github.com/kgen/data-collector'
  s.license        = { type: 'MIT' }
  s.author         = 'KGeN'
  s.source         = { git: '' }
  s.platform       = :ios, '15.0'
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.source_files   = 'ios/**/*.swift'
  s.frameworks     = 'ARKit', 'SceneKit', 'AVFoundation', 'CoreMotion'
end
