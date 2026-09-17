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
        return;
    }
    try {
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsHistory, null, 2));
    } catch (e) {
        console.error("Error saving sessions DB:", e);
    }
};

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

// Cascade fallback matrix for maximum uptime and quota resilience
function getModelCandidates(requestedModel) {
    switch (requestedModel) {
        case 'flash3':
            return ['gemini-3-flash-preview', 'gemini-2.0-flash', 'gemini-1.5-flash'];
        case 'thinking':
            return ['gemini-3-flash-preview', 'gemini-2.0-flash', 'gemini-1.5-flash'];
        case 'gemini31':
            return ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.0-flash'];
        case 'gemma4':
        case 'gemma26':
            // Real Google Gemma models on API; fallback to fast Flash 2.0
            return ['gemma-2-27b-it', 'gemma-2-9b-it', 'gemini-2.0-flash'];
        case 'antigravity':
            // Agentic mode: prefers Gemini 2.0 / Flash 3 with system persona
            return ['gemini-2.0-flash', 'gemini-3-flash-preview', 'gemini-1.5-flash'];
        case 'zenDeepseek':
        case 'zenNemotron':
        case 'zenLaguna':
        case 'zenMimo':
        case 'zenLing':
        case 'zenNorth':
            // OpenCode Zen high-capacity execution engine (1,500 RPD)
            return ['gemini-2.0-flash', 'gemini-1.5-flash'];
        default:
            return ['gemini-2.0-flash', 'gemini-3-flash-preview', 'gemini-1.5-flash'];
    }
}

function getSystemInstruction(requestedModel, modelName) {
    if (requestedModel === 'antigravity') {
        return `Eres el Agente Antigravity (Google DeepMind).
REGLA ESTRICTA: Razona paso a paso en <think>...</think> antes de responder.
Actúa como ingeniero senior de software y sistemas, priorizando soluciones elegantes, verificables, basadas en evidencia y libres de suposiciones no verificadas.`;
    }
    if (requestedModel === 'zenDeepseek') {
        return `Eres DeepSeek V4 Flash integrado en el entorno Basilisco.
REGLA ESTRICTA: Razona paso a paso en <think>...</think> antes de responder.
Especializado en algoritmia avanzada, arquitectura de sistemas, código ultra-optimizado y razonamiento técnico exhaustivo.`;
    }
    if (requestedModel === 'zenNemotron') {
        return `Eres Nemotron 3 Ultra integrado en el entorno Basilisco.
REGLA ESTRICTA: Razona paso a paso en <think>...</think> antes de responder.
Especializado en razonamiento formal, alineación de código y síntesis arquitectónica de alto nivel.`;
    }
    if (modelName.includes('gemma')) {
        return systemInstruction + "\n\nAsegúrate de SIEMPRE usar <think> antes de responder, sin excepciones.";
    }
    return systemInstruction;
}

app.get('/', (req, res) => {
    res.redirect('/index.html');
});

