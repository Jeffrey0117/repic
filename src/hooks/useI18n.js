import { useState, useEffect, useCallback } from 'react';
import { t as translate, getLanguage, setLanguage as setLang, subscribe } from '../i18n';

/**
 * React hook for internationalization
 * Provides translation function and language management
 *
 * @returns {Object} { t, language, setLanguage }
 */
function useI18n() {
  const [language, setLanguageState] = useState(getLanguage);

  useEffect(() => {
    // Subscribe to language changes from other components or direct API calls
    const unsubscribe = subscribe((newLang) => {
      setLanguageState(newLang);
    });

    return unsubscribe;
  }, []);

  /**
   * Set the application language
   * @param {string} lang - Language code ('en' or 'zh-TW')
   */
  const setLanguage = useCallback((lang) => {
    setLang(lang);
    setLanguageState(lang);
  }, []);

  /**
   * Translate a key with optional interpolation
   * @param {string} key - Translation key
   * @param {Object} params - Optional interpolation parameters
   * @returns {string} Translated string
   */
  const t = useCallback((key, params) => {
    return translate(key, params);
  }, [language]); // Re-create when language changes to ensure re-renders

  return {
    t,
    language,
    setLanguage
  };
}

export default useI18n;
