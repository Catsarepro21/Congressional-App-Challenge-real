import React, {useEffect, useState} from 'react';
import {AppState, Platform, Text, View} from 'react-native';

/** Cover sensitive UI without unmounting camera pickers, permission flows or OAuth callbacks. */
export default function AppPrivacyCover() {
  const [covered, setCovered] = useState(Platform.OS !== 'web' && AppState.currentState !== 'active');
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', state => setCovered(state !== 'active'));
    return () => subscription.remove();
  }, []);
  if (!covered) return null;
  return <View accessibilityViewIsModal style={{position:'absolute',top:0,right:0,bottom:0,left:0,zIndex:99999,justifyContent:'center',alignItems:'center',backgroundColor:'#F5F6F1'}}><Text>SafeScale Health</Text></View>;
}
