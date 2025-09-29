'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type RecognitionInstance = SpeechRecognition & {
  lang?: string
  continuous?: boolean
  interimResults?: boolean
}

type SpeechRecognitionConfig = {
  lang?: string
  interimResults?: boolean
  continuous?: boolean
}

interface SpeechRecognitionHook {
  isSupported: boolean
  supported: boolean
  isListening: boolean
  listening: boolean
  transcript: string
  error: string | null
  start: (handler?: (event: SpeechRecognitionEvent) => void) => void
  stop: () => void
  reset: () => void
}

export function useSpeechRecognition(config: SpeechRecognitionConfig = {}): SpeechRecognitionHook {
  const recognitionRef = useRef<RecognitionInstance | null>(null)
  const callbackRef = useRef<((event: SpeechRecognitionEvent) => void) | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isSupported = useMemo(() => {
    if (typeof window === 'undefined') return false
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  }, [])

  useEffect(() => {
    if (!isSupported) return

    const Recognition =
      (window.SpeechRecognition || window.webkitSpeechRecognition) as typeof window.SpeechRecognition

    const recognition = new Recognition() as RecognitionInstance
    recognition.lang = config.lang ?? 'en-US'
    recognition.continuous = config.continuous ?? false
    recognition.interimResults = config.interimResults ?? false
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setIsListening(true)
      setError(null)
    }

    recognition.onerror = event => {
      setError(event.error)
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results?.[0]?.[0] as SpeechRecognitionAlternative | undefined
      const spoken = result?.transcript ?? ''
      setTranscript(spoken)
      callbackRef.current?.(event)
    }

    recognitionRef.current = recognition

    return () => {
      recognition.onstart = null
      recognition.onerror = null
      recognition.onend = null
      recognition.onresult = null
      recognition.stop()
      recognitionRef.current = null
    }
  }, [isSupported, config.lang, config.continuous, config.interimResults])

  const start = useCallback((handler?: (event: SpeechRecognitionEvent) => void) => {
    if (!recognitionRef.current || isListening) return
    callbackRef.current = handler ?? null
    setTranscript('')
    setError(null)
    recognitionRef.current.start()
  }, [isListening])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    callbackRef.current = null
  }, [])

  const reset = useCallback(() => {
    setTranscript('')
    setError(null)
  }, [])

  return {
    isSupported,
    supported: isSupported,
    isListening,
    listening: isListening,
    transcript,
    error,
    start,
    stop,
    reset
  }
}

export default useSpeechRecognition
