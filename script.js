/* Basilisco — frontend v3.2 (69 Skills Ecosistema Antigravity + Suite QoL Refinada)
   Streaming SSE con fetch nativo, motor de skills obligatorias, comandos slash (/),
   persistencia local, exportación, drag & drop, pegado de imágenes, KaTeX bajo demanda,
   auto-scroll inteligente, buscador en chat y bloques de código interactivos. */
"use strict";

const $ = id => document.getElementById(id);

// Elementos principales
const chatBox = $("chatBox"), messageInput = $("messageInput");
const sendBtn = $("sendBtn"), stopBtn = $("stopBtn");
const modelSelect = $("modelSelect"), useSearch = $("useSearch"), useThinking = $("useThinking");
const fileInput = $("fileInput"), attachmentsPreview = $("attachmentsPreview");
const convList = $("convList"), sidebar = $("sidebar");
const pinModal = $("pinModal"), pinInput = $("pinInput"), pinError = $("pinError");
const toastEl = $("toast");

// Elementos Skills y QoL
const skillsBtn = $("skillsBtn"), skillsModal = $("skillsModal");
const closeSkillsModalBtn = $("closeSkillsModalBtn"), skillSearchInput = $("skillSearchInput");
const clearSkillSearchBtn = $("clearSkillSearchBtn"), skillsCategoryTabs = $("skillsCategoryTabs");
const skillsGrid = $("skillsGrid"), skillsCountDisplay = $("skillsCountDisplay");
const resetToRouterBtn = $("resetToRouterBtn"), modalStrictCheckbox = $("modalStrictCheckbox");
const strictSkillCheckbox = $("strictSkillCheckbox"), changeSkillBtn = $("changeSkillBtn");
const clearSkillBtn = $("clearSkillBtn"), topSkillEmoji = $("topSkillEmoji");
const topSkillName = $("topSkillName"), subbarSkillEmoji = $("subbarSkillEmoji");
const subbarSkillName = $("subbarSkillName");
const slashMenu = $("slashMenu"), slashMenuItems = $("slashMenuItems");
const convSearchInput = $("convSearchInput"), clearConvSearchBtn = $("clearConvSearchBtn");
const exportMenuBtn = $("exportMenuBtn"), exportDropdown = $("exportDropdown");
const exportMdBtn = $("exportMdBtn"), exportJsonBtn = $("exportJsonBtn");
const shortcutsBtn = $("shortcutsBtn"), shortcutsModal = $("shortcutsModal");
const closeShortcutsModalBtn = $("closeShortcutsModalBtn");
const toggleAllThoughtsBtn = $("toggleAllThoughtsBtn"), micBtn = $("micBtn");
const charCounter = $("charCounter"), mainDropZone = $("mainDropZone");
const dragDropOverlay = $("dragDropOverlay");

// Elementos QoL interactivos v3.2
const scrollToBottomBtn = $("scrollToBottomBtn");
const scrollUnreadDot = $("scrollUnreadDot");
const toggleChatSearchBtn = $("toggleChatSearchBtn");
const chatSearchBar = $("chatSearchBar");
const chatSearchInput = $("chatSearchInput");
const chatSearchCount = $("chatSearchCount");
const chatSearchPrevBtn = $("chatSearchPrevBtn");
const chatSearchNextBtn = $("chatSearchNextBtn");
const closeChatSearchBtn = $("closeChatSearchBtn");

// Modales accesibles (Reemplazo de alert/prompt/confirm nativos)
const confirmModal = $("confirmModal");
const confirmModalTitle = $("confirmModalTitle");
const confirmModalDesc = $("confirmModalDesc") || $("confirmModalText");
const confirmModalOk = $("confirmModalOk") || $("acceptConfirmBtn");
const confirmModalCancel = $("confirmModalCancel") || $("cancelConfirmBtn");
const closeConfirmModalBtn = $("closeConfirmModalBtn");

const renameModal = $("renameModal");
const renameModalInput = $("renameModalInput") || $("renameInput");
const renameModalForm = $("renameModalForm") || $("renameForm");
const renameModalCancel = $("renameModalCancel") || $("cancelRenameBtn");
const closeRenameModalBtn = $("closeRenameModalBtn");

// Selector de modelos personalizado premium
const customModelSelectWrapper = $("customModelSelectWrapper");
const customModelTrigger = $("customModelTrigger");
const customModelDropdown = $("customModelDropdown");
const currentModelLabel = $("currentModelLabel");
const currentModelSub = $("currentModelSub");

const STORAGE_KEY = "basilisco.conversations.v2";
const THEME_KEY = "basilisco.theme";
const PIN_KEY = "basilisco.pin";
const MAX_CONVS = 50;
const MAX_MSGS_PER_CONV = 100;

let conversations = loadConversations();
let activeConvId = conversations[0]?.id || null;
let currentController = null;
let editingIndex = null;
let selectedFiles = [];
let katexReady = false;
let katexPromise = null;
let currentSkillCategory = "Todos";
let slashSelectedIndex = 0;
let slashFilteredItems = [];
let speechRecognizer = null;
let isRecordingVoice = false;

// Estado de Auto-scroll inteligente y Búsqueda en Chat
let userScrolledUp = false;
let chatSearchResults = [];
let currentSearchIndex = -1;

/* Límites de uso por modelo */
const MODEL_LIMITS = {
    flash3:                       { maxRpm: 15, maxTpm: "1M",   maxRpd: 1500 },
    thinking:                     { maxRpm: 15, maxTpm: "1M",   maxRpd: 1500 },
    antigravity:                  { maxRpm: 15, maxTpm: "1M",   maxRpd: 1500 },
    gemma26:                      { maxRpm: 30, maxTpm: "16K",  maxRpd: 14400 },
    gemma4:                       { maxRpm: 30, maxTpm: "16K",  maxRpd: 14400 },
    zenDeepseek:                  { maxRpm: 30, maxTpm: "100K", maxRpd: 100 },
    zenNemotron:                  { maxRpm: 30, maxTpm: "100K", maxRpd: 100 },
    zenLaguna:                    { maxRpm: 30, maxTpm: "100K", maxRpd: 100 },
    zenMimo:                      { maxRpm: 30, maxTpm: "100K", maxRpd: 100 },
    zenLing:                      { maxRpm: 30, maxTpm: "100K", maxRpd: 100 },
    zenNorth:                     { maxRpm: 30, maxTpm: "100K", maxRpd: 100 },
    // Compatibilidad retroactiva
    "deepseek-v4-flash-free":     { maxRpm: 30, maxTpm: "100K", maxRpd: 100 },
    "nemotron-3-ultra-free":      { maxRpm: 30, maxTpm: "100K", maxRpd: 100 },
    "nemotron-3.5-lightning-free":{ maxRpm: 30, maxTpm: "100K", maxRpd: 100 },
    "mimo-v2.5-free":             { maxRpm: 30, maxTpm: "100K", maxRpd: 100 },
    "ling-3.0-flash-fin-free":    { maxRpm: 30, maxTpm: "100K", maxRpd: 100 },
    "big-pickle":                 { maxRpm: 30, maxTpm: "100K", maxRpd: 100 },
    "union-alpha":                { maxRpm: 30, maxTpm: "100K", maxRpd: 100 },
};

