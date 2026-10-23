/**
 * @file src/utils/mealPhotoPicker.ts
 * @description User-prompted meal photo capture / library selector with explicit permission handling.
 */

import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {Platform} from 'react-native';
import {inlineLocalPhoto, removePhotoCacheCopy} from '../services/LocalPhotoStorage';

async function selectPhoto(uri: string, onSelected: (uri: string) => void, base64?: string | null) {
  if (Platform.OS === 'web') {
    if (!base64 || base64.length > 14_000_000) throw new Error('Choose a local image smaller than 10 MB.');
    onSelected('data:image/jpeg;base64,' + base64); return;
  }
  const photo = await inlineLocalPhoto(uri);
  onSelected(photo.uri);
  try {await removePhotoCacheCopy(photo.temporaryFile);} catch { /* The OS may retain its temporary cache copy. */ }
}

/**
 * Prompts the user with a modal dialog to choose between taking a new photo
 * with the camera or choosing an existing photo from the photo library.
 *
 * Requests appropriate system permissions on-demand and reports friendly
 * error alerts if permissions are denied.
 */
export function promptMealPhoto(onPhotoSelected: (uri: string) => void): void {
  Alert.alert(
    'Add Meal Photo',
    'Take a photo of your meal or choose one from your photo library.',
    [
      {
        text: '📷 Take Photo',
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              Alert.alert(
                'Camera Access Required',
                'Enable Camera access for SafeScale Health in Settings to snap meal photos.',
                [{text:'Cancel',style:'cancel'}, {text:'Open Settings',onPress:() => {void Linking.openSettings();}}],
              );
              return;
            }
            // The native chooser must finish dismissing before another controller is presented.
            if (Platform.OS === 'ios') await new Promise(resolve => setTimeout(resolve,350));
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.7,
              base64: Platform.OS === 'web',
            });
            if (!result.canceled && result.assets?.[0]?.uri) {
              await selectPhoto(result.assets[0].uri, onPhotoSelected, result.assets[0].base64);
            }
          } catch (err: any) {
            Alert.alert('Camera Error', err?.message || 'Could not launch camera.');
          }
        },
      },
      {
        text: '🖼️ Choose from Library',
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
              Alert.alert(
                'Photos Access Required',
                'Enable Photos access for SafeScale Health in Settings to select an attachment.',
                [{text:'Cancel',style:'cancel'}, {text:'Open Settings',onPress:() => {void Linking.openSettings();}}],
              );
              return;
            }
            if (Platform.OS === 'ios') await new Promise(resolve => setTimeout(resolve,350));
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.7,
              base64: Platform.OS === 'web',
            });
            if (!result.canceled && result.assets?.[0]?.uri) {
              await selectPhoto(result.assets[0].uri, onPhotoSelected, result.assets[0].base64);
            }
          } catch (err: any) {
            Alert.alert('Photo Library Error', err?.message || 'Could not open photo library.');
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ],
  );
}
