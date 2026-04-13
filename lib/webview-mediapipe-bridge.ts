export type WebViewFrameInput = {
  base64: string;
  timestampMs: number;
};

export type WebViewFrameResult = {
  timestampMs: number;
  handDetected: boolean;
  handCount: number;
  handConfidence: number;
  faceDetected: boolean;
  faceConfidence: number;
};

type BridgeFn = (frames: WebViewFrameInput[]) => Promise<WebViewFrameResult[]>;

let _bridge: BridgeFn | null = null;
let _readyPromise: Promise<void> | null = null;
let _resolveReady: (() => void) | null = null;

export function resetBridgeReady() {
  _readyPromise = new Promise<void>((resolve) => {
    _resolveReady = resolve;
  });
}

export function registerBridge(fn: BridgeFn) {
  _bridge = fn;
  _resolveReady?.();
}

export function isBridgeReady(): boolean {
  return _bridge !== null;
}

export async function waitForBridge(timeoutMs = 20000): Promise<void> {
  if (_bridge) return;
  if (!_readyPromise) resetBridgeReady();
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("WebView bridge timeout")), timeoutMs),
  );
  await Promise.race([_readyPromise!, timeout]);
}

export async function analyzeViaWebView(
  frames: WebViewFrameInput[],
): Promise<WebViewFrameResult[]> {
  if (!_bridge) throw new Error("WebView MediaPipe bridge not ready");
  return _bridge(frames);
}

resetBridgeReady();