/* ── Persistencia ─────────────────────────────────────── */
function loadConversations() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
}
function saveConversations() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, MAX_CONVS))); }
    catch (e) { console.warn("Error al guardar en localStorage:", e); }
}
function activeConv() { return conversations.find(c => c.id === activeConvId) || null; }

/* ── Inicialización ───────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initSkillsUI();
    renderConvList();
    loadActiveConv();
    initQoL();
    initCustomModelSelect();
    initChipControls();
});

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light") setTheme("light");
}
function setTheme(t) {
    document.documentElement.dataset.theme = t;
    localStorage.setItem(THEME_KEY, t);
    const sunIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    const moonIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    $("themeBtn").innerHTML = t === "dark" ? sunIcon : moonIcon;
}
$("themeBtn").addEventListener("click", () =>
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

/* ── Sistema de Skills (Obligatorio) ──────────────────── */
function initSkillsUI() {
    if (!window.skillManager) return;
    
    syncActiveSkillDisplay();

    // Renderizar pestañas de categorías en modal
    skillsCategoryTabs.innerHTML = "";
    SKILL_CATEGORIES.forEach(cat => {
        const tab = document.createElement("button");
        tab.className = "category-tab" + (cat === currentSkillCategory ? " active" : "");
        tab.textContent = cat;
        tab.onclick = () => {
            currentSkillCategory = cat;
            document.querySelectorAll(".category-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            renderSkillsGrid();
        };
        skillsCategoryTabs.appendChild(tab);
    });

    renderSkillsGrid();

    // Eventos de botones
    skillsBtn.addEventListener("click", openSkillsModal);
    changeSkillBtn.addEventListener("click", openSkillsModal);
    closeSkillsModalBtn.addEventListener("click", () => skillsModal.close());
    
    skillSearchInput.addEventListener("input", (e) => {
        const val = e.target.value.trim();
        clearSkillSearchBtn.classList.toggle("hidden", !val);
        renderSkillsGrid();
    });

    clearSkillSearchBtn.addEventListener("click", () => {
        skillSearchInput.value = "";
        clearSkillSearchBtn.classList.add("hidden");
        renderSkillsGrid();
        skillSearchInput.focus();
    });

    resetToRouterBtn.addEventListener("click", () => {
        selectSkill("auto-skill-router");
        skillsModal.close();
    });

    clearSkillBtn.addEventListener("click", () => {
        selectSkill("auto-skill-router");
    });

    // Switches de Modo Obligatorio Estricto
    strictSkillCheckbox.checked = skillManager.strictMode;
    modalStrictCheckbox.checked = skillManager.strictMode;

    strictSkillCheckbox.addEventListener("change", (e) => {
        skillManager.setStrictMode(e.target.checked);
        modalStrictCheckbox.checked = e.target.checked;
        showToast(e.target.checked ? "Modo Obligatorio Estricto activado" : "Modo Obligatorio desactivado");
    });

    modalStrictCheckbox.addEventListener("change", (e) => {
        skillManager.setStrictMode(e.target.checked);
        strictSkillCheckbox.checked = e.target.checked;
        showToast(e.target.checked ? "Modo Obligatorio Estricto activado" : "Modo Obligatorio desactivado");
    });
}

function openSkillsModal() {
    renderSkillsGrid();
    skillsModal.showModal();
    skillSearchInput.focus();
}

function renderSkillsGrid() {
    if (!window.skillManager) return;
    const query = skillSearchInput.value;
    const skills = skillManager.filter(query, currentSkillCategory);
    
    skillsCountDisplay.textContent = `Mostrando ${skills.length} de ${skillManager.getAll().length} skills`;
    skillsGrid.innerHTML = "";

    if (skills.length === 0) {
        skillsGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-dim);">No se encontraron skills que coincidan con la búsqueda.</div>`;
        return;
    }

    const activeId = skillManager.activeSkillId;

    skills.forEach(skill => {
        const card = document.createElement("div");
        const isActive = skill.id === activeId;
        card.className = "skill-card" + (isActive ? " active" : "");

        card.innerHTML = `
            <div class="skill-card-top">
                <span class="skill-card-emoji">${skill.emoji}</span>
                <span class="skill-card-name" title="${escapeHtml(skill.name)}">${escapeHtml(skill.name)}</span>
                <span class="skill-card-cat">${escapeHtml(skill.category)}</span>
            </div>
            <span class="skill-card-cmd">${escapeHtml(skill.slashCommand)}</span>
            <div class="skill-card-desc" title="${escapeHtml(skill.description)}">${escapeHtml(skill.description)}</div>
            <div class="skill-card-footer">
                <button class="skill-activate-btn">${isActive ? "✓ Activa" : "Activar"}</button>
            </div>
        `;

        card.onclick = () => {
            selectSkill(skill.id);
            skillsModal.close();
        };

        skillsGrid.appendChild(card);
    });
}

function selectSkill(skillId) {
    if (!window.skillManager) return;
    skillManager.setActiveSkill(skillId);
    syncActiveSkillDisplay();
    renderSkillsGrid();
    const skill = skillManager.getActiveSkill();
    showToast(`Skill activa: ${skill ? skill.name : "Ninguna"}`);
}

function syncActiveSkillDisplay() {
    if (!window.skillManager) return;
    const skill = skillManager.getActiveSkill();
    if (skill) {
        topSkillEmoji.textContent = skill.emoji;
        topSkillName.textContent = skill.name;
        subbarSkillEmoji.textContent = skill.emoji;
        subbarSkillName.textContent = skill.name;
        clearSkillBtn.classList.toggle("hidden", skill.id === "auto-skill-router");
    } else {
        topSkillEmoji.textContent = "⚡";
        topSkillName.textContent = "Sin Skill";
        subbarSkillEmoji.textContent = "⚡";
        subbarSkillName.textContent = "Sin Skill";
        clearSkillBtn.classList.add("hidden");
    }
}

/* ── Menú de Comandos Slash (/) ────────────────────────── */
function initSlashMenu() {
    messageInput.addEventListener("input", handleSlashInput);
    messageInput.addEventListener("keydown", handleSlashKeydown);

    document.addEventListener("click", (e) => {
        if (!slashMenu.contains(e.target) && e.target !== messageInput) {
            closeSlashMenu();
        }
    });
}

function handleSlashInput() {
    const text = messageInput.value;
    updateCounters();

    if (text.startsWith("/")) {
        const query = text.slice(1).toLowerCase().trim();
        const items = [];

        UTILITY_COMMANDS.forEach(u => {
            if (u.command.toLowerCase().includes(query) || u.desc.toLowerCase().includes(query)) {
                items.push({ type: "util", cmd: u.command, name: u.command, desc: u.desc, action: u.action, emoji: "⚙️" });
            }
        });

        if (window.skillManager) {
            skillManager.getAll().forEach(s => {
                if (s.slashCommand.toLowerCase().includes(query) || s.name.toLowerCase().includes(query) || s.id.includes(query)) {
                    items.push({ type: "skill", cmd: s.slashCommand, name: s.name, desc: s.description, skillId: s.id, emoji: s.emoji });
                }
            });
        }

        if (items.length > 0) {
            slashFilteredItems = items.slice(0, 8);
            slashSelectedIndex = 0;
            renderSlashMenu();
            slashMenu.classList.remove("hidden");
            return;
        }
    }
    closeSlashMenu();
}

