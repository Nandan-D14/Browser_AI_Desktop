// FIX: Removed unused and non-existent 'LiveSession' type from import.
import { GoogleGenAI, Modality } from "@google/genai";
import { AiService } from "../types";

let ai: GoogleGenAI | null = null;
if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
}

const geminiService: AiService = {
    ai,
    connectLiveApi: async (callbacks) => {
        if (!ai) {
            throw new Error("Gemini AI not initialized. Make sure API_KEY is set.");
        }
        
        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: () => {},
                onmessage: callbacks.onMessage,
                onerror: callbacks.onError,
                onclose: callbacks.onClose,
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction: 'You are a helpful and friendly AI assistant integrated into a virtual operating system.',
            },
        });
        return sessionPromise;
    },

    generateWithPro: async (prompt: string) => {
        if (!ai) return "AI not initialized.";
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: prompt,
                config: {
                    thinkingConfig: { thinkingBudget: 32768 }
                }
            });
            return response.text;
        } catch (error) {
            console.error("Error with Gemini Pro:", error);
            return "Sorry, I encountered an error while thinking.";
        }
    },

    generateWithFlashLite: async (prompt: string) => {
        if (!ai) return "AI not initialized.";
        try {
            const response = await ai.models.generateContent({
                // FIX: Updated model name to 'gemini-flash-lite-latest' as per guidelines for 'flash lite' models.
                model: 'gemini-flash-lite-latest',
                contents: prompt,
            });
            return response.text;
        } catch (error) {
            console.error("Error with Gemini Flash Lite:", error);
            return "Sorry, I couldn't process that request.";
        }
    },

    generateWithProStream: async (prompt: string, onChunk: (chunk: string) => void) => {
        if (!ai) return onChunk("AI not initialized.");
        try {
            const responseStream = await ai.models.generateContentStream({
                model: 'gemini-2.5-pro',
                contents: prompt,
                config: {
                    thinkingConfig: { thinkingBudget: 32768 }
                }
            });
            for await (const chunk of responseStream) {
                onChunk(chunk.text);
            }
        } catch (error) {
            console.error("Error with Gemini Pro Stream:", error);
            onChunk("Sorry, I encountered an error while thinking.");
        }
    },

    generateWithFlashLiteStream: async (prompt: string, onChunk: (chunk: string) => void) => {
        if (!ai) return onChunk("AI not initialized.");
        try {
            const responseStream = await ai.models.generateContentStream({
                model: 'gemini-flash-lite-latest',
                contents: prompt,
            });
            for await (const chunk of responseStream) {
                onChunk(chunk.text);
            }
        } catch (error) {
            console.error("Error with Gemini Flash Lite Stream:", error);
            onChunk("Sorry, I couldn't process that request.");
        }
    },

    generateSpeech: async (text: string) => {
        if (!ai) throw new Error("AI not initialized.");
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-preview-tts',
                contents: [{ parts: [{ text }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                    },
                },
            });
            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!base64Audio) throw new Error("No audio data received from TTS API.");
            return base64Audio;
        } catch (error) {
            console.error("Error generating speech:", error);
            throw error;
        }
    },
};

export default geminiService;