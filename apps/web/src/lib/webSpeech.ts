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

const activeUtterances = new Set<SpeechSynthesisUtterance>();

export function isSpeechSynthesisAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function selectSpeechVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const language = navigator.language || "en-US";
  const languagePrefix = language.split("-")[0];
  return (
    voices.find((voice) => voice.lang === language && voice.localService) ??
    voices.find((voice) => voice.lang === language) ??
    voices.find((voice) => voice.lang.startsWith(`${languagePrefix}-`) && voice.localService) ??
    voices.find((voice) => voice.lang.startsWith(`${languagePrefix}-`))
  );
}

export function speakText(text: string): SpeechSynthesisResult {
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
  const voice = selectSpeechVoice(synthesis.getVoices());
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