function handleSlashKeydown(e) {
    if (slashMenu.classList.contains("hidden")) return;

    if (e.key === "ArrowDown") {
        e.preventDefault();
        slashSelectedIndex = (slashSelectedIndex + 1) % slashFilteredItems.length;
        renderSlashMenu();
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        slashSelectedIndex = (slashSelectedIndex - 1 + slashFilteredItems.length) % slashFilteredItems.length;
        renderSlashMenu();
    } else if (e.key === "Enter" || e.key === "Tab") {
        if (slashFilteredItems.length > 0) {
            e.preventDefault();
            executeSlashItem(slashFilteredItems[slashSelectedIndex]);
        }
    } else if (e.key === "Escape") {
        closeSlashMenu();
    }
}

function renderSlashMenu() {
    slashMenuItems.innerHTML = "";
    slashFilteredItems.forEach((item, idx) => {
        const div = document.createElement("div");
        div.className = "slash-item" + (idx === slashSelectedIndex ? " selected" : "");
        div.innerHTML = `
            <span>${item.emoji}</span>
            <span class="slash-cmd-tag">${escapeHtml(item.cmd)}</span>
            <span class="slash-item-name">${escapeHtml(item.name)}</span>
            <span class="slash-item-desc">${escapeHtml(item.desc)}</span>
        `;
        div.onmousedown = (e) => {
            e.preventDefault();
            executeSlashItem(item);
        };
        slashMenuItems.appendChild(div);
    });
}

function executeSlashItem(item) {
    closeSlashMenu();
    messageInput.value = "";
    messageInput.style.height = "auto";
    updateCounters();

    if (item.type === "util") {
        if (item.action === "newChat") newConversation();
        else if (item.action === "clearChat") clearCurrentConversation();
        else if (item.action === "exportMd") exportConversation("md");
        else if (item.action === "exportJson") exportConversation("json");
        else if (item.action === "setRouter") selectSkill("auto-skill-router");
        else if (item.action === "toggleStrict") {
            const next = !skillManager.strictMode;
            strictSkillCheckbox.checked = next;
            modalStrictCheckbox.checked = next;
            skillManager.setStrictMode(next);
            showToast(next ? "Modo Obligatorio activado" : "Modo Obligatorio desactivado");
        }
        else if (item.action === "clearSkill") selectSkill(null);
    } else if (item.type === "skill") {
        selectSkill(item.skillId);
    }
    messageInput.focus();
}

function closeSlashMenu() {
    slashMenu.classList.add("hidden");
    slashFilteredItems = [];
    slashSelectedIndex = 0;
}

/* ── Suite QoL (Quality of Life) ───────────────────────── */
function initQoL() {
    initSlashMenu();
    initClipboardPaste();
    initDragAndDrop();
    initSidebarSearch();
    initExportMenu();
    initSpeechRecognition();
    initShortcutsModal();
    initSmartScroll();
    initChatSearch();

    toggleAllThoughtsBtn.addEventListener("click", toggleAllThoughts);
}

// Auto-scroll inteligente y botón flotante
function initSmartScroll() {
    chatBox.addEventListener("scroll", () => {
        const threshold = 70;
        const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight <= threshold;
        userScrolledUp = !isAtBottom;
        if (isAtBottom) {
            scrollToBottomBtn.classList.add("hidden");
            scrollUnreadDot.classList.add("hidden");
        } else {
            scrollToBottomBtn.classList.remove("hidden");
        }
    });

    scrollToBottomBtn.addEventListener("click", () => {
        userScrolledUp = false;
        scrollToBottom(true);
        scrollToBottomBtn.classList.add("hidden");
        scrollUnreadDot.classList.add("hidden");
    });
}

function scrollToBottom(force = false) {
    if (!userScrolledUp || force) {
        chatBox.scrollTop = chatBox.scrollHeight;
    } else {
        scrollUnreadDot.classList.remove("hidden");
    }
}

// Buscador interno en conversación activa
function initChatSearch() {
    toggleChatSearchBtn.addEventListener("click", () => {
        const isHidden = chatSearchBar.classList.contains("hidden");
        if (isHidden) {
            chatSearchBar.classList.remove("hidden");
            chatSearchInput.focus();
            runChatSearch();
        } else {
            closeChatSearch();
        }
    });

    closeChatSearchBtn.addEventListener("click", closeChatSearch);

    chatSearchInput.addEventListener("input", runChatSearch);
    chatSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) prevSearchResult();
            else nextSearchResult();
        } else if (e.key === "Escape") {
            closeChatSearch();
        }
    });

    chatSearchPrevBtn.addEventListener("click", prevSearchResult);
    chatSearchNextBtn.addEventListener("click", nextSearchResult);
}

function closeChatSearch() {
    chatSearchBar.classList.add("hidden");
    chatSearchInput.value = "";
    clearChatHighlights();
    chatSearchCount.textContent = "0/0";
    chatSearchResults = [];
    currentSearchIndex = -1;
}

function runChatSearch() {
    clearChatHighlights();
    const query = chatSearchInput.value.trim().toLowerCase();
    chatSearchResults = [];
    currentSearchIndex = -1;

    if (!query) {
        chatSearchCount.textContent = "0/0";
        return;
    }

    const messages = chatBox.querySelectorAll(".message:not(.system)");
    messages.forEach(msg => {
        highlightNodeText(msg, query);
    });

    chatSearchResults = Array.from(chatBox.querySelectorAll("mark.chat-highlight"));
    if (chatSearchResults.length > 0) {
        currentSearchIndex = 0;
        updateSearchCurrentHighlight();
    } else {
        chatSearchCount.textContent = "0/0";
    }
}

function highlightNodeText(rootNode, query) {
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
        if (node.parentElement && !["SCRIPT", "STYLE", "BUTTON", "KBD"].includes(node.parentElement.tagName)) {
            textNodes.push(node);
        }
    }

    textNodes.forEach(textNode => {
        const text = textNode.nodeValue;
        const lower = text.toLowerCase();
        const idx = lower.indexOf(query);
        if (idx !== -1) {
            const span = document.createElement("span");
            let last = 0;
            let currentIdx = idx;
            while (currentIdx !== -1) {
                span.appendChild(document.createTextNode(text.slice(last, currentIdx)));
                const mark = document.createElement("mark");
                mark.className = "chat-highlight";
                mark.textContent = text.slice(currentIdx, currentIdx + query.length);
                span.appendChild(mark);
                last = currentIdx + query.length;
                currentIdx = lower.indexOf(query, last);
            }
            span.appendChild(document.createTextNode(text.slice(last)));
            textNode.parentNode.replaceChild(span, textNode);
        }
    });
}

function clearChatHighlights() {
    chatBox.querySelectorAll("mark.chat-highlight").forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        }
    });
}

function nextSearchResult() {
    if (!chatSearchResults.length) return;
    currentSearchIndex = (currentSearchIndex + 1) % chatSearchResults.length;
    updateSearchCurrentHighlight();
}

function prevSearchResult() {
    if (!chatSearchResults.length) return;
    currentSearchIndex = (currentSearchIndex - 1 + chatSearchResults.length) % chatSearchResults.length;
    updateSearchCurrentHighlight();
}

