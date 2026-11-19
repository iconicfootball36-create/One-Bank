import React from 'react';
import { AppNotification } from '../data/bankData';

interface NotificationsSheetProps {
  isOpen: boolean;
  notifications: AppNotification[];
  onClose: () => void;
  onMarkAllRead: () => void;
  onSelectNotification: (notification: AppNotification) => void;
}

export const NotificationsSheet: React.FC<NotificationsSheetProps> = ({
  isOpen,
  notifications,
  onClose,
  onMarkAllRead,
  onSelectNotification,
}) => {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/45">
      <div className="flex-1" onClick={onClose} />
      <div className="bg-white rounded-t-[24px] p-6 max-w-2xl w-full mx-auto shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h3 className="text-[16.5px] font-bold text-[#111827]">
              Notifications ({notifications.length})
            </h3>
            <p className="text-[12px] text-[#6B7280] mt-0.5">
              {unreadCount > 0
                ? `${unreadCount} unread alert${unreadCount === 1 ? '' : 's'}`
                : 'All alerts caught up'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-[12px] font-semibold text-[#4F8D9E] hover:underline px-2 py-1"
              >
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600"
              aria-label="Close notifications"
            >
              ✕
            </button>
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#6B7280]">
            No transfer or account alerts yet.
          </div>
        ) : (
          <div className="space-y-2.5 overflow-y-auto no-scrollbar pr-0.5">
            {notifications.map((item) => {
              const isCredit = item.type === 'credit';
              const isDebit = item.type === 'debit';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectNotification(item)}
                  className={`w-full text-left p-3.5 rounded-xl border transition flex items-start gap-3 ${
                    item.read
                      ? 'bg-white border-[#F3F4F6] hover:bg-gray-50'
                      : 'bg-[#F8FAFC] border-[#DCE7EE] hover:bg-[#F1F5F9]'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      isCredit
                        ? 'bg-[#26B397]/15 text-[#17856F]'
                        : isDebit
                          ? 'bg-[#D92027]/12 text-[#D92027]'
                          : 'bg-[#4F8D9E]/15 text-[#4F8D9E]'
                    }`}
                  >
                    {isCredit ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                        <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : isDebit ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                        <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold text-[#111827] truncate">
                        {item.title}
                      </span>
                      {!item.read && (
                        <span
                          className="w-2 h-2 rounded-full bg-[#D92027] shrink-0"
                          aria-label="Unread"
                        />
                      )}
                    </div>
                    <p className="text-[12px] text-[#4B5563] mt-0.5 leading-relaxed">
                      {item.message}
                    </p>
                    <div className="flex items-center justify-between mt-1.5 text-[11px] text-[#6B7280]">
                      <span className="tabular-nums">{item.timestamp}</span>
                      {item.transactionId && (
                        <span className="font-semibold text-[#4F8D9E]">
                          View receipt
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
