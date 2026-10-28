export type Quote = { quote_id: string; credits: number; action: string; quality: string; legacy: boolean; expires_at: string; model: { label: string; model: string; max_output_tokens: number } };
export type QuotePrompt = { apiBase: string; path: string; payload: Record<string, unknown>; headers: Record<string, string>; resolve: (id: string) => void; reject: (error: Error) => void };
let present: ((request: QuotePrompt) => void) | null = null;
export function setQuotePresenter(value: typeof present) { present = value; }
export function requestCreditQuote(input: Omit<QuotePrompt, 'resolve' | 'reject'>): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!present) { reject(new Error('The credit confirmation screen is not ready. Please try again.')); return; }
    present({ ...input, resolve, reject });
  });
}
export const METERED_PATHS = new Set(['/generate', '/chat', '/generate/scad', '/editor/enhance', '/editor/style', '/editor/bg-remove', '/editor/caption', '/avatar/generate']);