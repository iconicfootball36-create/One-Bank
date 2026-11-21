/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AppNotification,
  AppScreen,
  BankOption,
  Beneficiary,
  INITIAL_ACCOUNT,
  NIGERIAN_BANKS,
  TransactionRecord,
  TransactionStatus,
  formatNaira,
} from './data/bankData';
import { SplashScreen } from './components/SplashScreen';
import { HomeDashboard } from './components/HomeDashboard';
import { PayAndTransfer } from './components/PayAndTransfer';
import { TransactionHistory } from './components/TransactionHistory';
import { ProfileScreen } from './components/ProfileScreen';
import { TransferOtherBanks } from './components/TransferOtherBanks';
import { TransactionConfirmation } from './components/TransactionConfirmation';
import { TransferSubmitted } from './components/TransferSubmitted';
import { PaymentReceipt } from './components/PaymentReceipt';
import { SecondaryScreens } from './components/SecondaryScreens';
import { OfflineIndicator } from './components/PWAInstallButton';

const STORAGE_KEYS = {
  balance: 'onebank_account_balance_v1',
  transactions: 'onebank_transactions_v1',
  latestTransaction: 'onebank_latest_transaction_v1',
  profileImage: 'onebank_profile_image_v1',
  notifications: 'onebank_notifications_v1',
  transactionFailedMode: 'onebank_transaction_failed_mode_v1',
  transactionPendingMode: 'onebank_transaction_pending_mode_v1',
  hideBalance: 'onebank_hide_balance_v1',
} as const;

const INITIAL_TRANSACTION: TransactionRecord = {
  id: 'tx-initial',
  amount: 10.00,
  charges: 0.00,
  stampDuty: 0.00,
  total: 10.00,
  senderName: INITIAL_ACCOUNT.senderReceiptName,
  sourceAccount: INITIAL_ACCOUNT.sourceDisplay,
  recipientName: 'ABDULSALAM ADEDAYO TIAMIYU',
  recipientAccount: '9042769211',
  recipientBank: 'PALMPAY LIMITED',
  reference: '000001261119001847662176533576',
  narration: '',
  category: 'General',
  dateFormatted: 'November 19, 2026',
  timeFormatted: '12.19AM',
  status: 'SUCCESS',
};

function loadStoredBalance(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.balance);
    if (raw === null) return INITIAL_ACCOUNT.balance;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Number(parsed.toFixed(2));
    }
  } catch {
    // Ignore localStorage access errors
  }
  return INITIAL_ACCOUNT.balance;
}

function loadStoredTransactions(): TransactionRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.transactions);
    if (!raw) return [INITIAL_TRANSACTION];
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      typeof parsed[0]?.id === 'string' &&
      typeof parsed[0]?.amount === 'number'
    ) {
      return parsed as TransactionRecord[];
    }
  } catch {
    // Ignore malformed JSON or storage errors
  }
  return [INITIAL_TRANSACTION];
}

function loadStoredLatestTransaction(fallbackTx: TransactionRecord): TransactionRecord {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.latestTransaction);
    if (!raw) return fallbackTx;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string' && typeof parsed.amount === 'number') {
      return parsed as TransactionRecord;
    }
  } catch {
    // Ignore malformed JSON or storage errors
  }
  return fallbackTx;
}

