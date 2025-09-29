'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function HomeRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check for mode and UI preference params
    const mode = searchParams.get('mode');
    const dad = searchParams.get('dad');
    const present = searchParams.get('present');

    // Build redirect URL
    let redirectUrl = '/tri';

    // If dad mode is explicitly requested, redirect to dad page
    if (dad === '1' || mode === 'dad') {
      redirectUrl = '/dad';
      const params = new URLSearchParams();
      if (present === '1') params.set('present', '1');
      if (params.toString()) {
        redirectUrl += '?' + params.toString();
      }
    } else if (mode === 'reader' || mode === 'compare' || mode === 'focus') {
      // Redirect to tri page with mode params
      const params = new URLSearchParams();
      params.set('mode', mode);
      if (present === '1') params.set('present', '1');
      redirectUrl = '/tri?' + params.toString();
    } else {
      // Default redirect to tri page
      redirectUrl = '/tri';
    }

    router.push(redirectUrl);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-2xl font-bold text-gray-900 mb-4">
          📖 Al-Insān Translation Editor
        </div>
        <div className="text-gray-600 mb-6">
          Redirecting to the translation interface...
        </div>
        <div className="text-sm text-gray-500">
          If you're not redirected automatically,
          <a href="/tri" className="text-blue-600 hover:text-blue-800 ml-1">
            click here
          </a>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 mb-4">
            📖 Al-Insān Translation Editor
          </div>
          <div className="text-gray-600">Loading...</div>
        </div>
      </div>
    }>
      <HomeRedirect />
    </Suspense>
  );
}