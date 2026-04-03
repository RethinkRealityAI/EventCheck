// components/Seating/ConfirmDialog.tsx
import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    confirmVariant?: 'danger' | 'primary';
    onConfirm: () => void;
    onCancel: () => void;
    inputMode?: {
        placeholder: string;
        defaultValue?: string;
        onConfirmWithValue: (value: string) => void;
    };
}

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    confirmVariant = 'primary',
    onConfirm,
    onCancel,
    inputMode,
}: ConfirmDialogProps) {
    const [inputValue, setInputValue] = useState(inputMode?.defaultValue || '');

    if (!open) return null;

    const handleConfirm = () => {
        if (inputMode) {
            if (!inputValue.trim()) return;
            inputMode.onConfirmWithValue(inputValue.trim());
        } else {
            onConfirm();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleConfirm();
        if (e.key === 'Escape') onCancel();
    };

    const btnColor = confirmVariant === 'danger'
        ? 'bg-red-600 hover:bg-red-700'
        : 'bg-indigo-600 hover:bg-indigo-700';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onKeyDown={handleKeyDown}>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in-95">
                <div className="flex items-start gap-3 mb-4">
                    {confirmVariant === 'danger' && (
                        <div className="p-2 bg-red-500/10 rounded-xl">
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                        </div>
                    )}
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-white">{title}</h3>
                        <p className="text-sm text-slate-400 mt-1">{message}</p>
                    </div>
                    <button onClick={onCancel} className="p-1 text-slate-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {inputMode && (
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={inputMode.placeholder}
                        autoFocus
                        className="w-full bg-slate-900/50 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 mb-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                )}

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        className={`px-4 py-2 text-sm font-bold text-white rounded-xl transition-colors ${btnColor}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
