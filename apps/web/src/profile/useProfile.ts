import { useSyncExternalStore } from 'react';
import { profileSnapshot, subscribeProfile } from './profileStore';

export const useProfile = () => useSyncExternalStore(subscribeProfile, profileSnapshot);
