# Model context

## Why this code exists

Application state, recorded conversation and model context have different roles:

- The database owns current application facts.
- Conversation history records claims that may be stale or incorrect.
- Model context contains selected information for one inference step.

Keeping assembly separate from data access makes ordering and overflow testable without a model or database.
It also keeps authorization in the server domain instead of relying on prompt instructions.

## Implementation

[`buildContext`](../../packages/inference/src/context.ts) receives instructions, messages, tool definitions and an input allowance.
It returns a system message followed by the supplied task messages, without mutating those inputs.
The function performs no network or database access. The same inputs produce the same output.

```ts
const context = buildContext({
  instructions: input.instructions,
  messages,
  tools: definitions,
  maxInputTokens: input.limits.maxInputTokens,
});
```

Callers supply messages and tool definitions explicitly.
Authorize records before passing them into context assembly.
Source references remain in the supplied tool messages.
The text endpoint continues to send its single user prompt directly.

## Input accounting and overflow

The builder estimates input use from serialized UTF-8 bytes plus framing headroom.
It includes instructions, tool definitions and all current task messages.
This deliberately simple estimate avoids coupling a generic gateway adapter to one model's tokenizer.
It is not an exact input-token count or a guarantee about an arbitrary provider's context window.
Use a model-specific tokenizer and context-window policy before relying on exact token limits.

The builder rejects overflow with `BudgetError` before the next model request.
It does not silently truncate instructions, summarize records or drop tool results.
Reserve the desired output allowance outside this input builder.
The text endpoint's prompt character limit remains a separate input guard.

## Memory scope

The starter has no persistent conversation history, retrieval index or summarization pipeline.
The builder does not persist its inputs. Callers supply any history explicitly.
If a product adds memory, define ownership, retention, deletion and provenance before storing it.
Authorize retrieved records before assembly and evaluate retrieval separately from answer quality.
Choose storage from the access pattern; a vector database or GraphRAG is not a prerequisite.

## Verification

[`agent.test.ts`](../../packages/inference/src/_test_/agent.test.ts) checks deterministic assembly, source preservation and oversized results.

```bash
node --test packages/inference/src/_test_/agent.test.ts
just check-integration
```
