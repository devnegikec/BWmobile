import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './QsealCascadeScreen.styles';

interface IdleViewProps {
  onBack: () => void;
  onStartScan: () => void;
}

export default function IdleView({ onBack, onStartScan }: IdleViewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Link Parent & Child</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.idleContent}>
        <Text style={styles.idleIcon}>🔗</Text>
        <Text style={styles.idleTitle}>QSeal Cascade</Text>
        <Text style={styles.idleSubtitle}>
          Scan a parent QSeal first, then scan child QSeals.{'\n'}
          Each scan resolves the serial number against the backend.
        </Text>
        <TouchableOpacity style={styles.idleScanBtn} onPress={onStartScan}>
          <Text style={styles.idleScanBtnText}>Start Scanning</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
