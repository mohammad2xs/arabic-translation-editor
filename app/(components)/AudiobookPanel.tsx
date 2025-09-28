'use client';

import { useState, useEffect, useRef } from 'react';
import { canShare, getUserRole } from '../../lib/dadmode/access';
import type { Lane, AudioJob } from '../../lib/audio/types';


interface AudiobookPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentSectionId?: string;
  currentChapterId?: string;
}

export default function AudiobookPanel({
  isOpen,
  onClose,
  currentSectionId,
  currentChapterId
}: AudiobookPanelProps) {
  const [jobs, setJobs] = useState<AudioJob[]>([]);
  const [selectedScope, setSelectedScope] = useState<'section' | 'chapter' | 'book'>('section');
  const [selectedLane, setSelectedLane] = useState<Lane>('en');
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [jobProgress, setJobProgress] = useState<Record<string, AudioJob>>({});
  const [jobFilter, setJobFilter] = useState<'all' | 'pending' | 'processing' | 'completed' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const streamReaderRef = useRef<{ reader: ReadableStreamDefaultReader; controller: AbortController } | null>(null);

  const userRole = getUserRole();
  const canCreateJobs = canShare(userRole);

  // Load existing jobs on mount
  useEffect(() => {
    if (isOpen) {
      loadJobs();
      setupNDJSONStream();
    }

    return () => {
      cleanup();
    };
  }, [isOpen]);

  // Setup NDJSON streaming for real-time updates
  // Note: Uses NDJSON streaming over fetch for real-time job progress updates
  // See /api/audio/job/route.ts for API contract documentation
  const setupNDJSONStream = () => {
    cleanup();

    try {
      const controller = new AbortController();

      fetch('/api/audio/job?stream=true', {
        signal: controller.signal,
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          if (!response.body) {
            throw new Error('No response body available for streaming');
          }

          const reader = response.body.getReader();
          streamReaderRef.current = { reader, controller };

          console.log('NDJSON stream established for audiobook jobs');

          // Process the stream
          const decoder = new TextDecoder();
          let buffer = '';

          const processStream = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();

                if (done) {
                  console.log('NDJSON stream completed');
                  break;
                }

                // Decode the chunk and add to buffer
                buffer += decoder.decode(value, { stream: true });

                // Process complete lines
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                  if (line.trim()) {
                    try {
                      const update = JSON.parse(line);

                      if (update.type === 'job_update') {
                        setJobProgress(prev => ({
                          ...prev,
                          [update.job.id]: update.job
                        }));

                        // Update jobs list if job status changed significantly
                        if (update.job.status === 'completed' || update.job.status === 'failed' || update.job.status === 'cancelled') {
                          // Debounce the loadJobs call to avoid excessive requests
                          setTimeout(loadJobs, 500);
                        }
                      } else if (update.type === 'connected') {
                        console.log('NDJSON stream connection confirmed for audiobook panel');
                      }
                    } catch (error) {
                      console.error('Failed to parse NDJSON line:', error, 'Line:', line);
                    }
                  }
                }
              }
            } catch (error) {
              if (error instanceof Error && error.name !== 'AbortError') {
                console.error('NDJSON stream reading error:', error);

                // Attempt to reconnect after a delay with exponential backoff
                const reconnectDelay = Math.min(5000 * Math.pow(2, Math.random()), 30000);
                setTimeout(() => {
                  if (isOpen && !streamReaderRef.current) {
                    setupNDJSONStream();
                  }
                }, reconnectDelay);
              }
            }
          };

          processStream();
        })
        .catch(error => {
          if (error.name !== 'AbortError') {
            console.error('Failed to setup NDJSON stream:', error);
            // Retry connection after a longer delay
            setTimeout(() => {
              if (isOpen) {
                setupNDJSONStream();
              }
            }, 10000);
          }
        });

    } catch (error) {
      console.error('Failed to setup NDJSON stream:', error);
      // Retry connection after a longer delay
      setTimeout(() => {
        if (isOpen) {
          setupNDJSONStream();
        }
      }, 10000);
    }
  };

  // Cleanup NDJSON stream
  const cleanup = () => {
    if (streamReaderRef.current) {
      streamReaderRef.current.controller.abort();
      streamReaderRef.current.reader.releaseLock();
      streamReaderRef.current = null;
    }
  };

  // Load jobs from API
  const loadJobs = async () => {
    try {
      const response = await fetch('/api/audio/job');
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  };

  // Create new audiobook job
  const createJob = async () => {
    if (!canCreateJobs) {
      alert('You do not have permission to create audiobook jobs');
      return;
    }

    setIsCreatingJob(true);

    try {
      let scopeId: string;
      let scopeName: string;

      switch (selectedScope) {
        case 'section':
          if (!currentSectionId) {
            throw new Error('No section selected');
          }
          scopeId = currentSectionId;
          scopeName = `Section ${currentSectionId}`;
          break;
        case 'chapter':
          if (!currentChapterId) {
            throw new Error('No chapter selected');
          }
          scopeId = currentChapterId;
          scopeName = `Chapter ${currentChapterId}`;
          break;
        case 'book':
          scopeId = 'full_book';
          scopeName = 'Complete Book';
          break;
      }

      // Check for duplicate jobs
      const existingJob = jobs.find(job =>
        job.scope === selectedScope &&
        job.lane === selectedLane &&
        job.scopeId === scopeId &&
        (job.status === 'pending' || job.status === 'processing')
      );

      if (existingJob) {
        alert(`A ${selectedScope} job for ${getLaneDisplayName(selectedLane)} lane is already ${existingJob.status}. Please wait for it to complete or cancel it first.`);
        setIsCreatingJob(false);
        return;
      }

      const response = await fetch('/api/audio/job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scope: selectedScope,
          lane: selectedLane,
          scopeId,
          scopeName
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create job');
      }

      const data = await response.json();

      // More informative success message
      const laneDisplay = getLaneDisplayName(selectedLane);
      alert(`✅ Audiobook job created successfully!\n\nScope: ${scopeName}\nLane: ${laneDisplay}\nJob ID: ${data.job.id}\nEstimated segments: ${data.job.estimatedSegments}\n\nCheck the "Active Jobs" section below for real-time progress updates.`);

      // Refresh jobs list
      loadJobs();

    } catch (error) {
      console.error('Job creation error:', error);
      alert(`Failed to create audiobook job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreatingJob(false);
    }
  };

  // Cancel job
  const cancelJob = async (jobId: string) => {
    try {
      const response = await fetch('/api/audio/job', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId }),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel job');
      }

      // Refresh jobs list
      loadJobs();
    } catch (error) {
      console.error('Job cancellation error:', error);
      alert('Failed to cancel job');
    }
  };

  // Download completed audiobook
  const downloadAudiobook = (job: AudioJob) => {
    const url = job.m4bUrl || job.audioUrl;
    if (!url) {
      alert('Download URL not available');
      return;
    }

    // Create descriptive filename with timestamp
    const timestamp = new Date(job.updatedAt).toISOString().split('T')[0];
    const laneDisplay = getLaneDisplayName(job.lane).replace(/\s+/g, '_');
    const scopeDisplay = job.scopeName.replace(/\s+/g, '_');

    let fileName: string;
    let fileExtension: string;

    if (job.m4bUrl) {
      fileExtension = 'm4b';
      fileName = `${scopeDisplay}_${laneDisplay}_${timestamp}.${fileExtension}`;
    } else {
      fileExtension = 'json';
      fileName = `${scopeDisplay}_${laneDisplay}_manifest_${timestamp}.${fileExtension}`;
    }

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Show success message with file info
    if (job.m4bUrl) {
      alert(`📱 M4B audiobook downloaded: ${fileName}\n\nYou can now import this file into your audiobook player.`);
    } else {
      alert(`📄 Manifest file downloaded: ${fileName}\n\nThis JSON file contains metadata and links to all audio segments.`);
    }
  };

  // Get status color
  const getStatusColor = (status: AudioJob['status']): string => {
    switch (status) {
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      case 'processing':
        return 'text-blue-600 bg-blue-100';
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      case 'cancelled':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  // Format duration
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Get lane display name
  const getLaneDisplayName = (lane: Lane): string => {
    switch (lane) {
      case 'en':
        return 'English';
      case 'ar_enhanced':
        return 'Arabic Enhanced';
      case 'ar_original':
        return 'Arabic Original';
      default:
        return lane;
    }
  };

  // Filter jobs based on current filters
  const getFilteredJobs = (jobList: AudioJob[]): AudioJob[] => {
    return jobList.filter(job => {
      // Status filter
      if (jobFilter !== 'all' && job.status !== jobFilter) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          job.scopeName.toLowerCase().includes(query) ||
          job.id.toLowerCase().includes(query) ||
          getLaneDisplayName(job.lane).toLowerCase().includes(query) ||
          job.scope.toLowerCase().includes(query)
        );
      }

      return true;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

      <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">🎧 Audiobook Builder</h2>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-sm opacity-90 mt-1">Create and manage audiobook builds</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Job Creation Form */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-medium text-gray-900 mb-3">Create New Audiobook</h3>

            {/* Scope Selection */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Scope
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setSelectedScope('section')}
                  disabled={!currentSectionId}
                  className={`px-3 py-2 text-sm rounded transition-colors ${
                    selectedScope === 'section'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  } ${!currentSectionId ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Section
                </button>
                <button
                  onClick={() => setSelectedScope('chapter')}
                  disabled={true}
                  className="px-3 py-2 text-sm rounded transition-colors bg-gray-100 text-gray-700 opacity-50 cursor-not-allowed"
                  title="Chapter scope coming soon"
                >
                  Chapter
                </button>
                <button
                  onClick={() => setSelectedScope('book')}
                  className={`px-3 py-2 text-sm rounded transition-colors ${
                    selectedScope === 'book'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Book
                </button>
              </div>
            </div>

            {/* Lane Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Language Lane
              </label>
              <select
                value={selectedLane}
                onChange={(e) => setSelectedLane(e.target.value as Lane)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="en">English</option>
                <option value="ar_enhanced">Arabic Enhanced</option>
                <option value="ar_original">Arabic Original</option>
              </select>
            </div>

            {/* Create Button */}
            <button
              onClick={createJob}
              disabled={isCreatingJob || !canCreateJobs}
              className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-medium rounded-md transition-colors focus:ring-2 focus:ring-purple-500"
            >
              {isCreatingJob ? 'Creating...' : '🎙️ Create Audiobook'}
            </button>

            {!canCreateJobs && (
              <p className="text-xs text-gray-500 mt-2">
                You need elevated permissions to create audiobook jobs
              </p>
            )}
          </div>

          {/* Active Jobs */}
          <div className="p-4">
            <h3 className="font-medium text-gray-900 mb-3">
              Active Jobs ({Object.keys(jobProgress).length})
            </h3>

            {Object.values(jobProgress).length === 0 ? (
              <p className="text-sm text-gray-500">No active jobs</p>
            ) : (
              <div className="space-y-2">
                {Object.values(jobProgress).map((job) => (
                  <div key={job.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        {job.scopeName}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                    </div>

                    <div className="text-xs text-gray-600 mb-2">
                      Lane: {getLaneDisplayName(job.lane)}
                    </div>

                    {job.status === 'processing' && (
                      <div className="mb-2">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Progress</span>
                          <span>{job.processedSegments}/{job.totalSegments}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {job.error && (
                      <div className="text-xs text-red-600 mb-2">
                        Error: {job.error}
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">
                        {new Date(job.updatedAt).toLocaleString()}
                      </span>

                      <div className="flex space-x-1">
                        {job.status === 'processing' && (
                          <button
                            onClick={() => cancelJob(job.id)}
                            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            Cancel
                          </button>
                        )}

                        {job.status === 'completed' && (
                          <div className="flex space-x-1">
                            {job.m4bUrl && (
                              <button
                                onClick={() => downloadAudiobook(job)}
                                className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              >
                                Download M4B
                              </button>
                            )}
                            {job.audioUrl && !job.m4bUrl && (
                              <a
                                href={job.audioUrl}
                                download={`${job.scopeName}_${job.lane}_manifest.json`}
                                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 rounded transition-colors"
                              >
                                Manifest (JSON)
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Job History */}
          <div className="p-4 border-t border-gray-200">
            <h3 className="font-medium text-gray-900 mb-3">
              Job History ({jobs.length})
            </h3>

            {/* Job Filters and Search */}
            <div className="mb-4 space-y-2">
              {/* Search */}
              <input
                type="text"
                placeholder="Search jobs by name, ID, or lane..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />

              {/* Status Filter */}
              <select
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Jobs</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {jobs.length === 0 ? (
              <p className="text-sm text-gray-500">No jobs created yet</p>
            ) : (() => {
              const filteredJobs = getFilteredJobs(jobs);
              return filteredJobs.length === 0 ? (
                <p className="text-sm text-gray-500">No jobs match the current filters</p>
              ) : (
                <>
                  {filteredJobs.length !== jobs.length && (
                    <p className="text-xs text-gray-500 mb-2">
                      Showing {Math.min(filteredJobs.length, 10)} of {filteredJobs.length} filtered jobs
                    </p>
                  )}
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {filteredJobs.slice(0, 10).map((job) => (
                  <div key={job.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {job.scopeName}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                    </div>

                    <div className="text-xs text-gray-600 mb-1">
                      {getLaneDisplayName(job.lane)} • {new Date(job.createdAt).toLocaleDateString()}
                    </div>

                    {job.actualDuration && (
                      <div className="text-xs text-gray-600 mb-2">
                        Duration: {formatDuration(job.actualDuration)}
                      </div>
                    )}

                    {job.status === 'completed' && (
                      <div className="flex space-x-2">
                        {job.m4bUrl && (
                          <button
                            onClick={() => downloadAudiobook(job)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Download M4B
                          </button>
                        )}
                        {job.audioUrl && !job.m4bUrl && (
                          <a
                            href={job.audioUrl}
                            download={`${job.scopeName}_${job.lane}_manifest.json`}
                            className="text-xs text-gray-600 hover:underline"
                          >
                            Manifest (JSON)
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}