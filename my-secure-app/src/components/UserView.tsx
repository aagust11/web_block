
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { type UserData } from '../types';
import LockScreen from './LockScreen';

// This is necessary because PeerJS is loaded from a CDN and not as a module
declare const Peer: any;

interface UserViewProps {
    user: UserData;
    onLogout: () => void;
}

const ADMIN_PEER_ID = 'admin-peer-monitor-session-12345';

const UserView: React.FC<UserViewProps> = ({ user, onLogout }) => {
    const [isLocked, setIsLocked] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const [sharingError, setSharingError] = useState('');
    const peerRef = useRef<any>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const dataConnectionRef = useRef<any>(null);

    const handleLock = useCallback(() => {
        setIsLocked(true);
    }, []);

    const handleUnlock = useCallback(() => {
        setIsLocked(false);
        // Re-enter fullscreen after unlocking
        document.documentElement.requestFullscreen().catch(err => {
            console.error("Could not re-enter fullscreen:", err);
        });
    }, []);

    // Kiosk mode effect
    useEffect(() => {
        if (!isLocked && isSharing) {
            const handleVisibilityChange = () => {
                if (document.visibilityState === 'hidden') {
                    handleLock();
                }
            };
            const handleBlur = () => {
                // A brief timeout helps prevent false positives when focus shifts within the app
                setTimeout(() => {
                    if (document.activeElement?.tagName.toLowerCase() !== 'iframe') {
                        handleLock();
                    }
                }, 100);
            };
            
            window.addEventListener('blur', handleBlur);
            document.addEventListener('visibilitychange', handleVisibilityChange);
            return () => {
                window.removeEventListener('blur', handleBlur);
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            };
        }
    }, [isLocked, isSharing, handleLock]);

    // PeerJS setup effect
    useEffect(() => {
        if (!isSharing) return;

        const peer = new Peer(`user-${user.code}-${Date.now()}`, {
            host: 'peerjs.92k.de', // Using a public PeerJS server
            secure: true,
        });
        peerRef.current = peer;

        peer.on('open', (id: string) => {
            console.log('My peer ID is: ' + id);
            
            // Connect to admin for data (commands)
            const conn = peer.connect(ADMIN_PEER_ID);
            dataConnectionRef.current = conn;
            conn.on('open', () => {
                console.log('Data connection to admin established.');
                // Send user info
                conn.send({ type: 'userInfo', code: user.code });
            });
            conn.on('data', (data: any) => {
                console.log('Received command:', data);
                if (data.command === 'lock') {
                    setIsLocked(true);
                } else if (data.command === 'unlock') {
                    handleUnlock();
                }
            });

            // Call admin with screen stream
            if (streamRef.current) {
                const call = peer.call(ADMIN_PEER_ID, streamRef.current);
                call.on('error', (err: any) => console.error("PeerJS call error:", err));
            }
        });

        peer.on('error', (err: any) => {
            console.error('PeerJS error:', err);
            setSharingError(`Connection error: ${err.type}. Please refresh and try again.`);
        });

        return () => {
            peer.destroy();
        };
    }, [isSharing, user.code, handleUnlock]);


    const startSharing = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' } as any, // "any" to allow for newer spec properties
                audio: true,
            });
            streamRef.current = stream;
            document.documentElement.requestFullscreen();
            setIsSharing(true);
            setSharingError('');
        } catch (err) {
            console.error("Error getting display media", err);
            setSharingError('Screen sharing is required. Please allow access and try again.');
        }
    };

    if (isLocked) {
        return <LockScreen unlockCode={user.unlockCode} onUnlock={handleUnlock} />;
    }

    if (!isSharing) {
        return (
            <div className="text-center p-8 bg-gray-800 rounded-lg shadow-xl">
                <h2 className="text-2xl font-bold mb-4 text-cyan-400">Screen Sharing Required</h2>
                <p className="mb-6 text-gray-300">To proceed, you must share your entire screen. This session is monitored.</p>
                <button
                    onClick={startSharing}
                    className="px-6 py-3 font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                >
                    Start Sharing Screen
                </button>
                {sharingError && <p className="mt-4 text-red-400">{sharingError}</p>}
                 <button onClick={onLogout} className="mt-8 text-sm text-gray-500 hover:text-gray-300">Logout</button>
            </div>
        );
    }

    return (
        <div className="w-screen h-screen">
            <iframe
                src={user.link}
                title="Secure Content"
                className="w-full h-full border-0"
                allow="fullscreen"
            ></iframe>
        </div>
    );
};

export default UserView;
