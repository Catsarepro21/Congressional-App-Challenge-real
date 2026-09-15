Pod::Spec.new do |s|
  s.name = 'SafeScaleVision'
  s.version = '1.0.0'
  s.summary = 'Local SafeScale image classification and language generation'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'SafeScale'
  s.homepage = 'https://github.com/Catsarepro21/Congressional-App-Challenge-real'
  s.source = { :git => s.homepage }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'Foundation', 'HealthKit'
  s.weak_frameworks = 'FoundationModels'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
