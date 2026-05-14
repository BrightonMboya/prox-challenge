"use client";

import { useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  }
  interface Navigator {
    brave?: { isBrave(): Promise<boolean> };
  }
}

export type SpeechRecognitionState = {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  // Why voice input isn't usable, if it isn't. Surfaced in the button tooltip
  // and as a tiny note so the user isn't left guessing.
  unsupportedReason: string | null;
  start(): void;
  stop(): void;
  dismissError(): void;
};

function explainError(code: string, isSecure: boolean): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission denied. Click the lock icon in the address bar and allow microphone access.";
    case "no-speech":
      return "Didn't catch anything. Try speaking closer to the mic.";
    case "audio-capture":
      return "No microphone detected. Check your system audio devices.";
    case "network":
      return "Network error reaching the speech-recognition service.";
    case "aborted":
      return ""; // user-initiated stop, don't surface
    default:
      if (!isSecure) {
        return "Speech recognition requires HTTPS or http://localhost. The LAN IP shown by Next.js (e.g. 192.168.x.x) is blocked by Chrome — open http://localhost:3000 instead.";
      }
      return `Speech recognition error: ${code}`;
  }
}

export function useSpeechRecognition(onFinal: (text: string) => void): SpeechRecognitionState {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      setUnsupportedReason("This browser doesn't support speech recognition. Try Chrome, Edge, or Safari.");
      return;
    }

    // Brave technically exposes webkitSpeechRecognition but doesn't ship the
    // Google cloud backend that powers it on Chromium, so calls fail with a
    // "network" error. Detect ahead of time and disable cleanly.
    const detectBrave = async () => {
      try {
        if (typeof navigator !== "undefined" && navigator.brave && (await navigator.brave.isBrave())) {
          setSupported(false);
          setUnsupportedReason(
            "Voice input doesn't work in Brave — Chromium's speech recognition routes through a Google service that Brave strips out. Open this page in Chrome, Edge, or Safari to use the mic.",
          );
          return;
        }
        setSupported(true);
      } catch {
        setSupported(true);
      }
    };
    detectBrave();
  }, []);

  const start = () => {
    if (typeof window === "undefined") return;
    setError(null);

    const isSecure = window.isSecureContext;
    if (!isSecure) {
      setError(
        "Speech recognition requires HTTPS or http://localhost. The LAN IP shown by Next.js (e.g. 192.168.x.x) is blocked by Chrome — open http://localhost:3000 instead.",
      );
      return;
    }

    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setError(
        "Speech recognition isn't supported in this browser. Use Chrome, Edge, or Safari.",
      );
      return;
    }

    let rec: SpeechRecognitionLike;
    try {
      rec = new Ctor();
    } catch (e) {
      console.error("[speech] constructor failed", e);
      setError("Couldn't initialize speech recognition.");
      return;
    }

    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onstart = () => setListening(true);
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.onerror = (e: any) => {
      const code: string = e?.error ?? "unknown";
      console.error("[speech] error event", code, e);
      const msg = explainError(code, window.isSecureContext);
      if (msg) setError(msg);
      setListening(false);
      setInterim("");
    };
    rec.onresult = (e: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText) {
        onFinalRef.current(finalText.trim());
        setInterim("");
      } else {
        setInterim(interimText);
      }
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      console.error("[speech] start failed", e);
      setError("Couldn't start speech recognition. Try again.");
      recRef.current = null;
    }
  };

  const stop = () => {
    recRef.current?.stop();
    recRef.current = null;
  };

  useEffect(() => () => recRef.current?.abort(), []);

  return {
    supported,
    listening,
    interim,
    error,
    unsupportedReason,
    start,
    stop,
    dismissError: () => setError(null),
  };
}

export type SpeechSynthesisState = {
  supported: boolean;
  enabled: boolean;
  speaking: boolean;
  toggle(): void;
  speak(text: string): void;
  cancel(): void;
};

const TTS_KEY = "omnipro-tts-enabled";

export function useSpeechSynthesis(): SpeechSynthesisState {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupported("speechSynthesis" in window);
    setEnabled(localStorage.getItem(TTS_KEY) === "1");
  }, []);

  const toggle = () => {
    setEnabled((v) => {
      const next = !v;
      try {
        localStorage.setItem(TTS_KEY, next ? "1" : "0");
      } catch {}
      if (!next && typeof window !== "undefined") {
        window.speechSynthesis.cancel();
        setSpeaking(false);
      }
      return next;
    });
  };

  const speak = (text: string) => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;
    if (!text.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(stripForSpeech(text));
    u.rate = 1.05;
    u.pitch = 1.0;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const cancel = () => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  return { supported, enabled, speaking, toggle, speak, cancel };
}

function stripForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\bp\.\s*(\d+)/g, "page $1")
    .replace(/\s+/g, " ")
    .trim();
}
