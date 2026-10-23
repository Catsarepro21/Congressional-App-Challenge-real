import React, {useState} from 'react';
import {Text, View, TextInput} from 'react-native';
import {unlockWebVault, useWebVaultStatus} from '../../services/SecureHealthStorage';
import {Button, s, C} from './UI';

export default function WebVaultUnlock() {
  const creating = useWebVaultStatus(state => state.creating);
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function unlock() {
    if (creating && passphrase !== confirmation) {setError('The passphrases do not match.'); return;}
    setBusy(true); setError('');
    try {await unlockWebVault(passphrase); setPassphrase(''); setConfirmation('');}
    catch (err) {setError(err instanceof Error ? err.message : 'The vault could not be opened.');}
    finally {setBusy(false);}
  }
  return <View style={{flex:1,justifyContent:'center',backgroundColor:C.bg,padding:24}}>
    <View style={{width:'100%',maxWidth:480,alignSelf:'center',gap:16}}>
      <Text style={s.heading}>{creating ? 'Protect your browser records' : 'Unlock your health records'}</Text>
      <Text style={s.body}>Browser records are encrypted with your passphrase. It stays in memory for this tab and is never saved or sent. Close the tab to lock the vault.</Text>
      {creating && <Text style={s.body}>Use at least 12 characters and keep the passphrase safe. There is no password recovery. Existing browser records will be encrypted after you continue.</Text>}
      <TextInput accessibilityLabel="Vault passphrase" placeholder="Passphrase" value={passphrase} onChangeText={setPassphrase} secureTextEntry autoCapitalize="none" autoCorrect={false} style={s.input} editable={!busy} />
      {creating && <TextInput accessibilityLabel="Confirm vault passphrase" placeholder="Confirm passphrase" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false} style={s.input} editable={!busy} />}
      {error ? <Text accessibilityRole="alert" style={s.body}>{error}</Text> : null}
      <Button label={busy ? 'Opening…' : creating ? 'Create encrypted vault' : 'Unlock vault'} onPress={unlock} disabled={busy || !passphrase || (creating && passphrase.length < 12)} />
    </View>
  </View>;
}
