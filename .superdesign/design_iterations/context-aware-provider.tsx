'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

// Types for context data
interface UserContext {
  role: string;
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    fontSize: 'normal' | 'large' | 'xl';
    contrast: 'normal' | 'high';
    motion: 'normal' | 'reduced';
    audioLane: 'en' | 'ar_enhanced' | 'ar_original';
    audioSpeed: number;
  };
  workSession: {
    startTime: Date;
    currentRow: number;
    completedRows: number[];
    issuesFound: number;
    focusTime: number; // minutes
  };
  behavior: {
    averageRowTime: number; // seconds
    preferredActions: string[];
    errorPatterns: string[];
    helpTopics: string[];
  };
}

interface SmartSuggestion {
  id: string;
  type: 'action' | 'tip' | 'shortcut' | 'improvement';
  title: string;
  description: string;
  icon: string;
  confidence: number;
  action?: () => void;
  learnFrom?: boolean;
}

interface NotionIntegration {
  knowledgeBase: {
    articles: Array<{
      id: string;
      title: string;
      url: string;
      relevance: number;
    }>;
    templates: Array<{
      id: string;
      name: string;
      content: string;
    }>;
  };
  projectInfo: {
    status: string;
    deadline?: Date;
    progress: number;
    notes: string[];
  };
}

interface ContextState {
  user: UserContext;
  suggestions: SmartSuggestion[];
  notion: NotionIntegration | null;
  isLoading: boolean;
  lastUpdated: Date;
}

interface ContextActions {
  updateUserPreference: (key: string, value: any) => void;
  addSuggestion: (suggestion: SmartSuggestion) => void;
  dismissSuggestion: (id: string) => void;
  learnFromAction: (action: string, context: any) => void;
  refreshContext: () => Promise<void>;
  saveToNotion: (data: any) => Promise<void>;
}

const ContextAwareContext = createContext<{
  state: ContextState;
  actions: ContextActions;
} | null>(null);

export function useContextAware() {
  const context = useContext(ContextAwareContext);
  if (!context) {
    throw new Error('useContextAware must be used within ContextAwareProvider');
  }
  return context;
}

interface ContextAwareProviderProps {
  children: React.ReactNode;
  userId?: string;
  initialData?: Partial<ContextState>;
}

