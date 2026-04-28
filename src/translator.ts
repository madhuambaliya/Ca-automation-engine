import translate from 'google-translate-api-next';
import { ScrapedQuestion } from './types';

export class Translator {
  private static TARGET_LANG = 'gu';
  private static MAX_RETRIES = 3;
  private static FIELD_SEPARATOR = ' [||] ';

  async translateQuestion(q: ScrapedQuestion): Promise<ScrapedQuestion> {
    const fields = [
      q.question_text,
      q.option_a,
      q.option_b,
      q.option_c,
      q.option_d,
      q.explanation
    ];

    const combinedText = fields.join(Translator.FIELD_SEPARATOR);
    console.log(`[Translator] Translating batch of ${fields.length} fields for: ${q.question_text.substring(0, 30)}...`);

    let translatedText = '';
    let success = false;
    let attempt = 0;

    while (attempt < Translator.MAX_RETRIES && !success) {
      try {
        const res = await translate(combinedText, { to: Translator.TARGET_LANG });
        translatedText = res.text;

        // Simple validation: if target is Gujarati, the result should contain non-ASCII characters
        // This is a rough check to see if it just returned English
        if (this.isTranslated(translatedText)) {
          success = true;
        } else {
          console.warn(`[Translator] Translation seems to have failed (returned English), retry ${attempt + 1}/${Translator.MAX_RETRIES}`);
          attempt++;
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      } catch (error) {
        console.warn(`[Translator] Translation error, retry ${attempt + 1}/${Translator.MAX_RETRIES}:`, error);
        attempt++;
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }

    if (!success) {
      console.error(`[Translator] Failed to translate after ${Translator.MAX_RETRIES} attempts. Returning original.`);
      return q;
    }

    const translatedFields = translatedText.split(Translator.FIELD_SEPARATOR.trim());
    
    // Fallback if split fails or count mismatch
    if (translatedFields.length < 6) {
      console.error(`[Translator] Split mismatch: expected 6, got ${translatedFields.length}. Returning original.`);
      return q;
    }

    return {
      ...q,
      question_text: translatedFields[0]?.trim() || q.question_text,
      option_a: translatedFields[1]?.trim() || q.option_a,
      option_b: translatedFields[2]?.trim() || q.option_b,
      option_c: translatedFields[3]?.trim() || q.option_c,
      option_d: translatedFields[4]?.trim() || q.option_d,
      explanation: translatedFields[5]?.trim() || q.explanation
    };
  }

  private isTranslated(text: string): boolean {
    // Gujarati characters are in the range \u0A80-\u0AFF
    const gujaratiRegex = /[\u0A80-\u0AFF]/;
    return gujaratiRegex.test(text);
  }

  async translateBatch(questions: ScrapedQuestion[]): Promise<ScrapedQuestion[]> {
    const results: ScrapedQuestion[] = [];
    for (const q of questions) {
      const tq = await this.translateQuestion(q);
      results.push(tq);
      // Small delay between questions to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return results;
  }
}

