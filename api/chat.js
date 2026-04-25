const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');
const fs = require('fs');

dotenv.config();

const app = express();
const port = 3000;

app.use(cors());
// Increased limits for Base64 multimedia processing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Persistent Memory System
const SESSIONS_FILE = './sessions_db.json';
let sessionsHistory = {};
if (fs.existsSync(SESSIONS_FILE)) {
    try {
        sessionsHistory = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    } catch (e) {
        console.error("Error reading sessions DB:", e);
    }
}

const saveSessions = () => {
    // In serverless environments like Vercel, the filesystem is read-only.
    // We skip saving to disk to avoid errors.
    if (process.env.VERCEL) {
        console.log("Running on Vercel: Skipping disk persistence.");
        return;
    }
    try {
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsHistory, null, 2));
    } catch (e) {
        console.error("Error saving sessions DB:", e);
    }
};

const sessions = {};

// Quota tracking
let usageLog = []; // Stores { timestamp, tokens }
let currentDayStr = new Date().toDateString();
let rpdCount = 0;

const systemInstruction = `Eres un asistente experto.
REGLA ESTRICTA: Debes pensar paso a paso ANTES de responder.
Para pensar, DEBES usar este formato exacto:
<think>
(Escribe aquí tu monólogo interno)
</think>
(Escribe aquí tu respuesta final al usuario)

IMPORTANTE: 
1. NO escribas NADA antes de <think>.
2. Responde usando datos de foros y documentación oficial.`;

