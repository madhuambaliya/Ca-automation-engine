import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class HistoryManager {
  private scrapedUrls: Set<string> = new Set();
  private githubPat = process.env.GH_PAT;
  private gistId = process.env.GIST_ID;
  private filename = 'scraped_urls_indiabix.json';

  async init() {
    if (!this.githubPat) {
      console.warn('[History] GITHUB_PAT not found. Falling back to local history.');
      this.loadLocalHistory();
      return;
    }

    try {
      if (this.gistId) {
        await this.loadFromGist();
      } else {
        console.log('[History] GIST_ID not found. Creating a new Gist...');
        await this.createGist();
      }
    } catch (error) {
      console.error('[History] Failed to initialize Gist history, falling back to local:', error);
      this.loadLocalHistory();
    }
  }

  private loadLocalHistory() {
    const localPath = path.join(__dirname, '..', 'scraped_urls.json');
    try {
      if (fs.existsSync(localPath)) {
        const data = fs.readFileSync(localPath, 'utf8');
        const urls = JSON.parse(data);
        this.scrapedUrls = new Set(urls);
        console.log(`[History] Loaded ${this.scrapedUrls.size} URLs from local history.`);
      }
    } catch (error) {
      console.error('[History] Failed to load local history:', error);
    }
  }

  private async loadFromGist() {
    try {
      const response = await axios.get(`https://api.github.com/gists/${this.gistId}`, {
        headers: { Authorization: `token ${this.githubPat}` }
      });
      const content = response.data.files[this.filename]?.content;
      if (content) {
        const urls = JSON.parse(content);
        if (Array.isArray(urls)) {
          this.scrapedUrls = new Set(urls);
        } else {
          console.warn(`[History] Gist content is not an array, initializing empty.`);
          this.scrapedUrls = new Set();
        }
        console.log(`[History] Loaded ${this.scrapedUrls.size} URLs from Gist ${this.gistId}.`);
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.warn(`[History] Gist ${this.gistId} not found. Will create a new one on save.`);
        this.gistId = undefined;
      } else {
        throw error;
      }
    }
  }

  private async createGist() {
    const response = await axios.post('https://api.github.com/gists', {
      description: 'Scraped URLs for CA Automation',
      public: false,
      files: {
        [this.filename]: {
          content: JSON.stringify(Array.from(this.scrapedUrls), null, 2)
        }
      }
    }, {
      headers: { Authorization: `token ${this.githubPat}` }
    });
    this.gistId = response.data.id;
    console.log(`[History] Created new Gist: ${this.gistId}. Please add this to your .env file.`);
  }

  isScraped(url: string): boolean {
    return this.scrapedUrls.has(url);
  }

  addUrl(url: string) {
    this.scrapedUrls.add(url);
  }

  async saveHistory() {
    // Always save locally as backup
    const localPath = path.join(__dirname, '..', 'scraped_urls.json');
    try {
      const urls = Array.from(this.scrapedUrls);
      fs.writeFileSync(localPath, JSON.stringify(urls, null, 2));
    } catch (err) {
      console.error('[History] Failed to save local backup:', err);
    }

    if (!this.githubPat) return;

    try {
      if (!this.gistId) {
        await this.createGist();
      } else {
        await axios.patch(`https://api.github.com/gists/${this.gistId}`, {
          files: {
            [this.filename]: {
              content: JSON.stringify(Array.from(this.scrapedUrls), null, 2)
            }
          }
        }, {
          headers: { Authorization: `token ${this.githubPat}` }
        });
        console.log(`[History] Saved ${this.scrapedUrls.size} URLs to Gist ${this.gistId}.`);
      }
    } catch (error) {
      console.error('[History] Failed to save to Gist:', error);
    }
  }
}

