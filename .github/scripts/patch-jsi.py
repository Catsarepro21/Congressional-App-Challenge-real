import glob
import re
import os

print("=== Starting Expo JSI patches ===")

# 1. Patch Package.swift files for JSI and other modules
for path in glob.glob('node_modules/**/Package.swift', recursive=True):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    modified = False
    if '// swift-tools-version: 6.2' in content:
        content = content.replace('// swift-tools-version: 6.2', '// swift-tools-version: 6.0')
        modified = True
        print(f'Patched Swift tools version to 6.0 in: {path}')
    if 'expo-modules-jsi' in path:
        # Remove trailing commas in function argument lists to satisfy 6.0 compiler
        content = content.replace('targets: ["ExpoModulesJSI"],\n    )', 'targets: ["ExpoModulesJSI"]\n    )')
        content = content.replace('targets: ["ExpoModulesJSI"],\r\n    )', 'targets: ["ExpoModulesJSI"]\r\n    )')
        content = re.sub(r'(\s+\]),\r?\n(\s+)\),', r'\1\n\2),', content)
        content = content.replace('dependencies: testFrameworks.dependencies,\n    )', 'dependencies: testFrameworks.dependencies\n    )')
        content = content.replace('dependencies: testFrameworks.dependencies,\r\n    )', 'dependencies: testFrameworks.dependencies\r\n    )')
        content = content.replace('swiftLanguageModes: [.v6],', 'swiftLanguageModes: [.v5],')
        # Remove Swift 6.2 upcoming features incompatible with Xcode 16.2 (Swift 6.0)
        content = content.replace('.enableUpcomingFeature("NonisolatedNonsendingByDefault"),', '')
        content = content.replace('.enableUpcomingFeature("InferIsolatedConformances"),', '')
        # Add NonescapableTypes experimental feature flag
        target_flags = '"-enable-library-evolution",'
        replacement_flags = '"-enable-library-evolution",\n          "-enable-experimental-feature", "NonescapableTypes",'
        if target_flags in content and 'NonescapableTypes' not in content:
            content = content.replace(target_flags, replacement_flags)
        modified = True
        print('Applied Package.swift patches for JSI')
    if modified:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

# 2. Patch 'weak let' to 'weak var' in JSI Swift files
for path in glob.glob('node_modules/expo-modules-jsi/**/*.swift', recursive=True):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    modified = False
    if 'weak let' in content:
        content = content.replace('weak let', 'weak var')
        modified = True
        print(f'Patched weak let in: {path}')
    if modified:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

# 4. Patch JavaScriptRuntime.swift
js_runtime_path = 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntime.swift'
try:
    with open(js_runtime_path, 'r', encoding='utf-8') as f:
        content = f.read()
    modified = False
    # Regex literal error
    if '/^[a-zA-Z_$][a-zA-Z0-9_$]*$/' in content:
        content = content.replace('/^[a-zA-Z_$][a-zA-Z0-9_$]*$/', 'try! Regex("^[a-zA-Z_$][a-zA-Z0-9_$]*$")')
        modified = True
        print('Patched Regex literal in JavaScriptRuntime.swift')
    # Trailing comma error
    old_comma = '_ arguments: consuming JavaScriptValuesBuffer,'
    new_comma = '_ arguments: consuming JavaScriptValuesBuffer'
    if old_comma in content:
        content = content.replace(old_comma, new_comma)
        modified = True
        print('Patched trailing comma in JavaScriptRuntime.swift')
    if modified:
        with open(js_runtime_path, 'w', encoding='utf-8') as f:
            f.write(content)
except FileNotFoundError:
    print('JavaScriptRuntime.swift not found')

# 6. Patch JavaScriptError.swift
js_error_path = 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptError.swift'
try:
    with open(js_error_path, 'r', encoding='utf-8') as f:
        content = f.read()
    modified = False
    old_line = '  public var message: String {'
    new_line = '  var message: String {'
    if 'extension expo.CppError: Error' in content and old_line in content:
        content = content.replace(old_line, new_line)
        modified = True
        print('Patched public var message to var message in JavaScriptError.swift')
    if modified:
        with open(js_error_path, 'w', encoding='utf-8') as f:
            f.write(content)
except FileNotFoundError:
    print('JavaScriptError.swift not found')

# 7. Patch Task+immediate.swift
task_immediate_path = 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Extensions/Task+immediate.swift'
try:
    with open(task_immediate_path, 'w', encoding='utf-8') as f:
        f.write('''extension Task where Failure == any Error {
  @discardableResult
  public static func immediate_polyfill(
    name: String? = nil,
    priority: TaskPriority? = nil,
    @_inheritActorContext @_implicitSelfCapture operation: sending @escaping @isolated(any) () async throws -> Success
  ) -> Task<Success, any Error> {
    return Task(priority: priority, operation: operation)
  }
}
''')
    print('Patched Task+immediate.swift with a Swift 6.0 compatible polyfill')
except FileNotFoundError:
    print('Task+immediate.swift not found')

print("=== Expo JSI patches finished ===")