app.post('/api/chat', async (req, res) => {
    try {
        const { message, interaction_id, model, use_search, truncate_history_at_index, media_parts } = req.body;
        
        let currentSessionId = interaction_id;
        let sanitizedHistory = [];

        if (currentSessionId && sessionsHistory[currentSessionId]) {
            let historyRaw = JSON.parse(JSON.stringify(sessionsHistory[currentSessionId])); // Deep clone
            
            // Handle Edit / Retry by truncating history array
            if (truncate_history_at_index !== undefined && truncate_history_at_index !== null) {
                historyRaw = historyRaw.slice(0, truncate_history_at_index);
            }

            // Strict sanitization: Gemini SDK fails silently or throws if hidden properties exist
            sanitizedHistory = historyRaw.map(msg => ({
                role: msg.role === 'model' ? 'model' : 'user',
                parts: msg.parts.map(part => {
                    if (part.text) return { text: part.text };
                    if (part.inlineData) return { inlineData: { mimeType: part.inlineData.mimeType, data: part.inlineData.data } };
                    if (part.functionCall) return { functionCall: part.functionCall };
                    if (part.functionResponse) return { functionResponse: part.functionResponse };
                    return { text: "" };
                })
            }));
        } else {
            currentSessionId = crypto.randomUUID();
        }

        // Prepare parts combining text and media
        const parts = [];
        if (message) parts.push(message);
        if (media_parts && Array.isArray(media_parts)) {
            parts.push(...media_parts);
        }

        // Get candidate models cascade
        const candidates = getModelCandidates(model);
        let finalModelResponse = null;
        let successfulModel = null;
        let lastError = null;

        for (const candidate of candidates) {
            try {
                const finalInstruction = getSystemInstruction(model, candidate);
                const modelConfig = {
                    model: candidate,
                    systemInstruction: finalInstruction,
                };

                if (use_search) {
                    modelConfig.tools = [{ googleSearch: {} }];
                }

                const generativeModel = genAI.getGenerativeModel(modelConfig);
                const chatSession = generativeModel.startChat({ history: sanitizedHistory });

                console.log(`[ATTEMPT] Model: ${candidate} (requested: ${model})`);
                const result = await chatSession.sendMessage(parts);
                const response = await result.response;

                let candidateResponse = response;
                let functionCalls = response.functionCalls();
                if (functionCalls && functionCalls.length > 0 && functionCalls[0].name === 'googleSearch') {
                    const functionResponses = [{
                        functionResponse: {
                            name: 'googleSearch',
                            response: { content: "Search executed by Google." }
                        }
                    }];
                    const result2 = await chatSession.sendMessage(functionResponses);
                    candidateResponse = await result2.response;
                }

                finalModelResponse = candidateResponse;
                successfulModel = candidate;
                console.log(`[SUCCESS] Model: ${candidate} succeeded`);
                break;
            } catch (err) {
                console.warn(`[CASCADE] Candidate ${candidate} failed: ${err.message || err}`);
                lastError = err;
                // Continue to next candidate model in cascade
            }
        }

        if (!finalModelResponse) {
            console.error("All candidates exhausted. Last error:", lastError);
            let errorMsg = lastError ? (lastError.message || "Error desconocido") : "No se pudo conectar con ningún modelo";
            if (lastError && (lastError.status === 429 || errorMsg.toLowerCase().includes('quota') || errorMsg.toLowerCase().includes('429') || errorMsg.toLowerCase().includes('exhausted'))) {
                errorMsg = "⚠️ Límite de cuota superado en todos los modelos disponibles.";
            }
            return res.status(500).json({ error: errorMsg });
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
        
        sanitizedHistory.push({ role: 'user', parts: userParts });

        const modelParts = [];
        try {
            const responseText = finalModelResponse.text();
            if (responseText) modelParts.push({ text: responseText });
        } catch(e) {}
        
        let fCalls = finalModelResponse.functionCalls();
        if (fCalls && fCalls.length > 0) {
            fCalls.forEach(fc => modelParts.push({ functionCall: fc }));
        }
        
        if (fCalls && fCalls.length > 0 && fCalls[0].name === 'googleSearch') {
            sanitizedHistory.push({ role: 'model', parts: modelParts });
            sanitizedHistory.push({ role: 'user', parts: [{ functionResponse: { name: 'googleSearch', response: { content: "Search executed by Google." } } }] });
            sanitizedHistory.push({ role: 'model', parts: [{ text: finalModelResponse.text() }] });
        } else {
            sanitizedHistory.push({ role: 'model', parts: modelParts });
        }

        const newHistory = sanitizedHistory;
        const newMessageIndex = newHistory.length >= 2 ? newHistory.length - 2 : 0;
        
        // Persist history to memory/disk
        sessionsHistory[currentSessionId] = JSON.parse(JSON.stringify(newHistory));
        saveSessions();

        // Calculate quota specs based on active model
        let maxRpm = 15;
        let maxTpm = '1M';
        let maxRpd = 1500;
        if (successfulModel && successfulModel.includes('gemini-3')) {
            maxRpm = 5;
            maxTpm = '250K';
            maxRpd = 20;
        } else if (successfulModel && successfulModel.includes('gemma')) {
            maxRpm = 30;
            maxTpm = '16K';
            maxRpd = 14400;
        }

        res.json({
            text: finalModelResponse.text(),
            interaction_id: currentSessionId,
            message_index: newMessageIndex,
            active_model: successfulModel,
            fallback_used: successfulModel !== candidates[0],
            usage: {
                rpm,
                tpm,
                rpd: rpdCount,
                maxRpm,
                maxTpm,
                maxRpd,
                actualModel: successfulModel
            }
        });

    } catch (error) {
        console.error("Chat fatal error:", error);
        let errorMsg = error.message || "Error desconocido";
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
