'use client';

import { useState, useEffect } from 'react';

interface OnboardingCoachProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  isDadMode?: boolean;
}

interface OnboardingStep {
  id: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  features: Array<{
    feature: string;
    featureAr: string;
    shortcut?: string;
  }>;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'dad-mode',
    title: 'Dad-Mode Interface',
    titleAr: 'واجهة وضع الأبوة',
    description: 'This editor is designed with senior-friendly features for comfortable translation work.',
    descriptionAr: 'صُمم هذا المحرر بميزات صديقة للكبار من أجل عمل ترجمة مريح.',
    icon: '👓',
    features: [
      { feature: 'Large, clear text and buttons for easy reading', featureAr: 'نص وأزرار كبيرة وواضحة لقراءة سهلة' },
      { feature: 'High-contrast colors and simplified layouts', featureAr: 'ألوان عالية التباين وتخطيطات مبسطة' },
      { feature: 'Reduced visual clutter and distractions', featureAr: 'تقليل الفوضى البصرية والإلهاءات' },
      { feature: 'Touch-friendly controls for tablets', featureAr: 'عناصر تحكم صديقة للمس للأجهزة اللوحية' },
      { feature: 'Simple, intuitive navigation patterns', featureAr: 'أنماط تنقل بسيطة وبديهية' },
    ],
  },
  {
    id: 'assistant',
    title: 'AI Translation Assistant',
    titleAr: 'مساعد الترجمة الذكي',
    description: 'Your intelligent helper for improving translation quality and catching issues.',
    descriptionAr: 'مساعدك الذكي لتحسين جودة الترجمة واكتشاف المشاكل.',
    icon: '🤖',
    features: [
      { feature: 'Smart suggestions for clarity and flow', featureAr: 'اقتراحات ذكية للوضوح والتدفق' },
      { feature: 'Automatic detection of grammar issues', featureAr: 'كشف تلقائي لمشاكل القواعد' },
      { feature: 'Scripture reference validation', featureAr: 'التحقق من مراجع الكتاب المقدس' },
      { feature: 'Voice input for hands-free editing', featureAr: 'إدخال صوتي للتحرير بدون استخدام اليدين' },
      { feature: 'Context-aware translation improvements', featureAr: 'تحسينات ترجمة حساسة للسياق' },
    ],
  },
  {
    id: 'workflow',
    title: 'Efficient Workflow',
    titleAr: 'سير عمل فعال',
    description: 'Professional tools designed to streamline your translation process.',
    descriptionAr: 'أدوات احترافية مصممة لتبسيط عملية الترجمة الخاصة بك.',
    icon: '⚡',
    features: [
      { feature: 'Command palette (⌘K) for quick actions', featureAr: 'لوحة الأوامر (⌘K) للإجراءات السريعة', shortcut: '⌘K' },
      { feature: 'Issues queue highlighting problem areas', featureAr: 'قائمة انتظار المشاكل تبرز المناطق المشكلة' },
      { feature: 'Progress tracking and approval system', featureAr: 'تتبع التقدم ونظام الموافقة' },
      { feature: 'Real-time preview with audio playback', featureAr: 'معاينة في الوقت الفعلي مع تشغيل الصوت' },
      { feature: 'Keyboard shortcuts for power users', featureAr: 'اختصارات لوحة المفاتيح للمستخدمين المتقدمين' },
    ],
  },
];

export default function OnboardingCoach({
  isOpen,
  onClose,
  onComplete,
  isDadMode = false,
}: OnboardingCoachProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  // Check if user has already seen onboarding
  useEffect(() => {
    const seen = localStorage.getItem('translation-editor-onboarding-seen');
    setHasSeenOnboarding(!!seen);
  }, []);

  // Save onboarding completion
  const handleComplete = () => {
    localStorage.setItem('translation-editor-onboarding-seen', 'true');
    setHasSeenOnboarding(true);
    onComplete();
    onClose();
  };

  // Skip onboarding
  const handleSkip = () => {
    localStorage.setItem('translation-editor-onboarding-seen', 'true');
    setHasSeenOnboarding(true);
    onClose();
  };

  // Reset onboarding (for testing)
  const handleReset = () => {
    localStorage.removeItem('translation-editor-onboarding-seen');
    setHasSeenOnboarding(false);
    setCurrentStep(0);
  };

  // Navigation
  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Don't show if already seen onboarding and not explicitly opened
  if (!isOpen || (hasSeenOnboarding && !isOpen)) {
    return null;
  }

  const currentStepData = ONBOARDING_STEPS[currentStep];
  if (!currentStepData) {
    return null;
  }
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <div className="onboarding-header">
          <h1 className="onboarding-title">
            Welcome to the Translation Editor • مرحباً بك في محرر الترجمة
          </h1>
          <p className="onboarding-subtitle">
            Let's get you started with a quick tour of the key features • دعنا نبدأ بجولة سريعة على الميزات الرئيسية
          </p>
        </div>

        <div className="onboarding-cards">
          <div className="onboarding-card">
            <h3 className="onboarding-card-title">
              <span className="text-3xl mr-3">{currentStepData.icon}</span>
              {currentStepData.title} • {currentStepData.titleAr}
            </h3>
            <p className="onboarding-card-description">
              {currentStepData.description}
            </p>
            <p className="onboarding-card-description text-gray-600 mt-2" style={{direction: 'rtl'}}>
              {currentStepData.descriptionAr}
            </p>

            <ul className="mt-4 space-y-3">
              {currentStepData.features.map((feature, index) => (
                <li key={index} className="flex flex-col gap-2">
                  <div className="flex items-start gap-3">
                    <span className="text-green-500 mt-1 flex-shrink-0">✓</span>
                    <div className="flex-1">
                      <span className="text-gray-700">{feature.feature}</span>
                      {feature.shortcut && (
                        <span className="ml-2 px-2 py-1 bg-gray-100 rounded text-xs font-mono text-gray-600">
                          {feature.shortcut}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mr-6 text-gray-600 text-sm" style={{direction: 'rtl'}}>
                    {feature.featureAr}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="flex justify-center gap-2 mb-6">
          {ONBOARDING_STEPS.map((_, index) => (
            <button
              type="button"
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`w-3 h-3 rounded-full transition-colors ${
                index === currentStep
                  ? 'bg-blue-500'
                  : index < currentStep
                  ? 'bg-green-500'
                  : 'bg-gray-300'
              }`}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>

        <div className="onboarding-actions">
          <button
            type="button"
            onClick={handleSkip}
            className="onboarding-button"
            aria-label="Skip onboarding"
          >
            Skip Tour
          </button>

          {currentStep > 0 && (
            <button
              onClick={handlePrev}
              className="onboarding-button"
            >
              Previous
            </button>
          )}

          <button
            onClick={handleNext}
            className="onboarding-button primary"
          >
            {isLastStep ? 'Get Started' : 'Next'}
          </button>
        </div>

        {/* Dad-Mode specific message */}
        {isDadMode && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-2xl">👓</span>
              <div>
                <div className="font-medium text-blue-800">Dad-Mode Active</div>
                <div className="text-blue-600 text-sm">
                  Interface optimized for comfortable reading and easy navigation
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Development helper */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-3 bg-gray-100 border border-gray-300 rounded text-sm">
            <div className="font-medium text-gray-700 mb-2">Development Tools</div>
            <button
              onClick={handleReset}
              className="text-blue-600 underline hover:no-underline text-xs"
            >
              Reset Onboarding (for testing)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
