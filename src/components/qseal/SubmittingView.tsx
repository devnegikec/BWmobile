import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { styles } from './QsealCascadeScreen.styles';

interface SubmittingViewProps {
  parentSerial: string | null;
  childCount: number;
}

export default function SubmittingView({ parentSerial, childCount }: SubmittingViewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.idleContent}>
        <ActivityIndicator size="large" color="#1A73E8" />
        <Text style={styles.submittingText}>Linking QSeals...</Text>
        <Text style={styles.submittingDetail}>
          {parentSerial} ← {childCount} child serial(s)
        </Text>
      </View>
    </View>
  );
}
