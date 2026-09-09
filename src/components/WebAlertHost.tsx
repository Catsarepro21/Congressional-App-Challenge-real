import React, { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, Text, View, type AlertButton } from 'react-native';

/** React Native Web's Alert is a no-op; retain confirmations and error messages. */
export default function WebAlertHost() {
  const [queue, setQueue] = useState<Array<{ title: string; message?: string; buttons: AlertButton[] }>>([]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const original = Alert.alert;
    Alert.alert = (title, message, buttons) => {
      setQueue(items => [...items, { title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] }]);
    };
    return () => { Alert.alert = original; };
  }, []);
  const current = queue[0];
  if (Platform.OS !== 'web' || !current) return null;
  return <Modal transparent visible animationType="fade">
    <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 440, backgroundColor: 'white', borderRadius: 16, padding: 24 }}>
        <Text accessibilityRole="header" style={{ fontWeight: '700', fontSize: 20 }}>{current.title}</Text>
        <Text style={{ marginVertical: 16, lineHeight: 22 }}>{current.message}</Text>
        <View style={{ gap: 8 }}>
          {current.buttons.map((button, index) => <Pressable key={index} accessibilityRole="button" onPress={() => {
            setQueue(items => items.slice(1));
            button.onPress?.();
          }} style={{ padding: 12, borderRadius: 8, backgroundColor: button.style === 'destructive' ? '#FDE8E8' : '#E4F3EC' }}>
            <Text style={{ fontWeight: '600', textAlign: 'center' }}>{button.text || 'OK'}</Text>
          </Pressable>)}
        </View>
      </View>
    </View>
  </Modal>;
}
