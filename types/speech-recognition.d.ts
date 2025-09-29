declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
  interface WebkitSpeechRecognition {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    start(): void;
    stop(): void;
    abort(): void;
    onaudioend?: (ev: any) => void;
    onerror?: (ev: any) => void;
    onresult?: (ev: any) => void;
  }
  interface SpeechRecognitionConstructor {
    new (): WebkitSpeechRecognition;
  }
}
export {};
