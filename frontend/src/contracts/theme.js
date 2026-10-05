export const themePreference = 'theme.preference';
export const themeStorage = 'theme.storage';
export const themeModes = Object.freeze(['auto', 'light', 'dark']);
export const themeQueryKey = Object.freeze(['theme']);

/**
 * @typedef {{mode: 'auto'|'light'|'dark', resolved: 'light'|'dark'}} ThemePreference
 * @typedef {{read(): ThemePreference, write(mode: string): ThemePreference,
 * subscribe(listener: (value: ThemePreference) => void): () => void}} ThemeRepository
 */
