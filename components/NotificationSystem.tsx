import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface Notification {
    id: string;
    message: string;
    type: NotificationType;
    duration?: number;
}

interface NotificationContextType {
    showNotification: (message: string, type: NotificationType, duration?: number) => void;
    removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const showNotification = useCallback((message: string, type: NotificationType, duration = 5000) => {
        const id = Math.random().toString(36).substr(2, 9);
        setNotifications(prev => [...prev, { id, message, type, duration }]);

        if (duration > 0) {
            setTimeout(() => {
                removeNotification(id);
            }, duration);
        }
    }, [removeNotification]);

    return (
        <NotificationContext.Provider value={{ showNotification, removeNotification }}>
            {children}
            <Toaster notifications={notifications} removeNotification={removeNotification} />
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};

const Toaster: React.FC<{ notifications: Notification[], removeNotification: (id: string) => void }> = ({ notifications, removeNotification }) => {
    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
            {notifications.map((notification) => (
                <Toast key={notification.id} notification={notification} onRemove={() => removeNotification(notification.id)} />
            ))}
        </div>
    );
};

const Toast: React.FC<{ notification: Notification, onRemove: () => void }> = ({ notification, onRemove }) => {
    const icons = {
        success: <CheckCircle className="w-5 h-5 text-green-500" />,
        error: <AlertCircle className="w-5 h-5 text-red-500" />,
        info: <Info className="w-5 h-5 text-blue-500" />,
        warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    };

    const colors = {
        success: 'border-green-100 bg-white text-gray-800',
        error: 'border-red-100 bg-white text-gray-800',
        info: 'border-blue-100 bg-white text-gray-800',
        warning: 'border-amber-100 bg-white text-gray-800',
    };

    return (
        <div className={`
      pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl
      animate-in slide-in-from-right-full duration-300 ease-out
      min-w-[300px] max-w-md ${colors[notification.type]}
    `}>
            <div className="flex-shrink-0">
                {icons[notification.type]}
            </div>
            <div className="flex-1 text-sm font-medium">
                {notification.message}
            </div>
            <button
                onClick={onRemove}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};
