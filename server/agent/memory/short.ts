import type Anthropic from "@anthropic-ai/sdk";

const MAX_HISTORY_LENGTH = 100;

/**
 * Manages the message history for an agent run.
 * Provides trimming to prevent context window overflow.
 */
export class MessageHistory {
  private messages: Anthropic.MessageParam[] = [];

  push(message: Anthropic.MessageParam): void {
    this.messages.push(message);

    // Trim oldest messages (keep first user message + recent history)
    if (this.messages.length > MAX_HISTORY_LENGTH) {
      const first = this.messages[0];
      this.messages = [first, ...this.messages.slice(-MAX_HISTORY_LENGTH + 1)];
    }
  }

  getMessages(): Anthropic.MessageParam[] {
    return [...this.messages];
  }

  getLength(): number {
    return this.messages.length;
  }

  serialize(): string {
    return JSON.stringify(this.messages);
  }
}
