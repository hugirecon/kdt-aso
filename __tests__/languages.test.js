/**
 * KDT Aso - Language Support Tests
 */

const LanguageSupport = require('../core/languages');

describe('LanguageSupport', () => {
  let languageSupport;

  beforeEach(() => {
    languageSupport = new LanguageSupport();
  });

  describe('detectLanguage', () => {
    it('should detect English', () => {
      const lang = languageSupport.detectLanguage('Hello, how are you?');
      expect(lang).toBe('en');
    });

    it('should detect Hausa', () => {
      const lang = languageSupport.detectLanguage('Sannu, yaya kake?');
      expect(lang).toBe('ha');
    });

    it('should detect Yoruba', () => {
      const lang = languageSupport.detectLanguage('Pẹlẹ o, bawo ni?');
      expect(lang).toBe('yo');
    });

    it('should detect Igbo', () => {
      const lang = languageSupport.detectLanguage('Nnọọ, kedu?');
      expect(lang).toBe('ig');
    });

    it('should detect Nigerian Pidgin', () => {
      const lang = languageSupport.detectLanguage('How far? Wetin dey happen?');
      expect(lang).toBe('pcm');
    });

    it('should default to English for unknown text', () => {
      const lang = languageSupport.detectLanguage('xyz123');
      expect(lang).toBe('en');
    });

    it('should handle empty/null input', () => {
      expect(languageSupport.detectLanguage('')).toBe('en');
      expect(languageSupport.detectLanguage(null)).toBe('en');
    });
  });

  describe('isEmergency', () => {
    it('should detect English emergency', () => {
      expect(languageSupport.isEmergency('Help! Emergency!')).toBe(true);
      expect(languageSupport.isEmergency('This is urgent')).toBe(true);
    });

    it('should detect Hausa emergency', () => {
      expect(languageSupport.isEmergency('Taimako!')).toBe(true);
      expect(languageSupport.isEmergency('Gaggawa!')).toBe(true);
    });

    it('should detect Yoruba emergency', () => {
      expect(languageSupport.isEmergency('Iranlọwọ!')).toBe(true);
      expect(languageSupport.isEmergency('Pajawiri!')).toBe(true);
    });

    it('should detect Igbo emergency', () => {
      expect(languageSupport.isEmergency('Enyemaka!')).toBe(true);
      expect(languageSupport.isEmergency('Nsogbu!')).toBe(true);
    });

    it('should detect Pidgin emergency', () => {
      expect(languageSupport.isEmergency('Wahala dey o!')).toBe(true);
      expect(languageSupport.isEmergency('Help o!')).toBe(true);
    });

    it('should return false for non-emergency', () => {
      expect(languageSupport.isEmergency('Good morning')).toBe(false);
      expect(languageSupport.isEmergency('How far?')).toBe(false);
    });
  });

  describe('listLanguages', () => {
    it('should return all supported languages', () => {
      const languages = languageSupport.listLanguages();
      expect(languages.length).toBe(5);
      
      const codes = languages.map(l => l.code);
      expect(codes).toContain('en');
      expect(codes).toContain('ha');
      expect(codes).toContain('yo');
      expect(codes).toContain('ig');
      expect(codes).toContain('pcm');
    });
  });

  describe('isSupported', () => {
    it('should return true for supported languages', () => {
      expect(languageSupport.isSupported('en')).toBe(true);
      expect(languageSupport.isSupported('ha')).toBe(true);
      expect(languageSupport.isSupported('yo')).toBe(true);
      expect(languageSupport.isSupported('ig')).toBe(true);
      expect(languageSupport.isSupported('pcm')).toBe(true);
    });

    it('should return false for unsupported languages', () => {
      expect(languageSupport.isSupported('fr')).toBe(false);
      expect(languageSupport.isSupported('es')).toBe(false);
    });
  });

  describe('getLanguageContext', () => {
    it('should return context for each language', () => {
      for (const code of ['en', 'ha', 'yo', 'ig', 'pcm']) {
        const context = languageSupport.getLanguageContext(code);
        expect(context).toBeDefined();
        expect(typeof context).toBe('string');
        expect(context.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getGreeting', () => {
    it('should return appropriate greeting', () => {
      expect(languageSupport.getGreeting('en')).toContain('Hello');
      expect(languageSupport.getGreeting('ha')).toContain('Sannu');
      expect(languageSupport.getGreeting('yo')).toContain('Pẹlẹ');
      expect(languageSupport.getGreeting('ig')).toContain('Nnọọ');
      expect(languageSupport.getGreeting('pcm')).toContain('How far');
    });
  });

  describe('getAcknowledgment', () => {
    it('should return appropriate acknowledgment', () => {
      expect(languageSupport.getAcknowledgment('en')).toBe('Understood.');
      expect(languageSupport.getAcknowledgment('ha')).toContain('gane');
      expect(languageSupport.getAcknowledgment('pcm')).toContain('hear');
    });
  });

  describe('getEmergencyPhrases', () => {
    it('should include language-specific phrases', () => {
      const hausaPhrases = languageSupport.getEmergencyPhrases('ha');
      expect(hausaPhrases).toContain('gaggawa');
      
      const pidginPhrases = languageSupport.getEmergencyPhrases('pcm');
      expect(pidginPhrases).toContain('wahala dey');
    });

    it('should always include English phrases', () => {
      for (const code of ['ha', 'yo', 'ig', 'pcm']) {
        const phrases = languageSupport.getEmergencyPhrases(code);
        expect(phrases).toContain('emergency');
      }
    });
  });
});
