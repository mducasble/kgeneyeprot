import { useEffect, useState, useRef } from "react";
import { Platform } from "react-native";
import type { RequiredOrientation } from "./qc-types";

export type DeviceOrientation = "portrait" | "landscape" | "unknown";

export function useDeviceOrientation(): DeviceOrientation {
  const [orientation, setOrientation] = useState<DeviceOrientation>("portrait");

  useEffect(() => {
    if (Platform.OS === "web") {
      const update = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        setOrientation(w > h ? "landscape" : "portrait");
      };
      update();
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    let Accelerometer: any;
    let subscription: any;

    (async () => {
      try {
        const { Accelerometer: Acc } = await import("expo-sensors");
        Accelerometer = Acc;
        await Accelerometer.setUpdateInterval(300);
        subscription = Accelerometer.addListener(({ x, y }: { x: number; y: number }) => {
          const absX = Math.abs(x);
          const absY = Math.abs(y);
          if (absX > 0.7 && absY < 0.5) {
            setOrientation("landscape");
          } else if (absY > 0.7 && absX < 0.5) {
            setOrientation("portrait");
          }
        });
      } catch {
        setOrientation("portrait");
      }
    })();

    return () => {
      subscription?.remove();
    };
  }, []);

  return orientation;
}

export function isOrientationValid(
  current: DeviceOrientation,
  required: RequiredOrientation,
): boolean {
  if (required === "any") return true;
  if (current === "unknown") return true;
  return current === required;
}

export function useStabilityTracker() {
  const [stabilityReadings, setStabilityReadings] = useState<number[]>([]);
  const lastAccelRef = useRef<{ x: number; y: number; z: number } | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") {
      const mockInterval = setInterval(() => {
        setStabilityReadings((prev) => {
          const stability = 70 + Math.random() * 25;
          return [...prev, stability].slice(-60);
        });
      }, 500);
      return () => clearInterval(mockInterval);
    }

    let subscription: any;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const { Accelerometer } = await import("expo-sensors");
        await Accelerometer.setUpdateInterval(200);
        subscription = Accelerometer.addListener(
          ({ x, y, z }: { x: number; y: number; z: number }) => {
            const last = lastAccelRef.current;
            if (last) {
              const jitter = Math.sqrt(
                Math.pow(x - last.x, 2) +
                  Math.pow(y - last.y, 2) +
                  Math.pow(z - last.z, 2),
              );
              const stability = Math.max(0, Math.min(100, 100 - jitter * 80));
              setStabilityReadings((prev) => [...prev, stability].slice(-60));
            }
            lastAccelRef.current = { x, y, z };
          },
        );
      } catch {
        fallbackInterval = setInterval(() => {
          setStabilityReadings((prev) => {
            const s = 70 + Math.random() * 25;
            return [...prev, s].slice(-60);
          });
        }, 500);
      }
    })();

    return () => {
      subscription?.remove();
      if (fallbackInterval !== null) clearInterval(fallbackInterval);
    };
  }, []);

  return stabilityReadings;
}
