
import React, { useState } from 'react';

interface LockScreenProps {
    unlockCode: string;
    onUnlock: () => void;
}

const LockScreen: React.FC<LockScreenProps> = ({ unlockCode, onUnlock }) => {
    const [inputCode, setInputCode] = useState('');
    const [error, setError] = useState('');

    const handleUnlockAttempt = () => {
        if (inputCode === unlockCode) {
            onUnlock();
        } else {
            setError('Incorrect unlock code.');
            setInputCode('');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleUnlockAttempt();
        }
    }

    return (
        <div className="fixed inset-0 bg-red-800 bg-opacity-95 flex flex-col items-center justify-center z-50">
            <div className="w-full max-w-sm p-8 space-y-6 bg-gray-800 rounded-xl shadow-2xl text-center">
                <div className="animate-pulse">
                    <svg className="mx-auto h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h1 className="text-3xl font-bold text-red-400">Session Locked</h1>
                <p className="text-gray-300">Please enter the unlock code to resume.</p>
                <div>
                    <input
                        type="password"
                        value={inputCode}
                        onChange={(e) => {
                            setInputCode(e.target.value);
                            setError('');
                        }}
                        onKeyPress={handleKeyPress}
                        className="w-full px-4 py-2 mt-1 text-center text-gray-100 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder="Unlock Code"
                        autoFocus
                    />
                </div>
                {error && <p className="text-sm text-yellow-400">{error}</p>}
                <button
                    onClick={handleUnlockAttempt}
                    className="w-full px-4 py-2 font-bold text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-red-500 transition-colors"
                >
                    Unlock
                </button>
            </div>
        </div>
    );
};

export default LockScreen;
