import React, { useRef, useState, useEffect, useCallback } from "react";
import { Platform, View, StyleSheet } from "react-native";
import {
  registerBridge,
  WebViewFrameInput,
  WebViewFrameResult,
} from "@/lib/webview-mediapipe-bridge";

const MEDIAPIPE_VERSION = "0.10.32";
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const WASM_FALLBACK = `https://unpkg.com/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

const MEDIAPIPE_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:0;background:transparent;overflow:hidden;}</style>
<script type="module">
import { FilesetResolver, HandLandmarker, FaceLandmarker }
  from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/+esm';

const HAND_URL = '${HAND_MODEL_URL}';
const FACE_URL = '${FACE_MODEL_URL}';

let handLandmarker = null;
let faceLandmarker = null;
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

function rn(msg) {
  try {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  } catch(e) {}
}

async function tryInit(wasmPath) {
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: HAND_URL },
    runningMode: 'IMAGE', numHands: 2,
    minHandDetectionConfidence: 0.4,
    minHandPresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });
  try {
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_URL },
      runningMode: 'IMAGE', numFaces: 1,
      minFaceDetectionConfidence: 0.4,
      minFacePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
  } catch(fe) { faceLandmarker = null; }
  return true;
}

async function init() {
  for (const wasmPath of ['${WASM_CDN}', '${WASM_FALLBACK}']) {
    try {
      await tryInit(wasmPath);
      rn({ type: 'READY' });
      return;
    } catch(e) { handLandmarker = null; faceLandmarker = null; }
  }
  rn({ type: 'ERROR', message: 'MediaPipe init failed on both CDNs' });
}

function pixelStats(imageData) {
  const data = imageData.data;
  const total = data.length / 4;
  const step = Math.max(1, Math.floor(total / 2000));
  let sum = 0, count = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    sum += data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
    count++;
  }
  const mean = count > 0 ? sum / count : 128;
  let varSum = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    const lum = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
    varSum += (lum - mean) * (lum - mean);
  }
  const variance = count > 0 ? varSum / count : 1000;
  const linearNorm = mean / 255;
  const perceptual = Math.pow(linearNorm, 1 / 2.2);
  return {
    brightness: Math.min(100, perceptual * 100),
    blur: Math.min(100, Math.max(10, (variance / 2500) * 100)),
    contrast: Math.min(100, variance / 30)
  };
}

function analyzeFrame(base64Jpeg, timestampMs) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      let brightnessValue = 0, blurValue = 0, contrastValue = 0;
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const stats = pixelStats(imageData);
        brightnessValue = stats.brightness;
        blurValue = stats.blur;
        contrastValue = stats.contrast;
      } catch(e) {}

      let handDetected = false, handCount = 0, handConfidence = 0;
      let hands = [];
      let faceDetected = false, faceConfidence = 0;

      if (handLandmarker) {
        try {
          const r = handLandmarker.detect(canvas);
          handCount = r.landmarks ? r.landmarks.length : 0;
          handDetected = handCount > 0;

          for (let h = 0; h < handCount; h++) {
            const lm = r.landmarks[h];
            const landmarks21 = lm.map(p => ({ x: p.x, y: p.y, z: p.z }));

            let label = 'Unknown';
            let conf = 0;
            if (r.handedness && r.handedness[h] && r.handedness[h][0]) {
              label = r.handedness[h][0].categoryName || 'Unknown';
              conf = r.handedness[h][0].score || 0;
            }
            if (h === 0) handConfidence = conf;

            const xs = lm.map(p => p.x);
            const ys = lm.map(p => p.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const bbox = {
              x: minX, y: minY,
              width: Math.max(...xs) - minX,
              height: Math.max(...ys) - minY
            };

            hands.push({ handedness: label, confidence: conf, landmarks: landmarks21, boundingBox: bbox });
          }
        } catch(e) {}
      }

      if (faceLandmarker) {
        try {
          const fr = faceLandmarker.detect(canvas);
          faceDetected = fr.faceLandmarks && fr.faceLandmarks.length > 0;
          if (faceDetected && fr.faceBlendshapes && fr.faceBlendshapes[0]) {
            const cats = fr.faceBlendshapes[0].categories;
            faceConfidence = cats && cats[0] ? cats[0].score : 0.6;
          }
        } catch(e) {}
      }

      resolve({
        timestampMs, handDetected, handCount, handConfidence, hands,
        faceDetected, faceConfidence,
        brightnessValue, blurValue, contrastValue
      });
    };
    img.onerror = () => {
      resolve({
        timestampMs, handDetected: false, handCount: 0, handConfidence: 0, hands: [],
        faceDetected: false, faceConfidence: 0,
        brightnessValue: 0, blurValue: 0, contrastValue: 0
      });
    };
    img.src = 'data:image/jpeg;base64,' + base64Jpeg;
  });
}

window.addEventListener('message', async (event) => {
  try {
    const msg = JSON.parse(event.data);
    if (msg.type === 'ANALYZE') {
      const results = [];
      const frames = msg.frames || [];
      const timestamps = msg.timestamps || [];
      for (let i = 0; i < frames.length; i++) {
        const r = await analyzeFrame(frames[i], timestamps[i] || i * 200);
        results.push(r);
      }
      rn({ type: 'RESULTS', results });
    }
  } catch(e) {
    rn({ type: 'ERROR', message: String(e) });
  }
});

init();
</script>
</head><body></body></html>`;

export function MediaPipeWebView() {
  if (Platform.OS === "web") return null;

  return <MediaPipeWebViewInner />;
}

function MediaPipeWebViewInner() {
  const [WebViewComponent, setWebViewComponent] = useState<any>(null);
  const webViewRef = useRef<any>(null);
  const pendingRef = useRef<{
    resolve: (r: WebViewFrameResult[]) => void;
    reject: (e: Error) => void;
  } | null>(null);

  useEffect(() => {
    import("react-native-webview").then((mod) => {
      setWebViewComponent(() => mod.default || mod.WebView);
    });
  }, []);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent?.data ?? event.data ?? "{}");
      if (msg.type === "READY") {
        registerBridge(async (frames: WebViewFrameInput[]) => {
          return new Promise<WebViewFrameResult[]>((resolve, reject) => {
            pendingRef.current = { resolve, reject };
            const payload = JSON.stringify({
              type: "ANALYZE",
              frames: frames.map((f) => f.base64),
              timestamps: frames.map((f) => f.timestampMs),
            });
            webViewRef.current?.postMessage(payload);
          });
        });
      } else if (msg.type === "RESULTS" && pendingRef.current) {
        pendingRef.current.resolve(msg.results ?? []);
        pendingRef.current = null;
      } else if (msg.type === "ERROR" && pendingRef.current) {
        pendingRef.current.reject(new Error(msg.message || "Unknown error"));
        pendingRef.current = null;
      }
    } catch {
    }
  }, []);

  if (!WebViewComponent) return null;

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebViewComponent
        ref={webViewRef}
        source={{ html: MEDIAPIPE_HTML }}
        onMessage={handleMessage}
        javaScriptEnabled
        originWhitelist={["*"]}
        style={styles.webview}
        scrollEnabled={false}
        allowsInlineMediaPlayback
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: "none",
  },
  webview: {
    width: 1,
    height: 1,
    backgroundColor: "transparent",
  },
});
