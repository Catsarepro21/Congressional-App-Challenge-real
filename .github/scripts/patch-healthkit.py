import os
import re

file_path = 'node_modules/react-native-health/RCTAppleHealthKit/RCTAppleHealthKit.m'

if not os.path.exists(file_path):
    print(f"Error: {file_path} does not exist.")
    exit(1)

with open(file_path, 'r') as f:
    content = f.read()

# Target code to replace:
target_code = """- (void)emitEventInternal:(NSNotification *)notification {
  if (self.hasListeners) {
    self.callableJSModules = [RCTAppleHealthKit sharedJsModule];
    [self.callableJSModules setBridge:self.bridge];
    [self sendEventWithName:notification.name
                   body:notification.userInfo];
  }
}"""

# Replacement code (without setBridge):
replacement_code = """- (void)emitEventInternal:(NSNotification *)notification {
  if (self.hasListeners) {
    [self sendEventWithName:notification.name
                   body:notification.userInfo];
  }
}"""

if target_code in content:
    content = content.replace(target_code, replacement_code)
    print("SUCCESS: Patched emitEventInternal in RCTAppleHealthKit.m")
else:
    # Try a looser replacement if whitespace differs
    pattern = r'-\s*\(void\)\s*emitEventInternal\s*:\s*\(NSNotification\s*\*\s*\)\s*notification\s*\{\s*if\s*\(\s*self\.hasListeners\s*\)\s*\{\s*self\.callableJSModules\s*=\s*\[RCTAppleHealthKit\s+sharedJsModule\]\s*;\s*\[self\.callableJSModules\s+setBridge\s*:\s*self\.bridge\]\s*;\s*\[self\s+sendEventWithName\s*:\s*notification\.name\s+body\s*:\s*notification\.userInfo\]\s*;\s*\}\s*\}'
    if re.search(pattern, content):
        content = re.sub(pattern, replacement_code, content)
        print("SUCCESS: Patched emitEventInternal using regex in RCTAppleHealthKit.m")
    else:
        # Force replacement of just the setBridge line inside emitEventInternal
        old_lines = '[self.callableJSModules setBridge:self.bridge];'
        if old_lines in content:
            content = content.replace('    self.callableJSModules = [RCTAppleHealthKit sharedJsModule];\n', '')
            content = content.replace('    [self.callableJSModules setBridge:self.bridge];\n', '')
            print("SUCCESS: Removed setBridge lines directly in RCTAppleHealthKit.m")
        else:
            print("WARNING: Could not find emitEventInternal target in RCTAppleHealthKit.m")

with open(file_path, 'w') as f:
    f.write(content)

print("Patching complete.")
