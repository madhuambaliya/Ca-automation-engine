import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScrapedQuestion } from './types';

export class Scraper {
  private static BASE_URL = 'https://www.indiabix.com';

  async scrapeCategory(path: string): Promise<ScrapedQuestion[]> {
    const url = path.startsWith('http') ? path : `${Scraper.BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
    console.log(`[Scraper] Fetching: ${url}`);
    
    try {
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const $ = cheerio.load(data);
      const questions: ScrapedQuestion[] = [];

      $('.bix-div-container').each((_, el) => {
        const qContainer = $(el);
        
        const question_text = qContainer.find('.bix-td-qtxt').text().trim();
        
        const options: string[] = [];
        qContainer.find('.bix-td-option-val').each((_, opt) => {
          options.push($(opt).text().trim());
        });

        // Enhanced Answer Detection
        const hiddenInput = qContainer.find('input.jq-hdnakq');
        let correct_option = (hiddenInput.val() as string || '').trim().toUpperCase();

        // Fallback 1: Check visual class (e.g., option-svg-letter-d) in the answer section
        if (!correct_option) {
          const visualAnsSpan = qContainer.find('.bix-ans-option span[class*="option-svg-letter-"]');
          if (visualAnsSpan.length > 0) {
            const classAttr = visualAnsSpan.attr('class') || '';
            const match = classAttr.match(/option-svg-letter-([a-d])/i);
            if (match) correct_option = match[1].toUpperCase();
          }
        }

        // Fallback 2: Check text content of the answer section
        if (!correct_option) {
          const ansText = qContainer.find('.bix-ans-option').text().trim();
          const match = ansText.match(/Option\s+([A-D])/i);
          if (match) correct_option = match[1].toUpperCase();
        }
        const explanation = qContainer.find('.bix-ans-description').text().trim();
        
        // Extract category from the link at the bottom
        const categoryLink = qContainer.find('.explain-link a').attr('href') || '';
        const category_name = qContainer.find('.explain-link a').text().replace('Category :', '').trim() || 'Miscellaneous';
        
        // Slug is usually the third part of the path: /current-affairs/economy/ -> economy
        const slugMatch = categoryLink.match(/\/current-affairs\/([^\/]+)\//);
        const category_slug = slugMatch ? slugMatch[1] : 'miscellaneous';

        if (question_text && options.length >= 4) {
          questions.push({
            question_text,
            option_a: options[0],
            option_b: options[1],
            option_c: options[2],
            option_d: options[3],
            correct_option: correct_option || 'A',
            explanation,
            category_name,
            category_slug,
            source: 'IndiaBIX'
          });
        }
      });

      console.log(`[Scraper] Found ${questions.length} questions.`);
      return questions;
    } catch (error) {
      console.error(`[Scraper] Error scraping ${url}:`, error);
      return [];
    }
  }

  async discoverDailyUrls(): Promise<string[]> {
    const url = `${Scraper.BASE_URL}/current-affairs/questions-and-answers/`;
    console.log(`[Scraper] Discovering daily URLs from: ${url}`);
    
    try {
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const $ = cheerio.load(data);
      const urls: string[] = [];

      // Look for links that match the pattern /current-affairs/YYYY-MM-DD/
      $('a.text-link').each((_, el) => {
        const href = $(el).attr('href') || '';
        const fullUrl = href.startsWith('http') ? href : `${Scraper.BASE_URL}${href}`;
        if (fullUrl.match(/\/current-affairs\/\d{4}-\d{2}-\d{2}\/$/)) {
          urls.push(fullUrl);
        }
      });

      console.log(`[Scraper] Discovered ${urls.length} daily URLs.`);
      return [...new Set(urls)]; // Deduplicate
    } catch (error) {
      console.error(`[Scraper] Error discovering URLs:`, error);
      return [];
    }
  }

  /**
   * Extract date from IndiaBIX URL (e.g. /2026-04-01/ -> 2026-04-01)
   */
  static extractDateFromUrl(url: string): string {
    const match = url.match(/\/current-affairs\/(\d{4}-\d{2}-\d{2})\/$/);
    return match ? match[1] : new Date().toISOString().split('T')[0];
  }

  /**
   * IndiaBIX Current Affairs categories that map to our system
   */
  static CATEGORY_PATHS = [
    '/current-affairs/economy/',
    '/current-affairs/sports/',
    '/current-affairs/science-and-technology/',
    '/current-affairs/awards-and-honours/',
    '/current-affairs/banking/',
    '/current-affairs/international/',
    '/current-affairs/national/'
  ];
}
