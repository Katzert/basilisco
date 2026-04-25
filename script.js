const chatBox = document.getElementById('chatBox');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const modelSelect = document.getElementById('modelSelect');
const useSearch = document.getElementById('useSearch');
const fileInput = document.getElementById('fileInput');
const attachmentsPreview = document.getElementById('attachmentsPreview');

let interactionId = null;
let currentController = null;
let editingIndex = null;
let selectedFiles = [];

// Setup Marked.js globally to avoid performance issues
if (typeof marked !== 'undefined') {
    marked.use({ breaks: true });
    if (typeof window.markedKatex !== 'undefined') {
        marked.use(window.markedKatex({ throwOnError: false }));
    }
}

function parseMarkdown(text) {
    if (!text) return "";
    try {
        let rawText = text;
        let tokens = [];
        const combinedRegex = /(?:<think>|&lt;think\s*&gt;|\[\[\[\s*PENSAMIENTO\s*\]\]\])|(?:<\/think>|&lt;\/think\s*&gt;|\[\[\[\s*FIN_PENSAMIENTO\s*\]\]\])/gi;
        
        let match;
        while ((match = combinedRegex.exec(rawText)) !== null) {
            const isStart = match[0].toUpperCase().includes('PENSAMIENTO') && !match[0].toUpperCase().includes('FIN');
            const isThinkStart = match[0].toLowerCase().includes('<think') || match[0].toLowerCase().includes('&lt;think');
            const isOpening = isStart || isThinkStart;

            tokens.push({
                index: match.index,
                length: match[0].length,
                isOpening: isOpening
            });
        }

        // Auto-correct mechanism: If the model leaked text before the first <think> tag, ignore it.
        const firstOpeningToken = tokens.find(t => t.isOpening);
        const hideTextBefore = firstOpeningToken ? firstOpeningToken.index : -1;

        let resultHtml = "";
        let lastIndex = 0;
        let inThought = false;
        
        const safeParse = (content) => {
            if (!content.trim()) return content;
            if (typeof marked !== 'undefined') {
                return marked.parse(content);
            }
            // Fallback basic parse if marked failed to load
            return content.replace(/\n/g, '<br>');
        };

        const purify = (html) => {
            if (typeof DOMPurify !== 'undefined') {
                return DOMPurify.sanitize(html, {
                    ADD_TAGS: ['math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'ms', 'mspace', 'munderover', 'mfrac', 'msqrt', 'mroot', 'mstyle', 'merror', 'mpadded', 'mphantom', 'mfenced', 'menclose', 'msub', 'msup', 'msubsup', 'mtable', 'mtr', 'mtd', 'maligngroup', 'malignmark', 'mlabeledtr', 'mstack', 'mlongdiv', 'msgroup', 'msrow', 'mscarries', 'mscarry', 'maction', 'annotation', 'annotation-xml'],
                    ADD_ATTR: ['display', 'xmlns', 'href', 'mathvariant', 'mathcolor', 'mathbackground', 'mathsize', 'dir', 'fontfamily', 'fontweight', 'fontstyle', 'fontsize', 'color', 'background', 'class']
                });
            }
            return html;
        };

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const content = rawText.substring(lastIndex, token.index);
            
            // Only add content if we are not inside a thought block AND it's not the leaked text before the first <think> tag
            if (content && !inThought && lastIndex >= hideTextBefore) {
                resultHtml += purify(safeParse(content));
            }
            
            if (token.isOpening && !inThought) {
                inThought = true;
            } else if (!token.isOpening && inThought) {
                inThought = false;
            }
            
            lastIndex = token.index + token.length;
        }
        
        const remainingContent = rawText.substring(lastIndex);
        if (remainingContent && !inThought) {
            resultHtml += purify(safeParse(remainingContent));
        }
        
        if (inThought) {
            resultHtml += '<div style="color: #888; font-style: italic;">🧠 Pensando...</div>';
        }

        // Add copy buttons for code blocks
        resultHtml = resultHtml.replace(/<pre><code(.*?)>([\s\S]*?)<\/code><\/pre>/gi, (match, attrs, codeContent) => {
            const id = 'code-' + Math.random().toString(36).substr(2, 9);
            return `<div style="position: relative;"><button class="copy-btn" onclick="copyCode('${id}')">Copiar</button><pre><code id="${id}"${attrs}>${codeContent}</code></pre></div>`;
        });

        return resultHtml;
    } catch(e) {
        console.error("Markdown parse error:", e);
        // Absolute fallback to ensure text ALWAYS shows up even if everything crashes
        return `<div style="color:red; font-size:10px;">Error parsing UI</div><pre style="white-space: pre-wrap; font-family: sans-serif;">${text}</pre>`;
    }
}

window.copyCode = function(id) {
    const codeElement = document.getElementById(id);
    if (codeElement) {
        navigator.clipboard.writeText(codeElement.innerText).then(() => {
            const btn = codeElement.parentElement.querySelector('.copy-btn');
            if(btn) {
                const originalText = btn.innerText;
                btn.innerText = '¡Copiado!';
                setTimeout(() => { btn.innerText = originalText; }, 2000);
            }
        });
    }
}

