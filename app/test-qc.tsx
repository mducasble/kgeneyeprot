import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

interface PickedVideo {
  uri: string;
  durationMs: number;
  fileSize: number;
  orientation: "portrait" | "landscape";
  name: string;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={infoStyles.value}>{value}</Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 13, fontFamily: "Inter_400Regular" },
  value: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")} (${s}s)`;
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function TestQCScreen() {
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<PickedVideo | null>(null);
  const [picking, setPicking] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const handlePickVideo = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPicking(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setPicking(false);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets?.[0]) {
        setPicking(false);
        return;
      }

      const asset = result.assets[0];
      const durationMs = (asset.duration ?? 0) > 0 ? (asset.duration ?? 30000) : 30000;
      const fileSize =
        (asset as any).fileSize > 0
          ? (asset as any).fileSize
          : Math.round((durationMs / 1000) * 2.5 * 1024 * 1024);
      const orientation: "portrait" | "landscape" =
        (asset.width ?? 0) > (asset.height ?? 0) ? "landscape" : "portrait";
      const name = (asset as any).fileName || asset.uri.split("/").pop() || "video.mp4";

      setPicked({ uri: asset.uri, durationMs, fileSize, orientation, name });
    } finally {
      setPicking(false);
    }
  };

  const handleSimulate = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const durationMs = (Math.floor(Math.random() * 90) + 15) * 1000;
    const fileSize = Math.round((durationMs / 1000) * 2 * 1024 * 1024);
    setPicked({
      uri: "file://simulated_test.mp4",
      durationMs,
      fileSize,
      orientation: "portrait",
      name: "simulated_test.mp4",
    });
  };

  const handleRunQC = () => {
    if (!picked) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);

    router.push({
      pathname: "/review",
      params: {
        recordingId: id,
        durationMs: String(picked.durationMs),
        fileSize: String(picked.fileSize),
        orientation: picked.orientation,
        questId: "qc-test",
        questTitle: "QC Test Upload",
      },
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.8)" />
        </Pressable>
        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle}>QC Test Tool</Text>
          <View style={styles.devBadge}>
            <Text style={styles.devBadgeText}>DEV ONLY</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.descCard}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.accent} />
          <Text style={styles.descText}>
            Escolha um vídeo da galeria para submetê-lo à mesma pipeline de QC usada após uma gravação
            no app. O relatório gerado é idêntico ao fluxo normal.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Escolher Vídeo</Text>

          <Pressable
            style={({ pressed }) => [styles.pickBtn, { opacity: pressed ? 0.85 : 1 }]}
            onPress={handlePickVideo}
            disabled={picking}
          >
            <Ionicons name="folder-open-outline" size={22} color="#fff" />
            <Text style={styles.pickBtnText}>
              {picking ? "Abrindo galeria…" : picked ? "Escolher outro vídeo" : "Escolher da galeria"}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.simulateBtn, { opacity: pressed ? 0.85 : 1 }]}
            onPress={handleSimulate}
          >
            <Ionicons name="flash-outline" size={18} color={Colors.accent} />
            <Text style={styles.simulateBtnText}>Simular vídeo aleatório</Text>
          </Pressable>
        </View>

        {picked && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Vídeo Selecionado</Text>
            <View style={styles.infoCard}>
              <View style={styles.fileHeader}>
                <View style={styles.fileIcon}>
                  <Ionicons name="videocam" size={24} color={Colors.primary} />
                </View>
                <Text style={styles.fileName} numberOfLines={2}>{picked.name}</Text>
              </View>
              <View style={styles.infoRows}>
                <InfoRow label="Duração" value={formatDuration(picked.durationMs)} />
                <InfoRow label="Tamanho" value={formatSize(picked.fileSize)} />
                <InfoRow
                  label="Orientação"
                  value={picked.orientation === "portrait" ? "Retrato" : "Paisagem"}
                />
                <InfoRow
                  label="Mínimo QC"
                  value={picked.durationMs >= 5000 ? "Atende (≥5s)" : "Abaixo do mínimo (<5s)"}
                />
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.runBtn,
                { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              onPress={handleRunQC}
            >
              <Ionicons name="shield-checkmark-outline" size={22} color="#fff" />
              <Text style={styles.runBtnText}>Executar Análise de QC</Text>
              <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>
        )}

        <View style={styles.noticeCard}>
          <Ionicons name="warning-outline" size={16} color="#F59E0B" />
          <Text style={styles.noticeText}>
            Esta tela é uma ferramenta temporária de desenvolvimento e deve ser removida antes do
            lançamento.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0E1A" },
  topBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  topBarCenter: { alignItems: "center" as const, gap: 4 },
  topBarTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  devBadge: {
    backgroundColor: "#F59E0B22",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#F59E0B55",
  },
  devBadgeText: { color: "#F59E0B", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },
  descCard: {
    flexDirection: "row" as const,
    gap: 12,
    backgroundColor: Colors.accent + "10",
    borderWidth: 1,
    borderColor: Colors.accent + "30",
    borderRadius: 14,
    padding: 14,
    alignItems: "flex-start" as const,
  },
  descText: {
    flex: 1,
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  section: { gap: 10 },
  sectionTitle: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    marginBottom: 2,
  },
  pickBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  pickBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  simulateBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: Colors.accent + "15",
    borderWidth: 1,
    borderColor: Colors.accent + "30",
    paddingVertical: 11,
    borderRadius: 14,
  },
  simulateBtnText: { color: Colors.accent, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  infoCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  fileHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary + "15",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  fileName: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  infoRows: { gap: 0 },
  runBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    gap: 8,
  },
  runBtnText: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  noticeCard: {
    flexDirection: "row" as const,
    gap: 10,
    backgroundColor: "#F59E0B10",
    borderWidth: 1,
    borderColor: "#F59E0B30",
    borderRadius: 12,
    padding: 12,
    alignItems: "flex-start" as const,
    marginTop: 4,
  },
  noticeText: {
    flex: 1,
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
});
