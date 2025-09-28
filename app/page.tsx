'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the tri page
    router.push('/tri');
  }, [router]);

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