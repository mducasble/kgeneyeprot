import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

export default function RegisterScreen() {
  const { register } = useAuth();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!username.trim() || !password.trim() || !confirmPassword.trim()) {
      setError("Please fill in all fields");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await register(username.trim(), password);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError(err.message || "Registration failed");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.content, { paddingTop: 20 }]}>
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: Colors.accent + "15" }]}>
            <Ionicons name="person-add" size={30} color={Colors.accent} />
          </View>
          <Text style={[styles.title, { color: c.text }]}>Create Account</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            Join the data collection community
          </Text>
        </View>

        {!!error && (
          <View style={[styles.errorBanner, { backgroundColor: c.error + "15" }]}>
            <Ionicons name="alert-circle" size={18} color={c.error} />
            <Text style={[styles.errorText, { color: c.error }]}>{error}</Text>
          </View>
        )}

        <View style={styles.form}>
          <View style={[styles.inputContainer, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name="person-outline" size={20} color={c.textTertiary} />
            <TextInput
              style={[styles.input, { color: c.text }]}
              placeholder="Username"
              placeholderTextColor={c.textTertiary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.inputContainer, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name="lock-closed-outline" size={20} color={c.textTertiary} />
            <TextInput
              style={[styles.input, { color: c.text }]}
              placeholder="Password"
              placeholderTextColor={c.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <View style={[styles.inputContainer, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name="lock-closed-outline" size={20} color={c.textTertiary} />
            <TextInput
              style={[styles.input, { color: c.text }]}
              placeholder="Confirm Password"
              placeholderTextColor={c.textTertiary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: Colors.primary, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Create Account</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24 },
  header: { alignItems: "center" as const, marginBottom: 32, marginTop: 20 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 16,
  },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" as const },
  errorBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  errorText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  form: { gap: 14 },
  inputContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 54,
    gap: 12,
  },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  primaryButton: {
    height: 54,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 8,
  },
  primaryButtonText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
