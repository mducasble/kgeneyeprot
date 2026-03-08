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
import { Link, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

export default function LoginScreen() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismissAll();
    } catch (err: any) {
      setError(err.message || "Login failed");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.content, { paddingTop: insets.top + 20 }]}>
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: Colors.primary + "15" }]}>
            <Ionicons name="shield-checkmark" size={32} color={Colors.primary} />
          </View>
          <Text style={[styles.title, { color: c.text }]}>Welcome Back</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            Sign in to continue collecting data
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
              secureTextEntry={!showPassword}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={c.textTertiary}
              />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: Colors.primary, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Sign In</Text>
            )}
          </Pressable>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={[styles.footerText, { color: c.textSecondary }]}>
          Don't have an account?
        </Text>
        <Link href="/(auth)/register" asChild>
          <Pressable>
            <Text style={[styles.link, { color: Colors.primary }]}>Sign Up</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24 },
  header: { alignItems: "center" as const, marginBottom: 32, marginTop: 40 },
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
  footer: {
    flexDirection: "row" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 16,
  },
  footerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  link: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