function buildNotificationFromTransaction(
  tx: TransactionRecord,
  read = false
): AppNotification {
  const formattedAmt = `₦${formatNaira(tx.amount)}`;
  if (tx.direction === 'credit') {
    return {
      id: `notif-${tx.id}`,
      title: `Account Credited · ${formattedAmt}`,
      message: `${formattedAmt} was added to your account via ${tx.senderName}. Ref: ${tx.reference}`,
      timestamp: `${tx.dateFormatted} · ${tx.timeFormatted}`,
      type: 'credit',
      read,
      transactionId: tx.id,
    };
  }

  if (tx.status === 'FAILED') {
    return {
      id: `notif-${tx.id}`,
      title: `Transfer Failed · ${formattedAmt}`,
      message: `Your transfer of ${formattedAmt} to ${tx.recipientName} (${tx.recipientBank} · ${tx.recipientAccount}) failed. No funds were debited. Ref: ${tx.reference}`,
      timestamp: `${tx.dateFormatted} · ${tx.timeFormatted}`,
      type: 'debit',
      read,
      transactionId: tx.id,
    };
  }

  if (tx.status === 'PENDING') {
    return {
      id: `notif-${tx.id}`,
      title: `Transfer Pending · ${formattedAmt}`,
      message: `Your transfer of ${formattedAmt} to ${tx.recipientName} (${tx.recipientBank} · ${tx.recipientAccount}) is pending settlement. Ref: ${tx.reference}`,
      timestamp: `${tx.dateFormatted} · ${tx.timeFormatted}`,
      type: 'debit',
      read,
      transactionId: tx.id,
    };
  }

  return {
    id: `notif-${tx.id}`,
    title: `Transfer Sent · ${formattedAmt}`,
    message: `Sent ${formattedAmt} to ${tx.recipientName} (${tx.recipientBank} · ${tx.recipientAccount}). Ref: ${tx.reference}`,
    timestamp: `${tx.dateFormatted} · ${tx.timeFormatted}`,
    type: 'debit',
    read,
    transactionId: tx.id,
  };
}

function loadStoredNotifications(fallbackTransactions: TransactionRecord[]): AppNotification[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.notifications);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is AppNotification =>
            Boolean(item && typeof item.id === 'string' && typeof item.title === 'string')
        );
      }
    }
  } catch {
    // Ignore storage or JSON errors
  }
  return fallbackTransactions.map((tx) => buildNotificationFromTransaction(tx, true));
}

function loadStoredProfileImage(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.profileImage);
    return raw && raw.startsWith('data:image/') ? raw : null;
  } catch {
    return null;
  }
}

function loadStoredTransactionFailedMode(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.transactionFailedMode) === 'true';
  } catch {
    return false;
  }
}

function loadStoredTransactionPendingMode(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.transactionPendingMode) === 'true';
  } catch {
    return false;
  }
}

