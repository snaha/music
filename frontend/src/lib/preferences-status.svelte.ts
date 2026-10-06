import { subscribePreferences } from './preferences';
export const preferenceStatus = $state({ error: '' });
export const startPreferenceStatus = () => subscribePreferences(error => { preferenceStatus.error = error; });
