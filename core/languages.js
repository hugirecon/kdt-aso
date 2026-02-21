/**
 * KDT Aso - Nigerian Language Support
 * Handles language detection, translation context, and Nigerian language patterns
 */

class LanguageSupport {
  constructor() {
    // Supported languages
    this.languages = {
      en: { name: 'English', native: 'English', direction: 'ltr' },
      ha: { name: 'Hausa', native: 'Hausa', direction: 'ltr' },
      yo: { name: 'Yoruba', native: 'Yorùbá', direction: 'ltr' },
      ig: { name: 'Igbo', native: 'Igbo', direction: 'ltr' },
      pcm: { name: 'Nigerian Pidgin', native: 'Naijá', direction: 'ltr' },
      ff: { name: 'Fulfulde', native: 'Fulfulde', direction: 'ltr' },
      kr: { name: 'Kanuri', native: 'Kanuri', direction: 'ltr' }
    };

    // Common phrases for each language
    this.commonPhrases = {
      en: {
        greeting: ['hello', 'hi', 'good morning', 'good afternoon', 'good evening'],
        confirmation: ['yes', 'okay', 'alright', 'understood', 'copy that'],
        negation: ['no', 'negative', 'not', 'denied'],
        emergency: ['emergency', 'help', 'urgent', 'mayday', 'critical']
      },
      ha: {
        greeting: ['sannu', 'barka da safiya', 'barka da rana', 'barka da yamma', 'salama alaikum'],
        confirmation: ['i', 'toh', 'nagode', 'na gode', 'to'],
        negation: ['a\'a', 'babu', 'ba'],
        emergency: ['gaggawa', 'taimako', 'damuwa', 'gaggawar']
      },
      yo: {
        greeting: ['e kaaro', 'e kaasan', 'e kaalẹ', 'bawo ni', 'pẹlẹ o'],
        confirmation: ['bẹẹni', 'o dara', 'mo ti gbọ', 'ẹ ṣeun'],
        negation: ['rara', 'bẹẹkọ', 'ko'],
        emergency: ['iranlọwọ', 'pajawiri', 'ẹjọ', 'wahala']
      },
      ig: {
        greeting: ['nnọọ', 'ụtụtụ ọma', 'ehihie ọma', 'mgbede ọma', 'kedu'],
        confirmation: ['eewo', 'ọ dị mma', 'aghotara m', 'daalu'],
        negation: ['mba', 'ọ bụghị', 'anaghị'],
        emergency: ['enyemaka', 'nsogbu', 'ngwangwa', 'egwu']
      },
      pcm: {
        greeting: ['how far', 'wetin dey', 'how body', 'good morning o', 'how you dey'],
        confirmation: ['yes o', 'na so', 'e good', 'i hear you', 'no wahala'],
        negation: ['no be so', 'no', 'e no dey', 'no be true'],
        emergency: ['e don happen', 'wahala dey', 'help o', 'trouble dey', 'e urgent']
      },
      ff: {
        greeting: ['a]a jam', 'jam waali', 'jam weeti', 'no mbadda', 'a]a nganndaa'],
        confirmation: ['eey', 'waawii', 'goonga', 'mi jaabii', 'taw'],
        negation: ['alaa', 'walaa', 'mi salii'],
        emergency: ['ballal', 'caggal', 'jaawngal', 'hakkunde', 'kisal']
      },
      kr: {
        greeting: ['wu sha', 'wu shi layi', 'kashim wo', 'salam', 'ndo wu shi'],
        confirmation: ['awa', 'gana', 'hada', 'na gana'],
        negation: ['ba', 'bai', 'kuru ba'],
        emergency: ['faida', 'labar', 'gaggawa', 'hatsari', 'taimako']
      }
    };

    // Language detection patterns (regex patterns for each language)
    this.detectionPatterns = {
      ha: [
        /\b(sannu|barka|ina|kana|nagode|allah|yau|gobe|jiya|yaya)\b/i,
        /\b(ba.*ba|da|shi|su|mu|ka|ki|ta|wa|ni)\b/i,
        /\b(kowa|komai|wani|wata|abin|abu)\b/i
      ],
      yo: [
        /\b(ẹ|ọ|pẹlẹ|bawo|kaaro|kaalẹ|ṣe|jẹ|nibo|tani|kini)\b/i,
        /\b(mo|o|a|wọn|ẹ|àwọn)\s+(ti|ń|máa|lè)\b/i,
        /\b(ọjọ|ilé|ọmọ|ìgbà|orí|ọlọrun)\b/i
      ],
      ig: [
        /\b(nnọọ|kedu|gini|onye|ebee|mgbe|ọ|ụmụ|nwere)\b/i,
        /\b(na|ka|gi|ha|anyị|unu|m|ya)\s+(bụ|dị|nwere|chọrọ)\b/i,
        /\b(chukwu|ụwa|ụlọ|ndi|mmadụ)\b/i
      ],
      pcm: [
        /\b(dey|wetin|wahala|na|abeg|sef|no be|e don|how far)\b/i,
        /\b(make|wey|go|come|chop|yarn|dem|una)\b/i,
        /\b(shey|abi|o|sha|jare|now now)\b/i
      ],
      ff: [
        /\b(jam|waali|nganndaa|mbadda|goonga|waawii|jaabii)\b/i,
        /\b(mi|miin|en|be|ko|nde|ngal|ɗum)\b/i,
        /\b(pullo|fulɓe|nagge|ndiyam|ladde|wuro)\b/i
      ],
      kr: [
        /\b(wu|shi|layi|kashim|gana|hada|kuru)\b/i,
        /\b(ye|ro|wu|ci|ndi|gade|sandiya)\b/i,
        /\b(kanembu|borno|maiduguri|kanuribe)\b/i
      ]
    };

    // Context prompts for AI agents per language
    this.languageContext = {
      en: `Respond in English. Use clear, professional language appropriate for an operational command center.`,
      
      ha: `Respond in Hausa (Hausa language). Use proper Hausa with Arabic script transliteration if needed.
Common military/operational terms:
- Security: tsaro
- Report: rahoto  
- Position: matsayi
- Movement: motsi
- Alert: faɗakarwa
- Confirmed: an tabbatar`,
      
      yo: `Respond in Yoruba (Yorùbá language). Use proper Yoruba with tone marks when possible.
Common military/operational terms:
- Security: ààbò
- Report: ìròyìn
- Position: ipò
- Movement: ìgbéra
- Alert: ìkìlọ
- Confirmed: a ti jẹrisi`,
      
      ig: `Respond in Igbo (Igbo language). Use proper Igbo with special characters.
Common military/operational terms:
- Security: nchekwa
- Report: akụkọ
- Position: ọnọdụ
- Movement: mmegharị
- Alert: ịdọ aka ná ntị
- Confirmed: ekwusịrị`,
      
      pcm: `Respond in Nigerian Pidgin English (Naijá). Use common Pidgin expressions.
Keep it natural but professional. Example phrases:
- "E good" (acknowledged)
- "Roger dat" (understood)
- "Wahala dey" (there's a problem)
- "Area clear" (all clear)
- "Movement dey" (activity detected)
- "Na confirm" (confirmed)`,
      
      ff: `Respond in Fulfulde (Fula/Fulani language). Use proper Fulfulde.
Common military/operational terms:
- Security: kisal
- Report: haala
- Position: nokku
- Movement: yahdu
- Alert: reentaade
- Confirmed: tabbitii
Note: Fulfulde is spoken by Fulani across Northern Nigeria and the Sahel.`,
      
      kr: `Respond in Kanuri language. Use proper Kanuri expressions.
Common military/operational terms:
- Security: kəla
- Report: labar
- Position: fəte
- Movement: ləmənwa
- Alert: hada
- Confirmed: gana
Note: Kanuri is the dominant language in Borno State and the Lake Chad region.`
    };
  }

