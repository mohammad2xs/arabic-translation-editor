'use client';

import React, { useState } from 'react';

interface CalculatorDisplayProps {
    value: string;
    className?: string;
}

function CalculatorDisplay({ value, className = '' }: CalculatorDisplayProps) {
    return (
        <div
            className={`bg-gray-900 text-white text-3xl font-light text-right p-4 rounded-lg mb-4 min-h-16 flex items-center justify-end ${className}`}
            aria-label="Calculator display showing current value"
        >
            {value}
        </div>
    );
}

interface CalculatorButtonProps {
    text: string;
    variant: 'number' | 'operator' | 'function';
    onClick: () => void;
    className?: string;
}

function CalculatorButton({ text, variant, onClick, className = '' }: CalculatorButtonProps) {
    const baseClasses = "border-none rounded-lg text-2xl font-medium p-4 cursor-pointer transition-all duration-200 min-h-16 min-w-16 flex items-center justify-center";

    const variantClasses = {
        number: "bg-gray-700 text-white hover:bg-gray-600 active:bg-gray-500",
        operator: "bg-orange-500 text-white hover:bg-orange-400 active:bg-orange-600",
        function: "bg-gray-400 text-black hover:bg-gray-300 active:bg-gray-500"
    };

    return (
        <button
            className={`${baseClasses} ${variantClasses[variant]} ${className}`}
            onClick={onClick}
            aria-label={`Calculator button: ${text}`}
        >
            {text}
        </button>
    );
}

export default function CalculatorUI() {
    const [display, setDisplay] = useState('0');
    const [previousValue, setPreviousValue] = useState<number | null>(null);
    const [operation, setOperation] = useState<string | null>(null);
    const [waitingForOperand, setWaitingForOperand] = useState(false);

    const inputNumber = (num: string) => {
        if (waitingForOperand) {
            setDisplay(num);
            setWaitingForOperand(false);
        } else {
            setDisplay(display === '0' ? num : display + num);
        }
    };

    const inputDecimal = () => {
        if (waitingForOperand) {
            setDisplay('0.');
            setWaitingForOperand(false);
        } else if (display.indexOf('.') === -1) {
            setDisplay(display + '.');
        }
    };

    const clear = () => {
        setDisplay('0');
        setPreviousValue(null);
        setOperation(null);
        setWaitingForOperand(false);
    };

    const performOperation = (nextOperation: string) => {
        const inputValue = parseFloat(display);

        if (previousValue === null) {
            setPreviousValue(inputValue);
        } else if (operation) {
            const currentValue = previousValue || 0;
            const newValue = calculate(currentValue, inputValue, operation);

            setDisplay(String(newValue));
            setPreviousValue(newValue);
        }

        setWaitingForOperand(true);
        setOperation(nextOperation);
    };

    const calculate = (firstValue: number, secondValue: number, operation: string): number => {
        switch (operation) {
            case '+':
                return firstValue + secondValue;
            case '-':
                return firstValue - secondValue;
            case '×':
                return firstValue * secondValue;
            case '÷':
                return firstValue / secondValue;
            case '=':
                return secondValue;
            default:
                return secondValue;
        }
    };

    const handleEquals = () => {
        const inputValue = parseFloat(display);

        if (previousValue !== null && operation) {
            const newValue = calculate(previousValue, inputValue, operation);
            setDisplay(String(newValue));
            setPreviousValue(null);
            setOperation(null);
            setWaitingForOperand(true);
        }
    };

    return (
        <div className="max-w-sm mx-auto p-4 bg-black rounded-2xl">
            <CalculatorDisplay value={display} />

            <div className="grid grid-cols-4 gap-2">
                {/* Row 1 */}
                <CalculatorButton text="C" variant="function" onClick={clear} className="col-span-2" />
                <CalculatorButton text="CE" variant="function" onClick={clear} />
                <CalculatorButton text="÷" variant="operator" onClick={() => performOperation('÷')} />

                {/* Row 2 */}
                <CalculatorButton text="7" variant="number" onClick={() => inputNumber('7')} />
                <CalculatorButton text="8" variant="number" onClick={() => inputNumber('8')} />
                <CalculatorButton text="9" variant="number" onClick={() => inputNumber('9')} />
                <CalculatorButton text="×" variant="operator" onClick={() => performOperation('×')} />

                {/* Row 3 */}
                <CalculatorButton text="4" variant="number" onClick={() => inputNumber('4')} />
                <CalculatorButton text="5" variant="number" onClick={() => inputNumber('5')} />
                <CalculatorButton text="6" variant="number" onClick={() => inputNumber('6')} />
                <CalculatorButton text="-" variant="operator" onClick={() => performOperation('-')} />

                {/* Row 4 */}
                <CalculatorButton text="1" variant="number" onClick={() => inputNumber('1')} />
                <CalculatorButton text="2" variant="number" onClick={() => inputNumber('2')} />
                <CalculatorButton text="3" variant="number" onClick={() => inputNumber('3')} />
                <CalculatorButton text="+" variant="operator" onClick={() => performOperation('+')} />

                {/* Row 5 */}
                <CalculatorButton text="0" variant="number" onClick={() => inputNumber('0')} className="col-span-2" />
                <CalculatorButton text="." variant="number" onClick={inputDecimal} />
                <CalculatorButton text="=" variant="operator" onClick={handleEquals} />
            </div>
        </div>
    );
}
