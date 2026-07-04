"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeProvider = void 0;
class ClaudeProvider {
    async generateResponse(history, systemPrompt) {
        const start = Date.now();
        // Placeholder for actual Anthropic SDK integration
        // Example: const msg = await anthropic.messages.create({...})
        const reply = "This is a placeholder response from the Claude Provider. Anthropic integration requires adding the @anthropic-ai/sdk package and configuring ANTHROPIC_API_KEY.";
        const end = Date.now();
        return {
            reply,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            timestamps: { start, end }
        };
    }
}
exports.ClaudeProvider = ClaudeProvider;