export function ContextAwareProvider({
  children,
  userId,
  initialData
}: ContextAwareProviderProps) {
  const [state, setState] = useState<ContextState>({
    user: {
      role: 'reviewer',
      preferences: {
        theme: 'auto',
        fontSize: 'normal',
        contrast: 'normal',
        motion: 'normal',
        audioLane: 'en',
        audioSpeed: 1.0
      },
      workSession: {
        startTime: new Date(),
        currentRow: 1,
        completedRows: [],
        issuesFound: 0,
        focusTime: 0
      },
      behavior: {
        averageRowTime: 45,
        preferredActions: [],
        errorPatterns: [],
        helpTopics: []
      }
    },
    suggestions: [],
    notion: null,
    isLoading: false,
    lastUpdated: new Date(),
    ...initialData
  });

  // Context7 MCP Integration
  const analyzeContext = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

      // Simulate Context7 analysis (replace with actual MCP call)
      const contextAnalysis = await fetch('/api/context7/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          currentSession: state.user.workSession,
          behavior: state.user.behavior,
          preferences: state.user.preferences
        })
      });

      if (contextAnalysis.ok) {
        const analysis = await contextAnalysis.json();

        // Generate smart suggestions based on context
        const smartSuggestions: SmartSuggestion[] = [];

        // Work pattern analysis
        if (analysis.workPattern?.needsBreak) {
          smartSuggestions.push({
            id: 'break-suggestion',
            type: 'tip',
            title: 'Take a Break',
            description: 'You\'ve been working for over an hour. Consider taking a 5-minute break.',
            icon: '☕',
            confidence: 0.9,
            action: () => {
              // Could trigger break timer
              console.log('Break timer started');
            }
          });
        }

        // Audio preference optimization
        if (analysis.audioUsage?.shouldSwitchLane) {
          smartSuggestions.push({
            id: 'audio-lane-suggestion',
            type: 'improvement',
            title: `Switch to ${analysis.audioUsage.suggestedLane.toUpperCase()}`,
            description: 'Based on your usage patterns, this lane might be more efficient.',
            icon: '🎧',
            confidence: analysis.audioUsage.confidence,
            action: () => {
              updateUserPreference('audioLane', analysis.audioUsage.suggestedLane);
            }
          });
        }

        // Efficiency suggestions
        if (analysis.efficiency?.slowRows) {
          smartSuggestions.push({
            id: 'efficiency-tip',
            type: 'tip',
            title: 'Speed Up Your Workflow',
            description: 'Try using keyboard shortcuts for faster navigation.',
            icon: '⚡',
            confidence: 0.7,
            action: () => {
              // Could open shortcuts guide
            }
          });
        }

        setState(prev => ({
          ...prev,
          suggestions: [...prev.suggestions, ...smartSuggestions],
          lastUpdated: new Date()
        }));
      }
    } catch (error) {
      console.error('Context analysis failed:', error);
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.user, userId]);

  // Notion MCP Integration
  const syncWithNotion = useCallback(async () => {
    try {
      const notionData = await fetch('/api/notion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          projectId: 'arabic-translation',
          workSession: state.user.workSession
        })
      });

      if (notionData.ok) {
        const notion = await notionData.json();
        setState(prev => ({
          ...prev,
          notion: {
            knowledgeBase: {
              articles: notion.relevantArticles || [],
              templates: notion.templates || []
            },
            projectInfo: {
              status: notion.projectStatus || 'active',
              deadline: notion.deadline ? new Date(notion.deadline) : undefined,
              progress: notion.progress || 0,
              notes: notion.recentNotes || []
            }
          }
        }));
      }
    } catch (error) {
      console.error('Notion sync failed:', error);
    }
  }, [userId, state.user.workSession]);

  // Actions
  const updateUserPreference = useCallback((key: string, value: any) => {
    setState(prev => ({
      ...prev,
      user: {
        ...prev.user,
        preferences: {
          ...prev.user.preferences,
          [key]: value
        }
      },
      lastUpdated: new Date()
    }));

    // Apply preference immediately
    applyPreference(key, value);
  }, []);

  const applyPreference = (key: string, value: any) => {
    switch (key) {
      case 'theme':
        document.documentElement.setAttribute('data-theme', value);
        break;
      case 'fontSize':
        document.documentElement.setAttribute('data-font-size', value);
        break;
      case 'contrast':
        document.documentElement.setAttribute('data-contrast', value);
        break;
      case 'motion':
        document.documentElement.setAttribute('data-motion', value);
        break;
    }
  };

  const addSuggestion = useCallback((suggestion: SmartSuggestion) => {
    setState(prev => ({
      ...prev,
      suggestions: [...prev.suggestions, suggestion]
    }));
  }, []);

  const dismissSuggestion = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      suggestions: prev.suggestions.filter(s => s.id !== id)
    }));
  }, []);

  const learnFromAction = useCallback(async (action: string, context: any) => {
    // Update behavior patterns
    setState(prev => ({
      ...prev,
      user: {
        ...prev.user,
        behavior: {
          ...prev.user.behavior,
          preferredActions: [...new Set([...prev.user.behavior.preferredActions, action])]
        }
      }
    }));

    // Send learning data to Context7
    try {
      await fetch('/api/context7/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          action,
          context,
          timestamp: new Date()
        })
      });
    } catch (error) {
      console.error('Learning update failed:', error);
    }
  }, [userId]);

  const refreshContext = useCallback(async () => {
    await Promise.all([
      analyzeContext(),
      syncWithNotion()
    ]);
  }, [analyzeContext, syncWithNotion]);

  const saveToNotion = useCallback(async (data: any) => {
    try {
      await fetch('/api/notion/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          data,
          timestamp: new Date()
        })
      });
    } catch (error) {
      console.error('Notion save failed:', error);
    }
  }, [userId]);

  // Initialize and set up periodic context updates
  useEffect(() => {
    // Apply initial preferences
    Object.entries(state.user.preferences).forEach(([key, value]) => {
      applyPreference(key, value);
    });

    // Initial context analysis
    refreshContext();

    // Periodic context updates (every 2 minutes)
    const interval = setInterval(analyzeContext, 120000);

    // Focus time tracking
    const focusInterval = setInterval(() => {
      setState(prev => ({
        ...prev,
        user: {
          ...prev.user,
          workSession: {
            ...prev.user.workSession,
            focusTime: prev.user.workSession.focusTime + 1
          }
        }
      }));
    }, 60000); // Update every minute

    return () => {
      clearInterval(interval);
      clearInterval(focusInterval);
    };
  }, []);

  // Smart keyboard shortcuts based on user behavior
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      // Context-aware shortcuts
      if (modifier && e.key === 'h') {
        e.preventDefault();
        // Show contextual help based on current state
        const relevantSuggestions = state.suggestions.filter(s => s.type === 'tip');
        if (relevantSuggestions.length > 0) {
          // Show help modal with suggestions
          console.log('Contextual help:', relevantSuggestions);
        }
      }

      if (modifier && e.key === '?') {
        e.preventDefault();
        // Show smart shortcuts based on user's preferred actions
        console.log('Smart shortcuts for:', state.user.behavior.preferredActions);
      }
    };

    document.addEventListener('keydown', handleGlobalShortcuts);
    return () => document.removeEventListener('keydown', handleGlobalShortcuts);
  }, [state.suggestions, state.user.behavior.preferredActions]);

  const actions: ContextActions = {
    updateUserPreference,
    addSuggestion,
    dismissSuggestion,
    learnFromAction,
    refreshContext,
    saveToNotion
  };

  return (
    <ContextAwareContext.Provider value={{ state, actions }}>
      {children}
    </ContextAwareContext.Provider>
  );
}

// Smart Component Wrapper
export function withContextAware<P extends object>(
  Component: React.ComponentType<P>
) {
  return function ContextAwareComponent(props: P) {
    const { state, actions } = useContextAware();

    return (
      <Component
        {...props}
        contextData={state}
        contextActions={actions}
      />
    );
  };
}

// Smart Hook for context-based suggestions
export function useSmartSuggestions(category?: string) {
  const { state, actions } = useContextAware();

  const filteredSuggestions = category
    ? state.suggestions.filter(s => s.type === category)
    : state.suggestions;

  const sortedSuggestions = filteredSuggestions
    .sort((a, b) => b.confidence - a.confidence);

  return {
    suggestions: sortedSuggestions,
    dismiss: actions.dismissSuggestion,
    learn: actions.learnFromAction
  };
}

// Export types for use in other components
export type { UserContext, SmartSuggestion, NotionIntegration, ContextState, ContextActions };