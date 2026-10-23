import React, {useState} from 'react';
import {Alert, Platform, Share, Text, TextInput, View} from 'react-native';
import {deleteLocalHealthData, useSafeScaleStore} from '../../store/useSafeScaleStore';
import {Button, Card, Heading, Sheet, s} from './UI';

import {privacyExport} from '../../utils/privacyExport';

export default function PrivacySettings() {
  const demo = useSafeScaleStore(state => state.isTestMode);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
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
    <Heading title="Privacy & local processing" detail="Cloud AI and external service requests are disabled in this build." />
    <Text style={s.body}>{Platform.OS === 'web'
      ? 'Saved browser records are encrypted with your vault passphrase. The passphrase and key are not saved; close this tab to lock the vault.'
      : 'Saved records are encrypted on this device. The encryption key is kept in device secure storage. Apple Health permissions are managed separately by iOS.'}</Text>
    <Heading title="Your local data" detail="Export is an unencrypted copy of your health records without API keys or account tokens. Photos/files are not copied. Sharing or downloading is your choice and leaves this vault; protect the exported copy." />
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