function loadStoredHideBalance(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.hideBalance) === 'true';
  } catch {
    return false;
  }
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('splash');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);

  // Account & Form State (persisted across page refreshes)
  const [balance, setBalance] = useState<number>(() => loadStoredBalance());
  const [profileImage, setProfileImage] = useState<string | null>(() => loadStoredProfileImage());
  const [transactionFailedMode, setTransactionFailedMode] = useState<boolean>(() =>
    loadStoredTransactionFailedMode()
  );
  const [transactionPendingMode, setTransactionPendingMode] = useState<boolean>(() =>
    loadStoredTransactionPendingMode()
  );
  const [hideBalance, setHideBalance] = useState<boolean>(() => loadStoredHideBalance());
  const [amountInput, setAmountInput] = useState<string>('0.0');
  const [confirmationAmount, setConfirmationAmount] = useState<number>(0.40);
  const [submittedAmount, setSubmittedAmount] = useState<number>(10.00);

  const [recipientAccount, setRecipientAccount] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>('');
  const [isAccountVerified, setIsAccountVerified] = useState<boolean>(false);
  const [nameEnquiryUnavailable, setNameEnquiryUnavailable] = useState<boolean>(false);
  const [selectedBank, setSelectedBank] = useState<BankOption | null>(null);
  const [availableBanks, setAvailableBanks] = useState<BankOption[]>(NIGERIAN_BANKS);
  const [isResolvingAccount, setIsResolvingAccount] = useState<boolean>(false);
  const [accountResolutionError, setAccountResolutionError] = useState<string | null>(null);
  const [validationAttempt, setValidationAttempt] = useState<number>(0);

  const [isProcessingTransfer, setIsProcessingTransfer] = useState<boolean>(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferIdempotencyKey, setTransferIdempotencyKey] = useState<string>('');

  const [narration, setNarration] = useState<string>('');
  const [category, setCategory] = useState<string>('General');
  const [addToBeneficiaries, setAddToBeneficiaries] = useState<boolean>(false);

  // Official receipt & history state (persisted across page refreshes)
  const [transactions, setTransactions] = useState<TransactionRecord[]>(() =>
    loadStoredTransactions()
  );
  const [latestTransaction, setLatestTransaction] = useState<TransactionRecord>(() => {
    const stored = loadStoredTransactions();
    return loadStoredLatestTransaction(stored[0] || INITIAL_TRANSACTION);
  });
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    loadStoredNotifications(loadStoredTransactions())
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.balance, balance.toFixed(2));
    } catch {
      // Ignore storage quota or private mode errors
    }
  }, [balance]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions));
    } catch {
      // Ignore storage quota or private mode errors
    }
  }, [transactions]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.latestTransaction,
        JSON.stringify(latestTransaction)
      );
    } catch {
      // Ignore storage quota or private mode errors
    }
  }, [latestTransaction]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(notifications));
    } catch {
      // Ignore storage quota or private mode errors
    }
  }, [notifications]);

  useEffect(() => {
    try {
      if (profileImage) {
        window.localStorage.setItem(STORAGE_KEYS.profileImage, profileImage);
      } else {
        window.localStorage.removeItem(STORAGE_KEYS.profileImage);
      }
    } catch {
      // Ignore storage quota or private mode errors
    }
  }, [profileImage]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.transactionFailedMode,
        String(transactionFailedMode)
      );
    } catch {
      // Ignore storage quota or private mode errors
    }
  }, [transactionFailedMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.transactionPendingMode,
        String(transactionPendingMode)
      );
    } catch {
      // Ignore storage quota or private mode errors
    }
  }, [transactionPendingMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.hideBalance, String(hideBalance));
    } catch {
      // Ignore storage quota or private mode errors
    }
  }, [hideBalance]);

  // Load real Nigerian banks directory from Monnify backend on mount
  useEffect(() => {
    let cancelled = false;
    async function loadMonnifyBanks() {
      try {
        const res = await fetch('/api/monnify/banks');
        if (!res.ok) return;
        const data = (await res.json()) as {
          live?: boolean;
          banks?: BankOption[];
        };
        if (!cancelled && data.live && Array.isArray(data.banks) && data.banks.length > 0) {
          // Sync top 5 suggested banks with the exact bank code returned by Monnify's live directory
          const liveBanks = data.banks;
          const updatedTopFive = NIGERIAN_BANKS.filter((b) => b.isTopSuggested).map((top) => {
            const match = liveBanks.find((lb) => {
              const lbName = lb.name.toUpperCase();
              if (top.id === 'opay') {
                return lbName.includes('OPAY') || lbName.includes('PAYCOM') || lb.code === '305';
              }
              if (top.id === 'palmpay') {
                return lbName.includes('PALMPAY');
              }
              return lbName.includes(top.name.split(' ')[0]);
            });
            return match ? { ...top, code: match.code, nipBankCode: match.nipBankCode } : top;
          });

          const remainingBanks = liveBanks.filter(
            (lb) => !updatedTopFive.some((t) => t.code === lb.code || t.name === lb.name)
          );
          const priorityPatterns = [
            'MONIEPOINT',
            'KUDA',
            'GUARANTY TRUST',
            'ACCESS BANK',
            'ZENITH',
            'UNITED BANK FOR AFRICA',
            'FIRST BANK OF NIGERIA',
            'FIDELITY',
            'FIRST CITY MONUMENT',
            'WEMA BANK',
            'STANBIC IBTC',
            'STERLING BANK',
          ];
          remainingBanks.sort((a, b) => {
            const aIdx = priorityPatterns.findIndex((p) => a.name.includes(p));
            const bIdx = priorityPatterns.findIndex((p) => b.name.includes(p));
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return a.name.localeCompare(b.name);
          });
          setAvailableBanks([...updatedTopFive, ...remainingBanks]);
        }
      } catch {
        // Keep static NIGERIAN_BANKS if offline
      }
    }
    loadMonnifyBanks();
    return () => {
      cancelled = true;
    };
  }, []);

  // Perform real-time Monnify Name Enquiry whenever a 10-digit account number and bank are selected
  useEffect(() => {
    if (recipientAccount.length !== 10 || !selectedBank) {
      setIsAccountVerified(false);
      setNameEnquiryUnavailable(false);
      setAccountResolutionError(null);
      if (recipientAccount.length < 10) {
        setRecipientName('');
      }
      return;
    }

    let cancelled = false;
    async function resolveAccountWithMonnify() {
      setIsResolvingAccount(true);
      setIsAccountVerified(false);
      setNameEnquiryUnavailable(false);
      setAccountResolutionError(null);

      try {
        const params = new URLSearchParams({
          accountNumber: recipientAccount,
          bankCode: selectedBank!.code,
          bankName: selectedBank!.name,
        });
        const res = await fetch(`/api/monnify/validate-account?${params.toString()}`);
        const rawText = await res.text();
        let data: {
          live?: boolean;
          verified?: boolean;
          nameEnquiryUnavailable?: boolean;
          accountName?: string | null;
          bankCode?: string;
          error?: string;
          message?: string;
        } = {};
        if (rawText) {
          try {
            data = JSON.parse(rawText);
          } catch {
            data = {};
          }
        }

        if (cancelled) return;

        if (res.ok && data.accountName) {
          setRecipientName(data.accountName);
          setIsAccountVerified(true);
          setNameEnquiryUnavailable(false);
          setAccountResolutionError(null);
          // If the backend resolved a specific canonical Monnify bankCode (e.g. 305 for OPay), update selectedBank
          if (data.bankCode && data.bankCode !== selectedBank!.code) {
            setSelectedBank((prev) => (prev ? { ...prev, code: data.bankCode! } : prev));
          }
        } else if (res.ok && data.nameEnquiryUnavailable) {
          setIsAccountVerified(false);
          setNameEnquiryUnavailable(true);
          setAccountResolutionError(null);
          if (data.bankCode && data.bankCode !== selectedBank!.code) {
            setSelectedBank((prev) => (prev ? { ...prev, code: data.bankCode! } : prev));
          }
        } else {
          setRecipientName('');
          setIsAccountVerified(false);
          setNameEnquiryUnavailable(false);
          setAccountResolutionError(
            data.error || 'Could not verify account number with the selected bank.'
          );
        }
      } catch {
        if (!cancelled) {
          setRecipientName('');
          setIsAccountVerified(false);
          setNameEnquiryUnavailable(false);
          setAccountResolutionError(
            'Network error while validating account. Please check your connection and retry.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsResolvingAccount(false);
        }
      }
    }

    resolveAccountWithMonnify();
    return () => {
      cancelled = true;
    };
  }, [recipientAccount, selectedBank, validationAttempt]);

  // Auto-advance from splash screen to home dashboard after 2.2s (or tap anywhere immediately)
  useEffect(() => {
    if (currentScreen === 'splash') {
      const timer = setTimeout(() => {
        setCurrentScreen('home');
      }, 2200);
      return () => clearTimeout(timer);
    }
  }, [currentScreen]);

  // Auto-transition from full confetti burst (Screen 7) to settled confetti (Screen 8) after 1.8s
  useEffect(() => {
    if (currentScreen === 'transfer_submitted_confetti') {
      const timer = setTimeout(() => {
        setCurrentScreen('transfer_submitted_clean');
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [currentScreen]);

  const handleSelectTransferOption = (option: string) => {
    setShowTransferModal(false);
    setTransferError(null);
    if (option === 'Transfer to Beneficiaries') {
      setRecipientAccount('9042769211');
      setSelectedBank(
        availableBanks.find((b) => b.id === 'palmpay' || b.name.includes('PALMPAY')) ||
          NIGERIAN_BANKS[1]
      );
    }
    setCurrentScreen('transfer_other_banks');
  };

  const handleSelectBeneficiary = (ben: Beneficiary) => {
    const matchedBank =
      availableBanks.find(
        (b) =>
          b.name === ben.bankName ||
          b.code === ben.bankCode ||
          (ben.bankName.includes('OPAY') && (b.name.includes('OPAY') || b.name.includes('PAYCOM')))
      ) || NIGERIAN_BANKS[1];
    setSelectedBank(matchedBank);
    setRecipientAccount(ben.accountNumber);
  };

  const handleConfirmTransactionForm = () => {
    const parsed = parseFloat(amountInput.replace(/,/g, ''));
    if (isNaN(parsed) || parsed <= 0) {
      return;
    }
    if (parsed > balance) {
      return;
    }
    if (!selectedBank || (!isAccountVerified && !nameEnquiryUnavailable) || recipientName.trim().length < 2) {
      return;
    }

    setConfirmationAmount(parsed);
    setTransferError(null);
    setTransferIdempotencyKey(
      `IDEMP-${recipientAccount}-${selectedBank.code}-${parsed.toFixed(2)}-${Date.now()}`
    );
    setCurrentScreen('transaction_confirmation');
  };

  const finalizeVerifiedTransfer = useCallback(
    (
      finalAmount: number,
      bankUsed: BankOption,
      destAccount: string,
      verifiedName: string,
      txReference: string,
      txStatus: TransactionStatus
    ) => {
      setSubmittedAmount(finalAmount);

      const now = new Date();
      const dateFormatted = now.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      const timeFormatted = now
        .toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
        .replace(':', '.')
        .replace(/\s+/g, '');

      const newTx: TransactionRecord = {
        id: `tx-${Date.now()}`,
        amount: finalAmount,
        charges: 0.00,
        stampDuty: 0.00,
        total: finalAmount,
        senderName: INITIAL_ACCOUNT.senderReceiptName,
        sourceAccount: INITIAL_ACCOUNT.sourceDisplay,
        recipientName: verifiedName,
        recipientAccount: destAccount,
        recipientBank: bankUsed.name,
        reference: txReference,
        narration,
        category,
        dateFormatted,
        timeFormatted,
        status: txStatus,
      };

      setLatestTransaction(newTx);
      setTransactions((prev) => [newTx, ...prev]);
      setNotifications((prev) => [buildNotificationFromTransaction(newTx, false), ...prev]);

      // Only deduct user balance when Monnify confirms SUCCESS or COMPLETED/PENDING settlement
      if (txStatus === 'SUCCESS' || txStatus === 'PENDING') {
        setBalance((prev) => Math.max(0, Number((prev - finalAmount).toFixed(2))));
      }

      setCurrentScreen('transfer_submitted_confetti');
    },
    [category, narration]
  );

  const handleAuthorizePin = async () => {
    if (isProcessingTransfer) return;

    const finalAmount = confirmationAmount;
    if (!finalAmount || finalAmount <= 0) {
      setTransferError('Invalid transfer amount.');
      return;
    }
    if (finalAmount > balance) {
      setTransferError(
        `Insufficient balance. Your available balance is ₦${formatNaira(balance)}.`
      );
      return;
    }
    if (!selectedBank || (!isAccountVerified && !nameEnquiryUnavailable) || recipientName.trim().length < 2) {
      setTransferError('Recipient account has not been verified.');
      return;
    }

    setIsProcessingTransfer(true);
    setTransferError(null);
    const loadingStartedAt = Date.now();

    if (transactionFailedMode) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      finalizeVerifiedTransfer(
        finalAmount,
        selectedBank,
        recipientAccount,
        recipientName,
        `OB-FAIL-${Date.now()}`,
        'FAILED'
      );
      setIsProcessingTransfer(false);
      return;
    }

    if (transactionPendingMode) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      finalizeVerifiedTransfer(
        finalAmount,
        selectedBank,
        recipientAccount,
        recipientName,
        `OB-PEND-${Date.now()}`,
        'PENDING'
      );
      setIsProcessingTransfer(false);
      return;
    }

    try {
      const res = await fetch('/api/monnify/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: finalAmount,
          destinationBankCode: selectedBank.code,
          destinationBankName: selectedBank.name,
          destinationAccountNumber: recipientAccount,
          destinationAccountName: recipientName,
          narration: narration || `Transfer to ${recipientName}`,
          idempotencyKey: `TX-${recipientAccount}-${selectedBank.code}-${finalAmount.toFixed(2)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        }),
      });

      const rawText = await res.text();
      let data: {
        live?: boolean;
        requestSuccessful?: boolean;
        reference?: string;
        status?: TransactionStatus;
        error?: string;
      } = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = {};
        }
      }

      if (!res.ok || !data.requestSuccessful) {
        setTransferError(
          data.error || 'Transfer could not be completed by Monnify. Your balance has not been debited.'
        );
        return;
      }

      // Ensure the full-screen loader stays visible for 1.5s (1-2s) after PIN/biometric entry
      const elapsed = Date.now() - loadingStartedAt;
      const minLoaderDurationMs = 1500;
      if (elapsed < minLoaderDurationMs) {
        await new Promise((resolve) => setTimeout(resolve, minLoaderDurationMs - elapsed));
      }

      const txReference = data.reference || `OB-${Date.now()}`;
      const txStatus: TransactionStatus = 'SUCCESS';

      finalizeVerifiedTransfer(
        finalAmount,
        selectedBank,
        recipientAccount,
        recipientName,
        txReference,
        txStatus
      );
    } catch {
      setTransferError(
        'Network error while communicating with Monnify transfer server. Please check your connection.'
      );
    } finally {
      setIsProcessingTransfer(false);
    }
  };

  const handleAddMoneyToAccount = useCallback((amount: number, sourceLabel: string) => {
    const now = new Date();
    const dateFormatted = now.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const timeFormatted = now
      .toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      .replace(':', '.')
      .replace(/\s+/g, '');

    const creditTx: TransactionRecord = {
      id: `tx-topup-${Date.now()}`,
      amount,
      charges: 0.0,
      stampDuty: 0.0,
      total: amount,
      senderName: sourceLabel.toUpperCase(),
      sourceAccount: sourceLabel,
      recipientName: INITIAL_ACCOUNT.accountName.toUpperCase(),
      recipientAccount: INITIAL_ACCOUNT.accountNumber,
      recipientBank: 'STERLING BANK PLC',
      reference: `OB-TOPUP-${Date.now()}`,
      narration: `${sourceLabel} to ${INITIAL_ACCOUNT.accountNumber}`,
      category: 'General',
      dateFormatted,
      timeFormatted,
      status: 'SUCCESS',
      direction: 'credit',
    };

    setBalance((prev) => Number((prev + amount).toFixed(2)));
    setTransactions((prev) => [creditTx, ...prev]);
    setLatestTransaction(creditTx);
    setNotifications((prev) => [buildNotificationFromTransaction(creditTx, false), ...prev]);
  }, []);

  const handleMarkAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
  }, []);

  const handleSelectNotification = useCallback(
    (item: AppNotification) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
      );
      if (item.transactionId) {
        const matchedTx = transactions.find((tx) => tx.id === item.transactionId);
        if (matchedTx) {
          setLatestTransaction(matchedTx);
          setCurrentScreen('payment_receipt');
        }
      }
    },
    [transactions]
  );

  return (
    <div className="min-h-screen w-full bg-white text-[#111827] flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <OfflineIndicator />
      <main className="w-full min-h-screen bg-white flex flex-col flex-1">
        {currentScreen === 'splash' && (
          <SplashScreen onEnterApp={() => setCurrentScreen('home')} />
        )}

        {currentScreen === 'home' && (
          <HomeDashboard
            balance={balance}
            hideBalance={hideBalance}
            onToggleHideBalance={() => setHideBalance((prev) => !prev)}
            profileImage={profileImage}
            notifications={notifications}
            showTransferModal={showTransferModal}
            onOpenTransferModal={() => setShowTransferModal(true)}
            onCloseTransferModal={() => setShowTransferModal(false)}
            onSelectTransferOption={handleSelectTransferOption}
            onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
            onSelectNotification={handleSelectNotification}
            onNavigate={(scr) => setCurrentScreen(scr)}
          />
        )}

        {currentScreen === 'pay_and_transfer' && (
          <PayAndTransfer
            profileImage={profileImage}
            notifications={notifications}
            onOpenTransferModal={() => {
              setCurrentScreen('home');
              setShowTransferModal(true);
            }}
            onSelectBeneficiaryAndTransfer={(ben) => {
              handleSelectBeneficiary(ben);
              setCurrentScreen('transfer_other_banks');
            }}
            onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
            onSelectNotification={handleSelectNotification}
            onNavigate={(scr) => setCurrentScreen(scr)}
          />
        )}

        {currentScreen === 'transaction_history' && (
          <TransactionHistory
            balance={balance}
            hideBalance={hideBalance}
            onToggleHideBalance={() => setHideBalance((prev) => !prev)}
            transactions={transactions}
            onBack={() => setCurrentScreen('pay_and_transfer')}
            onSelectTransaction={(tx) => {
              setLatestTransaction(tx);
              setCurrentScreen('payment_receipt');
            }}
          />
        )}

        {currentScreen === 'profile' && (
          <ProfileScreen
            balance={balance}
            profileImage={profileImage}
            transactionFailedMode={transactionFailedMode}
            transactionPendingMode={transactionPendingMode}
            onBack={() => setCurrentScreen('home')}
            onAddMoney={handleAddMoneyToAccount}
            onUpdateProfileImage={setProfileImage}
            onToggleTransactionFailedMode={(enabled) => {
              setTransactionFailedMode(enabled);
              if (enabled) setTransactionPendingMode(false);
            }}
            onToggleTransactionPendingMode={(enabled) => {
              setTransactionPendingMode(enabled);
              if (enabled) setTransactionFailedMode(false);
            }}
          />
        )}

        {currentScreen === 'transfer_other_banks' && (
          <TransferOtherBanks
            balance={balance}
            amount={amountInput}
            recipientAccount={recipientAccount}
            recipientName={recipientName}
            isAccountVerified={isAccountVerified}
            nameEnquiryUnavailable={nameEnquiryUnavailable}
            selectedBank={selectedBank}
            availableBanks={availableBanks}
            isResolvingAccount={isResolvingAccount}
            accountResolutionError={accountResolutionError}
            narration={narration}
            category={category}
            addToBeneficiaries={addToBeneficiaries}
            showBankModal={showBankModal}
            onChangeAmount={setAmountInput}
            onChangeRecipientAccount={(acc) => {
              setRecipientAccount(acc);
            }}
            onChangeRecipientName={(name) => {
              setRecipientName(name);
            }}
            onSelectBank={(bank) => {
              setSelectedBank(bank);
            }}
            onSelectBeneficiary={handleSelectBeneficiary}
            onChangeNarration={setNarration}
            onChangeCategory={setCategory}
            onToggleAddToBeneficiaries={() => setAddToBeneficiaries(!addToBeneficiaries)}
            onOpenBankModal={() => setShowBankModal(true)}
            onCloseBankModal={() => setShowBankModal(false)}
            onRetryAccountValidation={() => setValidationAttempt((prev) => prev + 1)}
            onBack={() => setCurrentScreen('pay_and_transfer')}
            onConfirmTransaction={handleConfirmTransactionForm}
          />
        )}

        {currentScreen === 'transaction_confirmation' && (
          <TransactionConfirmation
            amount={confirmationAmount}
            recipientName={recipientName}
            recipientAccount={recipientAccount}
            selectedBank={selectedBank || NIGERIAN_BANKS[1]}
            narration={narration}
            isProcessingTransfer={isProcessingTransfer}
            transferError={transferError}
            onBack={() => setCurrentScreen('transfer_other_banks')}
            onSubmitPin={handleAuthorizePin}
          />
        )}

        {currentScreen === 'transfer_submitted_confetti' && (
          <TransferSubmitted
            amount={submittedAmount}
            recipientName={latestTransaction.recipientName || recipientName}
            status={latestTransaction.status}
            confettiDensity="full"
            onViewReceipt={() => setCurrentScreen('payment_receipt')}
            onDone={() => setCurrentScreen('home')}
          />
        )}

        {currentScreen === 'transfer_submitted_clean' && (
          <TransferSubmitted
            amount={submittedAmount}
            recipientName={latestTransaction.recipientName || recipientName}
            status={latestTransaction.status}
            confettiDensity="settled"
            onViewReceipt={() => setCurrentScreen('payment_receipt')}
            onDone={() => setCurrentScreen('home')}
          />
        )}

        {currentScreen === 'payment_receipt' && (
          <PaymentReceipt
            transaction={latestTransaction}
            onClose={() => setCurrentScreen('home')}
            onDone={() => setCurrentScreen('home')}
          />
        )}

        {(currentScreen === 'airtime_data' ||
          currentScreen === 'bill_payment' ||
          currentScreen === 'products' ||
          currentScreen === 'cards' ||
          currentScreen === 'menu') && (
          <SecondaryScreens
            screen={currentScreen}
            balance={balance}
            transactions={transactions}
            onBackHome={() => setCurrentScreen('home')}
            onNavigate={(scr) => setCurrentScreen(scr)}
            onQuickBuySuccess={(amt, label) => {
              if (amt > balance) return;
              setSubmittedAmount(amt);
              const now = new Date();
              const dateFormatted = now.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              });
              const timeFormatted = now
                .toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })
                .replace(':', '.')
                .replace(/\s+/g, '');
              const txStatus: TransactionStatus = transactionFailedMode
                ? 'FAILED'
                : transactionPendingMode
                  ? 'PENDING'
                  : 'SUCCESS';
              const tx: TransactionRecord = {
                id: `tx-${Date.now()}`,
                amount: amt,
                charges: 0.0,
                stampDuty: 0.0,
                total: amt,
                senderName: INITIAL_ACCOUNT.senderReceiptName,
                sourceAccount: INITIAL_ACCOUNT.sourceDisplay,
                recipientName: label.toUpperCase(),
                recipientAccount: recipientAccount || '9042769211',
                recipientBank: 'STERLING BILLS',
                reference: `${
                  txStatus === 'FAILED'
                    ? 'OB-FAIL-'
                    : txStatus === 'PENDING'
                      ? 'OB-PEND-'
                      : 'OB-BILL-'
                }${Date.now()}`,
                narration: label,
                category: 'Bills & Utilities',
                dateFormatted,
                timeFormatted,
                status: txStatus,
              };
              setLatestTransaction(tx);
              setTransactions((prev) => [tx, ...prev]);
              setNotifications((prev) => [buildNotificationFromTransaction(tx, false), ...prev]);
              if (txStatus !== 'FAILED') {
                setBalance((prev) => Math.max(0, Number((prev - amt).toFixed(2))));
              }
              setCurrentScreen('transfer_submitted_confetti');
            }}
          />
        )}
      </main>

      {/* Full-screen white transfer processing loader (1-2s) */}
      {isProcessingTransfer && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Processing transfer"
          className="fixed inset-0 z-50 bg-white flex items-center justify-center"
        >
          <svg
            className="w-12 h-12 animate-spin motion-reduce:animate-none"
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="24"
              cy="24"
              r="18"
              stroke="#9E6E71"
              strokeWidth="5.5"
            />
            <path
              d="M24 6 A18 18 0 0 1 42 24"
              stroke="#D92027"
              strokeWidth="5.5"
              strokeLinecap="butt"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
