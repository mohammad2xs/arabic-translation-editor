import { useEffect, useMemo, useRef, useState } from "react";
type SR = InstanceType<NonNullable<Window["webkitSpeechRecognition"]>>;

export function useSpeechRecognition(opts?: {
  lang?: string;
  interimResults?: boolean;
  continuous?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SR | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor = window.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = opts?.lang ?? "ar";
    rec.interimResults = opts?.interimResults ?? true;
    rec.continuous = opts?.continuous ?? false;
    rec.onresult = () => {};
    rec.onerror = () => setListening(false);
    rec.onaudioend = () => setListening(false);
    recRef.current = rec;
    setSupported(true);
    return () => {
      try { rec.stop(); } catch {}
      recRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api = useMemo(() => ({
    supported,
    listening,
    start(onResult?: (ev: any) => void) {
      if (!recRef.current) return;
      if (onResult) recRef.current.onresult = onResult;
      recRef.current.start();
      setListening(true);
    },
    stop() {
      try { recRef.current?.stop(); } finally { setListening(false); }
    }
  }), [supported, listening]);

  return api;
}
