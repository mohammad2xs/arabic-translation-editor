// Issues API Route - Handles quality gate detection and issue reporting
// For Arabic Translation Editor

import { NextRequest, NextResponse } from 'next/server';

export interface Issue {
  id: string;
  rowId: number;
  type: 'lpr' | 'coverage' | 'scripture' | 'notes';
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  severity: 'low' | 'medium' | 'high';
  context?: {
    originalText?: string;
    enhancedText?: string;
    expectedLength?: number;
    actualLength?: number;
    missingConcepts?: string[];
    scriptureRef?: string;
  };
  suggestions?: string[];
  autoFixable?: boolean;
  createdAt: string;
  resolvedAt?: string;
}

// Mock issue database for demo purposes
// In production, this would connect to your actual database
const generateMockIssues = (sectionId: string): Issue[] => {
  const baseIssues: Omit<Issue, 'id' | 'createdAt'>[] = [
    {
      rowId: 12,
      type: 'lpr',
      title: 'Low Length Preservation Ratio',
      titleAr: 'نسبة منخفضة لحفظ الطول',
      description: 'Arabic translation is 35% shorter than expected. Target: 80-120% of original.',
      descriptionAr: 'الترجمة العربية أقصر بنسبة 35% من المتوقع. الهدف: 80-120% من النص الأصلي.',
      severity: 'high',
      context: {
        originalText: 'This comprehensive analysis reveals fundamental insights...',
        enhancedText: 'هذا التحليل يكشف...',
        expectedLength: 45,
        actualLength: 15
      },
      suggestions: [
        'Expand key concepts for better clarity',
        'Add explanatory phrases common in Arabic',
        'Consider using parallel structures'
      ],
      autoFixable: false
    },
    {
      rowId: 28,
      type: 'coverage',
      title: 'Missing Semantic Coverage',
      titleAr: 'تغطية دلالية مفقودة',
      description: 'Key concept "covenant" not adequately expressed in Arabic translation.',
      descriptionAr: 'المفهوم الرئيسي "العهد" غير معبر عنه بشكل كافٍ في الترجمة العربية.',
      severity: 'medium',
      context: {
        originalText: 'The covenant between God and humanity...',
        enhancedText: 'الاتفاق بين الله والإنسانية...',
        missingConcepts: ['covenant', 'sacred bond', 'divine promise']
      },
      suggestions: [
        'Use "العهد" instead of "الاتفاق"',
        'Add explanatory phrase about sacred nature',
        'Consider theological implications'
      ],
      autoFixable: true
    },
    {
      rowId: 34,
      type: 'scripture',
      title: 'Unverified Scripture Reference',
      titleAr: 'مرجع كتابي غير محقق',
      description: 'Reference to "Psalm 23:1" needs verification against Arabic biblical text.',
      descriptionAr: 'المرجع إلى "مزمور 23:1" يحتاج للتحقق مقابل النص الكتابي العربي.',
      severity: 'medium',
      context: {
        scriptureRef: 'Psalm 23:1',
        originalText: 'As the psalmist declares in Psalm 23:1...',
        enhancedText: 'كما يعلن المرنم في مزمور 23:1...'
      },
      suggestions: [
        'Verify with Arabic Van Dyke translation',
        'Check verse numbering differences',
        'Ensure proper citation format'
      ],
      autoFixable: false
    },
    {
      rowId: 45,
      type: 'notes',
      title: 'Cultural Adaptation Note',
      titleAr: 'ملاحظة التكيف الثقافي',
      description: 'Reviewer flagged need for cultural context explanation.',
      descriptionAr: 'المراجع أشار إلى الحاجة لشرح السياق الثقافي.',
      severity: 'low',
      context: {
        originalText: 'Breaking bread together as a community...',
        enhancedText: 'كسر الخبز معاً كمجتمع...'
      },
      suggestions: [
        'Add note about Middle Eastern hospitality customs',
        'Explain significance of shared meals',
        'Reference cultural parallels'
      ],
      autoFixable: false
    },
    {
      rowId: 52,
      type: 'lpr',
      title: 'Excessive Length Expansion',
      titleAr: 'توسع مفرط في الطول',
      description: 'Arabic translation is 150% longer than original. May indicate over-explanation.',
      descriptionAr: 'الترجمة العربية أطول بنسبة 150% من الأصلية. قد تشير إلى إفراط في الشرح.',
      severity: 'medium',
      context: {
        expectedLength: 30,
        actualLength: 75
      },
      suggestions: [
        'Condense verbose explanations',
        'Remove redundant phrases',
        'Use more concise Arabic expressions'
      ],
      autoFixable: false
    },
    {
      rowId: 67,
      type: 'coverage',
      title: 'Theological Term Inconsistency',
      titleAr: 'عدم اتساق المصطلح اللاهوتي',
      description: 'Term "salvation" translated differently across sections. Consistency needed.',
      descriptionAr: 'مصطلح "الخلاص" مترجم بشكل مختلف عبر الأقسام. الاتساق مطلوب.',
      severity: 'high',
      context: {
        missingConcepts: ['salvation consistency', 'theological terminology']
      },
      suggestions: [
        'Standardize on "الخلاص" throughout',
        'Create terminology glossary',
        'Review all theological terms'
      ],
      autoFixable: true
    }
  ];

  // Generate IDs and timestamps
  return baseIssues.map((issue, index) => ({
    ...issue,
    id: `${sectionId}-issue-${index + 1}`,
    createdAt: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString() // Random time in last week
  }));
};

