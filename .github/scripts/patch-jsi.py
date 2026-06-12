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
        content = content.replace('weak let', 'nonisolated(unsafe) weak var')
        modified = True
        print(f'Patched weak let to nonisolated(unsafe) weak var in: {path}')
    if modified:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

# 3. Patch C++ Header files to add inline factories for Swift 6.0 compatibility
def patch_header(path, search_term, factory_code):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        if search_term in content and factory_code not in content:
            content = content.replace(search_term, factory_code + '\n' + search_term)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Patched C++ header: {path}")
    except Exception as e:
        print(f"Error patching header {path}: {e}")

patch_header(
    'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI-Cxx/include/RuntimeScheduler.h',
    '} // namespace expo',
    '''inline RuntimeScheduler* _Nonnull createRuntimeScheduler(void * _Nullable scheduler, RuntimeScheduler::ScheduleFn _Nonnull fn) noexcept {
  return new RuntimeScheduler(scheduler, fn);
}
inline RuntimeScheduler* _Nonnull createDefaultRuntimeScheduler() noexcept {
  return new RuntimeScheduler();
}'''
)

patch_header(
    'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI-Cxx/include/NativeState.h',
    '} // namespace expo',
    '''inline NativeState* _Nonnull createNativeState(void * _Nonnull context, void (* _Nonnull deallocator)(void * _Nonnull)) noexcept {
  return new NativeState(context, deallocator);
}'''
)

patch_header(
    'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI-Cxx/include/HostFunctionClosure.h',
    '} // namespace expo',
    '''inline HostFunctionClosure* _Nonnull createHostFunctionClosure(void * _Nonnull context, HostFunctionClosure::Closure* _Nonnull closure, void (* _Nonnull deallocator)(void * _Nonnull)) noexcept {
  return new HostFunctionClosure(context, closure, deallocator);
}'''
)

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
    # Constructors to factories
    if 'expo.RuntimeScheduler()' in content:
        content = content.replace('expo.RuntimeScheduler()', 'expo.createDefaultRuntimeScheduler()')
        modified = True
        print('Patched RuntimeScheduler() constructor call')
    if 'expo.RuntimeScheduler(scheduler, fn)' in content:
        content = content.replace('expo.RuntimeScheduler(scheduler, fn)', 'expo.createRuntimeScheduler(scheduler, fn)')
        modified = True
        print('Patched RuntimeScheduler(...) constructor call')
    if 'expo.HostFunctionClosure(context, call, deallocate)' in content:
        content = content.replace('expo.HostFunctionClosure(context, call, deallocate)', 'expo.createHostFunctionClosure(context, call, deallocate)')
        modified = True
        print('Patched HostFunctionClosure constructor call')
    if 'vector.push_back(consuming: propNameId)' in content:
        content = content.replace('vector.push_back(consuming: propNameId)', 'vector.push_back(consume propNameId)')
        modified = True
        print('Patched vector.push_back label to consume')
    if modified:
        with open(js_runtime_path, 'w', encoding='utf-8') as f:
            f.write(content)
except FileNotFoundError:
    print('JavaScriptRuntime.swift not found')

# 5. Patch JavaScriptNativeState.swift
js_native_state_path = 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptNativeState.swift'
try:
    with open(js_native_state_path, 'r', encoding='utf-8') as f:
        content = f.read()
    modified = False
    if 'expo.NativeState(ptr, deallocate)' in content:
        content = content.replace('expo.NativeState(ptr, deallocate)', 'expo.createNativeState(ptr, deallocate)')
        modified = True
        print('Patched NativeState(...) constructor call')
    if modified:
        with open(js_native_state_path, 'w', encoding='utf-8') as f:
            f.write(content)
except FileNotFoundError:
    print('JavaScriptNativeState.swift not found')

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
