import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './AssignBinScreen.styles';

interface IdleViewProps {
  onStartScan: () => void;
}

export default function IdleView({ onStartScan }: IdleViewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Assign Bin</Text>
        <Text style={styles.headerSubtitle}>Scan bin & items to map stock to a location</Text>
      </View>

      <View style={styles.idleContent}>
        <TouchableOpacity style={styles.scanButton} onPress={onStartScan}>
          <Text style={styles.scanButtonText}>Scan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