function updateSearchCurrentHighlight() {
    chatSearchResults.forEach((mark, idx) => {
        mark.classList.toggle("current", idx === currentSearchIndex);
    });
    chatSearchCount.textContent = `${currentSearchIndex + 1}/${chatSearchResults.length}`;
    if (chatSearchResults[currentSearchIndex]) {
        chatSearchResults[currentSearchIndex].scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

// Contador de caracteres y palabras
function updateCounters() {
    const text = messageInput.value;
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    charCounter.textContent = `${chars} car. • ${words} pal.`;
}

// Búsqueda en sidebar
function initSidebarSearch() {
    convSearchInput.addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase().trim();
        clearConvSearchBtn.classList.toggle("hidden", !q);
        renderConvList(q);
    });

    clearConvSearchBtn.addEventListener("click", () => {
        convSearchInput.value = "";
        clearConvSearchBtn.classList.add("hidden");
        renderConvList();
        convSearchInput.focus();
    });
}

// Pegado directo de imágenes (Ctrl+V)
function initClipboardPaste() {
    window.addEventListener("paste", (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) {
                    selectedFiles.push(file);
                    renderAttachments();
                    showToast("Imagen pegada del portapapeles.");
                }
            }
        }
    });
}

// Arrastrar y soltar archivos (Drag & Drop)
function initDragAndDrop() {
    let dragCounter = 0;
    ["dragenter", "dragover"].forEach(name => {
        window.addEventListener(name, (e) => {
            e.preventDefault();
            dragCounter++;
            dragDropOverlay.classList.remove("hidden");
        });
    });

    ["dragleave", "drop"].forEach(name => {
        window.addEventListener(name, (e) => {
            e.preventDefault();
            dragCounter--;
            if (dragCounter <= 0) {
                dragCounter = 0;
                dragDropOverlay.classList.add("hidden");
            }
        });
    });

    window.addEventListener("drop", (e) => {
        e.preventDefault();
        dragCounter = 0;
        dragDropOverlay.classList.add("hidden");
        if (e.dataTransfer?.files?.length) {
            Array.from(e.dataTransfer.files).forEach(f => selectedFiles.push(f));
            renderAttachments();
            showToast(`${e.dataTransfer.files.length} archivo(s) añadido(s).`);
        }
    });
}

// Menú de exportación
function initExportMenu() {
    exportMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        exportDropdown.classList.toggle("hidden");
    });

    document.addEventListener("click", () => exportDropdown.classList.add("hidden"));

    exportMdBtn.addEventListener("click", () => { exportConversation("md"); exportDropdown.classList.add("hidden"); });
    exportJsonBtn.addEventListener("click", () => { exportConversation("json"); exportDropdown.classList.add("hidden"); });
}

function exportConversation(format) {
    const conv = activeConv();
    if (!conv || !conv.messages.length) {
        showToast("No hay mensajes para exportar.");
        return;
    }

    const titleSlug = conv.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30) || "chat";
    const dateStr = new Date().toISOString().slice(0, 10);

    if (format === "md") {
        let md = `# ${conv.title}\n\n`;
        md += `*Fecha de exportación: ${new Date().toLocaleString()}*\n\n---\n\n`;
        conv.messages.forEach(m => {
            const roleName = m.role === "user" ? "### Usuario" : "### Basilisco AI";
            const time = m.ts ? ` (${formatTime(m.ts)})` : "";
            md += `${roleName}${time}\n\n${m.text}\n\n---\n\n`;
        });
        downloadFile(`${titleSlug}-${dateStr}.md`, "text/markdown", md);
        showToast("Chat exportado como Markdown.");
    } else {
        const json = JSON.stringify(conv, null, 2);
        downloadFile(`${titleSlug}-${dateStr}.json`, "application/json", json);
        showToast("Chat exportado como JSON.");
    }
}

function downloadFile(filename, type, content) {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Dictado por voz (Speech Recognition)
function initSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
        micBtn.title = "Dictado no soportado por este navegador";
        micBtn.style.opacity = ".4";
        return;
    }

    speechRecognizer = new SpeechRec();
    speechRecognizer.lang = "es-ES";
    speechRecognizer.continuous = false;
    speechRecognizer.interimResults = false;

    speechRecognizer.onstart = () => {
        isRecordingVoice = true;
        micBtn.classList.add("recording");
        showToast("Escuchando dictado...");
    };

    speechRecognizer.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        if (transcript) {
            messageInput.value = (messageInput.value + " " + transcript).trim();
            messageInput.style.height = "auto";
            messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + "px";
            updateCounters();
        }
    };

    speechRecognizer.onerror = (e) => {
        console.warn("Speech recognition error:", e);
        showToast("Error en reconocimiento de voz.");
    };

    speechRecognizer.onend = () => {
        isRecordingVoice = false;
        micBtn.classList.remove("recording");
    };

    micBtn.addEventListener("click", () => {
        if (!speechRecognizer) return;
        if (isRecordingVoice) speechRecognizer.stop();
        else speechRecognizer.start();
    });
}

// Colapsar/Expandir razonamientos
let allThoughtsExpanded = true;
function toggleAllThoughts() {
    const blocks = chatBox.querySelectorAll("details.thought-block");
    if (!blocks.length) {
        showToast("No hay bloques de razonamiento en este chat.");
        return;
    }
    allThoughtsExpanded = !allThoughtsExpanded;
    blocks.forEach(b => b.open = allThoughtsExpanded);
    showToast(allThoughtsExpanded ? "Razonamientos expandidos." : "Razonamientos colapsados.");
}

// Atajos de teclado modal
function initShortcutsModal() {
    shortcutsBtn.addEventListener("click", () => shortcutsModal.showModal());
    closeShortcutsModalBtn.addEventListener("click", () => shortcutsModal.close());

    window.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            convSearchInput.focus();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
            e.preventDefault();
            chatSearchBar.classList.remove("hidden");
            chatSearchInput.focus();
            runChatSearch();
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") {
            e.preventDefault();
            newConversation();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "/") {
            e.preventDefault();
            shortcutsModal.showModal();
        }
        if (e.key === "Escape") {
            if (!shortcutsModal.classList.contains("hidden") && shortcutsModal.open) shortcutsModal.close();
            if (!skillsModal.classList.contains("hidden") && skillsModal.open) skillsModal.close();
            if (!confirmModal.classList.contains("hidden") && confirmModal.open) confirmModal.close();
            if (!renameModal.classList.contains("hidden") && renameModal.open) renameModal.close();
            closeSlashMenu();
            if (!chatSearchBar.classList.contains("hidden")) closeChatSearch();
        }
    });
}

/* ── Modales Accesibles (Confirm & Rename) ─────────────── */
function showConfirmModal(title, desc) {
    return new Promise((resolve) => {
        confirmModalTitle.textContent = title;
        confirmModalDesc.textContent = desc;
        confirmModal.showModal();

        const onOk = () => {
            cleanup();
            confirmModal.close();
            resolve(true);
        };
        const onCancel = () => {
            cleanup();
            confirmModal.close();
            resolve(false);
        };
        const cleanup = () => {
            confirmModalOk?.removeEventListener("click", onOk);
            confirmModalCancel?.removeEventListener("click", onCancel);
            closeConfirmModalBtn?.removeEventListener("click", onCancel);
        };

        confirmModalOk?.addEventListener("click", onOk);
        confirmModalCancel?.addEventListener("click", onCancel);
        closeConfirmModalBtn?.addEventListener("click", onCancel);
    });
}