  /**
   * Detect language from text
   * @param {string} text - Input text
   * @returns {string} - Detected language code (en, ha, yo, ig, pcm)
   */
  detectLanguage(text) {
    if (!text || typeof text !== 'string') return 'en';
    
    const normalizedText = text.toLowerCase();
    const scores = { en: 0, ha: 0, yo: 0, ig: 0, pcm: 0 };

    // Check detection patterns
    for (const [lang, patterns] of Object.entries(this.detectionPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(normalizedText)) {
          scores[lang] += 2;
        }
      }
    }

    // Check common phrases
    for (const [lang, categories] of Object.entries(this.commonPhrases)) {
      for (const phrases of Object.values(categories)) {
        for (const phrase of phrases) {
          if (normalizedText.includes(phrase.toLowerCase())) {
            scores[lang] += 1;
          }
        }
      }
    }

    // Find highest scoring language
    let detectedLang = 'en';
    let maxScore = 0;
    for (const [lang, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        detectedLang = lang;
      }
    }

    // Default to English if no clear detection
    return maxScore > 0 ? detectedLang : 'en';
  }

  /**
   * Get language context for AI prompt
   * @param {string} langCode - Language code
   * @returns {string} - Context prompt for AI
   */
  getLanguageContext(langCode) {
    return this.languageContext[langCode] || this.languageContext.en;
  }

  /**
   * Get language info
   * @param {string} langCode - Language code
   * @returns {object} - Language info
   */
  getLanguageInfo(langCode) {
    return this.languages[langCode] || this.languages.en;
  }

  /**
   * List all supported languages
   * @returns {object[]} - Array of language info objects
   */
  listLanguages() {
    return Object.entries(this.languages).map(([code, info]) => ({
      code,
      ...info
    }));
  }

  /**
   * Check if language is supported
   * @param {string} langCode - Language code
   * @returns {boolean}
   */
  isSupported(langCode) {
    return langCode in this.languages;
  }

  /**
   * Get emergency phrases for a language
   * @param {string} langCode - Language code
   * @returns {string[]} - Emergency phrases
   */
  getEmergencyPhrases(langCode) {
    const phrases = this.commonPhrases[langCode]?.emergency || [];
    return [...phrases, ...this.commonPhrases.en.emergency]; // Always include English
  }

  /**
   * Check if text contains emergency keywords
   * @param {string} text - Input text
   * @returns {boolean}
   */
  isEmergency(text) {
    if (!text) return false;
    const normalizedText = text.toLowerCase();
    
    for (const lang of Object.keys(this.commonPhrases)) {
      const emergencyPhrases = this.commonPhrases[lang]?.emergency || [];
      for (const phrase of emergencyPhrases) {
        if (normalizedText.includes(phrase.toLowerCase())) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get greeting response in language
   * @param {string} langCode - Language code
   * @returns {string} - Greeting
   */
  getGreeting(langCode) {
    const greetings = {
      en: 'Hello, how can I assist you?',
      ha: 'Sannu, yaya zan taimaka maka?',
      yo: 'Pẹlẹ o, bawo ni mo ṣe le ran ọ lọwọ?',
      ig: 'Nnọọ, kedụ ka m ga-esi nyere gị aka?',
      pcm: 'How far, wetin I fit do for you?',
      ff: 'A jam waali, hol ko mbaaw-mi wallude ma?',
      kr: 'Wu sha, ni ro sandiya ye?'
    };
    return greetings[langCode] || greetings.en;
  }

  /**
   * Get acknowledgment in language
   * @param {string} langCode - Language code
   * @returns {string} - Acknowledgment
   */
  getAcknowledgment(langCode) {
    const acks = {
      en: 'Understood.',
      ha: 'Na gane.',
      yo: 'Mo ti gbọ.',
      ig: 'Aghọtara m.',
      pcm: 'I hear you.',
      ff: 'Mi jaabii.',
      kr: 'Na gana.'
    };
    return acks[langCode] || acks.en;
  }
}

module.exports = LanguageSupport;
