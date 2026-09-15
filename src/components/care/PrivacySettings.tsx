import React, {useState} from 'react';
import {Platform, Text, TextInput, View} from 'react-native';
import {useSafeScaleStore} from '../../store/useSafeScaleStore';
import {Button, Card, Heading, s} from './UI';

export default function PrivacySettings() {
  const hasKey = useSafeScaleStore(state => !!state.profile.geminiApiKey);
  const demo = useSafeScaleStore(state => state.isTestMode);
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  const save = () => {
    if (!key.trim()) {setMessage('Enter your Gemini API key first.'); return;}
    useSafeScaleStore.getState().updateProfile({geminiApiKey:key.trim()});
    setKey(''); setMessage(Platform.OS === 'web' ? 'Key set for this browser session only.' : 'Key updated. Check for any storage error before closing the app.');
  };
  return <Card>
    <Heading title="Cloud AI & privacy" detail="Cloud requests require your approval before sending data to Google." />
    <Text style={s.body}>{Platform.OS === 'web'
      ? 'The web preview stores health entries in browser storage. API keys are kept only in this running session; use the native app for encrypted storage.'
      : 'Saved health data and credentials are encrypted on this device. The encryption key is kept in device secure storage and cannot transfer to another device through backup.'}</Text>
    <Text style={s.label}>{hasKey ? 'A Gemini key is configured' : 'No Gemini key configured'}</Text>
    <TextInput accessibilityLabel="Gemini API key" placeholder="Enter your own Gemini API key" secureTextEntry autoCapitalize="none" autoCorrect={false}
      value={key} onChangeText={setKey} editable={!demo} style={[s.input, {minHeight:48}]} />
    <View style={s.row}>
      <Button label="Save key" onPress={save} disabled={demo || !key.trim()} />
      <Button label="Remove key" secondary disabled={demo || !hasKey} onPress={() => {
        useSafeScaleStore.getState().updateProfile({geminiApiKey:''});setKey('');setMessage('Key removed from this profile.');
      }} />
    </View>
    {message ? <Text accessibilityLiveRegion="polite" style={s.body}>{message}</Text> : null}
  </Card>;
}
