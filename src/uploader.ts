import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ScrapedQuestion } from './types';
import dotenv from 'dotenv';

dotenv.config();

export class Uploader {
  private supabase: SupabaseClient;
  private readonly CA_SUBJECT_ID = 'e2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('[Uploader] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    this.supabase = createClient(url, key);
  }

  async uploadQuestions(questions: ScrapedQuestion[], dailyDate: string): Promise<void> {
    console.log(`[Uploader] Processing ${questions.length} questions for date ${dailyDate}...`);

    // 1. Ensure ONE Daily Quiz exists for this date
    const quizTitle = `Daily Current Affairs - ${dailyDate}`;
    const { data: quiz, error: quizFetchErr } = await this.supabase
      .from('quizzes')
      .select('id, question_count')
      .eq('daily_date', dailyDate)
      .eq('is_daily', true)
      .eq('subject_id', this.CA_SUBJECT_ID)
      .maybeSingle();

    let quizId: string;
    let existingCount = 0;

    if (quiz) {
      quizId = quiz.id;
      existingCount = quiz.question_count || 0;
    } else {
      const { data: newQuiz, error: quizErr } = await this.supabase
        .from('quizzes')
        .insert({
          subject_id: this.CA_SUBJECT_ID,
          title: quizTitle,
          question_count: 0,
          is_daily: true,
          daily_date: dailyDate,
          is_active: true
        })
        .select('id')
        .single();

      if (quizErr) throw quizErr;
      quizId = newQuiz.id;
      console.log(`[Uploader] Created single daily quiz: ${quizTitle}`);
    }

    const questionLinks: { quiz_id: string; question_id: string; order_index: number }[] = [];

    // 2. Process Questions
    for (const q of questions) {
      try {
        // Check for duplicates
        const { data: existing } = await this.supabase
          .from('questions')
          .select('id')
          .eq('question_text', q.question_text)
          .eq('subject_id', this.CA_SUBJECT_ID)
          .maybeSingle();

        let questionId: string;

        if (existing) {
          questionId = existing.id;
        } else {
          // Insert Question
          const { data: newQ, error: qErr } = await this.supabase
            .from('questions')
            .insert({
              subject_id: this.CA_SUBJECT_ID,
              question_text: q.question_text,
              option_a: q.option_a,
              option_b: q.option_b,
              option_c: q.option_c,
              option_d: q.option_d,
              correct_option: q.correct_option,
              explanation: q.explanation,
              source: q.source,
              news_category_slug: q.category_slug,
              daily_date: dailyDate,
              is_active: true
            })
            .select('id')
            .single();

          if (qErr) throw qErr;
          questionId = newQ.id;
        }

        // Add to batch for linking
        questionLinks.push({
          quiz_id: quizId,
          question_id: questionId,
          order_index: existingCount + questionLinks.length + 1
        });

      } catch (err) {
        console.error(`[Uploader] Error processing question:`, err);
      }
    }

    // 3. Batch Link Questions to Quiz
    if (questionLinks.length > 0) {
      console.log(`[Uploader] Linking ${questionLinks.length} questions to quiz...`);
      const { error: linkErr } = await this.supabase
        .from('quiz_questions')
        .upsert(questionLinks, { onConflict: 'quiz_id,question_id' });

      if (linkErr) console.error(`[Uploader] Link Error:`, linkErr);

      // 4. Update the question_count on the quiz
      const totalCount = existingCount + questionLinks.length;
      await this.supabase
        .from('quizzes')
        .update({ question_count: totalCount })
        .eq('id', quizId);
        
      console.log(`[Uploader] Updated quiz question count to: ${totalCount}`);
    }
    
    console.log(`[Uploader] Finished processing batch for ${dailyDate}.`);
  }
}
