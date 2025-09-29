# Arabic Readability Notes

## Sources Consulted
1. [W3C Arabic Layout Requirements (alreq)](https://www.w3.org/TR/alreq/) — layout, punctuation, and justification rules compiled by the W3C Internationalization Working Group.
2. [Material Design: Language Support — Arabic](https://material.io/design/typography/language-support.html#language-specifics) — Google’s typographic guidance for RTL interfaces and Arabic type families.
3. [TypeTogether: Typography in the Arabic World](https://www.type-together.com/typography-in-the-arabic-world) — practical recommendations from Arabic UI/brand projects (line length, rhythm, preferred font pairings).

## Key Takeaways

### Line Length & Layout
- Aim for **55–70 Arabic glyphs per line** for comfortable reading; longer lines fatigue readers because ligatures and contextual forms extend horizontally. (TypeTogether)
- Preserve generous **inner padding** (2.5–3rem on desktop) to create breathing room for wide glyphs and diacritics. (TypeTogether)
- Use **ragged-left paragraphs** for editorial surfaces; full justification is acceptable only with smart Kashida insertion respecting `alreq` recommendations.

### Base Type & Leading
- Body text reads well at **16 px / 1rem** with **1.6–1.75 line-height**. Increase line-height to 1.8 once Dad Mode or Presentation mode is enabled to offset stacked diacritics. (Material Design, alreq 2.6)
- Choose humanist / neo-grotesk pairings: `'Noto Sans Arabic', 'Tajawal', 'Cairo', 'Amiri', 'Segoe UI', 'Helvetica Neue', sans-serif`. Provide fallbacks that keep metrics similar to avoid jumpiness. (Material Design)

### Punctuation & Spacing
- Arabic punctuation (`،` comma, `؟` question mark, `؛` semicolon) **follows the word with no preceding space**; retain a narrow hair space after punctuation when mixing Latin content. (alreq §4.2)
- Use **Arabic guillemets « »** for quotations with thin spaces inside; avoid Latin quotes unless the surrounding text is entirely Latin. (alreq §4.4)
- When mixing numerals, prefer **Arabic-Indic digits** `٠١٢٣…` for native copy; switch to western numerals contextually (e.g., coordinates) but keep consistent baseline alignment. (alreq §5.1)

### Interface Considerations
- Mirror layout affordances: primary actions right-aligned, progress indicators, and tabs reversed in reading order. Ensure icons with directionality flip for RTL contexts. (Material Design)
- Increase **hit-target height to ≥44 px** and provide 12–16 px gaps between interactive Arabic labels to accommodate descenders. (Material Design)
- For Dad Mode / Presentation mode, raise the base font size to 18–20 px, maintain the 1.7+ line-height, and boost contrast beyond WCAG AA to offset the denser stroke weight of Arabic glyphs. (Material Design, TypeTogether)

