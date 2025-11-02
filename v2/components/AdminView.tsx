
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { type PeerStream } from '../types';

declare const Peer: any;

interface AdminViewProps {
    onLogout: () => void;
}

const ADMIN_PEER_ID = 'admin-peer-monitor-session-12345';

const AdminView: React.FC<AdminViewProps> = ({ onLogout }) => {
    const [streams, setStreams] = useState<PeerStream[]>([]);
    const [peerId, setPeerId] = useState<string | null>(null);
    const peerRef = useRef<any>(null);
    const dataConnectionsRef = useRef<Record<string, any>>({});
    const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

    useEffect(() => {
        const peer = new Peer(ADMIN_PEER_ID, {
            host: 'peerjs.92k.de',
            secure: true,
        });
        peerRef.current = peer;

        peer.on('open', (id: string) => {
            console.log('Admin PeerJS is open. ID:', id);
            setPeerId(id);
        });

        peer.on('call', (call: any) => {
            call.answer();
            call.on('stream', (remoteStream: MediaStream) => {
                console.log('Receiving stream from', call.peer);
                setStreams(prev => {
                    if (prev.find(s => s.peerId === call.peer)) return prev;
                    return [...prev, { peerId: call.peer, stream: remoteStream }];
                });
            });
            call.on('close', () => {
                console.log('Call closed from', call.peer);
                setStreams(prev => prev.filter(s => s.peerId !== call.peer));
            });
        });

        peer.on('connection', (conn: any) => {
            console.log('Data connection established with', conn.peer);
            dataConnectionsRef.current[conn.peer] = conn;

            conn.on('close', () => {
                console.log('Data connection closed with', conn.peer);
                delete dataConnectionsRef.current[conn.peer];
                setStreams(prev => prev.filter(s => s.peerId !== conn.peer));
            });
        });

        peer.on('error', (err: any) => {
            console.error('PeerJS error:', err);
        });

        return () => {
            peer.destroy();
        };
    }, []);

    const sendCommand = useCallback((peerId: string, command: 'lock' | 'unlock') => {
        const conn = dataConnectionsRef.current[peerId];
        if (conn && conn.open) {
            conn.send({ command });
        } else {
            console.warn(`No open data connection to ${peerId}`);
        }
    }, []);

    useEffect(() => {
        streams.forEach(s => {
            const videoElement = videoRefs.current[s.peerId];
            if (videoElement && videoElement.srcObject !== s.stream) {
                videoElement.srcObject = s.stream;
            }
        });
    }, [streams]);

    return (
        <div className="p-4 sm:p-6 lg:p-8 w-full min-h-screen bg-gray-900">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-cyan-400">Admin Dashboard</h1>
                    <p className="text-gray-400">
                        {peerId ? `Listening on ID: ${peerId}` : 'Initializing...'} | {streams.length} active session(s)
                    </p>
                </div>
                <button onClick={onLogout} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md transition-colors">Logout</button>
            </div>
            
            {streams.length === 0 ? (
                <div className="text-center py-20">
                    <p className="text-gray-500">Waiting for users to connect...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {streams.map(({ peerId, stream }) => (
                        <div key={peerId} className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                            <video
                                ref={el => videoRefs.current[peerId] = el}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-auto bg-black"
                            />
                            <div className="p-4">
                                <p className="text-sm text-gray-400 truncate font-mono">{peerId}</p>
                                <div className="mt-3 flex gap-2">
                                    <button 
                                        onClick={() => sendCommand(peerId, 'lock')}
                                        className="flex-1 px-4 py-2 text-sm font-semibold bg-yellow-600 hover:bg-yellow-700 rounded-md transition-colors"
                                    >
                                        Lock
                                    </button>
                                    <button 
                                        onClick={() => sendCommand(peerId, 'unlock')}
                                        className="flex-1 px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 rounded-md transition-colors"
                                    >
                                        Unlock
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AdminView;
