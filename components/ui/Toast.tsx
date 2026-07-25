'use client';
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { IconCheck, IconX, IconInfoCircle } from '@tabler/icons-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border min-w-[250px] animate-in slide-in-from-bottom-5 fade-in duration-300",
              t.type === 'success' ? "bg-ecms-success/10 border-ecms-success/20 text-ecms-success" :
              t.type === 'error' ? "bg-ecms-danger/10 border-ecms-danger/20 text-ecms-danger" :
              "bg-ecms-info/10 border-ecms-info/20 text-ecms-info"
            )}
          >
            {t.type === 'success' && <IconCheck size={20} />}
            {t.type === 'error' && <IconX size={20} />}
            {t.type === 'info' && <IconInfoCircle size={20} />}
            <span className="font-medium text-sm text-ecms-text">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context.toast;
}
