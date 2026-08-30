import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { styles } from './AssignBinScreen.styles';

interface SubmittingViewProps {
  itemCount: number;
  binCode?: string;
}

export default function SubmittingView({ itemCount, binCode }: SubmittingViewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.centeredContent}>
        <ActivityIndicator size="large" color="#1A73E8" />
        <Text style={styles.centeredTitle}>Assigning items to bin...</Text>
        <Text style={styles.centeredSubtitle}>
          {itemCount} item(s) → {binCode}
        </Text>
      </View>
    </View>
  );
}