function showRenameModal(currentTitle) {
    return new Promise((resolve) => {
        renameModalInput.value = currentTitle;
        renameModal.showModal();
        renameModalInput.select();

        const onSubmit = (e) => {
            e.preventDefault();
            const val = renameModalInput.value.trim();
            cleanup();
            renameModal.close();
            resolve(val || null);
        };
        const onCancel = () => {
            cleanup();
            renameModal.close();
            resolve(null);
        };
        const cleanup = () => {
            renameModalForm?.removeEventListener("submit", onSubmit);
            renameModalCancel?.removeEventListener("click", onCancel);
            closeRenameModalBtn?.removeEventListener("click", onCancel);
        };

        renameModalForm?.addEventListener("submit", onSubmit);
        renameModalCancel?.addEventListener("click", onCancel);
        closeRenameModalBtn?.addEventListener("click", onCancel);
    });
}

/* ── Conversaciones ───────────────────────────────────── */
function newConversation() {
    const conv = { id: crypto.randomUUID(), title: "Nueva conversación", interactionId: null, messages: [] };
    conversations.unshift(conv);
    conversations = conversations.slice(0, MAX_CONVS);
    activeConvId = conv.id;
    editingIndex = null;
    saveConversations();
    renderConvList();
    loadActiveConv();
    messageInput.focus();
}

async function clearCurrentConversation() {
    const conv = activeConv();
    if (!conv || !conv.messages.length) return;
    const ok = await showConfirmModal("Limpiar chat actual", "¿Deseas vaciar todos los mensajes de esta conversación?");
    if (!ok) return;
    conv.messages = [];
    conv.interactionId = null;
    saveConversations();
    loadActiveConv();
    showToast("Historial del chat limpiado.");
}

function renderConvList(filterQuery = "") {
    convList.innerHTML = "";
    const filtered = filterQuery
        ? conversations.filter(c => c.title.toLowerCase().includes(filterQuery))
        : conversations;

    if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.style.padding = "14px";
        empty.style.fontSize = ".8rem";
        empty.style.color = "var(--text-dim)";
        empty.textContent = filterQuery ? "No se encontraron chats." : "Sin conversaciones.";
        convList.appendChild(empty);
        return;
    }

    for (const conv of filtered) {
        const item = document.createElement("div");
        item.className = "conv-item" + (conv.id === activeConvId ? " active" : "");
        item.dataset.id = conv.id;

        const title = document.createElement("span");
        title.className = "conv-title";
        title.textContent = conv.title;
        title.title = conv.title;
        title.onclick = () => switchConversation(conv.id);

        const actions = document.createElement("div");
        actions.className = "conv-actions-group";

        // Botón renombrar con SVG
        const editBtn = document.createElement("button");
        editBtn.className = "conv-edit";
        editBtn.title = "Renombrar conversación";
        editBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
        editBtn.onclick = (e) => {
            e.stopPropagation();
            renameConversation(conv.id);
        };

        // Botón borrar con SVG
        const delBtn = document.createElement("button");
        delBtn.className = "conv-del";
        delBtn.title = "Borrar conversación";
        delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        delBtn.onclick = (e) => {
            e.stopPropagation();
            deleteConversation(conv.id);
        };

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        item.appendChild(title);
        item.appendChild(actions);
        convList.appendChild(item);
    }
}

async function renameConversation(id) {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    const newName = await showRenameModal(conv.title);
    if (newName && newName.trim()) {
        conv.title = newName.trim();
        saveConversations();
        renderConvList(convSearchInput.value.toLowerCase().trim());
        showToast("Conversación renombrada.");
    }
}

function switchConversation(id) {
    activeConvId = id;
    editingIndex = null;
    closeSidebar();
    renderConvList(convSearchInput.value.toLowerCase().trim());
    loadActiveConv();
    if (!chatSearchBar.classList.contains("hidden")) closeChatSearch();
}

async function deleteConversation(id) {
    const ok = await showConfirmModal("Borrar conversación", "¿Deseas eliminar permanentemente esta conversación?");
    if (!ok) return;
    conversations = conversations.filter(c => c.id !== id);
    if (activeConvId === id) {
        activeConvId = conversations[0]?.id || null;
        editingIndex = null;
    }
    saveConversations();
    renderConvList(convSearchInput.value.toLowerCase().trim());
    loadActiveConv();
    showToast("Conversación eliminada.");
}

$("newChatBtn").addEventListener("click", newConversation);
$("clearAllBtn").addEventListener("click", async () => {
    if (!conversations.length) return;
    const ok = await showConfirmModal("Borrar todas las conversaciones", "¿Estás seguro de que deseas eliminar TODO el historial de chats?");
    if (!ok) return;
    conversations = [];
    activeConvId = null;
    saveConversations();
    renderConvList();
    loadActiveConv();
    showToast("Historial completo eliminado.");
});

/* ── Sidebar móvil ────────────────────────────────────── */
$("sidebarToggle").addEventListener("click", () => {
    sidebar.classList.toggle("open");
    if (sidebar.classList.contains("open")) {
        const bd = document.createElement("div");
        bd.className = "sidebar-backdrop";
        bd.id = "sidebarBackdrop";
        bd.onclick = closeSidebar;
        document.body.appendChild(bd);
    } else closeSidebar();
});
function closeSidebar() {
    sidebar.classList.remove("open");
    document.getElementById("sidebarBackdrop")?.remove();
}

/* ── Cargar conversación activa ───────────────────────── */
function loadActiveConv() {
    chatBox.innerHTML = "";
    userScrolledUp = false;
    scrollToBottomBtn.classList.add("hidden");
    scrollUnreadDot.classList.add("hidden");

    const conv = activeConv();
    if (!conv || !conv.messages.length) {
        renderEmptyDashboard();
        return;
    }
    conv.messages.forEach((m, i) => {
        const div = appendMessage(m.role, m.text, true, m.ts);
        div.dataset.index = i;
        addMessageActions(div, i, m.role, m.text);
    });
    scrollToBottom(true);
}

