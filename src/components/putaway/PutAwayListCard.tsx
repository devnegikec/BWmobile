import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './PutawayScreen.styles';
import type { PutAwayList } from '@/types';

interface PutAwayListCardProps {
  item: PutAwayList;
  onPress: () => void;
}

export default function PutAwayListCard({ item, onPress }: PutAwayListCardProps) {
  const completed = item.completed_items ?? 0;
  const total = item.total_items ?? item.items?.length ?? 0;
  const progress = total > 0 ? completed / total : 0;

  return (
    <TouchableOpacity
      style={[styles.listCard, item.status === 'completed' && styles.listCardCompleted]}
      onPress={onPress}
    >
      <View style={styles.listCardHeader}>
        <Text style={styles.listNo}>{item.put_away_list_no}</Text>
        <View
          style={[
            styles.listStatus,
            item.status === 'completed' ? styles.listStatusDone : styles.listStatusPending,
          ]}
        >
          <Text
            style={[
              styles.listStatusText,
              item.status === 'completed'
                ? styles.listStatusTextDone
                : styles.listStatusTextPending,
            ]}
          >
            {item.status}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View
          style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
        />
      </View>

      <Text style={styles.listDetail}>
        {completed}/{total} items completed
      </Text>
    </TouchableOpacity>
  );
}
