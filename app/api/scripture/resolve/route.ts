import { NextRequest, NextResponse } from 'next/server';

export const dynamic = "force-dynamic" as const;

interface ScriptureReference {
  reference: string;
  type: 'quran' | 'hadith';
  surah?: number;
  ayah?: number;
  arabic: string;
  english: string;
  metadata: {
    surahName?: string;
    surahNameEn?: string;
    revelationType?: 'meccan' | 'medinan';
    collection?: string;
    narrator?: string;
    grading?: string;
  };
}

const localScriptureDB: Record<string, ScriptureReference> = {
  '2:30': {
    reference: '2:30',
    type: 'quran',
    surah: 2,
    ayah: 30,
    arabic: 'وَإِذْ قَالَ رَبُّكَ لِلْمَلَائِكَةِ إِنِّي جَاعِلٌ فِي الْأَرْضِ خَلِيفَةً ۖ قَالُوا أَتَجْعَلُ فِيهَا مَن يُفْسِدُ فِيهَا وَيَسْفِكُ الدِّمَاءَ وَنَحْنُ نُسَبِّحُ بِحَمْدِكَ وَنُقَدِّسُ لَكَ ۖ قَالَ إِنِّي أَعْلَمُ مَا لَا تَعْلَمُونَ',
    english: 'And when your Lord said to the angels, "Indeed, I will make upon the earth a successor." They said, "Will You place upon it one who causes corruption therein and sheds blood, while we declare Your praise and sanctify You?" Allah said, "Indeed, I know that which you do not know."',
    metadata: {
      surahName: 'البقرة',
      surahNameEn: 'Al-Baqarah',
      revelationType: 'medinan'
    }
  },
  '5:2': {
    reference: '5:2',
    type: 'quran',
    surah: 5,
    ayah: 2,
    arabic: 'يَا أَيُّهَا الَّذِينَ آمَنُوا لَا تُحِلُّوا شَعَائِرَ اللَّهِ وَلَا الشَّهْرَ الْحَرَامَ وَلَا الْهَدْيَ وَلَا الْقَلَائِدَ وَلَا آمِّينَ الْبَيْتَ الْحَرَامَ يَبْتَغُونَ فَضْلًا مِّن رَّبِّهِمْ وَرِضْوَانًا',
    english: 'O you who believe! Do not violate the symbols of Allah, nor the sacred month, nor the offerings, nor the garlands, nor those proceeding to the Sacred House seeking bounty and good pleasure from their Lord.',
    metadata: {
      surahName: 'المائدة',
      surahNameEn: 'Al-Ma\'idah',
      revelationType: 'medinan'
    }
  },
  '2:255': {
    reference: '2:255',
    type: 'quran',
    surah: 2,
    ayah: 255,
    arabic: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ',
    english: 'Allah - there is no deity except Him, the Ever-Living, the Sustainer of existence. Neither drowsiness overtakes Him nor sleep. To Him belongs whatever is in the heavens and whatever is on the earth.',
    metadata: {
      surahName: 'البقرة',
      surahNameEn: 'Al-Baqarah',
      revelationType: 'medinan'
    }
  },
  'bukhari:1': {
    reference: 'bukhari:1',
    type: 'hadith',
    arabic: 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى',
    english: 'Actions are but by intention and every man shall have only that which he intended.',
    metadata: {
      collection: 'Sahih al-Bukhari',
      narrator: 'Umar ibn al-Khattab',
      grading: 'Sahih'
    }
  }
};

function parseReference(ref: string): { type: 'quran' | 'hadith', identifier: string } | null {
  const quranPattern = /^(\d+):(\d+)$/;
  const hadithPattern = /^(bukhari|muslim|tirmidhi|abu-dawud|nasai|ibn-majah):(\d+)$/i;

  if (quranPattern.test(ref)) {
    return { type: 'quran', identifier: ref };
  }

  if (hadithPattern.test(ref)) {
    return { type: 'hadith', identifier: ref.toLowerCase() };
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const reference = request.nextUrl.searchParams.get('ref');

    if (!reference) {
      return NextResponse.json(
        { error: 'Missing reference parameter' },
        { status: 400 }
      );
    }

    const parsed = parseReference(reference);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid reference format' },
        { status: 400 }
      );
    }

    const result = localScriptureDB[parsed.identifier];
    if (!result) {
      return NextResponse.json(
        {
          error: 'Reference not found',
          suggestion: 'Available references: 2:30, 5:2, 2:255, bukhari:1'
        },
        { status: 404 }
      );
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Scripture resolution error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

