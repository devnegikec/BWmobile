import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './QsealCascadeScreen.styles';

interface SuccessViewProps {
  mappedCount: number;
  childCount: number;
  parentSerial: string | null;
  onNewSession: () => void;
  onDone: () => void;
}

export default function SuccessView({
  mappedCount,
  childCount,
  parentSerial,
  onNewSession,
  onDone,
}: SuccessViewProps) {
  const isAlreadyMapped = mappedCount === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cascade Complete</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.idleContent}>
        <Text style={styles.successIcon}>{isAlreadyMapped ? 'ℹ️' : '✅'}</Text>
        <Text style={styles.successTitle}>
          {isAlreadyMapped ? 'Already Mapped' : 'Linked Successfully'}
        </Text>
        <Text style={styles.successMessage}>
          {isAlreadyMapped
            ? `All ${childCount} child QSeal(s) are already linked to parent ${parentSerial || ''}. No new links were created.`
            : `${mappedCount} child QSeal(s) linked to parent ${parentSerial || ''}.`}
        </Text>

        <TouchableOpacity style={styles.idleScanBtn} onPress={onNewSession}>
          <Text style={styles.idleScanBtnText}>New Cascade</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.idleScanBtn, styles.doneBtn]}
          onPress={onDone}
        >
          <Text style={styles.idleScanBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