// Dashboard técnico didáctico cuando no hay mensajes en el chat
function renderEmptyDashboard() {
    const activeSkill = window.skillManager ? window.skillManager.getActiveSkill() : null;
    const skillName = activeSkill ? activeSkill.name : "Auto-Skill Router";
    const skillEmoji = activeSkill ? activeSkill.emoji : "🧭";
    const modelName = modelSelect.options[modelSelect.selectedIndex]?.text || modelSelect.value;

    const div = document.createElement("div");
    div.className = "empty-dashboard";
    div.innerHTML = `
        <div class="empty-header">
            <div class="empty-logo-box">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
            </div>
            <h2 class="empty-title">Basilisco Studio v3.2</h2>
            <p class="empty-subtitle">Entorno de ingeniería asistida por IA con orquestación estricta de 69 skills especializadas, números tabulares y cero ruido promocional.</p>
            <div class="empty-status-row">
                <span class="status-pill"><span class="status-dot"></span> Motor: ${escapeHtml(modelName)}</span>
                <span class="status-pill">${skillEmoji} Skill: ${escapeHtml(skillName)}</span>
                <span class="status-pill">Ecosistema Antigravity</span>
            </div>
        </div>
        <div class="starters-grid">
            <div class="starter-card" data-prompt="Analiza la arquitectura del proyecto y propón mejoras de desacoplamiento modular.">
                <div class="starter-title"><span>Auditoría de Arquitectura</span><span class="starter-cmd">/ponytail</span></div>
                <div class="starter-desc">Identifica complejidad accidental, dependencias innecesarias y optimiza contratos de interfaz.</div>
            </div>
            <div class="starter-card" data-prompt="Diseña una interfaz web accesible sin AI-slop con jerarquía visual estricta en Inter.">
                <div class="starter-title"><span>Ingeniería UI/UX</span><span class="starter-cmd">/frontend-ui</span></div>
                <div class="starter-desc">Estructura componentes accesibles WCAG, paleta slate neutra y métricas tabulares.</div>
            </div>
            <div class="starter-card" data-prompt="Aplica Doubt-Driven Development para auditar supuestos críticos y fallos silenciosos.">
                <div class="starter-title"><span>Revisión Adversarial</span><span class="starter-cmd">/doubt-driven</span></div>
                <div class="starter-desc">Somete decisiones clave a escrutinio antes de aterrizar implementaciones costosas.</div>
            </div>
            <div class="starter-card" data-prompt="Resume de forma ultra-comprimida y técnica los conceptos clave.">
                <div class="starter-title"><span>Modo Ultra-Comprimido</span><span class="starter-cmd">/caveman</span></div>
                <div class="starter-desc">Ahorro drástico de tokens sin perder rigor técnico ni precisión en diagnósticos.</div>
            </div>
        </div>
    `;

    div.querySelectorAll(".starter-card").forEach(card => {
        card.onclick = () => {
            const prompt = card.dataset.prompt;
            messageInput.value = prompt;
            messageInput.focus();
            updateCounters();
        };
    });

    chatBox.appendChild(div);
}

function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
}

/* ── Renderizado Markdown Enriquecido (QoL) ────────────── */
function parseMarkdown(text) {
    if (!text) return "";
    try {
        const hasMath = /(\$\$?.+?\$\$?)/s.test(text);
        if (hasMath && !katexReady) ensureKatex();

        // Autocerrar <think> si quedó abierto por interrupción o corte
        let processedText = text;
        if (/<think(?:\s+[^>]*)?>/i.test(processedText) && !/<\/think>/i.test(processedText)) {
            processedText += "\n</think>";
        }

        let html = "";
        const re = /<think(?:\s+[^>]*)?>([\s\S]*?)<\/think>/gi;
        let last = 0, m;
        while ((m = re.exec(processedText)) !== null) {
            html += marked.parse(processedText.slice(last, m.index));
            const inner = m[1].trim();
            const innerHtml = inner ? marked.parse(inner) : "";
            html += `<details class="thought-block" open><summary>Pensamiento analítico</summary><div>${innerHtml}</div></details>`;
            last = m.index + m[0].length;
        }
        html += marked.parse(processedText.slice(last));
        html = DOMPurify.sanitize(html, {
            ADD_TAGS: ["details", "summary", "math", "semantics", "mrow", "mi", "mo", "mn", "ms", "mspace", "munderover", "mfrac", "msqrt", "mroot", "mstyle", "merror", "mpadded", "mphantom", "mfenced", "menclose", "msub", "msup", "msubsup", "mtable", "mtr", "mtd", "maligngroup", "malignmark", "mlabeledtr", "mstack", "mlongdiv", "msgroup", "msrow", "mscarries", "mscarry", "maction", "annotation", "annotation-xml"],
            ADD_ATTR: ["open", "display", "xmlns", "href", "mathvariant", "mathcolor", "mathbackground", "mathsize", "dir", "fontfamily", "fontweight", "fontstyle", "fontsize", "color", "background", "class"]
        });

        // Enriquecer bloques de código con cabecera de lenguaje, wrap toggle y botón copiar
        html = html.replace(/<pre><code(.*?)>([\s\S]*?)<\/code><\/pre>/gi, (match, attrs, codeContent) => {
            const id = "code-" + Math.random().toString(36).substr(2, 9);
            const langMatch = attrs.match(/class=["'].*?language-([a-zA-Z0-9_\-+]+).*?["']/i);
            const lang = langMatch ? langMatch[1] : "código";

            return `
                <div class="code-block-wrapper">
                    <div class="code-header">
                        <div class="code-header-left">
                            <span class="code-lang">${escapeHtml(lang)}</span>
                        </div>
                        <div class="code-actions">
                            <button class="code-btn" onclick="toggleCodeWrap('${id}', this)">Ajustar</button>
                            <button class="code-btn copy-btn" onclick="copyCode('${id}', this)">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                Copiar
                            </button>
                        </div>
                    </div>
                    <pre><code id="${id}"${attrs}>${codeContent}</code></pre>
                </div>
            `;
        });

        // Asegurar que todos los enlaces (fuentes web, citations) abran en una pestaña nueva
        html = html.replace(/<a\s+(?:(?!(?:target=|_blank))[^>])+>/gi, (tag) => tag.replace('<a ', '<a target="_blank" rel="noopener noreferrer" '));

        return html;
    } catch (e) {
        console.error("Markdown parse error:", e);
        return `<pre style="white-space:pre-wrap;font-family:sans-serif;">${escapeHtml(text)}</pre>`;
    }
}

function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function ensureKatex() {
    if (katexPromise) return katexPromise;
    katexPromise = new Promise((resolve) => {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css";
        document.head.appendChild(css);
        const s1 = document.createElement("script");
        s1.src = "https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js";
        s1.onload = () => {
            const s2 = document.createElement("script");
            s2.src = "https://cdn.jsdelivr.net/npm/marked-katex-extension/lib/index.umd.js";
            s2.onload = () => {
                if (typeof marked !== "undefined" && typeof window.markedKatex !== "undefined") {
                    marked.use(window.markedKatex({ throwOnError: false }));
                }
                katexReady = true;
                resolve();
            };
            document.head.appendChild(s2);
        };
        document.head.appendChild(s1);
    });
    return katexPromise;
}

// Funciones globales para bloques de código
window.copyCode = function (id, btn) {
    const el = document.getElementById(id);
    if (!el) return;
    navigator.clipboard.writeText(el.innerText).then(() => {
        if (btn) {
            const originalHTML = btn.innerHTML;
            btn.classList.add("copied");
            btn.innerHTML = `✓ Copiado`;
            setTimeout(() => {
                btn.classList.remove("copied");
                btn.innerHTML = originalHTML;
            }, 2000);
        }
    });
};

window.toggleCodeWrap = function (id, btn) {
    const el = document.getElementById(id);
    if (!el) return;
    const pre = el.closest("pre");
    if (!pre) return;
    const isWrapped = pre.classList.toggle("wrapped");
    if (btn) btn.textContent = isWrapped ? "Desajustar" : "Ajustar";
};

/* ── DOM de mensajes y Acciones QoL ───────────────────── */
function appendMessage(sender, text, doParse = true, timestamp = Date.now()) {
    const div = document.createElement("div");
    div.className = `message ${sender}`;

    // Metadata (hora y remitente)
    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = `${sender === "user" ? "Tú" : "Basilisco"} • ${formatTime(timestamp)}`;
    div.appendChild(meta);

    const body = document.createElement("div");
    body.className = "message-body";
    body.innerHTML = (sender === "ai" && doParse !== false) ? parseMarkdown(text) : escapeHtml(text);
    div.appendChild(body);

    chatBox.appendChild(div);
    scrollToBottom();
    return div;
}

function addMessageActions(div, index, role, rawText) {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    // Copiar mensaje completo con SVG
    const copyMsgBtn = document.createElement("button");
    copyMsgBtn.className = "action-btn";
    copyMsgBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copiar`;
    copyMsgBtn.onclick = () => {
        navigator.clipboard.writeText(rawText).then(() => showToast("Mensaje copiado al portapapeles."));
    };
    actions.appendChild(copyMsgBtn);

    if (role === "user") {
        const editBtn = document.createElement("button");
        editBtn.className = "action-btn";
        editBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg> Editar`;
        editBtn.onclick = () => {
            messageInput.value = rawText;
            editingIndex = index;
            messageInput.focus();
            updateCounters();
        };

        const retryBtn = document.createElement("button");
        retryBtn.className = "action-btn";
        retryBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg> Reintentar`;
        retryBtn.onclick = () => {
            editingIndex = index;
            doSend(rawText);
        };

        actions.appendChild(editBtn);
        actions.appendChild(retryBtn);
    } else if (role === "ai") {
        const regenBtn = document.createElement("button");
        regenBtn.className = "action-btn";
        regenBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg> Regenerar`;
        regenBtn.onclick = () => {
            const conv = activeConv();
            if (conv && index > 0) {
                const prevUserMsg = conv.messages[index - 1];
                if (prevUserMsg && prevUserMsg.role === "user") {
                    editingIndex = index - 1;
                    doSend(prevUserMsg.text);
                }
            }
        };

        const ttsBtn = document.createElement("button");
        ttsBtn.className = "action-btn";
        ttsBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> Escuchar`;
        ttsBtn.onclick = () => speakMessage(rawText, ttsBtn);

        actions.appendChild(regenBtn);
        actions.appendChild(ttsBtn);
    }

    div.appendChild(actions);
}

// Síntesis de voz (TTS)
function speakMessage(text, btn) {
    if (!window.speechSynthesis) {
        showToast("Text-to-Speech no soportado.");
        return;
    }
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> Escuchar`;
        return;
    }

    const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/[`#*_\[\]()]/g, "");
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "es-ES";
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Detener`;

    utter.onend = () => {
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> Escuchar`;
    };
    utter.onerror = () => {
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> Escuchar`;
    };

    window.speechSynthesis.speak(utter);
}

function removeMessagesFromDOM(fromIndex) {
    chatBox.querySelectorAll(".message[data-index]").forEach(msg => {
        const idx = parseInt(msg.dataset.index, 10);
        if (!isNaN(idx) && idx >= fromIndex) msg.remove();
    });
}

/* ── Adjuntos ─────────────────────────────────────────── */
fileInput.addEventListener("change", (e) => {
    Array.from(e.target.files).forEach(f => selectedFiles.push(f));
    renderAttachments();
});

function renderAttachments() {
    attachmentsPreview.innerHTML = "";
    selectedFiles.forEach((file, index) => {
        const thumb = document.createElement("div");
        thumb.className = "attachment-thumb";
        if (file.type.startsWith("image/")) {
            const img = document.createElement("img");
            img.src = URL.createObjectURL(file);
            thumb.appendChild(img);
        } else {
            thumb.textContent = file.name.slice(0, 8) + "…";
            thumb.title = file.name;
        }
        const remove = document.createElement("button");
        remove.className = "remove-thumb";
        remove.textContent = "✕";
        remove.onclick = () => { selectedFiles.splice(index, 1); renderAttachments(); };
        thumb.appendChild(remove);
        attachmentsPreview.appendChild(thumb);
    });
}

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
});

