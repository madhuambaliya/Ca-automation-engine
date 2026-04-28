export interface ScrapedQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation: string;
  category_name: string;
  category_slug: string;
  source: string;
}

export interface CAQuizData {
  title: string;
  daily_date: string;
  news_category_slug: string;
  questions: ScrapedQuestion[];
}
