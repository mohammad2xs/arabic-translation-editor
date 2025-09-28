'use client';

import { useState, useEffect, useRef } from 'react';
import { getUserRole, canAddNotes } from '../../lib/dadmode/access';

interface Note {
  id: string;
  ts: string;
  kind: 'text' | 'voice';
  body?: string;
  audioPath?: string;
  by: string;
  userRole: string;
}

interface StickyNoteDrawerProps {
  rowId: string;
  isOpen: boolean;
  onClose: () => void;
  large?: boolean;
}

export default function StickyNoteDrawer({
  rowId,
  isOpen,
  onClose,
  large = false,
}: StickyNoteDrawerProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const userRole = getUserRole();
  const canAddNote = canAddNotes(userRole);

  // Load notes when drawer opens
  useEffect(() => {
    if (isOpen) {
      loadNotes();
    }
  }, [isOpen, rowId]);

  // Focus textarea when drawer opens
  useEffect(() => {
    if (isOpen && canAddNote && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen, canAddNote]);

  const loadNotes = async () => {
    try {
      const response = await fetch(`/api/notes/${rowId}`);
      if (response.ok) {
        const data = await response.json();
        setNotes(data.notes || []);
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
    }
  };

  const addTextNote = async () => {
    if (!newNoteText.trim() || !canAddNote) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/notes/${rowId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kind: 'text',
          body: newNoteText.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotes(prev => [...prev, data.note]);
        setNewNoteText('');
      }
    } catch (error) {
      console.error('Failed to add note:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    if (!canAddNote) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        await saveVoiceNote(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Failed to access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setMediaRecorder(null);
      setIsRecording(false);
    }
  };

  const saveVoiceNote = async (audioBlob: Blob) => {
    setIsLoading(true);
    try {
      // In a real implementation, you'd upload the audio file first
      // For now, we'll create a placeholder path
      const audioPath = `/outputs/audio/notes/${rowId}_${Date.now()}.wav`;

      const response = await fetch(`/api/notes/${rowId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kind: 'voice',
          audioPath,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotes(prev => [...prev, data.note]);
      }
    } catch (error) {
      console.error('Failed to save voice note:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      const response = await fetch(`/api/notes/${rowId}?noteId=${noteId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setNotes(prev => prev.filter(note => note.id !== noteId));
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-96 bg-yellow-50 border-l-4 border-yellow-400 shadow-2xl z-50 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-yellow-100 border-b-2 border-yellow-300 p-4">
          <div className="flex items-center justify-between">
            <h3 className={`font-bold text-yellow-900 ${large ? 'text-xl' : 'text-lg'}`}>
              📝 Sticky Notes
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-yellow-200 hover:bg-yellow-300 flex items-center justify-center text-yellow-800 text-lg font-bold transition-colors"
              aria-label="Close notes"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-yellow-700 mt-1">
            Row {rowId} • {notes.length} note{notes.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {notes.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">📋</div>
              <p className="text-gray-600">No notes yet</p>
              {canAddNote && (
                <p className="text-sm text-gray-500 mt-1">
                  Add your first note below
                </p>
              )}
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className="bg-yellow-200 border-l-4 border-yellow-500 rounded-r-lg p-3 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {note.kind === 'text' ? (
                      <p className="text-gray-800 whitespace-pre-wrap">
                        {note.body}
                      </p>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">🎤</span>
                        <span className="text-gray-700">Voice note</span>
                        {/* In a real implementation, you'd add audio playback here */}
                      </div>
                    )}
                  </div>
                  {canAddNote && (
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="ml-2 w-6 h-6 rounded-full bg-red-200 hover:bg-red-300 flex items-center justify-center text-red-700 text-sm font-bold transition-colors"
                      aria-label="Delete note"
                      title="Delete note"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
                  <span>{formatTimestamp(note.ts)}</span>
                  <span className="capitalize">{note.userRole}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add note section */}
        {canAddNote && (
          <div className="border-t-2 border-yellow-300 bg-yellow-100 p-4">
            <div className="space-y-3">
              <textarea
                id="sticky-note-input"
                name="sticky-note-input"
                ref={textareaRef}
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Add a note..."
                className="w-full h-20 p-3 border border-yellow-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-yellow-500 text-base"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    addTextNote();
                  }
                }}
              />

              <div className="flex items-center space-x-2">
                <button
                  onClick={addTextNote}
                  disabled={!newNoteText.trim() || isLoading}
                  className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-lg font-medium hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:ring-2 focus:ring-yellow-400"
                >
                  {isLoading ? '⏳ Saving...' : '📝 Add Note'}
                </button>

                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isLoading}
                  className={`
                    px-4 py-2 rounded-lg font-medium transition-colors focus:ring-2
                    ${isRecording
                      ? 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-400'
                      : 'bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-400'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                  title={isRecording ? 'Stop recording' : 'Start voice note'}
                >
                  {isRecording ? '⏹️ Stop' : '🎤 Voice'}
                </button>
              </div>

              <p className="text-xs text-yellow-700">
                Ctrl+Enter to quickly add text note
              </p>
            </div>
          </div>
        )}

        {!canAddNote && (
          <div className="border-t-2 border-yellow-300 bg-yellow-50 p-4 text-center">
            <p className="text-sm text-gray-600">
              You need commenter or reviewer access to add notes
            </p>
          </div>
        )}
      </div>
    </>
  );
}

export function StickyNoteIndicator({
  noteCount,
  onClick,
  large = false,
}: {
  noteCount: number;
  onClick: () => void;
  large?: boolean;
}) {
  if (noteCount === 0) return null;

  const size = large ? 'w-8 h-8 text-lg' : 'w-6 h-6 text-sm';

  return (
    <button
      onClick={onClick}
      className={`
        ${size} rounded-full bg-yellow-400 text-yellow-900 font-bold
        flex items-center justify-center shadow-lg hover:bg-yellow-500
        transition-all duration-200 hover:scale-110
        focus:ring-2 focus:ring-yellow-300
      `}
      title={`${noteCount} note${noteCount !== 1 ? 's' : ''}`}
      aria-label={`View ${noteCount} note${noteCount !== 1 ? 's' : ''}`}
    >
      {noteCount}
    </button>
  );
}