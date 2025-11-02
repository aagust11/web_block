
import React, { useState, useCallback } from 'react';
import LoginScreen from './components/LoginScreen';
import UserView from './components/UserView';
import AdminView from './components/AdminView';
import { type UserData } from './types';

const App: React.FC = () => {
    const [user, setUser] = useState<UserData | null>(null);
    const [isAdmin, setIsAdmin] = useState<boolean>(false);

    const handleLoginSuccess = useCallback((loggedInUser: UserData, admin: boolean) => {
        setUser(loggedInUser);
        setIsAdmin(admin);
    }, []);

    const handleLogout = useCallback(() => {
        setUser(null);
        setIsAdmin(false);
    }, []);

    const renderContent = () => {
        if (!user) {
            return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
        }
        if (isAdmin) {
            return <AdminView onLogout={handleLogout} />;
        }
        return <UserView user={user} onLogout={handleLogout} />;
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center font-sans">
            {renderContent()}
        </div>
    );
};

export default App;
