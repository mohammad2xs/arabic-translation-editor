/**
 * Superdesign Canvas Utility Functions
 * 
 * This module provides utility functions for working with Superdesign Canvas
 * components and designs.
 */


export interface ComponentTemplate {
    name: string;
    type: 'button' | 'input' | 'card' | 'modal' | 'layout' | 'custom';
    template: string;
    props: Record<string, any>;
    styles: Record<string, any>;
}

export interface DesignTemplate {
    name: string;
    description: string;
    components: ComponentTemplate[];
    theme: {
        colors: Record<string, string>;
        typography: Record<string, any>;
        spacing: Record<string, number>;
    };
}

export class SuperdesignUtils {
    /**
     * Convert Superdesign component to React component string
     */
    static generateReactComponent(component: any): string {
        const componentName = this.toPascalCase(component.name);

        const props = Object.entries(component.props || {})
            .map(([key, value]) => `  ${key}: ${typeof value === 'string' ? `'${value}'` : JSON.stringify(value)};`)
            .join('\n');

        const styles = Object.entries(component.styles || {})
            .map(([key, value]) => `    ${key}: '${value}',`)
            .join('\n');

        return `'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ${componentName}Props {
${props}
  className?: string;
  children?: React.ReactNode;
}

export function ${componentName}({ 
  className, 
  children, 
  ...props 
}: ${componentName}Props) {
  const styles = {
${styles}
  };

  return (
    <div 
      className={cn('${component.type}', className)}
      style={styles}
      {...props}
    >
      {children}
    </div>
  );
}

export default ${componentName};`;
    }

    /**
     * Generate TypeScript types for Superdesign component
     */
    static generateTypeScriptTypes(component: any): string {
        const componentName = this.toPascalCase(component.name);

        const props = Object.entries(component.props || {})
            .map(([key, value]) => `  ${key}: ${this.getTypeScriptType(value)};`)
            .join('\n');

        return `export interface ${componentName}Props {
${props}
  className?: string;
  children?: React.ReactNode;
}`;
    }

    /**
     * Generate CSS classes for Superdesign component
     */
    static generateCSSClasses(component: any): string {
        const componentName = this.toKebabCase(component.name);

        const styles = Object.entries(component.styles || {})
            .map(([key, value]) => `  ${key}: ${value};`)
            .join('\n');

        return `.${componentName} {
${styles}
}`;
    }

    /**
     * Generate Tailwind CSS classes for Superdesign component
     */
    static generateTailwindClasses(component: any): string {
        const classes: string[] = [];

        if (component.styles) {
            // Convert CSS properties to Tailwind classes
            Object.entries(component.styles).forEach(([property, value]) => {
                const tailwindClass = this.cssToTailwind(property, value as string);
                if (tailwindClass) {
                    classes.push(tailwindClass);
                }
            });
        }

        return classes.join(' ');
    }

