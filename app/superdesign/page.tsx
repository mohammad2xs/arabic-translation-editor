'use client';

import React, { useEffect, useState } from 'react';
import SuperdesignCanvas from '../(components)/SuperdesignCanvas';
// import { superdesignWorkflows } from '@/lib/superdesign/workflows';
import { logger } from '@/lib/logging/console-ninja';
import { superdesignIntegration, type SuperdesignComponent, type SuperdesignDesign } from '@/lib/superdesign/integration';

export default function SuperdesignPage() {
    const [workflowsRunning, setWorkflowsRunning] = useState(false);
    const [workflowConfig, setWorkflowConfig] = useState({
        autoGenerateComponents: true,
        autoFixGeneratedCode: true,
        autoIntegrateWithNx: true,
        autoMonitorHealth: true,
        autoCommitChanges: false,
        autoDeploy: false,
    });

    useEffect(() => {
        logger.info('Superdesign page loaded', {
            component: 'SuperdesignPage',
            workflowsRunning: workflowsRunning
        });
    }, [workflowsRunning]);

    const handleComponentCreated = (component: SuperdesignComponent) => {
        logger.info('Component created from Superdesign Canvas', {
            component: 'SuperdesignPage',
            componentId: component.id,
            componentName: component.name,
            componentType: component.type
        });

        // Show notification or update UI
        console.log('New component created:', component);
    };

    const handleDesignExported = (design: SuperdesignDesign) => {
        logger.info('Design exported from Superdesign Canvas', {
            component: 'SuperdesignPage',
            designId: design.id,
            designName: design.name,
            componentCount: design.components.length
        });

        // Show notification or update UI
        console.log('New design exported:', design);
    };

    const toggleWorkflows = () => {
        if (workflowsRunning) {
            setWorkflowsRunning(false);
            logger.info('Workflows stopped', { component: 'SuperdesignPage' });
        } else {
            setWorkflowsRunning(true);
            logger.info('Workflows started', { component: 'SuperdesignPage' });
        }
    };

    const updateWorkflowConfig = (key: keyof typeof workflowConfig, value: boolean) => {
        const newConfig = { ...workflowConfig, [key]: value };
        setWorkflowConfig(newConfig);
        logger.info('Workflow config updated', {
            component: 'SuperdesignPage',
            config: newConfig
        });
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                Superdesign Canvas Integration
                            </h1>
                            <p className="mt-2 text-lg text-gray-600">
                                Create beautiful components and designs with Superdesign Canvas
                            </p>
                        </div>

                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2">
                                <div className={`w-3 h-3 rounded-full ${workflowsRunning ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                <span className="text-sm text-gray-600">
                                    {workflowsRunning ? 'Workflows Active' : 'Workflows Inactive'}
                                </span>
                            </div>

                            <button
                                onClick={toggleWorkflows}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${workflowsRunning
                                        ? 'bg-red-600 text-white hover:bg-red-700'
                                        : 'bg-green-600 text-white hover:bg-green-700'
                                    }`}
                            >
                                {workflowsRunning ? 'Stop Workflows' : 'Start Workflows'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Workflow Configuration */}
                <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">
                        Workflow Configuration
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(workflowConfig).map(([key, value]) => (
                            <label key={key} className="flex items-center space-x-3">
                                <input
                                    type="checkbox"
                                    checked={value}
                                    onChange={(e) => updateWorkflowConfig(key as keyof typeof workflowConfig, e.target.checked)}
                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                />
                                <span className="text-sm text-gray-700 capitalize">
                                    {key.replace(/([A-Z])/g, ' $1').trim()}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Integration Status */}
                <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center space-x-3">
                            <div className="text-2xl">🎨</div>
                            <div>
                                <h3 className="font-semibold text-gray-800">Superdesign Canvas</h3>
                                <p className="text-sm text-gray-500">
                                    {superdesignIntegration.isSuperdesignConnected() ? 'Connected' : 'Disconnected'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center space-x-3">
                            <div className="text-2xl">🔧</div>
                            <div>
                                <h3 className="font-semibold text-gray-800">Console Ninja</h3>
                                <p className="text-sm text-gray-500">Active</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center space-x-3">
                            <div className="text-2xl">⚡</div>
                            <div>
                                <h3 className="font-semibold text-gray-800">Nx Console</h3>
                                <p className="text-sm text-gray-500">Ready</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Superdesign Canvas Component */}
                <SuperdesignCanvas
                    onComponentCreated={handleComponentCreated}
                    onDesignExported={handleDesignExported}
                    className="mb-8"
                />

                {/* Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-blue-800 mb-3">
                        How to Use Superdesign Canvas Integration
                    </h3>
                    <div className="space-y-3 text-sm text-blue-700">
                        <div className="flex items-start space-x-2">
                            <span className="font-medium">1.</span>
                            <span>Install the Superdesign Canvas extension in VS Code/Cursor</span>
                        </div>
                        <div className="flex items-start space-x-2">
                            <span className="font-medium">2.</span>
                            <span>Create components and designs in Superdesign Canvas</span>
                        </div>
                        <div className="flex items-start space-x-2">
                            <span className="font-medium">3.</span>
                            <span>Components will automatically appear in the integration panel</span>
                        </div>
                        <div className="flex items-start space-x-2">
                            <span className="font-medium">4.</span>
                            <span>Enable workflows to automatically generate and fix code</span>
                        </div>
                        <div className="flex items-start space-x-2">
                            <span className="font-medium">5.</span>
                            <span>Use Console Ninja to debug and monitor the integration</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
