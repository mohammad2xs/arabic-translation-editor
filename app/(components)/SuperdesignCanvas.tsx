'use client';

import { logger } from '@/lib/logging/console-ninja';
import { superdesignIntegration, type SuperdesignComponent, type SuperdesignDesign } from '@/lib/superdesign/integration';
import React, { useCallback, useEffect, useState } from 'react';

interface SuperdesignCanvasProps {
    onComponentCreated?: (component: SuperdesignComponent) => void;
    onDesignExported?: (design: SuperdesignDesign) => void;
    className?: string;
}

export function SuperdesignCanvas({
    onComponentCreated,
    onDesignExported,
    className
}: SuperdesignCanvasProps) {
    const [isConnected, setIsConnected] = useState(false);
    const [components, setComponents] = useState<SuperdesignComponent[]>([]);
    const [designs, setDesigns] = useState<SuperdesignDesign[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Initialize connection
        superdesignIntegration.connect();
        setIsConnected(superdesignIntegration.isSuperdesignConnected());

        // Load existing components and designs
        setComponents(superdesignIntegration.getComponents());
        setDesigns(superdesignIntegration.getDesigns());

        logger.info('SuperdesignCanvas component mounted', {
            component: 'SuperdesignCanvas',
            connected: isConnected,
            componentCount: components.length,
            designCount: designs.length
        });
    }, []);

    const handleConnect = useCallback(() => {
        setIsLoading(true);
        setError(null);

        try {
            superdesignIntegration.connect();
            setIsConnected(superdesignIntegration.isSuperdesignConnected());

            if (superdesignIntegration.isSuperdesignConnected()) {
                logger.info('Successfully connected to Superdesign Canvas', {
                    component: 'SuperdesignCanvas'
                });
            } else {
                setError('Failed to connect to Superdesign Canvas. Please ensure the extension is installed and enabled.');
            }
        } catch (err) {
            setError('Error connecting to Superdesign Canvas: ' + (err as Error).message);
            logger.error('Error connecting to Superdesign Canvas', err as Error, {
                component: 'SuperdesignCanvas'
            });
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleRefresh = useCallback(() => {
        setComponents(superdesignIntegration.getComponents());
        setDesigns(superdesignIntegration.getDesigns());

        logger.info('Refreshed Superdesign Canvas data', {
            component: 'SuperdesignCanvas',
            componentCount: components.length,
            designCount: designs.length
        });
    }, [components.length, designs.length]);

    const handleComponentClick = useCallback((component: SuperdesignComponent) => {
        logger.info('Component clicked', {
            component: 'SuperdesignCanvas',
            componentId: component.id,
            componentName: component.name
        });

        onComponentCreated?.(component);
    }, [onComponentCreated]);

    const handleDesignClick = useCallback((design: SuperdesignDesign) => {
        logger.info('Design clicked', {
            component: 'SuperdesignCanvas',
            designId: design.id,
            designName: design.name
        });

        onDesignExported?.(design);
    }, [onDesignExported]);

    if (!isConnected) {
        return (
            <div className={`superdesign-canvas-disconnected ${className || ''}`}>
                <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <div className="text-6xl mb-4">🎨</div>
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">
                        Superdesign Canvas Not Connected
                    </h3>
                    <p className="text-gray-500 text-center mb-6 max-w-md">
                        Install and enable the Superdesign Canvas extension to start creating beautiful components
                        and designs for your Arabic Translation Editor.
                    </p>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 w-full max-w-md">
                            <p className="text-red-700 text-sm">{error}</p>
                        </div>
                    )}

                    <button
                        onClick={handleConnect}
                        disabled={isLoading}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoading ? 'Connecting...' : 'Connect to Superdesign Canvas'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`superdesign-canvas ${className || ''}`}>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                    <div className="text-2xl">🎨</div>
                    <div>
                        <h2 className="text-xl font-semibold text-gray-800">
                            Superdesign Canvas
                        </h2>
                        <p className="text-sm text-gray-500">
                            Connected • {components.length} components • {designs.length} designs
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleRefresh}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                    Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Components Section */}
                <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-800">Components</h3>
                    {components.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <div className="text-4xl mb-2">🧩</div>
                            <p>No components created yet</p>
                            <p className="text-sm">Create components in Superdesign Canvas to see them here</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {components.map((component) => (
                                <div
                                    key={component.id}
                                    onClick={() => handleComponentClick(component)}
                                    className="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="font-medium text-gray-800">{component.name}</h4>
                                            <p className="text-sm text-gray-500 capitalize">{component.type}</p>
                                        </div>
                                        <div className="text-xs text-gray-400">
                                            {component.metadata.version}
                                        </div>
                                    </div>
                                    {component.metadata.description && (
                                        <p className="text-sm text-gray-600 mt-2">
                                            {component.metadata.description}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Designs Section */}
                <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-800">Designs</h3>
                    {designs.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <div className="text-4xl mb-2">🎨</div>
                            <p>No designs exported yet</p>
                            <p className="text-sm">Export designs from Superdesign Canvas to see them here</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {designs.map((design) => (
                                <div
                                    key={design.id}
                                    onClick={() => handleDesignClick(design)}
                                    className="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="font-medium text-gray-800">{design.name}</h4>
                                            <p className="text-sm text-gray-500">
                                                {design.components.length} components
                                            </p>
                                        </div>
                                        <div className="text-xs text-gray-400">
                                            {design.metadata.version}
                                        </div>
                                    </div>
                                    {design.metadata.description && (
                                        <p className="text-sm text-gray-600 mt-2">
                                            {design.metadata.description}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Integration Status */}
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-green-700">
                        Superdesign Canvas integration is active and ready
                    </span>
                </div>
            </div>
        </div>
    );
}

export default SuperdesignCanvas;
