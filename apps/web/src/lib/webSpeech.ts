import * as Schema from "effect/Schema";
import { useEffect, useMemo, useState } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

export type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
};

export type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionAvailable(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

export type SpeechSynthesisResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
    };

export interface SpeechVoiceOption {
  readonly label: string;
  readonly lang: string;
  readonly voiceURI: string;
}

const PREFERRED_SPEECH_VOICE_URI_STORAGE_KEY = "t3code:preferred-speech-voice-uri:v1";
const PreferredSpeechVoiceUriSchema = Schema.NullOr(Schema.String);

const activeUtterances = new Set<SpeechSynthesisUtterance>();

export function isSpeechSynthesisAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function rankAutoSpeechVoice(voice: SpeechSynthesisVoice): number {
  const language = navigator.language || "en-US";
  const languagePrefix = language.split("-")[0];

  if (voice.lang === language && voice.localService) {
    return 0;
  }
  if (voice.lang === language) {
    return 1;
  }
  if (voice.lang.startsWith(`${languagePrefix}-`) && voice.localService) {
    return 2;
  }
  if (voice.lang.startsWith(`${languagePrefix}-`)) {
    return 3;
  }
  if (languagePrefix === "en" && voice.lang === "en-AU" && voice.localService) {
    return 4;
  }
  if (languagePrefix === "en" && voice.lang === "en-GB" && voice.localService) {
    return 5;
  }
  if (languagePrefix === "en" && voice.lang.startsWith("en-") && voice.localService) {
    return 6;
  }
  if (languagePrefix === "en" && voice.lang.startsWith("en-")) {
    return 7;
  }
  if (voice.default && voice.localService) {
    return 8;
  }
  if (voice.default) {
    return 9;
  }
  if (voice.localService) {
    return 10;
  }
  return 11;
}

function compareSpeechVoices(a: SpeechSynthesisVoice, b: SpeechSynthesisVoice): number {
  const rankDifference = rankAutoSpeechVoice(a) - rankAutoSpeechVoice(b);
  if (rankDifference !== 0) {
    return rankDifference;
  }
  return a.name.localeCompare(b.name);
}

function readSpeechVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisAvailable()) {
    return [];
  }
  return [...window.speechSynthesis.getVoices()].sort(compareSpeechVoices);
}

function formatSpeechVoiceLabel(voice: SpeechSynthesisVoice): string {
  const details = [voice.lang];
  if (voice.default) {
    details.push("default");
  }
  if (voice.localService) {
    details.push("device");
  }
  return `${voice.name} (${details.join(" • ")})`;
}

function selectSpeechVoice(
  voices: SpeechSynthesisVoice[],
  preferredVoiceUri?: string | null,
): SpeechSynthesisVoice | undefined {
  if (preferredVoiceUri) {
    const preferredVoice = voices.find((voice) => voice.voiceURI === preferredVoiceUri);
    if (preferredVoice) {
      return preferredVoice;
    }
  }
  return voices[0];
}

export function useSpeechSynthesisVoicePreference() {
  const [preferredVoiceUri, setPreferredVoiceUri] = useLocalStorage(
    PREFERRED_SPEECH_VOICE_URI_STORAGE_KEY,
    null,
    PreferredSpeechVoiceUriSchema,
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => readSpeechVoices());

  useEffect(() => {
    if (!isSpeechSynthesisAvailable()) {
      return;
    }

    const synthesis = window.speechSynthesis;
    const syncVoices = () => {
      setVoices(readSpeechVoices());
    };

    syncVoices();
    synthesis.addEventListener("voiceschanged", syncVoices);
    return () => {
      synthesis.removeEventListener("voiceschanged", syncVoices);
    };
  }, []);

  const voiceOptions = useMemo<ReadonlyArray<SpeechVoiceOption>>(
    () =>
      voices.map((voice) => ({
        label: formatSpeechVoiceLabel(voice),
        lang: voice.lang,
        voiceURI: voice.voiceURI,
      })),
    [voices],
  );

  const selectedVoiceLabel = useMemo(() => {
    if (!preferredVoiceUri) {
      return voiceOptions[0]?.label ?? null;
    }
    return voiceOptions.find((voice) => voice.voiceURI === preferredVoiceUri)?.label ?? null;
  }, [preferredVoiceUri, voiceOptions]);

  return {
    preferredVoiceUri,
    setPreferredVoiceUri,
    selectedVoiceLabel,
    voiceOptions,
  } as const;
}

export function speakText(
  text: string,
  options?: {
    preferredVoiceUri?: string | null;
  },
): SpeechSynthesisResult {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return { ok: false, message: "Speech output is not available in this browser." };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, message: "There is no text to read aloud." };
  }

  const synthesis = window.speechSynthesis;
  synthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(trimmed);
  const voice = selectSpeechVoice(readSpeechVoices(), options?.preferredVoiceUri ?? null);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = navigator.language || "en-US";
  }
  utterance.rate = 0.95;
  utterance.pitch = 1;
  const releaseUtterance = () => {
    activeUtterances.delete(utterance);
  };
  utterance.addEventListener("end", releaseUtterance);
  utterance.addEventListener("error", releaseUtterance);
  activeUtterances.add(utterance);
  synthesis.speak(utterance);
  synthesis.resume();
  return { ok: true };
}

export function stopSpeech(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }
  window.speechSynthesis.cancel();
  activeUtterances.clear();
}
