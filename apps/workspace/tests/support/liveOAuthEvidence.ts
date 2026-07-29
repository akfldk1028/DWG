export interface LiveOAuthEvidenceInput {
  provider: "codex" | "claude";
  authenticated: boolean;
  firstSessionId: string;
  resumedSessionId: string;
  prompt: string;
  response: string;
}

export interface SafeLiveOAuthSummary {
  provider: "Codex" | "Claude";
  authenticated: boolean;
  resumed: boolean;
}

export function createSafeLiveOAuthSummary(
  input: LiveOAuthEvidenceInput
): SafeLiveOAuthSummary {
  return {
    provider: input.provider === "codex" ? "Codex" : "Claude",
    authenticated: input.authenticated,
    resumed: input.firstSessionId === input.resumedSessionId
  };
}

export function renderSafeLiveOAuthEvidence(
  summary: SafeLiveOAuthSummary
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light" />
    <title>Live OAuth verification</title>
    <style>
      :root { font-family: Arial, sans-serif; color: #172033; background: #fff; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; }
      main { width: 560px; padding: 48px; border: 1px solid #d9dfeb; border-radius: 20px; }
      h1 { margin: 0 0 28px; font-size: 28px; }
      dl { display: grid; grid-template-columns: 1fr auto; gap: 18px; margin: 0; }
      dt { color: #526078; }
      dd { margin: 0; font-weight: 700; color: #166534; }
      footer { margin-top: 28px; color: #667085; font-size: 13px; }
    </style>
  </head>
  <body>
    <main data-testid="safe-live-oauth-evidence">
      <h1>${summary.provider} live OAuth verification</h1>
      <dl>
        <dt>Authenticated CLI</dt><dd>${summary.authenticated ? "Verified" : "Failed"}</dd>
        <dt>Session resume</dt><dd>${summary.resumed ? "Verified" : "Failed"}</dd>
      </dl>
      <footer>Prompts, responses, and provider session identifiers are intentionally omitted.</footer>
    </main>
  </body>
</html>`;
}
