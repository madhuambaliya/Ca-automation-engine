import { Scraper } from './scraper';
import { Translator } from './translator';
import { Uploader } from './uploader';
import { HistoryManager } from './history';
import { ScrapedQuestion } from './types';

async function runAutomation() {
  console.log('=== Daily CA Automation Starting ===');
  
  const scraper = new Scraper();
  const translator = new Translator();
  const uploader = new Uploader();
  const history = new HistoryManager();

  // Initialize history (async)
  await history.init();

  // Manual Test Mode - only trigger if SCRAPE_URL is a non-empty string
  const manualUrl = process.env.SCRAPE_URL;
  if (manualUrl && manualUrl.trim() !== '' && manualUrl !== 'undefined') {
    console.log(`[Main] MANUAL MODE: Processing single URL: ${manualUrl}`);
    await processUrl(manualUrl, scraper, translator, uploader);
    console.log('=== Manual Processing Complete ===');
    return;
  }


  // 1. Discover all daily URLs from the home page
  const allUrls = await scraper.discoverDailyUrls();
  
  // 2. Filter out already scraped URLs
  const newUrls = allUrls.filter(url => !history.isScraped(url));
  
  const processList = newUrls;
  
  console.log(`[Main] Found ${newUrls.length} new URLs. Processing all discovered new items.`);

  // 3. Process each new URL
  for (const url of processList) {
    try {
      const success = await processUrl(url, scraper, translator, uploader);
      if (success) {
        history.addUrl(url);
        await history.saveHistory(); // Save after each successful URL to prevent data loss
      }
      // Delay to be nice to IndiaBIX and Google Translate
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (err) {
      console.error(`[Main] Failed to process URL ${url}:`, err);
    }
  }

  console.log('\n=== Daily CA Automation Complete ===');
}


async function processUrl(url: string, scraper: Scraper, translator: Translator, uploader: Uploader): Promise<boolean> {
  try {
    const dailyDate = Scraper.extractDateFromUrl(url);
    console.log(`\n--- Processing URL: ${url} (Date: ${dailyDate}) ---`);
    
    // 1. Scrape
    const englishQuestions = await scraper.scrapeCategory(url);
    if (englishQuestions.length === 0) {
      console.warn(`[Main] No questions found at ${url}`);
      return false;
    }

    // 2. Translate
    console.log(`[Main] Translating ${englishQuestions.length} questions...`);
    const gujaratiQuestions = await translator.translateBatch(englishQuestions);

    // 3. Upload
    if (process.env.DRY_RUN === 'true') {
      console.log(`[Main] DRY RUN: Skipping upload for ${gujaratiQuestions.length} questions.`);
      console.log(`[Main] Sample Question:`, JSON.stringify(gujaratiQuestions[0], null, 2));
    } else {
      await uploader.uploadQuestions(gujaratiQuestions, dailyDate);
    }
    
    return true;
  } catch (err) {
    console.error(`[Main] Error processing ${url}:`, err);
    return false;
  }
}

runAutomation().catch(err => {
  console.error('Fatal error in automation:', err);
  process.exit(1);
});
