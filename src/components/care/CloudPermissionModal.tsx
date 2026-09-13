/**
 * @file src/components/care/CloudPermissionModal.tsx
 * @description Interactive modal dialog that prompts the user for explicit authorization
 * whenever an external cloud API call is attempted.
 *
 * Enforces per-request authorization: never caches permission, always asks before sending data.
 */

import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  useCloudPermissionStore,
  CloudPermissionGuard,
} from '../../services/CloudPermissionGuard';
import { C, s } from './UI';

export default function CloudPermissionModal() {
  const currentRequest = useCloudPermissionStore(s => s.currentRequest);

  if (!currentRequest) return null;

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={CloudPermissionGuard.denyCurrentRequest}
    >
      <View style={localStyles.backdrop}>
        <View style={localStyles.container}>
          {/* Header Icon */}
          <View style={localStyles.headerIconCircle}>
            <MaterialCommunityIcons name="shield-alert-outline" size={32} color={C.amber} />
          </View>

          {/* Title */}
          <Text style={localStyles.title}>Cloud API Authorization</Text>
          <Text style={localStyles.subtitle}>
            An action is requesting permission to send data to an external cloud server.
          </Text>

          {/* Details Card */}
          <View style={localStyles.detailsCard}>
            <View style={localStyles.detailRow}>
              <Text style={localStyles.detailLabel}>Purpose:</Text>
              <Text style={localStyles.detailValue}>{currentRequest.purpose}</Text>
            </View>

            <View style={localStyles.detailRow}>
              <Text style={localStyles.detailLabel}>Destination:</Text>
              <Text style={localStyles.detailValue}>{currentRequest.endpoint}</Text>
            </View>

            <View style={localStyles.detailRow}>
              <Text style={localStyles.detailLabel}>Data to Send:</Text>
              <Text style={localStyles.detailValue}>{currentRequest.dataPayloadSummary}</Text>
            </View>

            {currentRequest.sensitiveFields && currentRequest.sensitiveFields.length > 0 && (
              <View style={localStyles.detailRow}>
                <Text style={localStyles.detailLabel}>Includes:</Text>
                <Text style={[localStyles.detailValue, { color: C.amber }]}>
                  {currentRequest.sensitiveFields.join(', ')}
                </Text>
              </View>
            )}
          </View>

          {/* Privacy Notice */}
          <View style={localStyles.privacyNotice}>
            <MaterialCommunityIcons name="lock-outline" size={16} color={C.green} />
            <Text style={localStyles.privacyNoticeText}>
              Your health data is 100% private and on-device by default. If denied, the app will continue using offline models only.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={{ gap: 10, width: '100%', marginTop: 8 }}>
            {/* Safe Primary Choice: Deny & Stay Local */}
            <Pressable
              onPress={CloudPermissionGuard.denyCurrentRequest}
              style={({ pressed }) => [
                localStyles.denyButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <MaterialCommunityIcons name="shield-check" size={18} color={C.white} />
              <Text style={localStyles.denyButtonText}>Deny & Keep 100% Local</Text>
            </Pressable>

            {/* Explicit Cloud Send Choice */}
            <Pressable
              onPress={CloudPermissionGuard.approveCurrentRequest}
              style={({ pressed }) => [
                localStyles.allowButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <MaterialCommunityIcons name="cloud-upload-outline" size={18} color={C.ink} />
              <Text style={localStyles.allowButtonText}>Allow This Single Request</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 47, 50, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: C.white,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  headerIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  detailsCard: {
    width: '100%',
    backgroundColor: C.bg,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
    minWidth: 80,
  },
  detailValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: C.ink,
    textAlign: 'right',
  },
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.pale,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    width: '100%',
  },
  privacyNoticeText: {
    flex: 1,
    fontSize: 11,
    color: C.green,
    fontWeight: '600',
    lineHeight: 16,
  },
  denyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.green,
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
  },
  denyButtonText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '700',
  },
  allowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingVertical: 12,
    gap: 8,
  },
  allowButtonText: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '600',
  },
});
