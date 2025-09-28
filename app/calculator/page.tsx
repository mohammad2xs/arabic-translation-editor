'use client';

import React from 'react';
import CalculatorUI from '../(components)/CalculatorUI';

export default function CalculatorPage() {
    return (
        <div className="min-h-screen bg-gray-100 py-8">
            <div className="max-w-4xl mx-auto px-4">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">
                        Calculator UI Preview
                    </h1>
                    <p className="text-lg text-gray-600 mb-2">
                        Generated from Superdesign Canvas Integration
                    </p>
                    <p className="text-sm text-gray-500">
                        This calculator was created using the design system from .superdesign/design_iterations/calculator-ui.json
                    </p>
                </div>

                <div className="flex flex-col lg:flex-row gap-8 items-start">
                    {/* Calculator Preview */}
                    <div className="flex-1">
                        <div className="bg-white rounded-lg shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-800 mb-4">
                                Live Preview
                            </h2>
                            <CalculatorUI />
                        </div>
                    </div>

                    {/* Design Information */}
                    <div className="flex-1">
                        <div className="bg-white rounded-lg shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-800 mb-4">
                                Design System Details
                            </h2>

                            <div className="space-y-4">
                                <div>
                                    <h3 className="font-medium text-gray-700 mb-2">Colors</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <div className="w-8 h-8 bg-gray-900 rounded border" title="Background"></div>
                                        <div className="w-8 h-8 bg-gray-700 rounded border" title="Surface"></div>
                                        <div className="w-8 h-8 bg-orange-500 rounded border" title="Primary"></div>
                                        <div className="w-8 h-8 bg-gray-400 rounded border" title="Secondary"></div>
                                        <div className="w-8 h-8 bg-white rounded border" title="Text"></div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="font-medium text-gray-700 mb-2">Typography</h3>
                                    <p className="text-sm text-gray-600">
                                        Font Family: SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif
                                    </p>
                                    <p className="text-sm text-gray-600">
                                        Display: 2rem, Button: 1.5rem
                                    </p>
                                </div>

                                <div>
                                    <h3 className="font-medium text-gray-700 mb-2">Components</h3>
                                    <ul className="text-sm text-gray-600 space-y-1">
                                        <li>• CalculatorDisplay - Main output display</li>
                                        <li>• CalculatorButton - Interactive buttons</li>
                                        <li>• CalculatorOperator - Mathematical operators</li>
                                        <li>• CalculatorFunction - Clear and utility functions</li>
                                    </ul>
                                </div>

                                <div>
                                    <h3 className="font-medium text-gray-700 mb-2">Accessibility</h3>
                                    <ul className="text-sm text-gray-600 space-y-1">
                                        <li>• ARIA labels for screen readers</li>
                                        <li>• Keyboard navigation support</li>
                                        <li>• High contrast color scheme</li>
                                        <li>• Focus indicators</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Integration Status */}
                        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
                            <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span className="text-sm text-green-700">
                                    Superdesign Canvas integration active
                                </span>
                            </div>
                            <p className="text-xs text-green-600 mt-1">
                                This component was automatically generated from the design file
                            </p>
                        </div>
                    </div>
                </div>

                {/* Instructions */}
                <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-blue-800 mb-3">
                        How This Was Created
                    </h3>
                    <div className="space-y-2 text-sm text-blue-700">
                        <div className="flex items-start space-x-2">
                            <span className="font-medium">1.</span>
                            <span>Design file created in .superdesign/design_iterations/calculator-ui.json</span>
                        </div>
                        <div className="flex items-start space-x-2">
                            <span className="font-medium">2.</span>
                            <span>Superdesign Canvas integration detected the new design</span>
                        </div>
                        <div className="flex items-start space-x-2">
                            <span className="font-medium">3.</span>
                            <span>React components automatically generated using the design system</span>
                        </div>
                        <div className="flex items-start space-x-2">
                            <span className="font-medium">4.</span>
                            <span>Components integrated with Tailwind CSS for styling</span>
                        </div>
                        <div className="flex items-start space-x-2">
                            <span className="font-medium">5.</span>
                            <span>Accessibility features and responsive design applied</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
