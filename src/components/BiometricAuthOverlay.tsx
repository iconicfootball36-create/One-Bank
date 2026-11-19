import React, { useEffect, useState } from 'react';
import { formatNaira } from '../data/bankData';

export type BiometricMethod = 'faceid' | 'fingerprint';
type ScanStage = 'ready' | 'scanning' | 'verified';

interface BiometricAuthOverlayProps {
  isOpen: boolean;
  amount: number;
  recipientName: string;
  onSuccess: (method: BiometricMethod) => void;
  onFallbackToPin: () => void;
  onCancel: () => void;
}

export const BiometricAuthOverlay: React.FC<BiometricAuthOverlayProps> = ({
  isOpen,
  amount,
  recipientName,
  onSuccess,
  onFallbackToPin,
  onCancel,
}) => {
  const [method, setMethod] = useState<BiometricMethod>('faceid');
  const [stage, setStage] = useState<ScanStage>('ready');

  useEffect(() => {
    if (!isOpen) {
      setStage('ready');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || stage !== 'scanning') return;

    const verifyTimer = setTimeout(() => {
      setStage('verified');
    }, 850);

    return () => clearTimeout(verifyTimer);
  }, [isOpen, stage]);

  useEffect(() => {
    if (!isOpen || stage !== 'verified') return;

    const completeTimer = setTimeout(() => {
      onSuccess(method);
    }, 520);

    return () => clearTimeout(completeTimer);
  }, [isOpen, stage, method, onSuccess]);

  if (!isOpen) return null;

  const handleStartScan = () => {
    if (stage !== 'ready') return;
    setStage('scanning');
  };

  const handleMethodSwitch = (nextMethod: BiometricMethod) => {
    if (stage !== 'ready') return;
    setMethod(nextMethod);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end sm:justify-center sm:items-center bg-black/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="biometric-auth-title"
    >
      <div className="flex-1 sm:hidden" onClick={stage === 'ready' ? onCancel : undefined} />

      <div className="w-full max-w-md bg-white rounded-t-[26px] sm:rounded-[24px] px-6 pt-3 pb-7 shadow-2xl mx-auto">
        {/* Grab handle on mobile */}
        <div className="w-10 h-1 bg-[#D1D5DB] rounded-full mx-auto mb-4 sm:hidden" />

        {/* Header Row */}
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <h3
              id="biometric-auth-title"
              className="text-[16.5px] font-bold text-[#111827] tracking-tight"
            >
              Biometric Verification
            </h3>
            <p className="text-[12.5px] text-[#6B7280] mt-0.5 truncate tabular-nums">
              ₦{formatNaira(amount)} · {recipientName}
            </p>
          </div>

          <button
            type="button"
            disabled={stage !== 'ready'}
            onClick={onCancel}
            className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-[#4B5563] hover:bg-[#F3F4F6] transition disabled:opacity-40 shrink-0"
            aria-label="Cancel biometric check"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Method Switcher: Face ID / Fingerprint */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F2F4F7] mb-6">
          <button
            type="button"
            disabled={stage !== 'ready'}
            onClick={() => handleMethodSwitch('faceid')}
            className={`min-h-[40px] px-3 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition ${
              method === 'faceid'
                ? 'bg-white text-[#1D3557] shadow-xs'
                : 'text-[#6B7280] hover:text-[#111827]'
            } disabled:opacity-70`}
          >
            Face ID
          </button>
          <button
            type="button"
            disabled={stage !== 'ready'}
            onClick={() => handleMethodSwitch('fingerprint')}
            className={`min-h-[40px] px-3 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition ${
              method === 'fingerprint'
                ? 'bg-white text-[#1D3557] shadow-xs'
                : 'text-[#6B7280] hover:text-[#111827]'
            } disabled:opacity-70`}
          >
            Fingerprint
          </button>
        </div>

        {/* Interactive Biometric Sensor Area */}
        <div className="flex flex-col items-center py-2 mb-5">
          <button
            type="button"
            onClick={handleStartScan}
            disabled={stage !== 'ready'}
            aria-label={
              method === 'faceid'
                ? 'Authenticate with Face ID'
                : 'Authenticate with Fingerprint'
            }
            className={`relative w-28 h-28 rounded-3xl flex items-center justify-center transition-transform duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D3557] ${
              stage === 'verified'
                ? 'bg-[#26B397]/12 scale-100'
                : stage === 'scanning'
                  ? 'bg-[#1D3557]/8 scale-[1.03]'
                  : 'bg-[#F8FAFC] hover:bg-[#F1F5F9] active:scale-95 border border-[#E5E7EB]'
            }`}
          >
            {/* Outer subtle pulse ring while scanning */}
            {stage === 'scanning' && (
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-3xl border-2 border-[#4F8D9E] animate-ping opacity-35 motion-reduce:animate-none"
              />
            )}

            {stage === 'verified' ? (
              <div className="w-16 h-16 rounded-full bg-[#26B397] flex items-center justify-center transition-transform duration-200">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            ) : method === 'faceid' ? (
              <svg
                width="58"
                height="58"
                viewBox="0 0 48 48"
                fill="none"
                className={`transition-colors duration-200 ${
                  stage === 'scanning' ? 'text-[#4F8D9E]' : 'text-[#1D3557]'
                }`}
              >
                {/* Corner viewfinder brackets */}
                <path
                  d="M15 6H10C7.79 6 6 7.79 6 10V15M33 6H38C40.21 6 42 7.79 42 10V15M15 42H10C7.79 42 6 40.21 6 38V33M33 42H38C40.21 42 42 40.21 42 38V33"
                  stroke="currentColor"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                />
                {/* Eyes */}
                <path
                  d="M17.5 18V21.5M30.5 18V21.5"
                  stroke="currentColor"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                />
                {/* Nose */}
                <path
                  d="M24 18V26.5C24 27.3 23.4 28 22.5 28H21.5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Smile */}
                <path
                  d="M17.5 32.5C19.2 34.4 21.5 35.3 24 35.3C26.5 35.3 28.8 34.4 30.5 32.5"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />
                {/* Horizontal scan line when scanning */}
                {stage === 'scanning' && (
                  <line
                    x1="10"
                    y1="24"
                    x2="38"
                    y2="24"
                    stroke="#26B397"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="animate-pulse"
                  />
                )}
              </svg>
            ) : (
              <svg
                width="58"
                height="58"
                viewBox="0 0 48 48"
                fill="none"
                className={`transition-colors duration-200 ${
                  stage === 'scanning' ? 'text-[#4F8D9E]' : 'text-[#1D3557]'
                }`}
              >
                <path
                  d="M24 8C16.5 8 10.5 13.8 10.2 21.2"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M37.8 21.2C37.5 15.8 34.2 11.2 29.4 9.1"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M14.5 29.5C14.1 26.8 14 24.1 14.3 21.4C14.9 16.3 19.1 12.6 24 12.6C28.9 12.6 33.1 16.3 33.7 21.4C33.9 23.6 33.9 25.8 33.6 28"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M18.6 35.4C18 31.3 18 26.6 18.4 22.3C18.7 19.4 21.1 17.2 24 17.2C26.9 17.2 29.3 19.4 29.6 22.3C29.9 25.7 29.8 29.3 29.1 32.8"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M23.5 39C22.7 33.8 22.6 28.2 23.1 23.1C23.2 22.3 23.6 21.8 24.1 21.8C24.7 21.8 25.2 22.4 25.2 23.3C25.3 27.6 25 32 24.3 36.2"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M12.5 34.2C11.4 31.1 10.7 27.8 10.4 24.5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M36.5 32.8C37.1 30.2 37.5 27.5 37.6 24.8"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>

          <p className="text-[14.5px] font-semibold text-[#111827] mt-4 text-center">
            {stage === 'verified'
              ? 'Identity Verified'
              : stage === 'scanning'
                ? method === 'faceid'
                  ? 'Scanning Face ID...'
                  : 'Verifying Fingerprint...'
                : method === 'faceid'
                  ? 'Confirm with Face ID'
                  : 'Touch Fingerprint Sensor'}
          </p>
          <p className="text-[12.5px] text-[#6B7280] mt-1 text-center">
            {stage === 'verified'
              ? 'Completing your transfer...'
              : stage === 'scanning'
                ? 'Hold steady for verification'
                : 'Authenticate to authorize transfer, or use your PIN'}
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          <button
            type="button"
            disabled={stage !== 'ready'}
            onClick={handleStartScan}
            className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-[#1D3557] hover:bg-[#152741] disabled:opacity-50 text-white text-[14.5px] font-semibold whitespace-nowrap active:scale-[0.99] transition"
          >
            {stage === 'verified'
              ? 'Verified'
              : stage === 'scanning'
                ? 'Authenticating...'
                : method === 'faceid'
                  ? 'Authenticate with Face ID'
                  : 'Scan Fingerprint'}
          </button>

          <button
            type="button"
            disabled={stage !== 'ready'}
            onClick={onFallbackToPin}
            className="w-full min-h-[44px] py-2.5 px-4 rounded-xl text-[13.5px] font-semibold text-[#4F8D9E] hover:bg-[#F3F4F6] disabled:opacity-40 whitespace-nowrap transition"
          >
            Use Transaction PIN Instead
          </button>
        </div>
      </div>
    </div>
  );
};
