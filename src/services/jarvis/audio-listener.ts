/**
 * Jarvis local audio listener — press-to-speak microphone capture using the
 * Web Audio API / MediaRecorder API.
 *
 * Captures 16kHz mono PCM audio from the device microphone on explicit user
 * action only (press-to-speak). No background listening, no wake-word
 * detection, no autonomous audio processing.
 */

export type AudioListenerState =
  "idle" | "requesting-permission" | "listening" | "processing" | "ready" | "error";

export interface AudioListenerConfig {
  /** Maximum recording duration in seconds. */
  maxRecordSeconds?: number;
  /** Sample rate in Hz. */
  sampleRate?: number;
  /** Audio chunk collection interval in ms. */
  timeSliceMs?: number;
}

export interface AudioListenerEvents {
  onStateChange?: (state: AudioListenerState) => void;
  onAudioLevel?: (level: number) => void; // 0.0 to 1.0
  onSecondsElapsed?: (seconds: number) => void;
  onError?: (error: string) => void;
  onAudioReady?: (audioBlob: Blob) => void;
  onTranscript?: (transcript: string) => void;
  onSuggestions?: (suggestions: unknown[]) => void;
}

const DEFAULT_CONFIG: AudioListenerConfig = {
  maxRecordSeconds: 60,
  sampleRate: 16000,
  timeSliceMs: 1000,
};

/**
 * LocalAudioListener manages microphone access and audio capture.
 * It does not perform any network requests — callers handle the audio blob.
 */
export class LocalAudioListener {
  private config: AudioListenerConfig;
  private events: AudioListenerEvents;

  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private animationFrame: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startTime: number | null = null;

  private state: AudioListenerState = "idle";

  constructor(config: Partial<AudioListenerConfig> = {}, events: AudioListenerEvents = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = events;
  }

  getState(): AudioListenerState {
    return this.state;
  }

  private setState(next: AudioListenerState): void {
    this.state = next;
    this.events.onStateChange?.(next);
  }

  private cleanup(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.mediaRecorder) {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Already stopped.
      }
      this.mediaRecorder = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.analyser = null;
    this.dataArray = null;
    this.startTime = null;
  }

  private updateAudioLevel(): void {
    if (!this.analyser || !this.dataArray) return;
    this.analyser.getByteFrequencyData(this.dataArray as unknown as Uint8Array<ArrayBuffer>);
    let sum = 0;
    const len = this.dataArray.length;
    for (let i = 0; i < len; i++) {
      sum += this.dataArray[i] ?? 0;
    }
    const avg = len > 0 ? sum / len : 0;
    this.events.onAudioLevel?.(avg / 255);
  }

  private renderLevel(): void {
    if (!this.analyser || !this.dataArray) return;
    this.updateAudioLevel();
    this.animationFrame = requestAnimationFrame(() => this.renderLevel());
  }

  /**
   * Requests microphone access and starts recording.
   * Returns a promise that resolves when recording has started.
   */
  async start(): Promise<void> {
    if (this.state === "listening") return;

    this.setState("requesting-permission");
    this.audioChunks = [];

    try {
      const audioConstraints: MediaTrackConstraints = {
        channelCount: 1, // mono
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (this.config.sampleRate) {
        audioConstraints.sampleRate = this.config.sampleRate;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      this.stream = stream;

      // Set up audio level visualization.
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) {
        throw new Error("Web Audio API not available");
      }
      const audioCtx = new AudioCtor();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      this.analyser = analyser;
      this.dataArray = dataArray;

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      this.mediaRecorder = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        this.cleanup();
        if (this.audioChunks.length === 0) {
          this.setState("idle");
          return;
        }
        const audioBlob = new Blob(this.audioChunks, {
          type: "audio/webm;codecs=opus",
        });
        this.events.onAudioReady?.(audioBlob);
        this.setState("ready");
      };

      recorder.onerror = () => {
        this.cleanup();
        this.setState("error");
        this.events.onError?.("Microphone recording failed. Please retry.");
      };

      recorder.start(this.config.timeSliceMs);
      const startTime = Date.now();
      const maxRecordSeconds = this.config.maxRecordSeconds ?? 60;
      this.startTime = startTime;
      this.setState("listening");
      this.renderLevel();

      this.timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        this.events.onSecondsElapsed?.(elapsed);
        if (elapsed >= maxRecordSeconds) {
          recorder.stop();
        }
      }, 1000);
    } catch (err) {
      this.cleanup();
      this.setState("error");
      this.events.onError?.(
        err instanceof Error
          ? `Microphone access failed: ${err.message}`
          : "Microphone access failed. Please retry.",
      );
    }
  }

  /**
   * Stops recording and processes the captured audio.
   */
  stop(): void {
    if (this.mediaRecorder && this.state === "listening") {
      this.mediaRecorder.stop();
    } else {
      this.cleanup();
      this.setState("idle");
    }
  }

  /**
   * Resets the listener to idle state.
   */
  reset(): void {
    this.cleanup();
    this.setState("idle");
  }

  /**
   * Returns the captured audio chunks as a Blob (if any).
   */
  getAudioBlob(): Blob | null {
    if (this.audioChunks.length === 0) return null;
    return new Blob(this.audioChunks, { type: "audio/webm;codecs=opus" });
  }

  /**
   * Checks if microphone access is available without requesting it.
   */
  static async isMicrophoneAvailable(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      return false;
    }
  }
}