// Simulate quality gate analysis
const analyzeQualityGates = async (sectionId: string, filters?: {
  type?: Issue['type'];
  severity?: Issue['severity'];
  resolved?: boolean;
}) => {
  // In production, this would:
  // 1. Fetch translation data from database
  // 2. Run LPR analysis on Arabic vs original text
  // 3. Check semantic coverage using AI models
  // 4. Validate scripture references against biblical databases
  // 5. Retrieve reviewer notes and comments

  let issues = generateMockIssues(sectionId);

  // Apply filters
  if (filters?.type) {
    issues = issues.filter(issue => issue.type === filters.type);
  }

  if (filters?.severity) {
    issues = issues.filter(issue => issue.severity === filters.severity);
  }

  if (filters?.resolved !== undefined) {
    issues = issues.filter(issue =>
      filters.resolved ? !!issue.resolvedAt : !issue.resolvedAt
    );
  }

  return issues;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const sectionId = searchParams.get('section') || 'default';
    const type = searchParams.get('type') as Issue['type'] | null;
    const severity = searchParams.get('severity') as Issue['severity'] | null;
    const resolved = searchParams.get('resolved') === 'true' ? true :
                    searchParams.get('resolved') === 'false' ? false : undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Analyze quality gates and get issues
    const allIssues = await analyzeQualityGates(sectionId, {
      type: type || undefined,
      severity: severity || undefined,
      resolved
    });

    // Apply pagination
    const paginatedIssues = allIssues.slice(offset, offset + limit);

    // Calculate summary statistics
    const summary = {
      total: allIssues.length,
      byType: {
        lpr: allIssues.filter(i => i.type === 'lpr').length,
        coverage: allIssues.filter(i => i.type === 'coverage').length,
        scripture: allIssues.filter(i => i.type === 'scripture').length,
        notes: allIssues.filter(i => i.type === 'notes').length
      },
      bySeverity: {
        high: allIssues.filter(i => i.severity === 'high').length,
        medium: allIssues.filter(i => i.severity === 'medium').length,
        low: allIssues.filter(i => i.severity === 'low').length
      },
      resolved: allIssues.filter(i => i.resolvedAt).length,
      autoFixable: allIssues.filter(i => i.autoFixable).length
    };

    return NextResponse.json({
      success: true,
      issues: paginatedIssues,
      summary,
      pagination: {
        limit,
        offset,
        total: allIssues.length,
        hasMore: offset + limit < allIssues.length
      }
    });

  } catch (error) {
    console.error('Issues API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch issues',
        errorAr: 'فشل في جلب المشاكل'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, issueId, sectionId, data } = body;

    switch (action) {
      case 'resolve':
        // In production: update issue status in database
        return NextResponse.json({
          success: true,
          message: 'Issue marked as resolved',
          messageAr: 'تم وضع علامة على المشكلة كمحلولة',
          issueId,
          resolvedAt: new Date().toISOString()
        });

      case 'auto-fix':
        // In production: apply automatic fix if available
        return NextResponse.json({
          success: true,
          message: 'Auto-fix applied successfully',
          messageAr: 'تم تطبيق الإصلاح التلقائي بنجاح',
          issueId,
          fixApplied: data?.fixType || 'unknown'
        });

      case 'add-note':
        // In production: add reviewer note to issue
        return NextResponse.json({
          success: true,
          message: 'Note added to issue',
          messageAr: 'تمت إضافة ملاحظة للمشكلة',
          issueId,
          note: data?.note
        });

      case 'reanalyze':
        // In production: trigger fresh quality gate analysis
        const freshIssues = await analyzeQualityGates(sectionId);
        return NextResponse.json({
          success: true,
          message: 'Quality gates reanalyzed',
          messageAr: 'تم إعادة تحليل بوابات الجودة',
          issuesFound: freshIssues.length
        });

      default:
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid action',
            errorAr: 'إجراء غير صالح'
          },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Issues API POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process request',
        errorAr: 'فشل في معالجة الطلب'
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}