/* ── Envío con streaming y Skill Obligatoria ───────────── */
function setBusy(busy) {
    sendBtn.classList.toggle("hidden", busy);
    stopBtn.classList.toggle("hidden", !busy);
    messageInput.disabled = busy;
    fileInput.disabled = busy;
}

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text && selectedFiles.length === 0) return;

    if (text.startsWith("/")) {
        const parts = text.split(" ");
        const cmd = parts[0];
        const remainingText = parts.slice(1).join(" ");

        if (window.skillManager) {
            const skill = skillManager.getBySlashCommand(cmd);
            if (skill) {
                selectSkill(skill.id);
                if (!remainingText && selectedFiles.length === 0) {
                    messageInput.value = "";
                    updateCounters();
                    return;
                }
                return processAndSend(remainingText);
            }
        }
    }

    await processAndSend(text);
}

async function processAndSend(text) {
    const files = selectedFiles;
    messageInput.value = "";
    messageInput.style.height = "auto";
    selectedFiles = [];
    renderAttachments();
    fileInput.value = "";
    updateCounters();
    await doSend(text, files);
}

async function doSend(text, files = []) {
    const conv = activeConv();
    if (!conv) { newConversation(); return doSend(text, files); }
    if (conv.messages.length === 0) chatBox.innerHTML = "";

    if (editingIndex !== null) {
        removeMessagesFromDOM(editingIndex);
        conv.messages.splice(editingIndex);
    }
    const truncate = editingIndex;
    editingIndex = null;

    const userIdx = conv.messages.length;
    const now = Date.now();
    conv.messages.push({ role: "user", text: text || "Adjunto(s)", ts: now });
    const userDiv = appendMessage("user", text || `${files.length} adjunto(s)`, false, now);
    userDiv.dataset.index = userIdx;
    addMessageActions(userDiv, userIdx, "user", text);

    let mediaParts = null;
    if (files.length) {
        mediaParts = await Promise.all(files.map(async f => {
            const b64 = await fileToBase64(f);
            return { inlineData: { data: b64.split(",")[1], mimeType: f.type } };
        }));
    }

    setBusy(true);
    currentController = new AbortController();

    const aiDiv = document.createElement("div");
    aiDiv.className = "message ai streaming";
    aiDiv.dataset.index = userIdx + 1;

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = `Basilisco • ${formatTime(now)}`;
    aiDiv.appendChild(meta);

    const bodyDiv = document.createElement("div");
    bodyDiv.className = "message-body";
    aiDiv.appendChild(bodyDiv);

    chatBox.appendChild(aiDiv);
    scrollToBottom(true);

    let fullText = "";
    let rafPending = false;
    const scheduleRender = () => {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            bodyDiv.innerHTML = parseMarkdown(fullText);
            scrollToBottom();
        });
    };

    // FORMATEO OBLIGATORIO DE SKILL
    let outboundMessage = text;
    if (window.skillManager) {
        outboundMessage = skillManager.formatPrompt(text);
    }

    try {
        const res = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(sessionStorage.getItem(PIN_KEY) ? { "X-Auth-PIN": sessionStorage.getItem(PIN_KEY) } : {})
            },
            signal: currentController.signal,
            body: JSON.stringify({
                message: outboundMessage,
                interaction_id: conv.interactionId,
                model: modelSelect.value,
                use_search: useSearch.checked,
                use_thinking: useThinking.checked,
                truncate_history_at_index: truncate,
                media_parts: mediaParts
            })
        });

        if (res.status === 401) {
            conv.messages.pop();
            userDiv.remove();
            messageInput.value = text;
            selectedFiles = files;
            renderAttachments();
            pinModal.showModal();
            return;
        }
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${res.status}`);
        }

        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            const data = await res.json();
            fullText = data.text || data.message || "";
            conv.interactionId = data.interaction_id;
            updateQuota(data.usage);
            if (data.fallback_used && data.active_model) {
                showToast(`Fallback activo: ${data.active_model}`);
            }
        } else {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";

            const handleEvent = (raw) => {
                let event = "message", data = "";
                for (const line of raw.split("\n")) {
                    if (line.startsWith("event:")) event = line.slice(6).trim();
                    else if (line.startsWith("data:")) data += line.slice(5).trim();
                }
                if (!data) return;
                const obj = JSON.parse(data);
                if (event === "delta") {
                    fullText += obj.delta;
                    scheduleRender();
                } else if (event === "done") {
                    fullText += obj.delta || "";
                    conv.interactionId = obj.interaction_id;
                    updateQuota(obj.usage);
                } else if (event === "error") {
                    throw new Error(obj.error);
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                let sep;
                while ((sep = buf.indexOf("\n\n")) !== -1) {
                    handleEvent(buf.slice(0, sep));
                    buf = buf.slice(sep + 2);
                }
            }
        }

        if (!fullText) throw new Error("Respuesta vacía del servidor.");

        aiDiv.classList.remove("streaming");
        const finalRender = () => { bodyDiv.innerHTML = parseMarkdown(fullText); scrollToBottom(); };
        if (katexReady || !/(\$\$?.+?\$\$?)/s.test(fullText)) {
            finalRender();
        } else {
            await ensureKatex();
            finalRender();
        }

        const aiTs = Date.now();
        conv.messages.push({ role: "ai", text: fullText, ts: aiTs });
        addMessageActions(aiDiv, userIdx + 1, "ai", fullText);

        if (conv.title === "Nueva conversación" && text) {
            conv.title = text.slice(0, 40) + (text.length > 40 ? "…" : "");
        }
        conv.messages = conv.messages.slice(-MAX_MSGS_PER_CONV);
        saveConversations();
        renderConvList(convSearchInput.value.toLowerCase().trim());
    } catch (err) {
        aiDiv.remove();
        if (err.name === "AbortError") {
            conv.messages.push({ role: "ai", text: "Generación detenida por el usuario.", ts: Date.now() });
            const sMsg = appendMessage("system", "Generación detenida.");
            sMsg.dataset.index = userIdx + 1;
        } else {
            conv.messages.pop();
            userDiv.remove();
            messageInput.value = text;
            selectedFiles = files;
            renderAttachments();
            updateCounters();
            showToast(err.message);
        }
        saveConversations();
    } finally {
        setBusy(false);
        currentController = null;
        messageInput.focus();
    }
}

/* ── PIN ──────────────────────────────────────────────── */
pinModal.addEventListener("close", () => {
    if (pinModal.returnValue === "ok") {
        const pin = pinInput.value.trim();
        if (pin) {
            sessionStorage.setItem(PIN_KEY, pin);
            pinInput.value = "";
            sendMessage();
        }
    } else {
        pinInput.value = "";
        pinError.classList.add("hidden");
    }
});
pinModal.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!pinInput.value.trim()) return;
    pinModal.close("ok");
});

/* ── Cuota con Números Tabulares ───────────────────────── */
function updateQuota(usage) {
    if (!usage) return;
    $("quotaMeter").classList.remove("hidden");
    $("valRPM").textContent = `${usage.rpm ?? 0}/${usage.maxRpm}`;
    $("valTPM").textContent = `${usage.tpm > 1000 ? (usage.tpm / 1000).toFixed(1) + "K" : usage.tpm ?? 0}/${usage.maxTpm}`;
    const fmtK = n => (n > 1000 ? (n / 1000).toFixed(1) + "K" : n ?? 0);
    $("valRPD").textContent = `${fmtK(usage.rpd)}/${fmtK(usage.maxRpd)}`;
    if (usage.maxTotalTokens) {
        $("tknSpan").classList.remove("hidden");
        const t = usage.totalTokens ?? 0;
        $("valTKN").textContent = `${t > 1000 ? (t / 1000).toFixed(1) + "K" : t}/${usage.maxTotalTokens > 1000 ? (usage.maxTotalTokens / 1000).toFixed(0) + "K" : usage.maxTotalTokens}`;
    } else {
        $("tknSpan").classList.add("hidden");
    }
}

/* ── Selector de Modelo Personalizado y Chips de Control ── */
function syncCustomSelectFromValue(val) {
    if (!val) return;
    const options = document.querySelectorAll(".custom-option");
    options.forEach(opt => {
        const isMatch = opt.dataset.value === val;
        opt.classList.toggle("active", isMatch);
        opt.setAttribute("aria-selected", isMatch ? "true" : "false");
        if (isMatch) {
            const nameEl = opt.querySelector(".option-name");
            if (nameEl && currentModelLabel) currentModelLabel.textContent = nameEl.textContent.trim();
            if (currentModelSub) {
                const isZen = val.startsWith("zen") || val.startsWith("opencode/");
                currentModelSub.textContent = isZen ? "Zen" : "Google";
            }
        }
    });
}

function initCustomModelSelect() {
    if (!customModelTrigger || !customModelDropdown) return;

    const openDropdown = () => {
        customModelDropdown.classList.remove("hidden");
        customModelTrigger.setAttribute("aria-expanded", "true");
    };

    const closeDropdown = () => {
        customModelDropdown.classList.add("hidden");
        customModelTrigger.setAttribute("aria-expanded", "false");
    };

    customModelTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = !customModelDropdown.classList.contains("hidden");
        if (isOpen) closeDropdown();
        else openDropdown();
    });

    const options = customModelDropdown.querySelectorAll(".custom-option");
    options.forEach(opt => {
        opt.addEventListener("click", (e) => {
            e.stopPropagation();
            const val = opt.dataset.value;
            if (val && modelSelect) {
                modelSelect.value = val;
                modelSelect.dispatchEvent(new Event("change"));
            }
            syncCustomSelectFromValue(val);
            closeDropdown();
        });
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest("#customModelSelectWrapper")) {
            closeDropdown();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !customModelDropdown.classList.contains("hidden")) {
            closeDropdown();
            customModelTrigger.focus();
        }
    });

    syncCustomSelectFromValue(modelSelect ? modelSelect.value : "flash3");
}

function initChipControls() {
    function syncChip(cb) {
        if (!cb) return;
        const parent = cb.closest(".control-chip-btn");
        if (parent) parent.classList.toggle("active", cb.checked);
    }
    [useSearch, useThinking].forEach(cb => {
        if (!cb) return;
        syncChip(cb);
        cb.addEventListener("change", () => syncChip(cb));
    });
}

modelSelect.addEventListener("change", () => {
    if (modelSelect.value === "thinking") {
        useThinking.checked = true;
        const parent = useThinking.closest(".control-chip-btn");
        if (parent) parent.classList.add("active");
    }
    syncCustomSelectFromValue(modelSelect.value);
    updateQuota({ rpm: 0, tpm: 0, rpd: 0, ...MODEL_LIMITS[modelSelect.value] });
});

/* ── Toast ────────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 3500);
}

/* ── Eventos de entrada ───────────────────────────────── */
sendBtn.addEventListener("click", sendMessage);
stopBtn.addEventListener("click", () => currentController?.abort());
messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && slashMenu.classList.contains("hidden")) {
        e.preventDefault();
        sendMessage();
    }
});
messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + "px";
});
