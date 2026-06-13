import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export const Toast = ({ message, type = 'info', duration = 3000, onClose }) => {
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setShow(false);
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  if (!show) return null;

  const config = {
    error: { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-700', icon: AlertCircle },
    success: { bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-700', icon: CheckCircle },
    info: { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-700', icon: Info },
  };

  const style = config[type];
  const Icon = style.icon;

  return (
    <div className={`fixed top-4 right-4 flex items-center gap-3 px-4 py-3 rounded border ${style.bg} ${style.border} ${style.text} max-w-md z-50`} dir="rtl">
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={() => setShow(false)} className="flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const add = (message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, duration }]);
    return id;
  };

  const remove = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return { toasts, add, remove };
};

export const ToastContainer = ({ toasts, onRemove }) => (
  <div className="fixed top-4 right-4 z-50 space-y-2">
    {toasts.map(toast => (
      <Toast
        key={toast.id}
        message={toast.message}
        type={toast.type}
        duration={toast.duration}
        onClose={() => onRemove(toast.id)}
      />
    ))}
  </div>
);

export const ErrorMessage = ({ error, onDismiss }) => {
  if (!error) return null;

  return (
    <div className="flex items-center gap-2 p-3 bg-red-100 border border-red-300 text-red-700 rounded mb-4" dir="rtl">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      <span className="flex-1">{error}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export const LoadingSpinner = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  return (
    <div className={`${sizeClasses[size]} border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin`} />
  );
};

export const LoadingState = ({ isLoading, children }) => {
  if (!isLoading) return children;

  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="text-gray-600 mt-4">جاري التحميل...</p>
      </div>
    </div>
  );
};

export const EmptyState = ({ title, description, icon: Icon = AlertCircle }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4" dir="rtl">
    <Icon className="w-12 h-12 text-gray-400 mb-4" />
    <h3 className="text-lg font-semibold text-gray-700 mb-1">{title}</h3>
    <p className="text-gray-500 text-center">{description}</p>
  </div>
);
