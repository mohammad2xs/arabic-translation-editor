import { NextResponse } from 'next/server'
import { Document, Packer, Paragraph } from 'docx'
import { loadParallelDataset } from '../../../lib/data/parallel'

function buildTextExport(rows: string[], delimiter = '\n\n'): string {
  return rows.filter(Boolean).join(delimiter)
}

function buildMarkdownExport(rows: { rowId: string; text: string }[]): string {
  return rows
    .map(row => `### ${row.rowId}\n\n${row.text || '_[Translation pending]_'}`)
    .join('\n\n')
}

async function buildDocxExport(rows: { rowId: string; text: string }[]): Promise<Uint8Array> {
  const paragraphs = rows.flatMap(row => {
    const children: Paragraph[] = []
    children.push(new Paragraph({ text: row.rowId, heading: 'Heading3' }))
    if (row.text) {
      const lines = row.text.split(/\n+/)
      lines.forEach(line => {
        children.push(new Paragraph({ text: line }))
      })
    } else {
      children.push(new Paragraph({ text: '[Translation pending]' }))
    }
    children.push(new Paragraph({ text: '' }))
    return children
  })

  const document = new Document({
    sections: [
      {
        children: paragraphs
      }
    ]
  })

  const buffer = await Packer.toBuffer(document)
  return new Uint8Array(buffer)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const format = (searchParams.get('format') ?? 'txt').toLowerCase()
  const dataset = await loadParallelDataset()
  const targetRows = dataset.rows.map(row => ({ rowId: row.rowId, text: row.tgtText }))

  switch (format) {
    case 'txt': {
      const content = buildTextExport(targetRows.map(row => row.text))
      return new Response(content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="target.txt"'
        }
      })
    }
    case 'md': {
      const markdown = buildMarkdownExport(targetRows)
      return new Response(markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': 'attachment; filename="target.md"'
        }
      })
    }
    case 'docx': {
      const buffer = await buildDocxExport(targetRows)
      const payload = buffer.slice().buffer
      return new Response(payload, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': 'attachment; filename="target.docx"'
        }
      })
    }
    case 'json': {
      return new Response(JSON.stringify(dataset.segments, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="aligned.json"'
        }
      })
    }
    default:
      return NextResponse.json({ error: 'Unsupported export format' }, { status: 400 })
  }
}
