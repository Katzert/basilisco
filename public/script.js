/* Basilisco — frontend v3 (69 Skills Ecosistema Antigravity + Suite QoL)
   Streaming SSE con fetch nativo, motor de skills obligatorias, comandos slash (/),
   persistencia local, exportación, drag & drop, pegado de imágenes y KaTeX bajo demanda. */
"use strict";

const $ = id => document.getElementById(id);

// Elementos principales
const chatBox = $("chatBox"), messageInput = $("messageInput");
const sendBtn = $("sendBtn"), stopBtn = $("stopBtn");
const modelSelect = $("modelSelect"), useSearch = $("useSearch");
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

/* Límites de uso por modelo */
const MODEL_LIMITS = {
    flash3:      { maxRpm: 5,  maxTpm: "250K", maxRpd: 20 },
    thinking:    { maxRpm: 5,  maxTpm: "250K", maxRpd: 20 },
    antigravity: { maxRpm: 15, maxTpm: "1M",   maxRpd: 1500 },
    gemma26:     { maxRpm: 30, maxTpm: "16K",  maxRpd: 14400 },
    gemma4:      { maxRpm: 30, maxTpm: "16K",  maxRpd: 14400 },
    zenDeepseek: { maxRpm: 15, maxTpm: "1M",   maxRpd: 1500 },
    zenNemotron: { maxRpm: 15, maxTpm: "1M",   maxRpd: 1500 },
    zenLaguna:   { maxRpm: 15, maxTpm: "1M",   maxRpd: 1500 },
    zenMimo:     { maxRpm: 15, maxTpm: "1M",   maxRpd: 1500 },
    zenLing:     { maxRpm: 15, maxTpm: "1M",   maxRpd: 1500 },
    zenNorth:    { maxRpm: 15, maxTpm: "1M",   maxRpd: 1500 },
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
});

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light") setTheme("light");
}
function setTheme(t) {
    document.documentElement.dataset.theme = t;
    localStorage.setItem(THEME_KEY, t);
    $("themeBtn").textContent = t === "dark" ? "☀️" : "🌙";
}
$("themeBtn").addEventListener("click", () =>
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

/* ── Sistema de Skills (Obligatorio) ──────────────────── */
function initSkillsUI() {
    if (!window.skillManager) return;
    
    // Sincronizar estado inicial
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
        showToast(e.target.checked ? "🔒 Modo Obligatorio Estricto activado" : "🔓 Modo Obligatorio desactivado");
    });

    modalStrictCheckbox.addEventListener("change", (e) => {
        skillManager.setStrictMode(e.target.checked);
        strictSkillCheckbox.checked = e.target.checked;
        showToast(e.target.checked ? "🔒 Modo Obligatorio Estricto activado" : "🔓 Modo Obligatorio desactivado");
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
    showToast(`✨ Skill activa: ${skill ? skill.name : "Ninguna"}`);
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

    // Detectar si el texto actual comienza con "/"
    if (text.startsWith("/")) {
        const query = text.slice(1).toLowerCase().trim();
        const items = [];

        // Comandos de utilidad
        UTILITY_COMMANDS.forEach(u => {
            if (u.command.toLowerCase().includes(query) || u.desc.toLowerCase().includes(query)) {
                items.push({ type: "util", cmd: u.command, name: u.command, desc: u.desc, action: u.action, emoji: "⚙️" });
            }
        });

        // Skills que coincidan
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
            showToast(next ? "🔒 Modo Obligatorio activado" : "🔓 Modo Obligatorio desactivado");
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

    toggleAllThoughtsBtn.addEventListener("click", toggleAllThoughts);
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
                    showToast("🖼️ Imagen pegada del portapapeles");
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
            showToast(`📎 ${e.dataTransfer.files.length} archivo(s) añadido(s)`);
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
            const roleName = m.role === "user" ? "👤 **Usuario**" : "🐍 **Basilisco AI**";
            md += `### ${roleName}\n\n${m.text}\n\n---\n\n`;
        });
        downloadFile(`${titleSlug}-${dateStr}.md`, "text/markdown", md);
        showToast("📄 Chat exportado como Markdown");
    } else {
        const json = JSON.stringify(conv, null, 2);
        downloadFile(`${titleSlug}-${dateStr}.json`, "application/json", json);
        showToast("📦 Chat exportado como JSON");
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
        showToast("🎙️ Escuchando... habla ahora");
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
        if (isRecordingVoice) {
            speechRecognizer.stop();
        } else {
            speechRecognizer.start();
        }
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
    showToast(allThoughtsExpanded ? "🧠 Razonamientos expandidos" : "🧠 Razonamientos colapsados");
}

