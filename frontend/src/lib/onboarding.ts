import { useEffect, useSyncExternalStore } from 'react';
import { storage } from '@/src/utils/storage';

let completed: boolean | null = null;
let hydration: Promise<void> | null = null;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((notify) => notify());
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
const snapshot = () => completed;

export function useOnboarding() {
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (!hydration) hydration = storage.getItem<string>('aiforge_onboarded', '').then((value) => {
      if (completed === null) completed = !!value;
      publish();
    }).catch(() => { if (completed === null) completed = false; publish(); });
  }, []);
  return value;
}

export async function completeOnboarding() {
  await storage.setItem('aiforge_onboarded', '1');
  completed = true;
  publish();
}