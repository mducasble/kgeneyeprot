import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

export default function ReviewScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: Colors.dark.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Review Recording</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.content}>
        <Ionicons name="videocam-outline" size={48} color={Colors.dark.textTertiary} />
        <Text style={styles.text}>Recording saved successfully</Text>
        <Text style={styles.subtext}>Check the Uploads tab to manage your recording</Text>
        <Pressable
          style={({ pressed }) => [
            styles.doneBtn,
            { backgroundColor: Colors.primary, opacity: pressed ? 0.9 : 1 },
          ]}
          onPress={() => router.dismissAll()}
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  title: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 12,
    paddingHorizontal: 40,
  },
  text: { color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" as const },
  subtext: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center" as const,
  },
  doneBtn: {
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 16,
  },
  doneBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
