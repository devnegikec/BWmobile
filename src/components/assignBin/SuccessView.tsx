import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './AssignBinScreen.styles';

interface SuccessViewProps {
  itemCount: number;
  binCode: string;
  fullPath: string;
  onNewSession: () => void;
}

export default function SuccessView({ itemCount, binCode, fullPath, onNewSession }: SuccessViewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.centeredContent}>
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.centeredTitle}>Assignment Complete!</Text>
        <View style={styles.successCard}>
          <Text style={styles.successDetail}>
            {itemCount} item(s)
          </Text>
          <Text style={styles.successDetail}>
            → Bin: {binCode}
          </Text>
          {fullPath !== binCode && (
            <Text style={styles.successPath}>{fullPath}</Text>
          )}
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={onNewSession}>
          <Text style={styles.primaryButtonText}>New Session</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
