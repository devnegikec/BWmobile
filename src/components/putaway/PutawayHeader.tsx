import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './PutawayScreen.styles';

interface PutawayHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}

export default function PutawayHeader({ title, subtitle, onBack }: PutawayHeaderProps) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.headerSpacer} />
      )}
      <View style={styles.headerTitleWrap}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}
