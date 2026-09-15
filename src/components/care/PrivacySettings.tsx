import React, {useState} from 'react';
import {Alert, Platform, Share, Text, TextInput, View} from 'react-native';
import {deleteLocalHealthData, useSafeScaleStore} from '../../store/useSafeScaleStore';
import {Button, Card, Heading, Sheet, s} from './UI';

import {privacyExport} from '../../utils/privacyExport';

export default function PrivacySettings() {
  const hasKey = useSafeScaleStore(state => !!state.profile.geminiApiKey);
  const demo = useSafeScaleStore(state => state.isTestMode);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  const save = () => {
    if (!key.trim()) {setMessage('Enter your Gemini API key first.'); return;}
    useSafeScaleStore.getState().updateProfile({geminiApiKey:key.trim()});
    setKey(''); setMessage(Platform.OS === 'web' ? 'Key set for this browser session only.' : 'Key updated. Check for any storage error before closing the app.');
  };
  const exportData = async () => {
    try {
      const store = useSafeScaleStore.getState();
      const saved = useSafeScaleStore.persist.getOptions().partialize?.(store);
      const text = privacyExport(saved);
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([text], {type:'application/json'}));
        const link = document.createElement('a');link.href=url;link.download='safescale-health-export.json';link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else await Share.share({message:text,title:'SafeScale health export'});
    } catch { Alert.alert('Export failed', 'Your records are unchanged. Please try again.'); }
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
    <Heading title="Your local data" detail="Export contains private health records without API keys or account tokens. Attached photos/files are not copied. Protect the exported copy." />
    <Button label="Export health records" secondary disabled={demo} onPress={exportData} />
    <Button label="Delete local data…" secondary disabled={demo} onPress={() => {setConfirmation('');setDeleting(true);}} />
    {deleting && <Sheet title="Delete local data" onClose={() => setDeleting(false)}>
      <Text style={s.body}>This permanently deletes SafeScale's saved records, profile, credentials, active workout, chat, and app reminders on this device. It cannot be undone. Export anything you want to keep first.</Text>
      <Text style={s.body}>Apple Health, Google accounts, your photo library, attached files, and previously exported copies are not deleted. Revoke health/account permissions in those services separately.</Text>
      <TextInput accessibilityLabel="Type DELETE to confirm" placeholder="Type DELETE to confirm" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" style={s.input} />
      <Button label="Permanently delete local data" disabled={confirmation !== 'DELETE'} onPress={async () => {
        try { await deleteLocalHealthData(); }
        catch {Alert.alert('Deletion could not finish','Check device storage and notification permissions, then retry.');}
      }} />
    </Sheet>}

  </Card>;
}