app.post('/api/chat', async (req, res) => {
    try {
        const { message, interaction_id, model, use_search, truncate_history_at_index, media_parts } = req.body;
        
        let currentSessionId = interaction_id;
        let chatSession;

        let modelName = 'gemini-3-flash-preview'; // Default to Flash
        if (model === 'gemini31') modelName = 'gemini-3.1-pro-preview';
        if (model === 'thinking') modelName = 'gemini-3-flash-preview'; // Gemini 3 includes thinking by default
        if (model === 'flash3') modelName = 'gemini-3-flash-preview';
        if (model === 'gemma4') modelName = 'gemma-4-31b-it';

        let finalSystemInstruction = systemInstruction;
        if (modelName.includes('gemma')) {
            finalSystemInstruction = systemInstruction + "\n\nAsegúrate de SIEMPRE usar <think> antes de responder, sin excepciones.";
        }

        const modelConfig = {
            model: modelName,
            systemInstruction: finalSystemInstruction,
        };

        if (use_search) {
             modelConfig.tools = [{ googleSearch: {} }];
        }

        const generativeModel = genAI.getGenerativeModel(modelConfig);
        let history = [];

        if (currentSessionId && sessionsHistory[currentSessionId]) {
            history = JSON.parse(JSON.stringify(sessionsHistory[currentSessionId])); // Deep clone
            
            // ESTRICTA SANITIZACIÓN: El SDK de Gemini falla silenciosamente si hay propiedades ocultas en el historial.
            history = history.map(msg => ({
                role: msg.role === 'model' ? 'model' : 'user',
                parts: msg.parts.map(part => {
                    if (part.text) return { text: part.text };
                    if (part.inlineData) return { inlineData: { mimeType: part.inlineData.mimeType, data: part.inlineData.data } };
                    if (part.functionCall) return { functionCall: part.functionCall };
                    if (part.functionResponse) return { functionResponse: part.functionResponse };
                    return { text: "" };
                })
            }));

            // Handle Edit / Retry by truncating history array
            if (truncate_history_at_index !== undefined && truncate_history_at_index !== null) {
                // history slice: keep up to the index of the message being replaced
                history = history.slice(0, truncate_history_at_index);
            }
            
            console.log("HISTORY BEFORE START CHAT:", JSON.stringify(history, null, 2));
            chatSession = generativeModel.startChat({ history: history });
            sessions[currentSessionId] = chatSession;
        } else {
            currentSessionId = crypto.randomUUID();
            chatSession = generativeModel.startChat({ history: [] });
            sessions[currentSessionId] = chatSession;
        }

        // Prepare parts combining text and media
        const parts = [];
        if (message) parts.push(message);
        if (media_parts && Array.isArray(media_parts)) {
             parts.push(...media_parts);
        }

        console.log(`[START] Model: ${modelName}`);
        const result = await chatSession.sendMessage(parts);
        const response = await result.response;
        
        let functionCalls = response.functionCalls();
        let finalModelResponse = response;
        
        if (functionCalls && functionCalls.length > 0) {
            const functionCall = functionCalls[0];
            if (functionCall.name === 'googleSearch') {
                const functionResponses = [{
                    functionResponse: {
                        name: 'googleSearch',
                        response: { content: "Search executed by Google." }
                    }
                }];
                const result2 = await chatSession.sendMessage(functionResponses);
                finalModelResponse = await result2.response;
            }
        }
        
        // Parse token usage
        const usageMetadata = finalModelResponse.usageMetadata;
        const totalTokens = usageMetadata ? usageMetadata.totalTokenCount : 0;

        const now = Date.now();
        // Check day rollover for RPD
        if (new Date().toDateString() !== currentDayStr) {
            currentDayStr = new Date().toDateString();
            rpdCount = 0;
        }

        rpdCount++;
        usageLog.push({ timestamp: now, tokens: totalTokens });

        // Clean up entries older than 60 seconds
        const oneMinuteAgo = now - 60000;
        usageLog = usageLog.filter(entry => entry.timestamp >= oneMinuteAgo);

        const rpm = usageLog.length;
        const tpm = usageLog.reduce((sum, entry) => sum + entry.tokens, 0);

        // Manually update history
        const userParts = parts.map(p => {
            if (typeof p === 'string') return { text: p };
            if (p.inlineData) return { inlineData: { mimeType: p.inlineData.mimeType, data: p.inlineData.data } };
            return { text: "" };
        });
        
        history.push({ role: 'user', parts: userParts });

        const modelParts = [];
        try {
            const responseText = response.text();
            if (responseText) modelParts.push({ text: responseText });
        } catch(e) {}
        
        let fCalls = response.functionCalls();
        if (fCalls && fCalls.length > 0) {
            fCalls.forEach(fc => modelParts.push({ functionCall: fc }));
        }
        
        if (fCalls && fCalls.length > 0 && fCalls[0].name === 'googleSearch') {
             history.push({ role: 'model', parts: modelParts });
             history.push({ role: 'user', parts: [{ functionResponse: { name: 'googleSearch', response: { content: "Search executed by Google." } } }] });
             history.push({ role: 'model', parts: [{ text: finalModelResponse.text() }] });
        } else {
             history.push({ role: 'model', parts: modelParts });
        }

        const newHistory = history;
        const newMessageIndex = newHistory.length >= 2 ? newHistory.length - 2 : 0;
        
        // Persist history to disk
        sessionsHistory[currentSessionId] = JSON.parse(JSON.stringify(newHistory));
        saveSessions();

        let maxRpm = 5;
        let maxTpm = '250K';
        let maxRpd = 20;
        if (model === 'gemma4') {
            maxRpm = 15;
            maxTpm = 'Ilimitado';
            maxRpd = '1.5K';
        }

        res.json({
            text: finalModelResponse.text(),
            interaction_id: currentSessionId,
            message_index: newMessageIndex,
            usage: { rpm, tpm, rpd: rpdCount, maxRpm, maxTpm, maxRpd }
        });

    } catch (error) {
        console.error("Chat error:", error);
        let errorMsg = error.message || "Error desconocido";
        
        // Detect Quota Exceeded / 429 Too Many Requests
        if (error.status === 429 || errorMsg.toLowerCase().includes('quota') || errorMsg.toLowerCase().includes('429') || errorMsg.toLowerCase().includes('exhausted')) {
            errorMsg = "⚠️ Límite de cuota superado.";
        }
        
        res.status(500).json({ error: errorMsg });
    }
});

app.listen(port, () => {
    console.log(`Basilisco server running on http://localhost:${port}`);
});

module.exports = app;
