import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  Platform,
  Dimensions,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Link, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

const { width } = Dimensions.get("window");
const CARD_PADDING = 22;

export default function LoginScreen() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const logoOpacity = useSharedValue(0);
  const logoY = useSharedValue(-20);
  const cardOpacity = useSharedValue(0);
  const cardY = useSharedValue(40);
  const orbScale = useSharedValue(0.85);

  useEffect(() => {
    orbScale.value = withTiming(1, { duration: 2000, easing: Easing.out(Easing.quad) });
    logoOpacity.value = withDelay(200, withTiming(1, { duration: 600 }));
    logoY.value = withDelay(200, withSpring(0, { damping: 18, stiffness: 120 }));
    cardOpacity.value = withDelay(450, withTiming(1, { duration: 500 }));
    cardY.value = withDelay(450, withSpring(0, { damping: 20, stiffness: 130 }));
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ translateY: logoY.value }],
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardY.value }],
  }));

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbScale.value }],
  }));

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

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.root}>
      <LinearGradient
        colors={["#03060F", "#060D1A", "#030609"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[StyleSheet.absoluteFill, orbStyle, { pointerEvents: "none" }]}>
        <View style={[styles.orbLayer, styles.orb1a]} />
        <View style={[styles.orbLayer, styles.orb1b]} />
        <View style={[styles.orbLayer, styles.orb1c]} />
        <View style={[styles.orbLayer, styles.orb2a]} />
        <View style={[styles.orbLayer, styles.orb2b]} />
        <View style={[styles.orbLayer, styles.orb3a]} />
        <View style={[styles.orbLayer, styles.orb3b]} />
      </Animated.View>

      <View style={[styles.logoSection, { paddingTop: topPad + 32 }]}>
        <Animated.View style={[styles.logoWrap, logoStyle]}>
          <View style={styles.logoGlow} />
          <Image
            source={require("@/assets/images/kgen-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
      </View>

      <Animated.View style={[styles.cardWrapper, cardStyle, { paddingBottom: botPad + 20 }]}>
        <View style={styles.cardBorder}>
          <BlurView intensity={60} tint="dark" style={styles.blurContainer}>
            <View style={styles.cardInner}>

              {!!error && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={15} color="#F87171" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <View style={[
                styles.inputWrap,
                usernameFocused && styles.inputFocused,
              ]}>
                <Ionicons
                  name="person-outline"
                  size={17}
                  color={usernameFocused ? Colors.primary : "rgba(255,255,255,0.35)"}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Username"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setUsernameFocused(true)}
                  onBlur={() => setUsernameFocused(false)}
                />
              </View>

              <View style={[
                styles.inputWrap,
                passwordFocused && styles.inputFocused,
              ]}>
                <Ionicons
                  name="lock-closed-outline"
                  size={17}
                  color={passwordFocused ? Colors.primary : "rgba(255,255,255,0.35)"}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={17}
                    color="rgba(255,255,255,0.35)"
                  />
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.btn,
                  { transform: [{ scale: pressed ? 0.975 : 1 }], opacity: pressed ? 0.9 : 1 },
                ]}
                onPress={handleLogin}
                disabled={loading}
              >
                <LinearGradient
                  colors={["#00D4AA", "#00A882"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.btnGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="rgba(0,0,0,0.7)" size="small" />
                  ) : (
                    <Text style={styles.btnText}>Sign In</Text>
                  )}
                </LinearGradient>
              </Pressable>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.footer}>
                <Text style={styles.footerLabel}>Don't have an account?</Text>
                <Link href="/(auth)/register" asChild>
                  <Pressable>
                    <Text style={styles.footerLink}>Sign Up</Text>
                  </Pressable>
                </Link>
              </View>

            </View>
          </BlurView>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#03060F",
  },

  orbLayer: {
    position: "absolute",
    borderRadius: 9999,
  },

  orb1a: {
    width: 380,
    height: 380,
    top: -140,
    left: -120,
    backgroundColor: "rgba(0,212,170,0.09)",
  },
  orb1b: {
    width: 260,
    height: 260,
    top: -80,
    left: -60,
    backgroundColor: "rgba(0,212,170,0.07)",
  },
  orb1c: {
    width: 160,
    height: 160,
    top: -20,
    left: -10,
    backgroundColor: "rgba(0,212,170,0.05)",
  },
  orb2a: {
    width: 320,
    height: 320,
    top: 80,
    right: -120,
    backgroundColor: "rgba(129,140,248,0.08)",
  },
  orb2b: {
    width: 200,
    height: 200,
    top: 140,
    right: -60,
    backgroundColor: "rgba(129,140,248,0.06)",
  },
  orb3a: {
    width: 300,
    height: 300,
    bottom: 60,
    left: width / 2 - 150,
    backgroundColor: "rgba(0,168,130,0.07)",
  },
  orb3b: {
    width: 180,
    height: 180,
    bottom: 110,
    left: width / 2 - 90,
    backgroundColor: "rgba(0,168,130,0.05)",
  },

  logoSection: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  logoWrap: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  logoGlow: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(0,212,170,0.18)",
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 18,
  },

  cardWrapper: {
    paddingHorizontal: 18,
  },
  cardBorder: {
    borderRadius: 26,
    padding: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  blurContainer: {
    borderRadius: 25,
    overflow: "hidden",
  },
  cardInner: {
    paddingHorizontal: CARD_PADDING,
    paddingTop: CARD_PADDING,
    paddingBottom: CARD_PADDING - 4,
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.035)",
  },

  errorBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "rgba(248,113,113,0.10)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.20)",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: "#F87171",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },

  inputWrap: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
    gap: 12,
  },
  inputFocused: {
    borderColor: "rgba(0,212,170,0.45)",
    backgroundColor: "rgba(0,212,170,0.05)",
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#F1F5F9",
  },

  btn: {
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 2,
    shadowColor: "#00D4AA",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  btnGradient: {
    height: 52,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  btnText: {
    color: "#02150F",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },

  divider: {
    alignItems: "center" as const,
    paddingVertical: 2,
  },
  dividerLine: {
    width: "30%",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
  },

  footer: {
    flexDirection: "row" as const,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingBottom: 4,
  },
  footerLabel: {
    color: "rgba(255,255,255,0.38)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  footerLink: {
    color: Colors.primary,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
