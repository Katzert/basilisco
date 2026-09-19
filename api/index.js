const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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

// Cascade fallback matrix with exact verified live models from Google Generative Language API
function getModelCandidates(requestedModel) {
    const m = (requestedModel || '').toLowerCase();
    switch (m) {
        case 'flash':
        case 'flash3':
            return ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
        case 'thinking':
            return ['gemini-2.0-flash-thinking-exp-01-21', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
        case 'antigravity':
        case 'agent':
            return ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
        case 'gemma26':
        case 'gemma-26b':
        case 'gemma4':
        case 'gemma-31b':
            return ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
        case 'zendeepseek':
        case 'zennemotron':
        case 'zenlaguna':
        case 'zenmimo':
        case 'zenling':
        case 'zennorth':
            return ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
        default:
            return ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    }
}

function getSystemInstruction(requestedModel, modelName, isThinking = false, hasInternet = false) {
    let basePersona = `Eres un asistente experto de ingeniería de software, algoritmia y análisis técnico.`;

    const m = (requestedModel || '').toLowerCase();
    if (m === 'antigravity' || m === 'agent') {
        basePersona = `Eres el Agente Antigravity (Google DeepMind). Actúa como ingeniero senior de software y sistemas, priorizando soluciones elegantes, verificables, basadas en evidencia y libres de suposiciones no verificadas.`;
    } else if (m === 'gemma26' || m.includes('26b')) {
        basePersona = `Eres Gemma 4 26B (Google DeepMind). Eres conciso, directo y especializado en programación, análisis de sintaxis y arquitectura técnica.`;
    } else if (m === 'gemma4' || m.includes('31b')) {
        basePersona = `Eres Gemma 4 31B (Google DeepMind). Modelo abierto de alta capacidad deductiva, análisis formal y síntesis de patrones avanzados.`;
    } else if (m === 'zendeepseek' || m.includes('deepseek')) {
        basePersona = `Eres DeepSeek V4 Flash (OpenCode Zen Free Tier) en Basilisco. Especializado en algoritmia de alto rendimiento, análisis formal de código, optimización extrema y arquitectura limpia.`;
    } else if (m === 'zennemotron' || m.includes('nemotron')) {
        basePersona = `Eres Nemotron 3 Ultra (OpenCode Zen Free Tier) en Basilisco. Especializado en razonamiento formal, alineación de modelos, verificación de contratos y explicaciones técnicas de alto nivel.`;
    } else if (m === 'zenlaguna' || m.includes('laguna')) {
        basePersona = `Eres Laguna S 2.1 (OpenCode Zen Free Tier) en Basilisco. Especializado en ingeniería de sistemas distribuidos, concurrencia, resiliencia y síntesis de patrones modernos.`;
    } else if (m === 'zenmimo' || m.includes('mimo')) {
        basePersona = `Eres MiMo V2.5 (OpenCode Zen Free Tier) en Basilisco. Especializado en razonamiento analítico, resolución de problemas complejos e ingeniería de software.`;
    } else if (m === 'zenling' || m.includes('ling')) {
        basePersona = `Eres Ling 3.0 Flash (OpenCode Zen Free Tier) en Basilisco. Especializado en lógica formal, análisis cuantitativo, procesamiento rápido de consultas y estructuras de datos.`;
    } else if (m === 'zennorth' || m.includes('north') || m.includes('pickle') || m.includes('union')) {
        basePersona = `Eres North Mini Code (OpenCode Zen Free Tier) en Basilisco. Especializado en scripting ágil, refactorizaciones concisas, utilidades CLI y código minimalista.`;
    } else if (m === 'thinking') {
        basePersona = `Eres un modelo avanzado de pensamiento y razonamiento analítico profundo paso a paso.`;
    }

    if (hasInternet) {
        basePersona += `\n\nACCESO A INTERNET ACTIVO EN TIEMPO REAL: Cuentas con la herramienta Google Search conectada. Siempre que el usuario pregunte por eventos recientes, noticias de hoy, precios, clima, personas, librerías, documentación o datos fácticos, consulta la web y responde con información actualizada en tiempo real citando las fuentes consultadas.`;
    }

    if (isThinking || m === 'thinking') {
        return `${basePersona}

REGLA ESTRICTA Y OBLIGATORIA: Debes pensar y razonar minuciosamente paso a paso ANTES de responder.
Para pensar, DEBES usar este formato exacto:
<think>
(Escribe aquí tu monólogo interno, deducción analítica y validación de hipótesis)
</think>
(Escribe aquí tu respuesta final al usuario)

IMPORTANTE:
1. NO escribas NADA antes de <think>.
2. Todo tu proceso de pensamiento debe estar estrictamente dentro de <think>...</think>.
3. Tras cerrar </think>, escribe tu respuesta final de forma clara y directa.`;
    }

    return basePersona;
}

app.get('/', (req, res) => {
    const host = req.headers.host || '';
    if (/^(chat|telechat|telegram)\./i.test(host)) {
        return res.sendFile(path.join(__dirname, '../public/telechat/index.html'));
    }
    res.redirect('/index.html');
});

app.get(['/telechat', '/telechat/*', '/telegram', '/telegram/*'], (req, res) => {
    const subPath = req.params[0] || '';
    if (subPath && (subPath.endsWith('.css') || subPath.endsWith('.js') || subPath.endsWith('.json') || subPath.endsWith('.svg') || subPath.endsWith('.png'))) {
        return res.sendFile(path.join(__dirname, '../public/telechat', subPath));
    }
    res.sendFile(path.join(__dirname, '../public/telechat/index.html'));
});

app.get('/api/models', async (req, res) => {
    try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await resp.json();
        const supported = (data.models || [])
            .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
            .map(m => ({ name: m.name.replace('models/', ''), displayName: m.displayName }));
        res.json({ count: supported.length, models: supported });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { message, interaction_id, model, use_search, use_thinking, truncate_history_at_index, media_parts } = req.body;
        const shouldThink = Boolean(use_thinking === true || use_thinking === 'true' || model === 'thinking');
        const hasInternet = use_search !== false && use_search !== 'false';
        
        let currentSessionId = interaction_id;
        let sanitizedHistory = [];

        if (currentSessionId && sessionsHistory[currentSessionId]) {
            let historyRaw = JSON.parse(JSON.stringify(sessionsHistory[currentSessionId])); // Deep clone
            
            // Handle Edit / Retry by truncating history array
            if (truncate_history_at_index !== undefined && truncate_history_at_index !== null) {
                historyRaw = historyRaw.slice(0, truncate_history_at_index);
            }

            // Strict sanitization: Gemini SDK fails silently or throws if invalid properties exist
            sanitizedHistory = historyRaw.map(msg => ({
                role: msg.role === 'model' ? 'model' : 'user',
                parts: msg.parts.map(part => {
                    if (part.text) return { text: part.text };
                    if (part.inlineData) return { inlineData: { mimeType: part.inlineData.mimeType, data: part.inlineData.data } };
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
                const finalInstruction = getSystemInstruction(model, candidate, shouldThink, hasInternet);
                const modelConfig = {
                    model: candidate,
                    systemInstruction: finalInstruction,
                };

                if (hasInternet) {
                    modelConfig.tools = [{ googleSearch: {} }];
                }

                if (shouldThink && (candidate.includes('thinking') || candidate.includes('2.5'))) {
                    modelConfig.generationConfig = {
                        thinkingConfig: {
                            includeThoughts: true,
                            thinkingBudget: 2048
                        }
                    };
                }

                let generativeModel;
                try {
                    generativeModel = genAI.getGenerativeModel(modelConfig);
                } catch (cfgErr) {
                    delete modelConfig.generationConfig;
                    generativeModel = genAI.getGenerativeModel(modelConfig);
                }

                let chatSession = generativeModel.startChat({ history: sanitizedHistory });

                console.log(`[ATTEMPT] Model: ${candidate} (requested: ${model}, thinking: ${shouldThink}, internet: ${hasInternet})`);
                
                // Timeout per candidate to guarantee snappy response
                const timeoutLimit = 12000;
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`Timeout de ${timeoutLimit}ms superado en ${candidate}`)), timeoutLimit)
                );

                const sendPromise = (async () => {
                    try {
                        const result = await chatSession.sendMessage(parts);
                        return await result.response;
                    } catch (sendErr) {
                        console.warn(`[RETRY CONFIG] ${candidate}: ${sendErr.message}`);
                        // First retry: drop thinkingConfig if present, keeping internet search tools!
                        if (modelConfig.generationConfig) {
                            try {
                                delete modelConfig.generationConfig;
                                const retryModel = genAI.getGenerativeModel(modelConfig);
                                const retrySession = retryModel.startChat({ history: sanitizedHistory });
                                const result = await retrySession.sendMessage(parts);
                                return await result.response;
                            } catch (e1) {
                                console.warn(`[RETRY 1 FAILED] ${candidate}: ${e1.message}`);
                            }
                        }
                        // Second retry: if candidate has no tool support at all, fallback without tools
                        if (modelConfig.tools) {
                            delete modelConfig.tools;
                            const retryModel = genAI.getGenerativeModel(modelConfig);
                            const retrySession = retryModel.startChat({ history: sanitizedHistory });
                            const result = await retrySession.sendMessage(parts);
                            return await result.response;
                        }
                        throw sendErr;
                    }
                })();

                const response = await Promise.race([sendPromise, timeoutPromise]);

                finalModelResponse = response;
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

        // Extract native thoughts and main text
        let nativeThoughts = "";
        let mainText = "";

        try {
            const candidateObj = finalModelResponse.candidates?.[0];
            if (candidateObj?.content?.parts) {
                for (const part of candidateObj.content.parts) {
                    if (part.thought) {
                        nativeThoughts += (part.text || "") + "\n";
                    } else if (part.text) {
                        mainText += part.text || "";
                    }
                }
            }
        } catch (e) {
            console.warn("Error parsing candidate parts for thoughts:", e);
        }

        if (!mainText && !nativeThoughts) {
            try {
                mainText = finalModelResponse.text() || "";
            } catch (e) {}
        }

        let formattedOutput = mainText;

        if (nativeThoughts.trim()) {
            if (!formattedOutput.includes('<think>')) {
                formattedOutput = `<think>\n${nativeThoughts.trim()}\n</think>\n\n${formattedOutput.trim()}`;
            }
        }

        // Extract grounding citations (web sources) from Google Search
        const candidateObj = finalModelResponse.candidates?.[0];
        const groundingMeta = candidateObj?.groundingMetadata;
        if (groundingMeta?.groundingChunks && Array.isArray(groundingMeta.groundingChunks)) {
            const webSources = [];
            const seenUris = new Set();
            groundingMeta.groundingChunks.forEach(chunk => {
                if (chunk.web?.uri && !seenUris.has(chunk.web.uri)) {
                    seenUris.add(chunk.web.uri);
                    webSources.push({
                        title: chunk.web.title || chunk.web.uri,
                        uri: chunk.web.uri
                    });
                }
            });

            if (webSources.length > 0) {
                const sourcesMd = webSources
                    .slice(0, 6)
                    .map(s => `- [${s.title}](${s.uri})`)
                    .join("\n");
                formattedOutput += `\n\n---\n**Fuentes web consultadas:**\n${sourcesMd}`;
            }
        }

        // Save clean response in conversation history
        sanitizedHistory.push({ role: 'model', parts: [{ text: formattedOutput }] });

        const newHistory = sanitizedHistory;
        const newMessageIndex = newHistory.length >= 2 ? newHistory.length - 2 : 0;
        
        // Persist history to memory/disk
        sessionsHistory[currentSessionId] = JSON.parse(JSON.stringify(newHistory));
        saveSessions();

        // Calculate quota specs based on active model and requested Zen Free tier
        let maxRpm = 15;
        let maxTpm = '1M';
        let maxRpd = 1500;
        let reportedModel = successfulModel;

        if (model && (model.startsWith('zen') || model.includes('free') || model.includes('pickle') || model.includes('union'))) {
            // OpenCode Zen 100% Free Tier specs
            maxRpm = 30;
            maxTpm = '100K';
            maxRpd = 100;
            reportedModel = `${model} (OpenCode Zen Free)`;
        } else if (successfulModel && successfulModel === 'gemini-3-flash-preview') {
            maxRpm = 5;
            maxTpm = '250K';
            maxRpd = 20;
        } else if (successfulModel && successfulModel.includes('gemma')) {
            maxRpm = 30;
            maxTpm = '16K';
            maxRpd = 14400;
        }

        res.json({
            text: formattedOutput,
            interaction_id: currentSessionId,
            message_index: newMessageIndex,
            active_model: reportedModel,
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

// ============================================================================
// --- TeleChat In-Memory & File-Backed Storage (Unified Telegram Clone) ---
// ============================================================================
const TELECHAT_FILE = path.join(__dirname, '../chat_memory.json');
let telechatRooms = {};
let telechatSaveTimeout = null;

function loadTelechatData() {
    try {
        if (fs.existsSync(TELECHAT_FILE)) {
            const raw = fs.readFileSync(TELECHAT_FILE, 'utf8');
            telechatRooms = JSON.parse(raw);
        }
    } catch (e) {
        console.error('Error reading chat_memory.json:', e.message);
        telechatRooms = {};
    }
}

function scheduleTelechatSave() {
    // In serverless environments like Vercel, the filesystem is read-only
    if (process.env.VERCEL) return;
    if (telechatSaveTimeout) clearTimeout(telechatSaveTimeout);
    telechatSaveTimeout = setTimeout(() => {
        fs.writeFile(TELECHAT_FILE, JSON.stringify(telechatRooms, null, 2), 'utf8', (err) => {
            if (err) console.error('Error saving chat_memory.json:', err.message);
        });
        telechatSaveTimeout = null;
    }, 400);
}

loadTelechatData();

// Active TeleChat SSE Connections: roomCode -> Set of response objects
const telechatSseClients = new Map();

function broadcastToTelechatRoom(roomCode, eventType, data) {
    const clients = telechatSseClients.get(roomCode);
    if (clients && clients.size > 0) {
        const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
        clients.forEach(clientRes => {
            try {
                clientRes.write(payload);
            } catch (e) {
                clients.delete(clientRes);
            }
        });
    }
}

// Keep-alive heartbeat every 25 seconds for SSE
const telechatKeepalive = setInterval(() => {
    telechatSseClients.forEach((clients, room) => {
        clients.forEach(clientRes => {
            try {
                clientRes.write(': keepalive\n\n');
            } catch (e) {
                clients.delete(clientRes);
            }
        });
        if (clients.size === 0) telechatSseClients.delete(room);
    });
}, 25000);
if (telechatKeepalive.unref) telechatKeepalive.unref();

// 1. SSE Real-time stream: GET /api/stream?room=XYZ
app.get('/api/stream', (req, res) => {
    const room = (req.query.room || 'TELE-CHAT').toUpperCase();
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    res.write(`event: connected\ndata: {"status":"connected","room":"${room}"}\n\n`);

    if (!telechatSseClients.has(room)) {
        telechatSseClients.set(room, new Set());
    }
    const set = telechatSseClients.get(room);
    set.add(res);

    req.on('close', () => {
        set.delete(res);
        if (set.size === 0) telechatSseClients.delete(room);
    });
});

// 2. Get Messages: GET /api/messages?room=XYZ (with gzip support)
app.get('/api/messages', (req, res) => {
    const room = (req.query.room || 'TELE-CHAT').toUpperCase();
    const messages = telechatRooms[room] || [];
    const jsonStr = JSON.stringify(messages);
    const acceptEncoding = req.headers['accept-encoding'] || '';

    if (acceptEncoding.includes('gzip') && jsonStr.length > 512) {
        zlib.gzip(Buffer.from(jsonStr), (err, zipped) => {
            if (err) {
                res.setHeader('Content-Type', 'application/json');
                return res.send(jsonStr);
            }
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Encoding': 'gzip',
                'Cache-Control': 'no-cache'
            });
            res.end(zipped);
        });
    } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(jsonStr);
    }
});

// 3. Post Message: POST /api/messages
app.post('/api/messages', (req, res) => {
    try {
        const payload = req.body;
        const room = (payload.room || 'TELE-CHAT').toUpperCase();
        const msg = payload.message;

        if (!telechatRooms[room]) telechatRooms[room] = [];

        if (msg && !telechatRooms[room].some(m => m.id === msg.id)) {
            telechatRooms[room].push(msg);
            scheduleTelechatSave();
            broadcastToTelechatRoom(room, 'message', msg);
        }

        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ error: 'Invalid payload' });
    }
});

// 4. Post Reaction: POST /api/reaction
app.post('/api/reaction', (req, res) => {
    try {
        const payload = req.body;
        const room = (payload.room || 'TELE-CHAT').toUpperCase();
        const { messageId, emoji } = payload;

        if (telechatRooms[room]) {
            const target = telechatRooms[room].find(m => m.id === messageId);
            if (target) {
                target.reactions = target.reactions || {};
                target.reactions[emoji] = (target.reactions[emoji] || 0) + 1;
                scheduleTelechatSave();
                broadcastToTelechatRoom(room, 'reaction', { messageId, emoji });
            }
        }

        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ error: 'Invalid payload' });
    }
});

// 5. Post Read Receipt: POST /api/receipt
app.post('/api/receipt', (req, res) => {
    try {
        const payload = req.body;
        const room = (payload.room || 'TELE-CHAT').toUpperCase();
        const { messageId } = payload;

        if (telechatRooms[room]) {
            const target = telechatRooms[room].find(m => m.id === messageId);
            if (target && target.status !== 'read') {
                target.status = 'read';
                scheduleTelechatSave();
                broadcastToTelechatRoom(room, 'receipt', { messageId });
            }
        }

        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ error: 'Invalid payload' });
    }
});

// 6. Clear Room: POST /api/clear
app.post('/api/clear', (req, res) => {
    try {
        const payload = req.body;
        const room = (payload.room || 'TELE-CHAT').toUpperCase();
        telechatRooms[room] = [];
        scheduleTelechatSave();
        broadcastToTelechatRoom(room, 'clear', { room });
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ error: 'Invalid payload' });
    }
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Basilisco server running on http://localhost:${port}`);
    });
}

module.exports = app;