// Atajos de teclado modal
function initShortcutsModal() {
    shortcutsBtn.addEventListener("click", () => shortcutsModal.showModal());
    closeShortcutsModalBtn.addEventListener("click", () => shortcutsModal.close());

    window.addEventListener("keydown", (e) => {
        // Ctrl+K: Buscar en chats
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            convSearchInput.focus();
        }
        // Ctrl+Shift+O: Nuevo chat
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") {
            e.preventDefault();
            newConversation();
        }
        // Ctrl+/: Atajos
        if ((e.ctrlKey || e.metaKey) && e.key === "/") {
            e.preventDefault();
            shortcutsModal.showModal();
        }
        // Escape: Cerrar modales
        if (e.key === "Escape") {
            if (!shortcutsModal.classList.contains("hidden") && shortcutsModal.open) shortcutsModal.close();
            if (!skillsModal.classList.contains("hidden") && skillsModal.open) skillsModal.close();
            closeSlashMenu();
        }
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

function clearCurrentConversation() {
    const conv = activeConv();
    if (!conv) return;
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

        // Botón renombrar
        const editBtn = document.createElement("button");
        editBtn.className = "conv-edit";
        editBtn.textContent = "✏️";
        editBtn.title = "Renombrar conversación";
        editBtn.onclick = (e) => {
            e.stopPropagation();
            renameConversation(conv.id);
        };

        // Botón borrar
        const delBtn = document.createElement("button");
        delBtn.className = "conv-del";
        delBtn.textContent = "🗑️";
        delBtn.title = "Borrar conversación";
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

function renameConversation(id) {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    const newName = prompt("Introduce un nuevo nombre para esta conversación:", conv.title);
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
}

function deleteConversation(id) {
    conversations = conversations.filter(c => c.id !== id);
    if (activeConvId === id) {
        activeConvId = conversations[0]?.id || null;
        editingIndex = null;
    }
    saveConversations();
    renderConvList(convSearchInput.value.toLowerCase().trim());
    loadActiveConv();
}

$("newChatBtn").addEventListener("click", newConversation);
$("clearAllBtn").addEventListener("click", () => {
    if (!conversations.length) return;
    if (!confirm("¿Borrar TODAS las conversaciones?")) return;
    conversations = [];
    activeConvId = null;
    saveConversations();
    renderConvList();
    loadActiveConv();
    showToast("Todas las conversaciones han sido borradas.");
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
    const conv = activeConv();
    if (!conv) {
        chatBox.appendChild(systemMsg("🐍 Conectado. Crea una conversación para empezar."));
        return;
    }
    if (!conv.messages.length) {
        chatBox.appendChild(systemMsg("🐍 Conectado. Escribe un mensaje o usa '/' para ver las 69 skills disponibles."));
        return;
    }
    conv.messages.forEach((m, i) => {
        const div = appendMessage(m.role, m.text, false);
        div.dataset.index = i;
        addMessageActions(div, i, m.role, m.text);
    });
}

function systemMsg(text) {
    const div = document.createElement("div");
    div.className = "message system";
    div.dataset.index = -1;
    div.innerHTML = text;
    return div;
}

/* ── Renderizado Markdown ─────────────────────────────── */
function parseMarkdown(text) {
    if (!text) return "";
    try {
        const hasMath = /(\$\$?.+?\$\$?)/s.test(text);
        if (hasMath && !katexReady) ensureKatex();

        // Dividir en bloques de pensamiento <think>...</think> y resto
        let html = "";
        const re = /<think>([\s\S]*?)<\/think>/g;
        let last = 0, m;
        while ((m = re.exec(text)) !== null) {
            html += marked.parse(text.slice(last, m.index));
            html += `<details class="thought-block" open><summary>🧠 Pensamiento</summary><div>${escapeHtml(m[1])}</div></details>`;
            last = m.index + m[0].length;
        }
        html += marked.parse(text.slice(last));
        html = DOMPurify.sanitize(html, {
            ADD_TAGS: ["math", "semantics", "mrow", "mi", "mo", "mn", "ms", "mspace", "munderover", "mfrac", "msqrt", "mroot", "mstyle", "merror", "mpadded", "mphantom", "mfenced", "menclose", "msub", "msup", "msubsup", "mtable", "mtr", "mtd", "maligngroup", "malignmark", "mlabeledtr", "mstack", "mlongdiv", "msgroup", "msrow", "mscarries", "mscarry", "maction", "annotation", "annotation-xml"],
            ADD_ATTR: ["display", "xmlns", "href", "mathvariant", "mathcolor", "mathbackground", "mathsize", "dir", "fontfamily", "fontweight", "fontstyle", "fontsize", "color", "background", "class"]
        });

        // Botón copiar en bloques de código
        html = html.replace(/<pre><code(.*?)>([\s\S]*?)<\/code><\/pre>/gi, (match, attrs, codeContent) => {
            const id = "code-" + Math.random().toString(36).substr(2, 9);
            return `<div style="position:relative;"><button class="copy-btn" onclick="copyCode('${id}')">Copiar</button><pre><code id="${id}"${attrs}>${codeContent}</code></pre></div>`;
        });
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

window.copyCode = function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    navigator.clipboard.writeText(el.innerText).then(() => {
        const btn = el.parentElement.querySelector(".copy-btn");
        if (btn) {
            const orig = btn.innerText;
            btn.textContent = "¡Copiado!";
            setTimeout(() => { btn.textContent = orig; }, 2000);
        }
    });
};

/* ── DOM de mensajes y Acciones QoL ───────────────────── */
function appendMessage(sender, text, doParse = true) {
    const div = document.createElement("div");
    div.className = `message ${sender}`;
    div.innerHTML = sender === "ai" && doParse ? parseMarkdown(text) : escapeHtml(text);
    chatBox.appendChild(div);
    scrollToBottom();
    return div;
}

function scrollToBottom() { chatBox.scrollTop = chatBox.scrollHeight; }

function addMessageActions(div, index, role, rawText) {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    // Copiar mensaje completo
    const copyMsgBtn = document.createElement("button");
    copyMsgBtn.className = "action-btn";
    copyMsgBtn.textContent = "📋 Copiar";
    copyMsgBtn.onclick = () => {
        navigator.clipboard.writeText(rawText).then(() => showToast("Mensaje copiado al portapapeles."));
    };
    actions.appendChild(copyMsgBtn);

    if (role === "user") {
        const editBtn = document.createElement("button");
        editBtn.className = "action-btn";
        editBtn.textContent = "✏️ Editar";
        editBtn.onclick = () => {
            messageInput.value = rawText;
            editingIndex = index;
            messageInput.focus();
            updateCounters();
        };

        const retryBtn = document.createElement("button");
        retryBtn.className = "action-btn";
        retryBtn.textContent = "🔄 Reintentar";
        retryBtn.onclick = () => {
            editingIndex = index;
            doSend(rawText);
        };

        actions.appendChild(editBtn);
        actions.appendChild(retryBtn);
    } else if (role === "ai") {
        // Regenerar respuesta
        const regenBtn = document.createElement("button");
        regenBtn.className = "action-btn";
        regenBtn.textContent = "🔄 Regenerar";
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

        // Escuchar texto (TTS)
        const ttsBtn = document.createElement("button");
        ttsBtn.className = "action-btn";
        ttsBtn.textContent = "🔊 Escuchar";
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
        btn.textContent = "🔊 Escuchar";
        return;
    }

    // Limpiar etiquetas HTML y tags <think>
    const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/[`#*_\[\]()]/g, "");
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "es-ES";
    btn.textContent = "⏹️ Detener";

    utter.onend = () => { btn.textContent = "🔊 Escuchar"; };
    utter.onerror = () => { btn.textContent = "🔊 Escuchar"; };

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
            thumb.textContent = file.name.slice(0, 5) + "…";
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

    // Verificar si es un comando slash
    if (text.startsWith("/")) {
        const parts = text.split(" ");
        const cmd = parts[0];
        const remainingText = parts.slice(1).join(" ");

        // Verificar si es una skill directa por comando (ej. /caveman, /humanizer)
        if (window.skillManager) {
            const skill = skillManager.getBySlashCommand(cmd);
            if (skill) {
                selectSkill(skill.id);
                if (!remainingText && selectedFiles.length === 0) {
                    messageInput.value = "";
                    updateCounters();
                    return;
                }
                // Si viene con mensaje posterior, enviar ese texto
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

    // Truncar historial si se edita/reintenta
    if (editingIndex !== null) {
        removeMessagesFromDOM(editingIndex);
        conv.messages.splice(editingIndex);
    }
    const truncate = editingIndex;
    editingIndex = null;

    const userIdx = conv.messages.length;
    conv.messages.push({ role: "user", text: text || "📎 Adjunto(s)", ts: Date.now() });
    const userDiv = appendMessage("user", text || `📎 ${files.length} adjunto(s)`);
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
    chatBox.appendChild(aiDiv);

    let fullText = "";
    let rafPending = false;
    const scheduleRender = () => {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            aiDiv.innerHTML = parseMarkdown(fullText);
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
                showToast(`⚡ Fallback activo: servido por ${data.active_model}`);
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
        const finalRender = () => { aiDiv.innerHTML = parseMarkdown(fullText); scrollToBottom(); };
        if (katexReady || !/(\$\$?.+?\$\$?)/s.test(fullText)) {
            finalRender();
        } else {
            await ensureKatex();
            finalRender();
        }

        conv.messages.push({ role: "ai", text: fullText, ts: Date.now() });
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
            conv.messages.push({ role: "ai", text: "⏹️ Generación detenida por el usuario.", ts: Date.now() });
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

/* ── Cuota ────────────────────────────────────────────── */
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

modelSelect.addEventListener("change", () => {
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
