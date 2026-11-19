import React, { useRef, useState } from 'react';
import { StatusBar } from './StatusBar';
import { INITIAL_ACCOUNT, formatNaira } from '../data/bankData';

interface ProfileScreenProps {
  balance: number;
  profileImage: string | null;
  transactionFailedMode: boolean;
  transactionPendingMode: boolean;
  onBack: () => void;
  onAddMoney: (amount: number, sourceLabel: string) => void;
  onUpdateProfileImage: (imageDataUrl: string | null) => void;
  onToggleTransactionFailedMode: (enabled: boolean) => void;
  onToggleTransactionPendingMode: (enabled: boolean) => void;
}

const QUICK_TOPUP_AMOUNTS = [5000, 10000, 25000, 50000, 100000];
const FUNDING_SOURCES = [
  'Debit Card Top-Up',
  'Bank Transfer Inflow',
  'Cash / Agent Deposit',
];

function resizeImageToDataUrl(file: File, maxSize = 360): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('Invalid image file.'));
        return;
      }

      const img = new Image();
      img.onerror = () => resolve(result);
      img.onload = () => {
        try {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(result);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch {
          resolve(result);
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  balance,
  profileImage,
  transactionFailedMode,
  transactionPendingMode,
  onBack,
  onAddMoney,
  onUpdateProfileImage,
  onToggleTransactionFailedMode,
  onToggleTransactionPendingMode,
}) => {
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [activeDetailModal, setActiveDetailModal] = useState<
    'bvn' | 'nin' | 'display' | null
  >(null);
  const [showAddMoneyModal, setShowAddMoneyModal] = useState(false);
  const [topUpAmountInput, setTopUpAmountInput] = useState('');
  const [selectedSource, setSelectedSource] = useState(FUNDING_SOURCES[0]);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string) => {
    setCopiedMessage(message);
    setTimeout(() => {
      setCopiedMessage(null);
    }, 2400);
  };

  const handleCopy = async (label: string, value: string) => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(value);
    }
    showToast(`${label} (${value}) copied`);
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file');
      return;
    }

    setIsUploadingImage(true);
    try {
      const compressedDataUrl = await resizeImageToDataUrl(file);
      onUpdateProfileImage(compressedDataUrl);
      showToast('Profile photo updated');
    } catch {
      showToast('Could not upload photo. Please try another image.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const parsedTopUpAmount = parseFloat(topUpAmountInput.replace(/,/g, ''));
  const isTopUpValid =
    Number.isFinite(parsedTopUpAmount) &&
    parsedTopUpAmount > 0 &&
    parsedTopUpAmount <= 100000000;

  const handleSubmitTopUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(parsedTopUpAmount) || parsedTopUpAmount <= 0) {
      setTopUpError('Please enter an amount greater than ₦0.00.');
      return;
    }
    if (parsedTopUpAmount > 100000000) {
      setTopUpError('Maximum single top-up is ₦100,000,000.00.');
      return;
    }

    const cleanAmount = Number(parsedTopUpAmount.toFixed(2));
    onAddMoney(cleanAmount, selectedSource);
    setShowAddMoneyModal(false);
    setTopUpAmountInput('');
    setTopUpError(null);
    showToast(`₦${formatNaira(cleanAmount)} added to your account`);
  };

  return (
    <div className="relative w-full min-h-screen bg-white flex flex-col justify-between overflow-x-hidden select-none">
      <div className="max-w-2xl w-full mx-auto flex-1 flex flex-col">
        <StatusBar time="12:37" />

        {/* Header with Back Chevron & Title */}
        <div className="flex items-center px-4 pt-3 pb-4">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 -ml-2 flex items-center justify-center text-[#111827] hover:bg-gray-100 rounded-full active:scale-95 transition"
            aria-label="Go back"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="flex-1 text-center text-[16.5px] font-semibold text-[#111827] pr-8">
            Profile
          </h1>
        </div>

        {/* Main Scrollable Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-12">
          {/* Hidden File Input for Profile Image Upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageFileChange}
            className="hidden"
            aria-label="Upload profile photo"
          />

          {/* Large Avatar Circle with Interactive Photo Upload */}
          <div className="flex flex-col items-center mt-1 mb-6">
            <button
              type="button"
              disabled={isUploadingImage}
              onClick={() => fileInputRef.current?.click()}
              className="relative w-[148px] h-[148px] rounded-full bg-gradient-to-b from-[#ECEEEF] to-[#DCDFE3] overflow-hidden flex flex-col items-center justify-center mb-3.5 group focus:outline-none focus:ring-2 focus:ring-[#4F8D9E] focus:ring-offset-2 active:scale-[0.98] transition"
              aria-label={profileImage ? 'Change profile photo' : 'Add profile photo'}
            >
              {profileImage ? (
                <img
                  src={profileImage}
                  alt="Abdulsalam Tiamiyu"
                  className="w-full h-full object-cover"
                />
              ) : (
                <>
                  {/* Silhouette head & shoulders */}
                  <div className="w-[54px] h-[54px] rounded-full bg-[#B8BCC2] -mt-4" />
                  <div className="w-[96px] h-[44px] rounded-t-full bg-[#B8BCC2] mt-2" />
                </>
              )}

              {/* Bottom dark grey overlay strip with gallery picture icon */}
              <div className="absolute bottom-0 inset-x-0 h-[38px] bg-[#636466]/85 group-hover:bg-[#4B4C4E]/95 flex items-center justify-center transition">
                <svg width="20" height="17" viewBox="0 0 24 20" fill="none" stroke="white" strokeWidth="1.7">
                  <rect x="2" y="2" width="20" height="16" rx="1.5" />
                  <circle cx="16.5" cy="7" r="1.5" fill="white" />
                  <path d="M3 16l5.5-5.5 4.5 4.5 3.5-3 4.5 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            <h2 className="text-[19px] font-bold text-[#111827] tracking-tight uppercase">
              ABDULSALAM TIAMIYU
            </h2>
            <button
              type="button"
              onClick={() => handleCopy('Referral Code', 'ABDUT659')}
              className="text-[14px] font-medium text-[#58595B] mt-1 hover:text-[#111827] transition"
            >
              Ref Code: ABDUT659
            </button>

            <div className="flex items-center gap-3 mt-2.5">
              <button
                type="button"
                disabled={isUploadingImage}
                onClick={() => fileInputRef.current?.click()}
                className="text-[12.5px] font-semibold text-[#4F8D9E] hover:underline disabled:opacity-50"
              >
                {isUploadingImage
                  ? 'Uploading...'
                  : profileImage
                    ? 'Change Photo'
                    : 'Add Profile Photo'}
              </button>
              {profileImage && (
                <>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateProfileImage(null);
                      showToast('Profile photo removed');
                    }}
                    className="text-[12.5px] font-semibold text-[#D92027] hover:underline"
                  >
                    Remove Photo
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Account Balance & Add Money Card */}
          <div className="rounded-[16px] bg-[#1F2E4D] text-white p-4 mb-6 shadow-xs flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] text-white/75 font-medium">
                Account Balance · {INITIAL_ACCOUNT.accountNumber}
              </div>
              <div className="text-[21px] font-bold tracking-tight tabular-nums mt-0.5 truncate">
                ₦{formatNaira(balance)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setTopUpError(null);
                setShowAddMoneyModal(true);
              }}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#4F8D9E] hover:bg-[#417A8A] text-white text-[13px] font-semibold active:scale-95 transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              <span>Add Money</span>
            </button>
          </div>

          {/* Account Details Section Header */}
          <div className="text-[15.5px] font-semibold text-[#6B7280] mb-3">
            Account Details
          </div>

          <div className="divide-y divide-[#F3F4F6] mb-7">
            {/* 1. Bank Account Number */}
            <div className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Blue person avatar icon */}
                <div className="w-9 h-9 flex items-center justify-center shrink-0">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <circle cx="14" cy="9" r="5" fill="#29ABE2" />
                    <path d="M4 25c1.5-5 5-7.5 10-7.5s8.5 2.5 10 7.5" fill="#29ABE2" />
                  </svg>
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[#111827]">
                    Bank Account Number
                  </div>
                  <div className="text-[13px] text-[#6B7280] mt-0.5 tabular-nums">
                    {INITIAL_ACCOUNT.accountNumber}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCopy('Bank Account Number', INITIAL_ACCOUNT.accountNumber)}
                className="p-2 text-[#4A89B0] hover:bg-gray-50 rounded-lg active:scale-95 transition"
                aria-label="Copy Bank Account Number"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <rect x="5" y="7" width="11" height="13" rx="1.5" />
                  <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v11a1.5 1.5 0 0 1-1.5 1.5H16" />
                </svg>
              </button>
            </div>

            {/* 2. BVN */}
            <div className="py-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setActiveDetailModal('bvn')}
                className="flex items-center gap-4 text-left flex-1"
              >
                {/* Light blue shield with checkmark */}
                <div className="w-9 h-9 flex items-center justify-center shrink-0">
                  <svg width="26" height="28" viewBox="0 0 26 28" fill="none">
                    <path d="M13 2L3 6.5V13.5C3 20 7.3 25.5 13 27C18.7 25.5 23 20 23 13.5V6.5L13 2Z" fill="#BAE6FD" />
                    <path d="M13 4.5L5.5 8V13.5C5.5 18.6 8.8 23 13 24.3C17.2 23 20.5 18.6 20.5 13.5V8L13 4.5Z" fill="#38BDF8" />
                    <path d="M9.5 14L12 16.5L17 11.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[#111827]">
                    BVN
                  </div>
                  <div className="text-[13px] text-[#6B7280] mt-0.5">
                    View your details
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleCopy('BVN', '22481903745')}
                className="p-2 text-[#4A89B0] hover:bg-gray-50 rounded-lg active:scale-95 transition"
                aria-label="Copy BVN"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <rect x="5" y="7" width="11" height="13" rx="1.5" />
                  <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v11a1.5 1.5 0 0 1-1.5 1.5H16" />
                </svg>
              </button>
            </div>

            {/* 3. Bank Sort Code */}
            <div className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Bank building with green BANK roof */}
                <div className="w-9 h-9 flex items-center justify-center shrink-0">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <rect x="4" y="9" width="20" height="15" fill="#BAE6FD" />
                    <rect x="6" y="4" width="16" height="5" rx="1" fill="#ECFCCB" />
                    <text x="8" y="8" fill="#4ADE80" fontSize="4.5" fontWeight="bold">BANK</text>
                    <rect x="7" y="12" width="3" height="3" fill="#38BDF8" />
                    <rect x="12.5" y="12" width="3" height="3" fill="#38BDF8" />
                    <rect x="18" y="12" width="3" height="3" fill="#38BDF8" />
                    <rect x="11" y="18" width="6" height="6" fill="#0284C7" />
                    <rect x="2" y="24" width="24" height="2" fill="#84CC16" />
                  </svg>
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[#111827]">
                    Bank Sort Code
                  </div>
                  <div className="text-[13px] text-[#6B7280] mt-0.5 tabular-nums">
                    232
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCopy('Bank Sort Code', '232')}
                className="p-2 text-[#4A89B0] hover:bg-gray-50 rounded-lg active:scale-95 transition"
                aria-label="Copy Bank Sort Code"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <rect x="5" y="7" width="11" height="13" rx="1.5" />
                  <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v11a1.5 1.5 0 0 1-1.5 1.5H16" />
                </svg>
              </button>
            </div>

            {/* 4. NIN */}
            <div className="py-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setActiveDetailModal('nin')}
                className="flex items-center gap-4 text-left flex-1"
              >
                {/* Light blue shield with checkmark */}
                <div className="w-9 h-9 flex items-center justify-center shrink-0">
                  <svg width="26" height="28" viewBox="0 0 26 28" fill="none">
                    <path d="M13 2L3 6.5V13.5C3 20 7.3 25.5 13 27C18.7 25.5 23 20 23 13.5V6.5L13 2Z" fill="#BAE6FD" />
                    <path d="M13 4.5L5.5 8V13.5C5.5 18.6 8.8 23 13 24.3C17.2 23 20.5 18.6 20.5 13.5V8L13 4.5Z" fill="#38BDF8" />
                    <path d="M9.5 14L12 16.5L17 11.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[#111827]">
                    NIN
                  </div>
                  <div className="text-[13px] text-[#6B7280] mt-0.5">
                    View your details
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleCopy('NIN', '59102837461')}
                className="p-2 text-[#4A89B0] hover:bg-gray-50 rounded-lg active:scale-95 transition"
                aria-label="Copy NIN"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <rect x="5" y="7" width="11" height="13" rx="1.5" />
                  <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v11a1.5 1.5 0 0 1-1.5 1.5H16" />
                </svg>
              </button>
            </div>

            {/* 5. Display Preference */}
            <button
              type="button"
              onClick={() => setActiveDetailModal('display')}
              className="w-full py-4 flex items-center justify-between text-left hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-4">
                {/* Dark green/slate crescent moon icon */}
                <div className="w-9 h-9 flex items-center justify-center shrink-0">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="#364E48">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[#111827]">
                    Display Preference
                  </div>
                  <div className="text-[13px] text-[#6B7280] mt-0.5">
                    Manage display preference
                  </div>
                </div>
              </div>

              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2.2" className="mr-1">
                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* 6. Transaction Failed Mode Toggle */}
            <div className="py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    transactionFailedMode
                      ? 'bg-[#FEE2E2] text-[#D92027]'
                      : 'bg-[#F3F4F6] text-[#6B7280]'
                  }`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v4.5M12 16h.01" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[#111827]">
                    Transaction Failed Mode
                  </div>
                  <div
                    className={`text-[13px] mt-0.5 ${
                      transactionFailedMode ? 'text-[#D92027] font-medium' : 'text-[#6B7280]'
                    }`}
                  >
                    {transactionFailedMode
                      ? 'On · Outgoing transfers will fail'
                      : 'Off · Normal transfer processing'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={transactionFailedMode}
                aria-label="Toggle Transaction Failed Mode"
                onClick={() => {
                  const next = !transactionFailedMode;
                  onToggleTransactionFailedMode(next);
                  showToast(
                    next
                      ? 'Transaction Failed Mode enabled'
                      : 'Transaction Failed Mode disabled'
                  );
                }}
                className={`relative w-12 h-7 rounded-full transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  transactionFailedMode
                    ? 'bg-[#D92027] focus:ring-[#D92027]'
                    : 'bg-[#D1D5DB] focus:ring-[#4F8D9E]'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-xs transform transition-transform ${
                    transactionFailedMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* 7. Transaction Pending Mode Toggle */}
            <div className="py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    transactionPendingMode
                      ? 'bg-[#FEF3C7] text-[#D97706]'
                      : 'bg-[#F3F4F6] text-[#6B7280]'
                  }`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[#111827]">
                    Transaction Pending Mode
                  </div>
                  <div
                    className={`text-[13px] mt-0.5 ${
                      transactionPendingMode ? 'text-[#D97706] font-medium' : 'text-[#6B7280]'
                    }`}
                  >
                    {transactionPendingMode
                      ? 'On · Outgoing transfers stay pending'
                      : 'Off · Normal transfer processing'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={transactionPendingMode}
                aria-label="Toggle Transaction Pending Mode"
                onClick={() => {
                  const next = !transactionPendingMode;
                  onToggleTransactionPendingMode(next);
                  showToast(
                    next
                      ? 'Transaction Pending Mode enabled'
                      : 'Transaction Pending Mode disabled'
                  );
                }}
                className={`relative w-12 h-7 rounded-full transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  transactionPendingMode
                    ? 'bg-[#F59E0B] focus:ring-[#F59E0B]'
                    : 'bg-[#D1D5DB] focus:ring-[#4F8D9E]'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-xs transform transition-transform ${
                    transactionPendingMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Your Personal Information Section */}
          <div className="text-[15.5px] font-semibold text-[#6B7280] mb-3">
            Your Personal Information
          </div>
          <div className="divide-y divide-[#F3F4F6] text-sm">
            <div className="py-3 flex justify-between">
              <span className="text-[#6B7280]">Full Name</span>
              <span className="font-semibold text-[#111827]">ABDULSALAM TIAMIYU</span>
            </div>
            <div className="py-3 flex justify-between">
              <span className="text-[#6B7280]">Account Tier</span>
              <span className="font-semibold text-[#111827]">Tier 1 (Savings - Financial Inclusion)</span>
            </div>
          </div>
        </div>

        {/* Copy Feedback Toast */}
        {copiedMessage && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#111827] text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg">
            {copiedMessage}
          </div>
        )}
      </div>

      {/* BVN / NIN / Display Preference Modal */}
      {activeDetailModal && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/45">
          <div className="flex-1" onClick={() => setActiveDetailModal(null)} />
          <div className="bg-white rounded-t-[26px] p-6 max-w-2xl w-full mx-auto shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-[#111827]">
                {activeDetailModal === 'bvn' && 'Bank Verification Number (BVN)'}
                {activeDetailModal === 'nin' && 'National Identification Number (NIN)'}
                {activeDetailModal === 'display' && 'Display Preference'}
              </h3>
              <button
                type="button"
                onClick={() => setActiveDetailModal(null)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {activeDetailModal === 'bvn' && (
              <div className="space-y-2 text-sm mb-4">
                <div className="p-3.5 rounded-xl bg-gray-50 flex items-center justify-between">
                  <span className="text-[#6B7280]">Verified BVN</span>
                  <span className="font-bold text-[#111827] tabular-nums">22481903745</span>
                </div>
              </div>
            )}

            {activeDetailModal === 'nin' && (
              <div className="space-y-2 text-sm mb-4">
                <div className="p-3.5 rounded-xl bg-gray-50 flex items-center justify-between">
                  <span className="text-[#6B7280]">Verified NIN</span>
                  <span className="font-bold text-[#111827] tabular-nums">59102837461</span>
                </div>
              </div>
            )}

            {activeDetailModal === 'display' && (
              <div className="space-y-2 text-sm mb-4">
                <div className="p-3.5 rounded-xl border border-[#4F8D9E] bg-[#4F8D9E]/10 flex items-center justify-between font-semibold text-[#111827]">
                  <span>OneBank Light Mode (Default)</span>
                  <span className="text-[#4F8D9E]">✓</span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setActiveDetailModal(null)}
              className="w-full py-3 rounded-xl bg-[#1F2E4D] text-white text-sm font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Add Money / Top-Up Modal */}
      {showAddMoneyModal && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/45">
          <div
            className="flex-1"
            onClick={() => setShowAddMoneyModal(false)}
          />
          <form
            onSubmit={handleSubmitTopUp}
            className="bg-white rounded-t-[26px] p-6 max-w-2xl w-full mx-auto shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[17px] font-bold text-[#111827]">
                  Add Money to Account
                </h3>
                <p className="text-[12px] text-[#6B7280] mt-0.5 tabular-nums">
                  Sterling Savings · {INITIAL_ACCOUNT.accountNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMoneyModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[#111827]"
                aria-label="Close Add Money modal"
              >
                ✕
              </button>
            </div>

            <div className="mb-4">
              <label
                htmlFor="profile-add-money-amount"
                className="block text-[12.5px] font-semibold text-[#374151] mb-1.5"
              >
                Amount (NGN)
              </label>
              <div className="flex items-center rounded-xl border border-[#D1D5DB] focus-within:border-[#4F8D9E] px-3.5 py-3 bg-[#F9FAFB]">
                <span className="text-[18px] font-bold text-[#111827] mr-2">₦</span>
                <input
                  id="profile-add-money-amount"
                  type="tel"
                  inputMode="decimal"
                  autoFocus
                  value={topUpAmountInput}
                  onChange={(e) => {
                    const sanitized = e.target.value
                      .replace(/[^0-9.]/g, '')
                      .replace(/(\..*)\./g, '$1');
                    setTopUpAmountInput(sanitized);
                    setTopUpError(null);
                  }}
                  placeholder="0.00"
                  className="w-full bg-transparent text-[20px] font-bold text-[#111827] placeholder-[#9CA3AF] focus:outline-none tabular-nums"
                />
              </div>
            </div>

            {/* Quick Amount Buttons */}
            <div className="mb-4">
              <div className="text-[12px] font-semibold text-[#6B7280] mb-2">
                Quick Select
              </div>
              <div className="grid grid-cols-3 gap-2">
                {QUICK_TOPUP_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setTopUpAmountInput(String(preset));
                      setTopUpError(null);
                    }}
                    className={`py-2 px-2.5 rounded-xl border text-[12.5px] font-semibold tabular-nums transition ${
                      parsedTopUpAmount === preset
                        ? 'border-[#4F8D9E] bg-[#4F8D9E]/10 text-[#1F2E4D]'
                        : 'border-[#E5E7EB] bg-white text-[#374151] hover:bg-gray-50'
                    }`}
                  >
                    ₦{preset.toLocaleString('en-NG')}
                  </button>
                ))}
              </div>
            </div>

            {/* Funding Source */}
            <div className="mb-5">
              <div className="text-[12px] font-semibold text-[#6B7280] mb-2">
                Funding Source
              </div>
              <div className="space-y-2">
                {FUNDING_SOURCES.map((source) => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => setSelectedSource(source)}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-left text-[13px] font-medium flex items-center justify-between transition ${
                      selectedSource === source
                        ? 'border-[#4F8D9E] bg-[#4F8D9E]/10 text-[#111827] font-semibold'
                        : 'border-[#E5E7EB] bg-white text-[#4B5563] hover:bg-gray-50'
                    }`}
                  >
                    <span>{source}</span>
                    {selectedSource === source && (
                      <span className="text-[#4F8D9E] font-bold">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {topUpError && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[12px] font-medium text-[#D92027]">
                {topUpError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-[#1F2E4D] hover:bg-[#16223A] text-white text-[14.5px] font-semibold active:scale-[0.99] transition"
            >
              {isTopUpValid
                ? `Add ₦${formatNaira(parsedTopUpAmount)} to Account`
                : 'Add Money to Account'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
