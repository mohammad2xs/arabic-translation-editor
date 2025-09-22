'use client';

import React, { useState, useEffect } from 'react';
import { useContextAware, useSmartSuggestions } from './context-aware-provider';

interface ShowcaseDemoProps {
  className?: string;
}

export default function ShowcaseDemo({ className = '' }: ShowcaseDemoProps) {
  const { state, actions } = useContextAware();
  const { suggestions } = useSmartSuggestions();
  const [activeDemo, setActiveDemo] = useState<'palette' | 'audio' | 'suggestions' | 'theme'>('theme');
  const [isPlaying, setIsPlaying] = useState(false);

  // Demo data
  const sampleText = "Welcome to the enhanced Arabic Translation Editor with Cursor-inspired design and intelligent MCP integrations.";
  const arabicText = "مرحباً بك في محرر الترجمة العربية المحسن مع التصميم المستوحى من Cursor والتكاملات الذكية.";

  return (
    <div className={`cursor-ui min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 ${className}`}>
      {/* Header */}
      <header className="cursor-glass-card m-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              🎨 Enhanced UI Showcase
            </h1>
            <p className="text-gray-600 mt-2">
              Cursor-inspired design with intelligent MCP integrations
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme Selector */}
            <div className="cursor-lane-selector">
              <button
                onClick={() => actions.updateUserPreference('theme', 'light')}
                className={`cursor-lane-button ${state.user.preferences.theme === 'light' ? 'data-active' : ''}`}
                data-active={state.user.preferences.theme === 'light' ? 'true' : undefined}
              >
                ☀️
              </button>
              <button
                onClick={() => actions.updateUserPreference('theme', 'dark')}
                className={`cursor-lane-button ${state.user.preferences.theme === 'dark' ? 'data-active' : ''}`}
                data-active={state.user.preferences.theme === 'dark' ? 'true' : undefined}
              >
                🌙
              </button>
              <button
                onClick={() => actions.updateUserPreference('theme', 'auto')}
                className={`cursor-lane-button ${state.user.preferences.theme === 'auto' ? 'data-active' : ''}`}
                data-active={state.user.preferences.theme === 'auto' ? 'true' : undefined}
              >
                🔄
              </button>
            </div>

            {/* Context Status */}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Context7 Active</span>
            </div>
          </div>
        </div>
      </header>

      {/* Demo Navigation */}
      <nav className="mx-6 mb-6">
        <div className="cursor-glass-card p-2">
          <div className="flex gap-2">
            {[
              { id: 'theme', label: '🎨 Design System', icon: '🎨' },
              { id: 'palette', label: '⌘ Command Palette', icon: '⌘' },
              { id: 'audio', label: '🎧 Audio Controls', icon: '🎧' },
              { id: 'suggestions', label: '🧠 Smart Suggestions', icon: '🧠' }
            ].map((demo) => (
              <button
                key={demo.id}
                onClick={() => setActiveDemo(demo.id as any)}
                className={`cursor-btn ${
                  activeDemo === demo.id ? 'cursor-btn-primary' : 'cursor-btn-ghost'
                }`}
              >
                <span>{demo.icon}</span>
                {demo.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Demo Content */}
      <main className="mx-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Demo Area */}
        <div className="lg:col-span-2">
          {/* Design System Demo */}
          {activeDemo === 'theme' && (
            <div className="space-y-6">
              <div className="cursor-glass-card p-6">
                <h2 className="text-xl font-semibold mb-4">🎨 Cursor-Inspired Design System</h2>

                {/* Color Palette */}
                <div className="mb-6">
                  <h3 className="font-medium mb-3">Color Palette</h3>
                  <div className="grid grid-cols-6 gap-3">
                    {[
                      { name: 'Primary', color: 'bg-gradient-to-r from-blue-600 to-purple-600' },
                      { name: 'Success', color: 'bg-green-500' },
                      { name: 'Warning', color: 'bg-yellow-500' },
                      { name: 'Error', color: 'bg-red-500' },
                      { name: 'Muted', color: 'bg-gray-400' },
                      { name: 'Accent', color: 'bg-blue-500' }
                    ].map((color) => (
                      <div key={color.name} className="text-center">
                        <div className={`w-12 h-12 rounded-lg ${color.color} mb-2`}></div>
                        <span className="text-xs text-gray-600">{color.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Button Variants */}
                <div className="mb-6">
                  <h3 className="font-medium mb-3">Button Variants</h3>
                  <div className="flex flex-wrap gap-3">
                    <button className="cursor-btn cursor-btn-primary">Primary</button>
                    <button className="cursor-btn cursor-btn-ghost">Ghost</button>
                    <button className="cursor-btn cursor-btn-primary cursor-micro-bounce">
                      With Animation
                    </button>
                    <button className="cursor-btn cursor-btn-ghost" disabled>
                      Disabled
                    </button>
                  </div>
                </div>

                {/* Input Examples */}
                <div>
                  <h3 className="font-medium mb-3">Input Controls</h3>
                  <div className="space-y-3">
                    <input
                      className="cursor-input"
                      placeholder="Enhanced input with focus states..."
                    />
                    <div className="flex gap-3">
                      <input className="cursor-input flex-1" placeholder="English text" />
                      <input className="cursor-input flex-1" placeholder="نص عربي" dir="rtl" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Typography Showcase */}
              <div className="cursor-glass-card p-6">
                <h2 className="text-xl font-semibold mb-4">📝 Typography Scale</h2>
                <div className="space-y-4">
                  <h1 className="text-4xl font-bold">Heading 1 - Main Title</h1>
                  <h2 className="text-3xl font-semibold">Heading 2 - Section Title</h2>
                  <h3 className="text-2xl font-medium">Heading 3 - Subsection</h3>
                  <p className="text-lg">Large body text for important content and Arabic translations.</p>
                  <p className="text-base">Regular body text for general content and descriptions.</p>
                  <p className="text-sm text-gray-600">Small text for captions and metadata.</p>
                  <code className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                    Monospace font for code and technical content
                  </code>
                </div>
              </div>
            </div>
          )}

          {/* Command Palette Demo */}
          {activeDemo === 'palette' && (
            <div className="cursor-glass-card p-6">
              <h2 className="text-xl font-semibold mb-4">⌘ Enhanced Command Palette</h2>
              <div className="space-y-4">
                <p className="text-gray-600">
                  The enhanced command palette features context-aware suggestions, smart search,
                  and learning capabilities powered by Context7.
                </p>

                {/* Simulated Palette */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <div className="space-y-3">
                    <div className="text-4xl">⌘</div>
                    <p className="font-medium">Press <kbd className="px-2 py-1 bg-gray-200 rounded font-mono text-sm">⌘K</kbd> to open</p>
                    <button
                      className="cursor-btn cursor-btn-primary"
                      onClick={() => {
                        actions.addSuggestion({
                          id: 'demo-suggestion',
                          type: 'tip',
                          title: 'Try the enhanced search',
                          description: 'Search is now context-aware and learns from your behavior',
                          icon: '💡',
                          confidence: 0.9
                        });
                      }}
                    >
                      Simulate Command Palette
                    </button>
                  </div>
                </div>

                {/* Features List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  {[
                    { icon: '🧠', title: 'Context Awareness', desc: 'Prioritizes commands based on current context' },
                    { icon: '🔍', title: 'Smart Search', desc: 'Fuzzy search with relevance boosting' },
                    { icon: '📚', title: 'Learning Algorithm', desc: 'Adapts to your workflow patterns' },
                    { icon: '⚡', title: 'Performance', desc: 'Instant results with smooth animations' }
                  ].map((feature) => (
                    <div key={feature.title} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl">{feature.icon}</div>
                      <div>
                        <h4 className="font-medium">{feature.title}</h4>
                        <p className="text-sm text-gray-600">{feature.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Audio Demo */}
          {activeDemo === 'audio' && (
            <div className="cursor-glass-card p-6">
              <h2 className="text-xl font-semibold mb-4">🎧 Enhanced Audio Experience</h2>

              {/* Simulated Audio Bar */}
              <div className="cursor-audio-bar mb-6">
                <div className="cursor-audio-controls">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-600">Audio</span>
                    <div className="cursor-lane-selector">
                      <button className="cursor-lane-button data-active" data-active="true">EN</button>
                      <button className="cursor-lane-button">AR+</button>
                      <button className="cursor-lane-button">AR</button>
                    </div>
                  </div>

                  <button
                    className="cursor-play-button"
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1"/>
                        <rect x="14" y="4" width="4" height="16" rx="1"/>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    )}
                  </button>

                  <div className="flex-1 flex items-center gap-4">
                    <span className="text-xs text-gray-500 font-mono min-w-[3rem]">0:00</span>
                    <div className="flex-1 relative">
                      <div className="cursor-progress-bar">
                        <div className="cursor-progress-fill" style={{ width: '35%' }}></div>
                      </div>
                      {isPlaying && (
                        <div className="absolute top-2 left-0 right-0 flex items-end justify-center gap-1 h-6">
                          {Array.from({ length: 20 }, (_, i) => (
                            <div
                              key={i}
                              className="w-1 bg-blue-400 rounded-full transition-all duration-100"
                              style={{
                                height: `${Math.max(2, Math.random() * 20)}px`,
                                animationDelay: `${i * 50}ms`
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 font-mono min-w-[3rem]">2:45</span>
                  </div>

                  <div className="text-xs text-gray-600 text-right min-w-[8rem]">
                    <div className="font-medium">English</div>
                    <div className="text-gray-500">Neural Voice</div>
                  </div>
                </div>
              </div>

              {/* Sample Text */}
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Sample Text (English)</h4>
                  <p className="text-sm">{sampleText}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg" dir="rtl">
                  <h4 className="font-medium mb-2">Sample Text (Arabic)</h4>
                  <p className="text-sm font-arabic">{arabicText}</p>
                </div>
              </div>

              {/* Features */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { icon: '🎵', title: 'Real-time Visualizer', desc: 'Beautiful audio visualization' },
                  { icon: '🤖', title: 'Smart Lane Detection', desc: 'AI suggests optimal audio lane' },
                  { icon: '🎛️', title: 'Advanced Controls', desc: 'Speed, volume, and quality controls' }
                ].map((feature) => (
                  <div key={feature.title} className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-3xl mb-2">{feature.icon}</div>
                    <h5 className="font-medium">{feature.title}</h5>
                    <p className="text-xs text-gray-600 mt-1">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Smart Suggestions Demo */}
          {activeDemo === 'suggestions' && (
            <div className="cursor-glass-card p-6">
              <h2 className="text-xl font-semibold mb-4">🧠 Smart Suggestions</h2>
              <p className="text-gray-600 mb-6">
                Context7 analyzes your behavior and provides intelligent suggestions to improve your workflow.
              </p>

              {suggestions.length > 0 ? (
                <div className="space-y-3">
                  {suggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200"
                    >
                      <div className="text-2xl">{suggestion.icon}</div>
                      <div className="flex-1">
                        <h4 className="font-medium text-blue-900">{suggestion.title}</h4>
                        <p className="text-sm text-blue-700 mt-1">{suggestion.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-blue-600">
                            Confidence: {Math.round(suggestion.confidence * 100)}%
                          </span>
                          <div className="w-16 h-1 bg-blue-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${suggestion.confidence * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => actions.dismissSuggestion(suggestion.id)}
                        className="text-blue-400 hover:text-blue-600 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">🎯</div>
                  <p className="text-gray-500">No suggestions right now</p>
                  <button
                    className="cursor-btn cursor-btn-primary mt-4"
                    onClick={() => {
                      actions.addSuggestion({
                        id: 'demo-break',
                        type: 'tip',
                        title: 'Take a Break',
                        description: 'You\'ve been working for a while. Consider taking a 5-minute break.',
                        icon: '☕',
                        confidence: 0.85
                      });
                    }}
                  >
                    Generate Demo Suggestion
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Context Status */}
          <div className="cursor-glass-card p-4">
            <h3 className="font-medium mb-3">📊 Context Status</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span>Work Session</span>
                <span className="font-medium">{state.user.workSession.focusTime}m</span>
              </div>
              <div className="flex justify-between">
                <span>Current Row</span>
                <span className="font-medium">{state.user.workSession.currentRow}</span>
              </div>
              <div className="flex justify-between">
                <span>Completed</span>
                <span className="font-medium">{state.user.workSession.completedRows.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Issues Found</span>
                <span className="font-medium text-orange-600">{state.user.workSession.issuesFound}</span>
              </div>
            </div>
          </div>

          {/* User Preferences */}
          <div className="cursor-glass-card p-4">
            <h3 className="font-medium mb-3">⚙️ Smart Preferences</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Font Size</label>
                <select
                  value={state.user.preferences.fontSize}
                  onChange={(e) => actions.updateUserPreference('fontSize', e.target.value)}
                  className="cursor-input text-sm"
                >
                  <option value="normal">Normal</option>
                  <option value="large">Large</option>
                  <option value="xl">Extra Large</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Audio Speed</label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={state.user.preferences.audioSpeed}
                  onChange={(e) => actions.updateUserPreference('audioSpeed', parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="text-xs text-gray-500 mt-1">
                  {state.user.preferences.audioSpeed}x speed
                </div>
              </div>
            </div>
          </div>

          {/* MCP Status */}
          <div className="cursor-glass-card p-4">
            <h3 className="font-medium mb-3">🔗 MCP Integrations</h3>
            <div className="space-y-2 text-sm">
              {[
                { name: 'Context7', status: 'connected', color: 'green' },
                { name: 'Notion', status: 'syncing', color: 'yellow' },
                { name: 'Console Ninja', status: 'connected', color: 'green' },
                { name: 'Web-to-MCP', status: 'connected', color: 'green' }
              ].map((integration) => (
                <div key={integration.name} className="flex items-center justify-between">
                  <span>{integration.name}</span>
                  <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full bg-${integration.color}-500`}></div>
                    <span className="text-xs text-gray-500">{integration.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 mx-6 mb-6">
        <div className="cursor-glass-card p-4 text-center text-sm text-gray-600">
          <p>
            Enhanced with ❤️ using Cursor-inspired design principles and intelligent MCP integrations
          </p>
        </div>
      </footer>
    </div>
  );
}