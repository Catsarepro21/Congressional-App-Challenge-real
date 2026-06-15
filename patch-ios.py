import glob
import re
import os

print("=== Starting iOS Build Patch Script ===")

# 1. Find and patch all Package.swift files to use Swift 6.0 and remove upcoming features
for package_swift in glob.glob('node_modules/**/Package.swift', recursive=True):
    try:
        with open(package_swift, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Downgrade Swift tools version from 6.2.0 to 6.0.0
        content = re.sub(r'\.swift\("6\.2\.0"\)', '.swift("6.0.0")', content)
        content = re.sub(r'swift-tools-version:6\.2\.0', 'swift-tools-version:6.0.0', content)
        content = re.sub(r'swift-tools-version:\s*6\.2\.0', 'swift-tools-version: 6.0.0', content)
        content = re.sub(r'swift-tools-version:\s*6\.2', 'swift-tools-version: 6.0', content)
        
        # Remove all Swift upcoming feature flags along with their trailing commas and formatting safely
        content = re.sub(r'\s*\.enableUpcomingFeature\((?:"[^"]+"|\'[^\']+\')\),?\s*\n', '\n', content)
        
        # Remove trailing commas in argument lists before closing parentheses (invalid in Swift 6.0)
        content = re.sub(r',\s*\n\s*\)', lambda m: m.group(0).replace(',', '', 1), content)
        
        with open(package_swift, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Patched Swift version, features & commas in: {package_swift}')
    except Exception as e:
        print(f'Error patching {package_swift}: {e}')

# 2. Patch Package.swift in expo-modules-jsi (correct path is under apple/)
path = 'node_modules/expo-modules-jsi/apple/Package.swift'
try:
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        target_flags = '"-enable-library-evolution",'
        replacement_flags = '"-enable-library-evolution",\n          "-enable-experimental-feature", "NonescapableTypes",'
        if target_flags in content and 'NonescapableTypes' not in content:
            content = content.replace(target_flags, replacement_flags)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('Package.swift flags patched')
except Exception as e:
    print(f'Error Package.swift: {e}')

# 3. Patch 'weak let' to 'weak var' in JSI Swift files
for p in glob.glob('node_modules/expo-modules-jsi/**/*.swift', recursive=True):
    try:
        with open(p, 'r', encoding='utf-8') as f:
            content = f.read()
        if 'weak let' in content:
            content = content.replace('weak let', 'nonisolated(unsafe) weak var')
            with open(p, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f'Patched: {p}')
    except Exception as e:
        print(f'Error {p}: {e}')

# 4. Patch C++ Header files to add inline factories for Swift 6.0 compatibility
def patch_header(p_path, search_term, factory_code):
    try:
        if os.path.exists(p_path):
            with open(p_path, 'r', encoding='utf-8') as f:
                content = f.read()
            if search_term in content and factory_code not in content:
                content = content.replace(search_term, factory_code + '\n' + search_term)
                with open(p_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"Patched C++ header: {p_path}")
    except Exception as e:
        print(f"Error {p_path}: {e}")

patch_header(
    'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI-Cxx/include/RuntimeScheduler.h',
    '} // namespace expo',
    'inline RuntimeScheduler* _Nonnull createRuntimeScheduler(void * _Nullable scheduler, RuntimeScheduler::ScheduleFn _Nonnull fn) noexcept {\n  return new RuntimeScheduler(scheduler, fn);\n}\ninline RuntimeScheduler* _Nonnull createDefaultRuntimeScheduler() noexcept {\n  return new RuntimeScheduler();\n}'
)

patch_header(
    'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI-Cxx/include/NativeState.h',
    '} // namespace expo',
    'inline NativeState* _Nonnull createNativeState(void * _Nonnull context, void (* _Nonnull deallocator)(void * _Nonnull)) noexcept {\n  return new NativeState(context, deallocator);\n}'
)

patch_header(
    'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI-Cxx/include/HostFunctionClosure.h',
    '} // namespace expo',
    'inline HostFunctionClosure* _Nonnull createHostFunctionClosure(void * _Nonnull context, HostFunctionClosure::Closure* _Nonnull closure, void (* _Nonnull deallocator)(void * _Nonnull)) noexcept {\n  return new HostFunctionClosure(context, closure, deallocator);\n}'
)

# 5. Patch JavaScriptRuntime.swift
js_runtime_path = 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntime.swift'
try:
    if os.path.exists(js_runtime_path):
        with open(js_runtime_path, 'r', encoding='utf-8') as f:
            content = f.read()
        content = content.replace('/^[a-zA-Z_$][a-zA-Z0-9_$]*$/', 'try! Regex("^[a-zA-Z_$][a-zA-Z0-9_$]*$")')
        content = content.replace('_ arguments: consuming JavaScriptValuesBuffer,', '_ arguments: consuming JavaScriptValuesBuffer')
        content = content.replace('expo.RuntimeScheduler()', 'expo.createDefaultRuntimeScheduler()')
        content = content.replace('expo.RuntimeScheduler(scheduler, fn)', 'expo.createRuntimeScheduler(scheduler, fn)')
        content = content.replace('expo.HostFunctionClosure(context, call, deallocate)', 'expo.createHostFunctionClosure(context, call, deallocate)')
        content = content.replace('vector.push_back(consuming: propNameId)', 'vector.push_back(consume propNameId)')
        with open(js_runtime_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('JavaScriptRuntime.swift patched')
except Exception as e:
    print(f'Error JavaScriptRuntime.swift: {e}')

# 6. Patch JavaScriptNativeState.swift
js_native_state_path = 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptNativeState.swift'
try:
    if os.path.exists(js_native_state_path):
        with open(js_native_state_path, 'r', encoding='utf-8') as f:
            content = f.read()
        content = content.replace('expo.NativeState(ptr, deallocate)', 'expo.createNativeState(ptr, deallocate)')
        with open(js_native_state_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('JavaScriptNativeState.swift patched')
except Exception as e:
    print(f'Error JavaScriptNativeState.swift: {e}')

# 7. Patch JavaScriptError.swift
js_error_path = 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptError.swift'
try:
    if os.path.exists(js_error_path):
        with open(js_error_path, 'r', encoding='utf-8') as f:
            content = f.read()
        content = content.replace('  public var message: String {', '  var message: String {')
        with open(js_error_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('JavaScriptError.swift patched')
except Exception as e:
    print(f'Error JavaScriptError.swift: {e}')

# 8. Patch Task+immediate.swift
task_immediate_path = 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Extensions/Task+immediate.swift'
try:
    if os.path.exists(task_immediate_path):
        with open(task_immediate_path, 'w', encoding='utf-8') as f:
            f.write('extension Task where Failure == any Error {\n  @discardableResult\n  public static func immediate_polyfill(\n    name: String? = nil,\n    priority: TaskPriority? = nil,\n    @_inheritActorContext @_implicitSelfCapture operation: sending @escaping @isolated(any) () async throws -> Success\n  ) -> Task<Success, any Error> {\n    return Task(priority: priority, operation: operation)\n  }\n}\n')
        print('Task+immediate.swift patched')
except Exception as e:
    print(f'Error Task+immediate.swift: {e}')

# 9. Xcode build-xcframework.sh script patching (signing and quiet removal)
build_xcf_script = "node_modules/expo-modules-jsi/apple/scripts/build-xcframework.sh"
try:
    if os.path.exists(build_xcf_script):
        with open(build_xcf_script, 'r', encoding='utf-8') as f:
            content = f.read()
        content = re.sub(r'[ \t]*-quiet[ \t]*\\?\r?\n', '', content)
        signing_flags = (
            'CODE_SIGNING_ALLOWED=NO \\\n'
            '    CODE_SIGNING_REQUIRED=NO \\\n'
            '    CODE_SIGN_IDENTITY="" \\\n'
            '    EXPANDED_CODE_SIGN_IDENTITY="" \\\n'
            '    SWIFT_VERSION=6.0 \\\n'
        )
        content = re.sub(r'(xcodebuild[^\n]*\\\n)', r'\1    ' + signing_flags, content)
        with open(build_xcf_script, 'w', encoding='utf-8') as f:
            f.write(content)
        print("build-xcframework.sh patched")
except Exception as e:
    print(f"Error build-xcframework.sh: {e}")

print("=== Patching complete! ===")
