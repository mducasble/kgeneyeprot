import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";

type Variant = "quests" | "uploads" | "recordings" | "account" | "default";

const orbConfigs: Record<Variant, Array<{ top?: number; bottom?: number; left?: number; right?: number; width: number; height: number; color: string; opacity: number }>> = {
  quests: [
    { top: -80, right: -60, width: 380, height: 380, color: Colors.primary, opacity: 0.16 },
    { bottom: 120, left: -120, width: 360, height: 360, color: "#7C3AED", opacity: 0.13 },
    { top: 280, right: -80, width: 240, height: 240, color: "#3B82F6", opacity: 0.09 },
    { top: 60, left: -40, width: 160, height: 160, color: "#F59E0B", opacity: 0.06 },
  ],
  uploads: [
    { top: -60, left: -80, width: 340, height: 340, color: "#3B82F6", opacity: 0.14 },
    { bottom: 100, right: -100, width: 360, height: 360, color: Colors.primary, opacity: 0.12 },
    { top: 260, left: -40, width: 220, height: 220, color: "#7C3AED", opacity: 0.10 },
    { top: 80, right: -20, width: 140, height: 140, color: "#F59E0B", opacity: 0.05 },
  ],
  recordings: [
    { top: -40, right: -100, width: 360, height: 360, color: "#7C3AED", opacity: 0.15 },
    { bottom: 140, left: -80, width: 340, height: 340, color: Colors.primary, opacity: 0.11 },
    { top: 240, right: -60, width: 260, height: 260, color: "#EC4899", opacity: 0.08 },
    { top: 100, left: 40, width: 120, height: 120, color: "#F59E0B", opacity: 0.06 },
  ],
  account: [
    { top: -100, left: -80, width: 380, height: 380, color: Colors.primary, opacity: 0.14 },
    { bottom: 80, right: -100, width: 340, height: 340, color: "#7C3AED", opacity: 0.13 },
    { top: 300, left: -60, width: 240, height: 240, color: "#3B82F6", opacity: 0.08 },
  ],
  default: [
    { top: -80, right: -60, width: 340, height: 340, color: Colors.primary, opacity: 0.14 },
    { bottom: 100, left: -100, width: 320, height: 320, color: "#7C3AED", opacity: 0.12 },
  ],
};

export function GlassBackground({ variant = "default" }: { variant?: Variant }) {
  const orbs = orbConfigs[variant];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={["#0A0414", "#060A1C", "#030710"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      />
      {orbs.map((orb, i) => (
        <View
          key={i}
          style={[
            styles.orb,
            {
              top: orb.top,
              bottom: orb.bottom,
              left: orb.left,
              right: orb.right,
              width: orb.width,
              height: orb.height,
              borderRadius: orb.width / 2,
              backgroundColor: orb.color,
              opacity: orb.opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: "absolute" as const,
  },
});
