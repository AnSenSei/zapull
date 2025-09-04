import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UserInfo {
  id?: string;
  createdAt?: string;
  displayName: string;
  email: string;
  addresses: Array<{ id?: string; name: string; street: string; city: string; state: string; zip: string; country: string }>;
  avatar?: string;
  level?: number;
  pointsBalance?: number;
  totalCashRecharged?: number;
  totalPointsSpent?: number;
  totalFusion?: number;
  totalAchievements?: number;
  clientSeed?: string;
  referred_by?: string;
  total_point_refered?: number;
  stripe_account_id?: string;
  new_account?: boolean;
}

type AuthStore = {
  uid: string | null
  userInfo: UserInfo | null
  token: string | null
  tokenExpiry: number | null
  isLoginModalOpen: boolean
  isRegisterModalOpen: boolean
  isResetModalOpen: boolean
  isVerifyEmailModalOpen: boolean
  isEditDisplayNameModalOpen: boolean
  authInitialized: boolean
  setUid: (uid: string | null) => void
  setUserInfo: (info: UserInfo | null) => void
  setToken: (token: string | null, expiry?: number) => void
  clearToken: () => void
  isTokenValid: () => boolean
  setAuthInitialized: (initialized: boolean) => void
  updateUserInfo: (info: Partial<UserInfo>) => void
  openLoginModal: () => void
  closeLoginModal: () => void
  openRegisterModal: () => void
  closeRegisterModal: () => void
  openResetModal: () => void
  closeResetModal: () => void
  openVerifyEmailModal: () => void
  closeVerifyEmailModal: () => void
  openEditDisplayNameModal: () => void
  closeEditDisplayNameModal: () => void
  switchToRegister: () => void
  switchToLogin: () => void
  switchToReset: () => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(persist((set, get) => ({
  uid: null,
  userInfo: null,
  token: null,
  tokenExpiry: null,
  isLoginModalOpen: false,
  isRegisterModalOpen: false,
  isResetModalOpen: false,
  isVerifyEmailModalOpen: false,
  isEditDisplayNameModalOpen: false,
  authInitialized: false,
  setUid: (uid) => set({ uid }),
  setUserInfo: (info) => set({ userInfo: info }),
  setToken: (token, expiry) => {
    const tokenExpiry = expiry || (token ? Date.now() + 3600000 : null); // 默认1小时过期
    set({ token, tokenExpiry });
  },
  clearToken: () => set({ token: null, tokenExpiry: null }),
  isTokenValid: () => {
    const state = get();
    return !!(state.token && state.tokenExpiry && Date.now() < state.tokenExpiry);
  },
  setAuthInitialized: (initialized) => set({ authInitialized: initialized }),
  updateUserInfo: (info) => set((state) => ({
    userInfo: state.userInfo ? { ...state.userInfo, ...info } : null
  })),
  openLoginModal: () => set({ isLoginModalOpen: true, isRegisterModalOpen: false, isResetModalOpen: false, isVerifyEmailModalOpen: false, isEditDisplayNameModalOpen: false }),
  closeLoginModal: () => set({ isLoginModalOpen: false }),
  openRegisterModal: () => set({ isRegisterModalOpen: true, isLoginModalOpen: false, isResetModalOpen: false, isVerifyEmailModalOpen: false, isEditDisplayNameModalOpen: false }),
  closeRegisterModal: () => set({ isRegisterModalOpen: false }),
  openResetModal: () => set({ isResetModalOpen: true, isLoginModalOpen: false, isRegisterModalOpen: false, isVerifyEmailModalOpen: false, isEditDisplayNameModalOpen: false }),
  closeResetModal: () => set({ isResetModalOpen: false }),
  openVerifyEmailModal: () => set({ isVerifyEmailModalOpen: true, isLoginModalOpen: false, isRegisterModalOpen: false, isResetModalOpen: false, isEditDisplayNameModalOpen: false }),
  closeVerifyEmailModal: () => set({ isVerifyEmailModalOpen: false }),
  openEditDisplayNameModal: () => set({ isEditDisplayNameModalOpen: true, isLoginModalOpen: false, isRegisterModalOpen: false, isResetModalOpen: false, isVerifyEmailModalOpen: false }),
  closeEditDisplayNameModal: () => set({ isEditDisplayNameModalOpen: false }),
  switchToRegister: () => set({ isLoginModalOpen: false, isRegisterModalOpen: true, isResetModalOpen: false, isVerifyEmailModalOpen: false, isEditDisplayNameModalOpen: false }),
  switchToLogin: () => set({ isRegisterModalOpen: false, isLoginModalOpen: true, isResetModalOpen: false, isVerifyEmailModalOpen: false, isEditDisplayNameModalOpen: false }),
  switchToReset: () => set({ isLoginModalOpen: false, isRegisterModalOpen: false, isResetModalOpen: true, isVerifyEmailModalOpen: false, isEditDisplayNameModalOpen: false }),
  logout: () => set({ uid: null, userInfo: null, token: null, tokenExpiry: null, authInitialized: true })
}), {
  name: 'auth-storage',
  partialize: (state) => ({ uid: state.uid, userInfo: state.userInfo, token: state.token, tokenExpiry: state.tokenExpiry, authInitialized: false })
}))