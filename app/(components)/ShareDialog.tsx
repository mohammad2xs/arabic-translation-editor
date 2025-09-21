'use client';

import { useState } from 'react';
import type { UserRole } from '../../lib/dadmode/access';

interface ShareDialogProps {
  currentSection: string;
  onClose: () => void;
}

export default function ShareDialog({
  currentSection,
  onClose,
}: ShareDialogProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>('viewer');
  const [expiryDays, setExpiryDays] = useState(7);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const roleOptions: { value: UserRole; label: string; description: string; icon: string }[] = [
    {
      value: 'viewer',
      label: 'Viewer',
      description: 'Can read and listen to audio only',
      icon: '👁️',
    },
    {
      value: 'commenter',
      label: 'Commenter',
      description: 'Can add notes and comments, no editing',
      icon: '💬',
    },
    {
      value: 'reviewer',
      label: 'Reviewer',
      description: 'Full access to edit, approve, and share',
      icon: '✏️',
    },
  ];

  const expiryOptions = [
    { days: 1, label: '1 day' },
    { days: 3, label: '3 days' },
    { days: 7, label: '1 week' },
    { days: 14, label: '2 weeks' },
    { days: 30, label: '1 month' },
  ];

  const generateLink = async () => {
    setIsGenerating(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiryDays);

      const response = await fetch('/api/share/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: selectedRole,
          expiresAt: expiresAt.toISOString(),
          section: currentSection,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setGeneratedLink(data.link);
      } else {
        const error = await response.json();
        alert(`Failed to generate link: ${error.error}`);
      }
    } catch (error) {
      console.error('Link generation error:', error);
      alert('Failed to generate sharing link. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    if (!generatedLink) return;

    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = generatedLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                📤 Share Translation
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600 text-xl font-bold transition-colors"
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
            <p className="text-gray-600 mt-1">
              Section {currentSection}
            </p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-6">
            {!generatedLink ? (
              <>
                {/* Role Selection */}
                <div>
                  <label className="block text-lg font-medium text-gray-700 mb-3">
                    👤 Access Level
                  </label>
                  <div className="space-y-3">
                    {roleOptions.map((option) => (
                      <label
                        key={option.value}
                        className={`
                          block p-4 border-2 rounded-lg cursor-pointer transition-all duration-200
                          ${selectedRole === option.value
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                          }
                        `}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={option.value}
                          checked={selectedRole === option.value}
                          onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                          className="sr-only"
                        />
                        <div className="flex items-start space-x-3">
                          <span className="text-2xl">{option.icon}</span>
                          <div>
                            <div className="font-medium text-gray-900">
                              {option.label}
                            </div>
                            <div className="text-sm text-gray-600">
                              {option.description}
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Expiry Selection */}
                <div>
                  <label className="block text-lg font-medium text-gray-700 mb-3">
                    ⏰ Link Expires In
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {expiryOptions.map((option) => (
                      <button
                        key={option.days}
                        onClick={() => setExpiryDays(option.days)}
                        className={`
                          p-3 border-2 rounded-lg font-medium transition-all duration-200
                          ${expiryDays === option.days
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                          }
                        `}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generate Button */}
                <button
                  onClick={generateLink}
                  disabled={isGenerating}
                  className="w-full py-4 bg-blue-600 text-white rounded-lg text-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:ring-4 focus:ring-blue-200"
                >
                  {isGenerating ? '⏳ Generating Link...' : '🔗 Generate Share Link'}
                </button>
              </>
            ) : (
              <>
                {/* Generated Link */}
                <div>
                  <label className="block text-lg font-medium text-gray-700 mb-3">
                    🎉 Share Link Generated
                  </label>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="break-all text-sm text-gray-700 mb-3">
                      {generatedLink}
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        Access: {roleOptions.find(r => r.value === selectedRole)?.label}
                      </span>
                      <span>
                        Expires: {new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Copy Button */}
                <button
                  onClick={copyToClipboard}
                  className={`
                    w-full py-4 rounded-lg text-lg font-medium transition-colors focus:ring-4
                    ${copied
                      ? 'bg-green-600 text-white focus:ring-green-200'
                      : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-200'
                    }
                  `}
                >
                  {copied ? '✅ Copied!' : '📋 Copy Link'}
                </button>

                {/* Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">
                    📋 Sharing Instructions
                  </h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Send this link to reviewers via email or message</li>
                    <li>• Recipients will have {roleOptions.find(r => r.value === selectedRole)?.label.toLowerCase()} access</li>
                    <li>• Link expires automatically in {expiryDays} day{expiryDays !== 1 ? 's' : ''}</li>
                    <li>• Dad-Mode interface will be enabled automatically</li>
                  </ul>
                </div>

                {/* Generate Another */}
                <button
                  onClick={() => {
                    setGeneratedLink(null);
                    setCopied(false);
                  }}
                  className="w-full py-3 bg-gray-600 text-white rounded-lg text-lg font-medium hover:bg-gray-700 transition-colors focus:ring-4 focus:ring-gray-200"
                >
                  🔄 Generate Another Link
                </button>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500 text-center">
              🔒 Links are secure and automatically expire. Recipients cannot share further.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}