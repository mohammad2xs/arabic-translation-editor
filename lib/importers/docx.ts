import mammoth from 'mammoth'

export interface DocxParagraphs {
  paragraphs: string[]
}

function normalizeParagraph(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export async function readDocx(filePath: string): Promise<DocxParagraphs> {
  try {
    const result = await mammoth.extractRawText({ path: filePath })
    const paragraphs = result.value
      .split(/\r?\n\s*\r?\n/g)
      .map(normalizeParagraph)
      .filter(Boolean)

    return { paragraphs }
  } catch (error) {
    throw new Error(`Failed to read DOCX file ${filePath}: ${(error as Error).message}`)
  }
}
