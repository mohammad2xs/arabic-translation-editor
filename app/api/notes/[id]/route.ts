import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { getRoleFromRequest, canAddNotes } from '../../../../lib/dadmode/access';

interface Note {
  id: string;
  ts: string;
  kind: 'text' | 'voice';
  body?: string;
  audioPath?: string;
  by: string;
  userRole: string;
}

interface AddNoteRequest {
  kind: 'text' | 'voice';
  body?: string;
  audioPath?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rowId = params.id;

    if (!rowId) {
      return NextResponse.json(
        { error: 'Row ID is required' },
        { status: 400 }
      );
    }

    const notesDir = join(process.cwd(), 'outputs', 'tmp', 'notes');
    const notesFile = join(notesDir, `${rowId}.json`);

    try {
      const data = await fs.readFile(notesFile, 'utf-8');
      const notes: Note[] = JSON.parse(data);

      return NextResponse.json({
        rowId,
        notes,
        count: notes.length,
      });
    } catch {
      // No notes found
      return NextResponse.json({
        rowId,
        notes: [],
        count: 0,
      });
    }
  } catch (error) {
    console.error('Notes retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve notes' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rowId = params.id;

    if (!rowId) {
      return NextResponse.json(
        { error: 'Row ID is required' },
        { status: 400 }
      );
    }

    // Get user role and check permissions
    const userRole = getRoleFromRequest(request);

    if (!canAddNotes(userRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to add notes' },
        { status: 403 }
      );
    }

    const body: AddNoteRequest = await request.json();

    // Validate request
    if (!body.kind || !['text', 'voice'].includes(body.kind)) {
      return NextResponse.json(
        { error: 'Note kind must be either "text" or "voice"' },
        { status: 400 }
      );
    }

    if (body.kind === 'text' && !body.body) {
      return NextResponse.json(
        { error: 'Text notes must have a body' },
        { status: 400 }
      );
    }

    if (body.kind === 'voice' && !body.audioPath) {
      return NextResponse.json(
        { error: 'Voice notes must have an audioPath' },
        { status: 400 }
      );
    }

    // Ensure notes directory exists
    const notesDir = join(process.cwd(), 'outputs', 'tmp', 'notes');
    await fs.mkdir(notesDir, { recursive: true });

    const notesFile = join(notesDir, `${rowId}.json`);

    // Load existing notes
    let existingNotes: Note[] = [];
    try {
      const data = await fs.readFile(notesFile, 'utf-8');
      existingNotes = JSON.parse(data);
    } catch {
      // File doesn't exist, will create new
    }

    // Create new note
    const newNote: Note = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ts: new Date().toISOString(),
      kind: body.kind,
      body: body.body,
      audioPath: body.audioPath,
      by: `user_${userRole}`, // In production, this would be actual user ID
      userRole,
    };

    // Add note to collection
    existingNotes.push(newNote);

    // Save updated notes
    await fs.writeFile(notesFile, JSON.stringify(existingNotes, null, 2));

    return NextResponse.json({
      success: true,
      note: newNote,
      rowId,
      totalNotes: existingNotes.length,
    });
  } catch (error) {
    console.error('Note creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create note' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rowId = params.id;
    const url = new URL(request.url);
    const noteId = url.searchParams.get('noteId');

    if (!rowId || !noteId) {
      return NextResponse.json(
        { error: 'Row ID and note ID are required' },
        { status: 400 }
      );
    }

    // Get user role and check permissions
    const userRole = getRoleFromRequest(request);

    if (!canAddNotes(userRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to delete notes' },
        { status: 403 }
      );
    }

    const notesFile = join(process.cwd(), 'outputs', 'tmp', 'notes', `${rowId}.json`);

    try {
      const data = await fs.readFile(notesFile, 'utf-8');
      let notes: Note[] = JSON.parse(data);

      // Remove the note
      const originalLength = notes.length;
      notes = notes.filter(note => note.id !== noteId);

      if (notes.length === originalLength) {
        return NextResponse.json(
          { error: 'Note not found' },
          { status: 404 }
        );
      }

      // Save updated notes
      await fs.writeFile(notesFile, JSON.stringify(notes, null, 2));

      return NextResponse.json({
        success: true,
        deletedNoteId: noteId,
        remainingNotes: notes.length,
      });
    } catch {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Note deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete note' },
      { status: 500 }
    );
  }
}