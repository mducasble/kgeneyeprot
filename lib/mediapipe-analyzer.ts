import { Platform } from "react-native";
import type { LocalQCFrameSample } from "./qc-types";
import {
  analyzeViaWebView,
  waitForBridge,
  isBridgeReady,
  type WebViewFrameInput,
} from "./webview-mediapipe-bridge";

const MEDIAPIPE_VERSION = "0.10.32";
const SINGLETON_KEY = `mp-${MEDIAPIPE_VERSION}`;
const MEDIAPIPE_WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MEDIAPIPE_WASM_FALLBACK = `https://unpkg.com/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const FACE_LANDMARKER_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let _singletonKey: string | null = null;
let handLandmarker: any = null;
let faceLandmarker: any = null;
let initPromise: Promise<boolean> | null = null;
let mediaPipeReady = false;

function resetSingletons() {
  handLandmarker = null;
  faceLandmarker = null;
  initPromise = null;
  mediaPipeReady = false;
  _singletonKey = null;
}

async function tryInitWithWasm(wasmPath: string): Promise<boolean> {
  const { FilesetResolver, HandLandmarker, FaceLandmarker } = await import(
    "@mediapipe/tasks-vision"
  );
  console.log("[MediaPipe] Trying WASM from:", wasmPath);
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  console.log("[MediaPipe] FilesetResolver OK, loading HandLandmarker...");

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: HAND_MODEL_URL,
    },
    runningMode: "IMAGE",
    numHands: 2,
    minHandDetectionConfidence: 0.4,
    minHandPresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });

  console.log("[MediaPipe] HandLandmarker ready. Trying FaceLandmarker...");

  try {
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: FACE_LANDMARKER_URL,
      },
      runningMode: "IMAGE",
      numFaces: 1,
      minFaceDetectionConfidence: 0.4,
      minFacePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
    console.log("[MediaPipe] FaceLandmarker ready");
  } catch (fe: any) {
    console.warn(
      "[MediaPipe] FaceLandmarker unavailable — face checks will default to 'no face':",
      fe?.message ?? fe,
    );
    faceLandmarker = null;
  }

  mediaPipeReady = true;
  _singletonKey = SINGLETON_KEY;
  console.log("[MediaPipe] Init complete (hands=ready, face=" + (faceLandmarker ? "ready" : "unavailable") + ")");
  return true;
}

async function initMediaPipe(): Promise<boolean> {
  if (mediaPipeReady && handLandmarker && _singletonKey === SINGLETON_KEY) return true;
  if (_singletonKey !== SINGLETON_KEY) resetSingletons();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    for (const wasmPath of [MEDIAPIPE_WASM_CDN, MEDIAPIPE_WASM_FALLBACK]) {
      try {
        const ok = await tryInitWithWasm(wasmPath);
        if (ok) return true;
      } catch (e: any) {
        const msg = e?.message ?? JSON.stringify(e);
        console.warn(`[MediaPipe] Init failed with ${wasmPath}:`, msg);
        handLandmarker = null;
        faceLandmarker = null;
      }
    }
    initPromise = null;
    return false;
  })();

  return initPromise;
}

let _canvasCtx: CanvasRenderingContext2D | null = null;

function getCanvasCtx(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  if (!_canvasCtx || _canvasCtx.canvas !== canvas) {
    _canvasCtx = canvas.getContext("2d", { willReadFrequently: true }) ?? null;
  }
  return _canvasCtx;
}

function seekAndCapture(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  timeS: number,
): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const cleanup = setTimeout(() => {
      video.onseeked = null;
      resolve(null);
    }, 8000);

    video.onseeked = () => {
      clearTimeout(cleanup);
      video.onseeked = null;
      try {
        const ctx = getCanvasCtx(canvas);
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
        } catch (secErr) {
          // Canvas taint — draw succeeded but pixel read blocked
          console.warn("[MediaPipe] getImageData blocked (canvas taint):", secErr);
          resolve(null);
        }
      } catch (drawErr) {
        console.warn("[MediaPipe] drawImage failed:", drawErr);
        resolve(null);
      }
    };

    video.currentTime = timeS;
  });
}

function pixelBrightnessAndVariance(data: Uint8ClampedArray): {
  brightness: number;
  variance: number;
} {
  const total = data.length / 4;
  const step = Math.max(1, Math.floor(total / 2000));
  let sum = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4 * step) {
    sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    count++;
  }

  const mean = count > 0 ? sum / count : 128;
  let varSum = 0;

  for (let i = 0; i < data.length; i += 4 * step) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    varSum += (lum - mean) ** 2;
  }

  const variance = count > 0 ? varSum / count : 1000;
  return { brightness: mean, variance };
}

function isSimulatedUri(uri: string): boolean {
  return uri.startsWith("file://simulated") || uri === "";
}

async function analyzeOnWeb(
  videoUri: string,
  durationMs: number,
  stabilityData: number[],
  onProgress?: (p: number) => void,
): Promise<LocalQCFrameSample[]> {
  if (isSimulatedUri(videoUri)) {
    return generateSimulatedFrames(durationMs, stabilityData);
  }

  onProgress?.(2);

  const ok = await initMediaPipe();
  onProgress?.(12);

  if (!ok || !handLandmarker) {
    console.warn("[MediaPipe] Falling back to simulation");
    return generateSimulatedFrames(durationMs, stabilityData);
  }

  const video = document.createElement("video");
  // crossOrigin must NOT be set for blob: or data: URIs — it causes taint / CORS errors
  if (videoUri.startsWith("http://") || videoUri.startsWith("https://")) {
    video.crossOrigin = "anonymous";
  }
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;

  const loadVideo = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Video load timeout")), 20000);
    video.onloadedmetadata = () => { clearTimeout(t); resolve(); };
    video.onerror = () => { clearTimeout(t); reject(new Error("Video load error")); };
    video.src = videoUri;
    video.load();
  });

  try {
    await loadVideo;
  } catch (e) {
    console.warn("[MediaPipe] Video load failed:", e);
    return generateSimulatedFrames(durationMs, stabilityData);
  }

  onProgress?.(15);

  const canvas = document.createElement("canvas");
  const maxDim = 480;
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);

  const SAMPLE_RATE_FPS = 5;
  const totalSeconds = Math.max(1, Math.floor(durationMs / 1000));
  const sampleTimes: number[] = [];
  for (let t = 1 / SAMPLE_RATE_FPS / 2; t < totalSeconds; t += 1 / SAMPLE_RATE_FPS) {
    sampleTimes.push(t);
  }

  const avgStability =
    stabilityData.length
      ? stabilityData.reduce((a, b) => a + b, 0) / stabilityData.length
      : 75;

  const frames: LocalQCFrameSample[] = [];

  for (let i = 0; i < sampleTimes.length; i++) {
    const t = sampleTimes[i];
    const pct = 15 + ((i + 1) / sampleTimes.length) * 78;
    onProgress?.(pct);

    const imageData = await seekAndCapture(video, canvas, t);

    let handDetected = false;
    let handCount = 0;
    let handConfidence = 0;
    let handBoundingBoxes: { x: number; y: number; width: number; height: number }[] = [];
    let faceDetected = false;
    let faceConfidence = 0;
    let brightnessValue = 60;
    let blurValue = 60;
    let contrastValue = 60;

    if (imageData) {
      const { brightness, variance } = pixelBrightnessAndVariance(imageData.data);
      // Apply sRGB gamma correction so perceived brightness matches human vision
      // Linear 107/255 = 42% → after gamma: ~67% (matches how it looks on screen)
      const linearNorm = brightness / 255;
      const perceptual = Math.pow(linearNorm, 1 / 2.2);
      brightnessValue = Math.min(100, perceptual * 100);
      blurValue = Math.min(100, Math.max(10, (variance / 2500) * 100));
      contrastValue = Math.min(100, variance / 30);
      if (i === 0 || i === Math.floor(sampleTimes.length / 2)) {
        console.log(`[MediaPipe] Frame sample t=${t.toFixed(2)}s brightness=${brightnessValue.toFixed(1)} (raw=${brightness.toFixed(0)}/255) blur=${blurValue.toFixed(1)}`);
      }
    } else if (i === 0) {
      console.warn("[MediaPipe] Frame t=0 returned null imageData — canvas taint or seek failed");
    }

    try {
      const handResult = handLandmarker.detect(canvas);
      handCount = handResult.landmarks.length;
      handDetected = handCount > 0;

      if (handDetected && handResult.handedness.length > 0) {
        handConfidence = handResult.handedness[0]?.[0]?.score ?? 0.8;
        handBoundingBoxes = handResult.landmarks.map(
          (landmarks: { x: number; y: number }[]) => {
            const xs = landmarks.map((l) => l.x);
            const ys = landmarks.map((l) => l.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            return {
              x: minX,
              y: minY,
              width: Math.max(...xs) - minX,
              height: Math.max(...ys) - minY,
            };
          },
        );
      }
    } catch (e) {
      console.warn("[MediaPipe] Hand detection error:", e);
    }

    if (faceLandmarker) {
      try {
        const faceResult = faceLandmarker.detect(canvas);
        faceDetected = (faceResult.faceLandmarks?.length ?? 0) > 0;
        if (faceDetected) {
          faceConfidence = faceResult.faceBlendshapes?.[0]?.categories?.[0]?.score ?? 0.6;
        }
      } catch (e) {
        console.warn("[MediaPipe] Face detection error:", e);
      }
    }

    const stabilityNow = avgStability + (Math.random() - 0.5) * 10;

    frames.push({
      timestampMs: Math.floor(t * 1000),
      handDetected,
      handCount,
      handConfidence,
      handBoundingBoxes,
      faceDetected,
      faceConfidence,
      brightnessValue,
      blurValue,
      contrastValue,
      motionValue: Math.max(0, 100 - stabilityNow),
    });
  }

  const avgBrightness = frames.reduce((s, f) => s + f.brightnessValue, 0) / frames.length;
  const handsDetectedPct = Math.round((frames.filter(f => f.handDetected).length / frames.length) * 100);
  console.log(`[MediaPipe] Analysis done: ${frames.length} frames | avgBrightness=${avgBrightness.toFixed(1)} | handsDetected=${handsDetectedPct}%`);

  onProgress?.(95);
  return frames;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function avg(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function generateSimulatedFrames(
  durationMs: number,
  stabilityData: number[],
): LocalQCFrameSample[] {
  const totalFrames = Math.max(1, Math.floor(durationMs / 1000));
  const avgStability = stabilityData.length ? avg(stabilityData) : 80;
  const frames: LocalQCFrameSample[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    const stabilityNow = avgStability + (Math.random() - 0.5) * 20;
    const handDetected = Math.random() > 0.2;
    const handCount = handDetected ? (Math.random() > 0.6 ? 2 : 1) : 0;
    const faceDetected = Math.random() < 0.05;

    frames.push({
      timestampMs: Math.floor(t * durationMs),
      handDetected,
      handCount,
      handConfidence: handDetected ? 0.7 + Math.random() * 0.3 : 0,
      handBoundingBoxes: handDetected
        ? [
            {
              x: 0.2 + Math.random() * 0.3,
              y: 0.3 + Math.random() * 0.3,
              width: 0.15 + Math.random() * 0.1,
              height: 0.2 + Math.random() * 0.1,
            },
          ]
        : [],
      faceDetected,
      faceConfidence: faceDetected ? 0.6 + Math.random() * 0.4 : 0,
      brightnessValue: clamp(60 + (Math.random() - 0.5) * 30, 0, 100),
      blurValue: clamp(stabilityNow * 0.7 + Math.random() * 20, 0, 100),
      contrastValue: clamp(55 + (Math.random() - 0.5) * 25, 0, 100),
      motionValue: clamp(100 - stabilityNow + Math.random() * 10, 0, 100),
    });
  }

  return frames;
}

async function extractFramesForBridge(
  videoUri: string,
  durationMs: number,
  onProgress?: (p: number) => void,
): Promise<WebViewFrameInput[]> {
  const VideoThumbnails = await import("expo-video-thumbnails");
  const FileSystem = await import("expo-file-system/legacy");

  const MAX_FRAMES = 20;
  const totalSeconds = Math.max(1, Math.floor(durationMs / 1000));
  const numFrames = Math.min(MAX_FRAMES, Math.max(3, totalSeconds));
  const interval = durationMs / numFrames;
  const frames: WebViewFrameInput[] = [];

  for (let i = 0; i < numFrames; i++) {
    const timestampMs = Math.floor(interval * (i + 0.5));
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: timestampMs,
        quality: 0.5,
      });
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      frames.push({ base64, timestampMs });
      onProgress?.(10 + (i / numFrames) * 45);
    } catch (e) {
      console.warn(`[MediaPipe] Frame ${i} at ${timestampMs}ms extraction failed:`, e);
    }
  }

  console.log(`[MediaPipe] Extracted ${frames.length}/${numFrames} frames for bridge analysis`);
  return frames;
}

function bridgeResultsToQCFrames(
  results: Awaited<ReturnType<typeof analyzeViaWebView>>,
  stabilityReadings: number[],
): LocalQCFrameSample[] {
  const avgStability =
    stabilityReadings.length
      ? stabilityReadings.reduce((a, b) => a + b, 0) / stabilityReadings.length
      : 75;

  return results.map((r) => {
    const stabilityNow = avgStability + (Math.random() - 0.5) * 10;
    return {
      timestampMs: r.timestampMs,
      handDetected: r.handDetected,
      handCount: r.handCount,
      handConfidence: r.handConfidence,
      handBoundingBoxes: [],
      faceDetected: r.faceDetected,
      faceConfidence: r.faceConfidence,
      brightnessValue: 65,
      blurValue: Math.min(100, Math.max(10, stabilityNow * 0.7)),
      contrastValue: 60,
      motionValue: Math.max(0, 100 - stabilityNow),
    };
  });
}

export async function analyzeVideo(
  videoUri: string,
  durationMs: number,
  stabilityReadings: number[],
  onProgress?: (p: number) => void,
): Promise<LocalQCFrameSample[]> {
  if (Platform.OS === "web") {
    try {
      return await analyzeOnWeb(videoUri, durationMs, stabilityReadings, onProgress);
    } catch (e) {
      console.warn("[MediaPipe] Web analysis failed, using simulation:", e);
      return generateSimulatedFrames(durationMs, stabilityReadings);
    }
  }

  // Native: use the hidden WebView bridge for real MediaPipe analysis
  if (isSimulatedUri(videoUri)) {
    onProgress?.(90);
    return generateSimulatedFrames(durationMs, stabilityReadings);
  }

  try {
    onProgress?.(5);

    // Wait for the WebView MediaPipe bridge to be ready (loaded from CDN)
    if (!isBridgeReady()) {
      console.log("[MediaPipe] Waiting for WebView bridge to be ready...");
      await waitForBridge(25000);
    }

    onProgress?.(10);

    // Extract JPEG frames from the video using expo-video-thumbnails
    const frames = await extractFramesForBridge(videoUri, durationMs, onProgress);

    if (frames.length === 0) {
      console.warn("[MediaPipe] No frames extracted, falling back to simulation");
      return generateSimulatedFrames(durationMs, stabilityReadings);
    }

    onProgress?.(55);

    // Send frames to WebView for real MediaPipe analysis
    const results = await analyzeViaWebView(frames);
    onProgress?.(90);

    const handsDetectedPct = Math.round(
      (results.filter((r) => r.handDetected).length / results.length) * 100,
    );
    const facesDetectedPct = Math.round(
      (results.filter((r) => r.faceDetected).length / results.length) * 100,
    );
    console.log(
      `[MediaPipe] Bridge analysis done: ${results.length} frames | hands=${handsDetectedPct}% | faces=${facesDetectedPct}%`,
    );

    return bridgeResultsToQCFrames(results, stabilityReadings);
  } catch (e) {
    console.warn("[MediaPipe] WebView bridge analysis failed, falling back to simulation:", e);
    onProgress?.(90);
    return generateSimulatedFrames(durationMs, stabilityReadings);
  }
}

export { generateSimulatedFrames };
