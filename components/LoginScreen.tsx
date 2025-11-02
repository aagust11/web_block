
import React, { useState, useCallback } from 'react';
import { fetchUsers } from '../services/googleSheetService';
import { type UserData } from '../types';

interface LoginScreenProps {
    onLoginSuccess: (user: UserData, isAdmin: boolean) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = useCallback(async () => {
        if (!code.trim()) {
            setError('Please enter a code.');
            return;
        }
        setIsLoading(true);
        setError('');

        if (code.toLowerCase() === 'admin') {
            if (password === 'Hab31447259!') {
                onLoginSuccess({ code: 'admin', visible: true, link: '', unlockCode: '' }, true);
            } else {
                setError('Invalid admin password.');
            }
            setIsLoading(false);
            return;
        }

        try {
            const users = await fetchUsers();
            const user = users.find(u => u.code.toLowerCase() === code.toLowerCase());

            if (user) {
                if (user.visible) {
                    onLoginSuccess(user, false);
                } else {
                    setError('Access for this code is disabled.');
                }
            } else {
                setError('Invalid code.');
            }
        } catch (err) {
            setError('Failed to verify code. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [code, name, password, onLoginSuccess]);

    const isLoginAdmin = code.toLowerCase() === 'admin';

    return (
        <div className="w-full max-w-md p-8 space-y-6 bg-gray-800 rounded-xl shadow-lg">
            <div className="text-center">
                <h1 className="text-3xl font-bold text-cyan-400">Secure Access</h1>
                <p className="text-gray-400">Enter your credentials to continue</p>
            </div>
            <div className="space-y-4">
                <div>
                    <label htmlFor="code" className="text-sm font-medium text-gray-300">Access Code</label>
                    <input
                        id="code"
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="w-full px-4 py-2 mt-1 text-gray-100 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        placeholder="e.g., A123"
                    />
                </div>
                {!isLoginAdmin ? (
                    <div>
                        <label htmlFor="name" className="text-sm font-medium text-gray-300">Your Name</label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 mt-1 text-gray-100 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            placeholder="John Doe"
                        />
                    </div>
                ) : (
                    <div>
                        <label htmlFor="password" className="text-sm font-medium text-gray-300">Admin Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2 mt-1 text-gray-100 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                    </div>
                )}
            </div>
            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
            <button
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full px-4 py-2 font-bold text-white bg-cyan-600 rounded-md hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500 disabled:bg-gray-500 transition-colors"
            >
                {isLoading ? 'Verifying...' : 'Continue'}
            </button>
        </div>
    );
};

export default LoginScreen;

