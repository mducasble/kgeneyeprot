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

  # DIAGNOSTIC: Only compile the module file to isolate registration issue.
  # Other Swift files are temporarily excluded to test if they interfere.
  # To restore: change back to 'ios/**/*.swift'
  s.source_files   = 'ios/ExpoKgenAdvancedCaptureModule.swift'
end
