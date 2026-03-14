import { create } from 'zustand';

// Types
export interface Subscription {
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'none';
  planId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface SubscriptionState {
  subscription: Subscription;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
}

interface SubscriptionActions {
  fetchSubscription: (getToken: () => Promise<string | null>) => Promise<void>;
  updateSubscription: (subscription: Subscription) => void;
  clearSubscription: () => void;
  hasActiveSubscription: () => boolean;
}

type SubscriptionStore = SubscriptionState & SubscriptionActions;

const API_URL = import.meta.env.VITE_API_URL || '';

const DEFAULT_SUBSCRIPTION: Subscription = {
  status: 'none',
  planId: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  // Initial state
  subscription: { ...DEFAULT_SUBSCRIPTION },
  isLoading: false,
  isInitialized: false,
  error: null,

  // Fetch subscription status from API
  fetchSubscription: async (getToken) => {
    set({ isLoading: true, error: null });

    try {
      const token = await getToken();
      if (!token) {
        set({
          subscription: { ...DEFAULT_SUBSCRIPTION },
          isLoading: false,
          isInitialized: true,
        });
        return;
      }

      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch subscription');
      }

      const { subscription } = await response.json();

      set({
        subscription: subscription || { ...DEFAULT_SUBSCRIPTION },
        isLoading: false,
        isInitialized: true,
        error: null,
      });
    } catch (error) {
      console.error('[SubscriptionStore] Fetch error:', error);
      set({
        isLoading: false,
        isInitialized: true,
        error: error instanceof Error ? error.message : 'Failed to fetch subscription',
      });
    }
  },

  updateSubscription: (subscription) => set({ subscription }),

  clearSubscription: () =>
    set({
      subscription: { ...DEFAULT_SUBSCRIPTION },
      isInitialized: false,
    }),

  hasActiveSubscription: () => {
    const status = get().subscription.status;
    return status === 'active' || status === 'trialing';
  },
}));

// Selector hooks
export const useSubscription = () =>
  useSubscriptionStore((state) => state.subscription);

export const useHasActiveSubscription = () =>
  useSubscriptionStore((state) => {
    const status = state.subscription.status;
    return status === 'active' || status === 'trialing';
  });

export const useSubscriptionLoading = () =>
  useSubscriptionStore((state) => state.isLoading);

export const useSubscriptionInitialized = () =>
  useSubscriptionStore((state) => state.isInitialized);