fileInput.addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(file => {
        selectedFiles.push(file);
    });
    renderAttachments();
});

function renderAttachments() {
    attachmentsPreview.innerHTML = '';
    selectedFiles.forEach((file, index) => {
        const thumb = document.createElement('div');
        thumb.className = 'attachment-thumb';
        
        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            thumb.appendChild(img);
        } else {
            thumb.textContent = file.name.substring(0, 5) + '...';
        }
        
        const remove = document.createElement('div');
        remove.className = 'remove-thumb';
        remove.textContent = 'X';
        remove.onclick = () => {
            selectedFiles.splice(index, 1);
            renderAttachments();
        };
        thumb.appendChild(remove);
        attachmentsPreview.appendChild(thumb);
    });
}

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

function appendMessage(sender, text, rawText = null) {
    const div = document.createElement('div');
    div.className = `message ${sender}`;
    if (sender === 'ai') {
        div.innerHTML = parseMarkdown(text);
    } else {
        div.textContent = text;
        if (rawText) div.dataset.raw = rawText;
    }
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return div;
}

function addUserActions(messageDiv, index, rawText) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn';
    editBtn.textContent = '✏️ Editar';
    editBtn.onclick = () => {
        messageInput.value = rawText;
        editingIndex = index;
        messageInput.focus();
    };

    const retryBtn = document.createElement('button');
    retryBtn.className = 'action-btn';
    retryBtn.textContent = '🔄 Reintentar';
    retryBtn.onclick = () => {
        messageInput.value = rawText;
        editingIndex = index;
        sendMessage();
    };

    actions.appendChild(editBtn);
    actions.appendChild(retryBtn);
    messageDiv.appendChild(actions);
}

function removeMessagesFromDOM(index) {
    const messages = Array.from(chatBox.querySelectorAll('.message'));
    messages.forEach(msg => {
        const msgIndex = parseInt(msg.getAttribute('data-index'), 10);
        if (!isNaN(msgIndex) && msgIndex >= index) {
            msg.remove();
        }
    });
}

stopBtn.addEventListener('click', () => {
    if (currentController) {
        currentController.abort();
    }
});

async function sendMessage() {
    const messageText = messageInput.value.trim();
    if (!messageText && selectedFiles.length === 0) return;

    if (editingIndex !== null) {
        removeMessagesFromDOM(editingIndex);
    }

    const payloadText = messageText;
    messageInput.value = '';
    
    let displayMsg = payloadText;
    if (selectedFiles.length > 0) {
        displayMsg += displayMsg ? `\n[+${selectedFiles.length} adjuntos]` : `[${selectedFiles.length} adjuntos]`;
    }

    const userMsgDiv = appendMessage('user', displayMsg, payloadText);
    userMsgDiv.setAttribute('data-index', editingIndex !== null ? editingIndex : -1); 
    
    sendBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    messageInput.disabled = true;
    fileInput.disabled = true;

    let mediaParts = null;
    if (selectedFiles.length > 0) {
        mediaParts = await Promise.all(selectedFiles.map(async file => {
            const base64Data = await fileToBase64(file);
            return {
                 inlineData: {
                     data: base64Data.split(',')[1],
                     mimeType: file.type
                 }
            };
        }));
    }
    
    const currentEditIndex = editingIndex;
    editingIndex = null;
    selectedFiles = [];
    renderAttachments();
    fileInput.value = '';

    currentController = new AbortController();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: currentController.signal,
            body: JSON.stringify({
                message: payloadText,
                interaction_id: interactionId,
                model: modelSelect.value,
                use_search: useSearch.checked,
                truncate_history_at_index: currentEditIndex,
                media_parts: mediaParts
            })
        });

        const data = await response.json();

        if (!response.ok) {
            appendMessage('system', `Error: ${data.error || response.statusText}`);
            return;
        }

        const aiMsgDiv = appendMessage('ai', data.text);
        
        interactionId = data.interaction_id;
        userMsgDiv.setAttribute('data-index', data.message_index);
        addUserActions(userMsgDiv, data.message_index, payloadText);
        aiMsgDiv.setAttribute('data-index', data.message_index + 1);

        if (data.usage) {
            document.getElementById('quotaMeter').classList.remove('hidden');
            document.getElementById('valRPM').textContent = `${data.usage.rpm} / ${data.usage.maxRpm}`;
            const tpmStr = typeof data.usage.tpm === 'number' && data.usage.tpm > 1000 ? (data.usage.tpm / 1000).toFixed(1) + 'K' : data.usage.tpm;
            document.getElementById('valTPM').textContent = `${tpmStr} / ${data.usage.maxTpm}`;
            document.getElementById('valRPD').textContent = `${data.usage.rpd} / ${data.usage.maxRpd}`;
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            appendMessage('system', 'Generación detenida por el usuario.');
        } else {
            appendMessage('system', `Error de red: ${err.message}`);
        }
    } finally {
        currentController = null;
        sendBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        messageInput.disabled = false;
        fileInput.disabled = false;
        messageInput.focus();
    }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});