    /**
     * Validate Superdesign component
     */
    static validateComponent(component: any): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!component.name) {
            errors.push('Component name is required');
        }

        if (!component.type) {
            errors.push('Component type is required');
        }

        if (!component.props) {
            errors.push('Component props are required');
        }

        if (!component.styles) {
            errors.push('Component styles are required');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate Superdesign design
     */
    static validateDesign(design: any): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!design.name) {
            errors.push('Design name is required');
        }

        if (!design.components || design.components.length === 0) {
            errors.push('Design must have at least one component');
        }

        if (!design.theme) {
            errors.push('Design theme is required');
        }

        // Validate each component
        design.components?.forEach((component: any, index: number) => {
            const validation = this.validateComponent(component);
            if (!validation.valid) {
                validation.errors.forEach(error => {
                    errors.push(`Component ${index + 1}: ${error}`);
                });
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Convert string to PascalCase
     */
    private static toPascalCase(str: string): string {
        return str
            .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
                return index === 0 ? word.toUpperCase() : word.toLowerCase();
            })
            .replace(/\s+/g, '');
    }

    /**
     * Convert string to kebab-case
     */
    private static toKebabCase(str: string): string {
        return str
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .replace(/\s+/g, '-')
            .toLowerCase();
    }

    /**
     * Get TypeScript type for a value
     */
    private static getTypeScriptType(value: any): string {
        if (typeof value === 'string') return 'string';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        if (Array.isArray(value)) return 'any[]';
        if (typeof value === 'object' && value !== null) return 'Record<string, any>';
        return 'any';
    }

    /**
     * Convert CSS property to Tailwind class
     */
    private static cssToTailwind(property: string, value: string): string | null {
        const mappings: Record<string, Record<string, string>> = {
            'background-color': {
                'red': 'bg-red-500',
                'blue': 'bg-blue-500',
                'green': 'bg-green-500',
                'yellow': 'bg-yellow-500',
                'purple': 'bg-purple-500',
                'pink': 'bg-pink-500',
                'gray': 'bg-gray-500',
                'black': 'bg-black',
                'white': 'bg-white',
            },
            'color': {
                'red': 'text-red-500',
                'blue': 'text-blue-500',
                'green': 'text-green-500',
                'yellow': 'text-yellow-500',
                'purple': 'text-purple-500',
                'pink': 'text-pink-500',
                'gray': 'text-gray-500',
                'black': 'text-black',
                'white': 'text-white',
            },
            'padding': {
                '8px': 'p-2',
                '16px': 'p-4',
                '24px': 'p-6',
                '32px': 'p-8',
            },
            'margin': {
                '8px': 'm-2',
                '16px': 'm-4',
                '24px': 'm-6',
                '32px': 'm-8',
            },
            'font-size': {
                '12px': 'text-xs',
                '14px': 'text-sm',
                '16px': 'text-base',
                '18px': 'text-lg',
                '20px': 'text-xl',
                '24px': 'text-2xl',
                '30px': 'text-3xl',
                '36px': 'text-4xl',
            },
            'font-weight': {
                '400': 'font-normal',
                '500': 'font-medium',
                '600': 'font-semibold',
                '700': 'font-bold',
            },
            'text-align': {
                'left': 'text-left',
                'center': 'text-center',
                'right': 'text-right',
            },
            'display': {
                'flex': 'flex',
                'block': 'block',
                'inline': 'inline',
                'inline-block': 'inline-block',
            },
            'flex-direction': {
                'row': 'flex-row',
                'column': 'flex-col',
            },
            'justify-content': {
                'flex-start': 'justify-start',
                'center': 'justify-center',
                'flex-end': 'justify-end',
                'space-between': 'justify-between',
                'space-around': 'justify-around',
            },
            'align-items': {
                'flex-start': 'items-start',
                'center': 'items-center',
                'flex-end': 'items-end',
                'stretch': 'items-stretch',
            },
        };

        const propertyMapping = mappings[property];
        if (propertyMapping) {
            return propertyMapping[value] || null;
        }

        return null;
    }

    /**
     * Generate component documentation
     */
    static generateDocumentation(component: any): string {
        const componentName = this.toPascalCase(component.name);

        return `/**
 * ${componentName} Component
 * 
 * Generated from Superdesign Canvas
 * 
 * @param props - Component props
 * @returns JSX element
 * 
 * @example
 * \`\`\`tsx
 * <${componentName} className="custom-class">
 *   Content here
 * </${componentName}>
 * \`\`\`
 */`;
    }

    /**
     * Generate component tests
     */
    static generateTests(component: any): string {
        const componentName = this.toPascalCase(component.name);

        return `import { render, screen } from '@testing-library/react';
import { ${componentName} } from './${componentName}';

describe('${componentName}', () => {
  it('renders without crashing', () => {
    render(<${componentName} />);
    expect(screen.getByRole('generic')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<${componentName} className="custom-class" />);
    expect(screen.getByRole('generic')).toHaveClass('custom-class');
  });

  it('renders children', () => {
    render(<${componentName}>Test content</${componentName}>);
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });
});`;
    }
}

// Export utility functions
export const {
    generateReactComponent,
    generateTypeScriptTypes,
    generateCSSClasses,
    generateTailwindClasses,
    validateComponent,
    validateDesign,
    generateDocumentation,
    generateTests
} = SuperdesignUtils;
