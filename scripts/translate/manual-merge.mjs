#!/usr/bin/env node

/**
 * Manual Translation Merger - Direct ID-based mapping
 * Applies the 20 completed translations directly to the parallel dataset
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PARALLEL_PATH = path.join(PROJECT_ROOT, '.cache/parallel.jsonl')
const BACKUP_DIR = path.join(PROJECT_ROOT, '.cache/backups')

// Manual mapping of exact IDs to their translations
const TRANSLATIONS = {
  "outputs-tmp-rows-S072-009-json:0000#2": "And Allah Almighty has pointed to this divine secret in Surat Fussilat in verse 44, and the entire surah was named with this name because of this great verse that shows that this القرآن is detailed guidance and light for believing hearts, and that this القرآن addresses hearts entrusted with the covenant that Allah deposited in them. Thus the verse of Fussilat comes to answer those who make excuses and arguments for themselves that this القرآن was not revealed in their language and they cannot understand it, to teach us that the language of the القرآن is the language of hearts. The Almighty says: \"And if We had made it a foreign Qur'an, they would have said, 'Why are its verses not explained in detail? Is it a foreign [recitation] and an Arab [messenger]?' Say, 'It is, for those who believe, a guidance and cure. But those who do not believe - in their ears is deafness, and it is upon them blindness. Those are being called from a distant place.'\" (41:44). That is, this القرآن is detailed to be guidance and healing for those who believe (whether Arab or non-Arab), and those who do not believe, upon them is blindness (whether Arab or non-Arab). For it is light that shines in the heart, not needing a special language to address minds and hearing with its tongue, but with a tongue that hearts hear and understand and find rest and tranquility in. In this القرآن is light that illuminates believing hearts with the covenant between them and their Lord, when their Lord said to them, \"Am I not your Lord?\" So they said, \"Yes.\"",

  "outputs-tmp-rows-S063-024-json:0000#2": "And that we should not walk on earth arrogantly or proudly with what we have of knowledge, wealth, or power. Allah Almighty says to the strutting and arrogant: \"Indeed, you will never tear the earth [apart], and you will never reach the mountains in height\" (17:37). That is, know that Allah has created one who is stronger than you in creation and greater in status. Your strength and power cannot tear the earth apart, for one movement from it would end all your dominion and power over it.",

  "outputs-tmp-rows-S063-021-json:0000#2": "Livelihood earnings do not indicate cognitive superiority in all cases and circumstances, for a person may carry humanitarian ideas and lofty feelings while his pockets are empty of money.",

  "outputs-tmp-rows-S061-007-json:0000#1": "Regarding the people of نوح: Allah Almighty says that نوح remained among his people for a thousand years minus fifty, calling them to Allah, but they persisted and were arrogant in their arrogance and did not believe. Allah Almighty says about نوح: \"He said, 'My Lord, indeed I invited my people [to truth] night and day. But my invitation increased them not except in flight. And indeed, every time I invited them that You may forgive them, they put their fingers in their ears, covered themselves with their garments, persisted, and were arrogant with [great] arrogance'\" (71:5-7). They refused out of arrogance toward the weak and poor who believed with نوح. How could they follow what their weak and poor had followed? So they said arrogantly, in Surat Ash-Shu'ara (26:111-116): \"They said, 'Should we believe you while you are followed by the lowest [class of people]?' He said, 'And what is my knowledge of what they used to do? Their account is only with my Lord, if you [could] perceive.'\" And regarding the people of شعيب: Allah said in Al-A'raf verse 88: \"Said the eminent ones who were arrogant among his people, 'We will surely evict you, O شعيب, and those who have believed with you from our city, or you must return to our religion.' He said, 'Even if we were unwilling?'\" And regarding the people of فرعون: Allah said in Surat Yunus 75: \"Then We sent after them موسى and هارون to فرعون and his establishment with Our signs, but they were arrogant and were a criminal people.\" And in Surat Al-Qasas (28:39): \"And he was arrogant, he and his soldiers, in the land, without right, and they thought that they would not be returned to Us.\" And in Al-Ankabut (29:39): \"And قارون and فرعون and هامان. And certainly موسى came to them with clear proofs, but they were arrogant in the land, and they were not outrunners [of Our punishment].\" And Surat Al-A'raf (7:132-135) shows their stubbornness, persistence, and arrogance despite all the clear proofs and signs that came to them: \"And they said, 'No matter what sign you bring us to bewitch us with, we will not be believers in you.' So We sent upon them the flood and locusts and lice and frogs and blood as distinct signs, but they were arrogant and were a criminal people.\" Thus the القرآن tells us of the arrogance of بني إسرائيل toward the seal of messengers محمد ﷺ, when the truth came to them which they recognized as they recognize their own sons, but they denied what they knew out of arrogance, superiority, and envy.",

  "outputs-tmp-rows-S061-007-json:0000#2": "Allah says in Surat Al-Baqarah verses 87-90: \"And We did certainly give موسى the Torah and followed up after him with messengers. And We gave عيسى, the son of مريم, clear proofs and supported him with the Pure Spirit. But is it [not] that every time a messenger came to you, [O Children of Israel], with what your souls did not desire, you were arrogant? And a party [of messengers] you denied and another party you killed. And they said, 'Our hearts are wrapped.' But, [in fact], Allah has cursed them for their disbelief, so little do they believe. And when there came to them a Book from Allah confirming that which was with them - although before they used to pray for victory against those who disbelieved - but when there came to them that which they recognized, they disbelieved in it; so the curse of Allah will be upon the disbelievers. How wretched is that for which they sold themselves - that they would disbelieve in what Allah has revealed through [their] outrage that Allah would reveal His favor upon whom He wills from among His servants. So they returned having [earned] wrath upon wrath. And for the disbelievers is a humiliating punishment.\"",

  "outputs-tmp-rows-S060-016-json:0000#2": "Delusion is the cause of arrogance and haughtiness.",

  "outputs-tmp-rows-S030-001-json:0000#2": "And whoever Allah has not made light for, there is no light for him.",

  "outputs-tmp-rows-S029-001-json:0000#2": "Then Allah shows us the condition of those immersed in disbelief and misguidance, and He says: \"But those who disbelieved - their deeds are like a mirage in a lowland which a thirsty one thinks is water until, when he comes to it, he finds it is nothing but finds Allah before Him, and He will pay him in full his due; and Allah is swift in account\" (24:39).",

  "outputs-tmp-rows-S027-018-json:0000#2": "Because guidance is in Allah's hand alone.",

  "outputs-tmp-rows-S025-007-json:0000#2": "However, this light - \"Allah's word and His القرآن\" - when it touches hardened hearts, those in which the oil of innate nature has been corrupted, it does not shine or kindle. This is in confirmation of His saying: \"Allah is the ally of those who believe. He takes them out of darknesses into the light. But those who disbelieve - their allies are the طاغوت. They take them out of the light into darknesses. Those are the companions of the Fire; they will abide eternally therein\" (2:257). So the hearts of Allah's allies are illuminated by Allah with His light, and He removes from them the darkness that clung to them, so they become illuminated with their Lord's light and become themselves a source of radiant light for Allah's word and His light.",

  "outputs-tmp-rows-S025-002-json:0000#2": "The verses of the القرآن have been detailed for the hearts of believers as a garment is tailored for its wearer. It addresses hearts in their language. Therefore, we see those believing hearts drawing from its lights each day a new light that illuminates for them darknesses they were living in and removes their veils. It is the healing cure for hearts that have no blindness in them, and it is light for people of understanding, as Allah said: \"Only those of understanding will remember\" (2:269). It is guidance and clear light.",

  "outputs-tmp-rows-S025-002-json:0000#3": "The noble القرآن is like a brilliant star in its clarity, explanation, and miraculous nature. No light, sign, or explanation can match it.",

  "outputs-tmp-rows-S022-007-json:0000#2": "He hastens in seeking what he wants and desires, having no patience for what he seeks. This haste may lead him to destruction, as Allah said in Surat Al-Isra: \"And man supplicates for evil as he supplicates for good, and man is ever hasty\" (17:11). That is, he calls upon Allah hastily for the fulfillment of what appears to him and he considers good, but his haste in seeking what he thinks and considers good leads him to seek evil for himself, so he calls for evil thinking it is good.",

  "outputs-tmp-rows-S022-007-json:0000#3": "Allah has shown us that man is capable of overcoming these traits - of weakness, lack of patience, haste, and ingratitude - and he can correct their course, straighten their crookedness, and escape their destructions if he is upright and follows Allah's straight path. He said: \"By the fig and the olive. And [by] Mount Sinai. And [by] this secure city [Mecca]. We have certainly created man in the best of stature. Then We return him to the lowest of the low, except for those who believe and do righteous deeds, for they will have a reward uninterrupted\" (95:1-6). Allah has sworn here by what He created of fig and olive, both of which are among Allah's blessings that help in straightening and reforming man's body, that He created man in the best formation and constitution, with what He placed in him of sound innate nature that recognizes its Lord and Creator, and with what his humanity was characterized by of Allah's noble attributes. Then Allah swears by the stages of man's creation and in the years of his moral and ethical development.",

  "outputs-tmp-rows-S022-007-json:0000#4": "And He who made him in the best constitution in bodily creation and spiritual creation, and who favored him with this creation over much of what He created with great favor.",

  "outputs-tmp-rows-S014-008-json:0000#2": "(And Allah knows best.)",

  "outputs-tmp-rows-S013-004-json:0000#2": "Reconciliation may occur between the two ministers - the head and the heart - and that is when the sight of the mind perceives through the insight of the heart. Since the foundation of the mind's sight is the brain which is in the head, whichever of the two rulers prevails, the two ministers follow him.",

  "outputs-tmp-rows-S012-005-json:0000#2": "When desire overcomes and controls the soul and takes hold of its reins, then the battle becomes more intense and stronger, requiring spiritual weapons and divine cognitive equipment in that battle, so that the spirit can liberate the soul from this possession and enslavement. Allah says: \"And strive for Allah with the striving due to Him\" (22:78).",

  "outputs-tmp-rows-S005-001-json:0000#3": "from the early and later scholars.",

  "outputs-tmp-rows-S004-024-json:0000#2": "Thus everything around us has two faces for use, subjugated for either good or evil. Everything around us - from things made by our hands like cars, television, telephone, internet, etc., and everything that exists on earth in its land and sea, its surface and interior - we can use either for good or for evil, so that the test of man is completed, for whom Allah has subjugated everything on this earth."
}

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(BACKUP_DIR, `parallel.${timestamp}.jsonl`)

  await fs.mkdir(BACKUP_DIR, { recursive: true })
  await fs.copyFile(PARALLEL_PATH, backupPath)

  console.log(`[manual-merge] Backup created: ${path.relative(PROJECT_ROOT, backupPath)}`)
  return backupPath
}

async function manualMerge() {
  const backupPath = await createBackup()

  const content = await fs.readFile(PARALLEL_PATH, 'utf8')
  const lines = content.split('\n').filter(Boolean)
  let mergedCount = 0

  const updatedLines = []

  for (const line of lines) {
    try {
      const segment = JSON.parse(line)

      if (TRANSLATIONS[segment.id] && (!segment.tgt || segment.tgt.trim().length < 10)) {
        // Apply manual translation
        segment.tgt = TRANSLATIONS[segment.id]
        segment.status = 'reviewed'
        segment.lengthRatio = Number((segment.tgt.length / Math.max(segment.src.length, 1)).toFixed(3))

        // Add metadata
        segment.metadata = segment.metadata || {}
        segment.metadata.translatedBy = 'claude-opus'
        segment.metadata.translatedAt = new Date().toISOString()
        segment.metadata.styleProfile = 'auto-derived-v1'

        mergedCount++
        console.log(`[manual-merge] Applied translation for ${segment.id}`)
      }

      updatedLines.push(JSON.stringify(segment))
    } catch (parseError) {
      updatedLines.push(line)
    }
  }

  const updatedContent = updatedLines.join('\n') + '\n'
  await fs.writeFile(PARALLEL_PATH, updatedContent, 'utf8')

  console.log(`[manual-merge] Summary:`)
  console.log(`  Backup: ${path.relative(PROJECT_ROOT, backupPath)}`)
  console.log(`  Translations applied: ${mergedCount}/${Object.keys(TRANSLATIONS).length}`)

  return { mergedCount, translationsTotal: Object.keys(TRANSLATIONS).length, backupPath }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  manualMerge().catch(error => {
    console.error('[manual-merge] Failed:', error.message)
    process.exitCode = 1
  })
}

export { manualMerge }