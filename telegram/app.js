/**
 * TeleChat - Telegram-Inspired Modern Chat Engine
 * Real-Time P2P WebRTC, Server SSE & Cloud-Memory Synchronization via Room Code
 */

(function () {
  'use strict';

  // --- Configuration & Default Constants ---
  const STORAGE_PREFIX = 'telechat_v1_';
  const DEFAULT_PALETTE = ['#5288c1', '#65c466', '#e07153', '#b660cd', '#e69c24', '#2f96b4'];

  // --- Web Audio Synthesizer for Telegram Sound Effects ---
  const SoundFX = {
    ctx: null,
    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.ctx = new AudioContext();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    },
    playSend() {
      try {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(840, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.08);
      } catch (e) { /* ignore audio error */ }
    },
    playReceive() {
      try {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880.00, this.ctx.currentTime + 0.07); // A5
        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.22);
      } catch (e) { /* ignore audio error */ }
    },
    playRecordStart() {
      try {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, this.ctx.currentTime);
        osc.frequency.setValueAtTime(660, this.ctx.currentTime + 0.06);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.12);
      } catch (e) {}
    }
  };

  // --- Application State ---
  const state = {
    currentUser: {
      id: '',
      name: '',
      color: DEFAULT_PALETTE[0],
      avatar: ''
    },
    currentRoom: '',
    recentRooms: [],
    messages: [],
    peers: new Map(), // peerId -> DataConnection
    isHost: false,
    peerInstance: null,
    broadcastChannel: null,
    eventSource: null,
    pendingAttachment: null,
    mediaRecorder: null,
    audioChunks: [],
    recordStartTime: 0,
    recordInterval: null,
    typingTimeout: null,
    remoteTypingTimeout: null
  };

  // --- DOM Elements Cache ---
  const dom = {
    html: document.documentElement,
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    sidebar: document.getElementById('sidebar'),
    sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
    menuBtn: document.getElementById('menu-btn'),
    searchInput: document.getElementById('search-input'),
    newRoomBtn: document.getElementById('new-room-btn'),
    joinRoomBtn: document.getElementById('join-room-btn'),
    chatList: document.getElementById('chat-list'),

    // Self Profile bar
    myAvatarPreview: document.getElementById('my-avatar-preview'),
    myDisplayName: document.getElementById('my-display-name'),
    openProfileBtn: document.getElementById('open-profile-btn'),

    // Active Room Item in Sidebar
    sidebarRoomAvatar: document.getElementById('sidebar-room-avatar'),
    sidebarRoomTitle: document.getElementById('sidebar-room-title'),
    sidebarRoomTime: document.getElementById('sidebar-room-time'),
    sidebarRoomSnippet: document.getElementById('sidebar-room-snippet'),
    sidebarRoomStatusDot: document.getElementById('sidebar-room-status-dot'),

    // Chat Header
    headerAvatar: document.getElementById('header-avatar'),
    headerRoomName: document.getElementById('header-room-name'),
    headerStatusText: document.getElementById('header-status-text'),
    headerStatusIndicator: document.getElementById('header-status-indicator'),
    headerProfileClick: document.getElementById('header-profile-click'),
    toggleSearchBtn: document.getElementById('toggle-search-btn'),
    shareCodeBtn: document.getElementById('share-code-btn'),
    roomCodeBadge: document.getElementById('room-code-badge'),
    clearChatBtn: document.getElementById('clear-chat-btn'),

    // In-Chat Search
    chatSearchBar: document.getElementById('chat-search-bar'),
    inChatSearchInput: document.getElementById('in-chat-search-input'),
    searchMatchesCount: document.getElementById('search-matches-count'),
    closeSearchBtn: document.getElementById('close-search-btn'),

    // Feed & Messages
    messagesContainer: document.getElementById('messages-container'),
    typingIndicatorBar: document.getElementById('typing-indicator-bar'),
    typingText: document.getElementById('typing-text'),
    currentDatePill: document.getElementById('current-date-pill'),

    // Attachment Preview
    attachmentPreviewBar: document.getElementById('attachment-preview-bar'),
    previewItemContent: document.getElementById('preview-item-content'),
    cancelAttachmentBtn: document.getElementById('cancel-attachment-btn'),

    // Input area
    messageInput: document.getElementById('message-input'),
    actionBtn: document.getElementById('action-btn'),
    micIcon: document.querySelector('.mic-icon'),
    sendIcon: document.querySelector('.send-icon'),

    // Attachments
    attachBtn: document.getElementById('attach-btn'),
    attachMenu: document.getElementById('attach-menu'),
    imageFileInput: document.getElementById('image-file-input'),
    docFileInput: document.getElementById('doc-file-input'),
    audioFileInput: document.getElementById('audio-file-input'),

    // Voice recording
    voiceRecordingOverlay: document.getElementById('voice-recording-overlay'),
    recordingTimer: document.getElementById('recording-timer'),
    cancelVoiceBtn: document.getElementById('cancel-voice-btn'),

    // Emojis
    emojiBtn: document.getElementById('emoji-btn'),
    quickEmojisMenu: document.getElementById('quick-emojis-menu'),

    // Modals
    roomModal: document.getElementById('room-modal'),
    closeRoomModal: document.getElementById('close-room-modal'),
    modalRoomCode: document.getElementById('modal-room-code'),
    copyCodeDirect: document.getElementById('copy-code-direct'),
    copyLinkDirect: document.getElementById('copy-link-direct'),
    joinRoomForm: document.getElementById('join-room-form'),
    roomCodeInput: document.getElementById('room-code-input'),
    createRandomRoomBtn: document.getElementById('create-random-room-btn'),

    profileModal: document.getElementById('profile-modal'),
    closeProfileModal: document.getElementById('close-profile-modal'),
    profileModalAvatar: document.getElementById('profile-modal-avatar'),
    avatarColorPalette: document.getElementById('avatar-color-palette'),
    userDisplayNameInput: document.getElementById('user-display-name-input'),
    userIdReadonly: document.getElementById('user-id-readonly'),
    saveProfileBtn: document.getElementById('save-profile-btn'),

    // Lightbox & Drag Overlay
    lightboxOverlay: document.getElementById('lightbox-overlay'),
    lightboxImage: document.getElementById('lightbox-image'),
    lightboxDownloadLink: document.getElementById('lightbox-download-link'),
    closeLightboxBtn: document.getElementById('close-lightbox-btn'),
    dragDropOverlay: document.getElementById('drag-drop-overlay'),
    toastContainer: document.getElementById('toast-container')
  };

  // --- Helpers & Utilities ---
  function showToast(text, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function sanitizeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderMarkdownText(text) {
    let clean = sanitizeHTML(text);
    clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    clean = clean.replace(/\*(.*?)\*/g, '<em>$1</em>');
    clean = clean.replace(/`([^`]+)`/g, '<code>$1</code>');
    clean = clean.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return clean;
  }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'TELE-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  function getInitials(name) {
    if (!name) return 'TC';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  // --- User Profile Management ---
  function loadUserProfile() {
    const saved = localStorage.getItem(STORAGE_PREFIX + 'user_profile');
    if (saved) {
      try {
        state.currentUser = JSON.parse(saved);
      } catch (e) {}
    }

    if (!state.currentUser.id) {
      state.currentUser.id = 'usr_' + Math.random().toString(36).substring(2, 10);
    }
    if (!state.currentUser.name) {
      state.currentUser.name = 'Usuario ' + Math.floor(100 + Math.random() * 900);
    }
    if (!state.currentUser.color) {
      state.currentUser.color = DEFAULT_PALETTE[Math.floor(Math.random() * DEFAULT_PALETTE.length)];
    }

    saveUserProfile();
    renderUserProfileUI();
  }

  function saveUserProfile() {
    localStorage.setItem(STORAGE_PREFIX + 'user_profile', JSON.stringify(state.currentUser));
  }

  function renderUserProfileUI() {
    const initials = getInitials(state.currentUser.name);
    dom.myDisplayName.textContent = state.currentUser.name;
    dom.myAvatarPreview.textContent = initials;
    dom.myAvatarPreview.style.background = state.currentUser.color;

    dom.profileModalAvatar.textContent = initials;
    dom.profileModalAvatar.style.background = state.currentUser.color;
    dom.userDisplayNameInput.value = state.currentUser.name;
    dom.userIdReadonly.value = state.currentUser.id;

    const dots = dom.avatarColorPalette.querySelectorAll('.color-dot');
    dots.forEach(dot => {
      if (dot.getAttribute('data-color') === state.currentUser.color) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });

    document.documentElement.style.setProperty('--bubble-out', state.currentUser.color);
  }

  // --- Cloud & Local Persistence for Messages ---
  async function loadRoomMessages(roomCode) {
    // 1. Try local storage first
    const raw = localStorage.getItem(STORAGE_PREFIX + 'history_' + roomCode);
    if (raw) {
      try {
        state.messages = JSON.parse(raw);
      } catch (e) {
        state.messages = [];
      }
    } else {
      state.messages = [];
    }

    // 2. Query Server API for cloud memory
    try {
      const res = await fetch(`/api/messages?room=${encodeURIComponent(roomCode)}`);
      if (res.ok) {
        const serverMsgs = await res.json();
        if (Array.isArray(serverMsgs) && serverMsgs.length > 0) {
          // Merge deduplicated
          const existingIds = new Set(state.messages.map(m => m.id));
          serverMsgs.forEach(sm => {
            if (!existingIds.has(sm.id)) {
              state.messages.push(sm);
            }
          });
          state.messages.sort((a, b) => a.timestamp - b.timestamp);
          persistRoomMessages(false);
        }
      }
    } catch (e) {
      // Offline mode or standalone static file
    }

    renderAllMessages();
  }

  function persistRoomMessages(syncServer = true) {
    if (!state.currentRoom) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'history_' + state.currentRoom, JSON.stringify(state.messages));
    } catch (e) {
      console.warn('Storage quota limit, keeping local memory in RAM', e);
    }
  }

  function saveMessageToServer(msg) {
    if (!state.currentRoom) return;
    fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: state.currentRoom, message: msg })
    }).catch(() => {});
  }

  // --- Recent Rooms Management in Sidebar ---
  function loadRecentRooms() {
    const raw = localStorage.getItem(STORAGE_PREFIX + 'recent_rooms');
    if (raw) {
      try {
        state.recentRooms = JSON.parse(raw);
      } catch (e) {
        state.recentRooms = [];
      }
    }
  }

  function addRecentRoom(code) {
    if (!state.recentRooms.includes(code)) {
      state.recentRooms.unshift(code);
      if (state.recentRooms.length > 8) state.recentRooms.pop();
      localStorage.setItem(STORAGE_PREFIX + 'recent_rooms', JSON.stringify(state.recentRooms));
      renderRecentRoomsUI();
    }
  }

  function renderRecentRoomsUI() {
    dom.chatList.innerHTML = '';
    const roomsToShow = state.recentRooms.length > 0 ? state.recentRooms : [state.currentRoom || 'TELE-CHAT'];

    roomsToShow.forEach(room => {
      const isActive = (room === state.currentRoom);
      const item = document.createElement('div');
      item.className = `chat-item ${isActive ? 'active' : ''}`;
      item.role = 'listitem';

      const lastMsg = (isActive && state.messages.length > 0)
        ? state.messages[state.messages.length - 1].text || '[Archivo adjunto]'
        : 'Conectado por código';

      item.innerHTML = `
        <div class="avatar-wrapper">
          <div class="avatar" style="background: ${isActive ? 'var(--color-primary)' : 'var(--bg-card)'}">
            ${room.slice(-2)}
          </div>
          <span class="status-dot ${isActive ? '' : 'offline'}"></span>
        </div>
        <div class="chat-info">
          <div class="chat-title-row">
            <span class="chat-title">Sala ${sanitizeHTML(room)}</span>
            <span class="chat-time">${isActive ? 'Ahora' : ''}</span>
          </div>
          <div class="chat-subtitle-row">
            <span class="chat-snippet">${sanitizeHTML(lastMsg)}</span>
          </div>
        </div>
      `;

      item.addEventListener('click', () => {
        if (room !== state.currentRoom) {
          connectToRoom(room);
        }
      });

      dom.chatList.appendChild(item);
    });
  }

  // --- Real-Time SSE Server Connection ---
  function setupServerSSE(roomCode) {
    if (state.eventSource) {
      state.eventSource.close();
      state.eventSource = null;
    }

    try {
      state.eventSource = new EventSource(`/api/stream?room=${encodeURIComponent(roomCode)}`);

      state.eventSource.addEventListener('message', (e) => {
        try {
          const msg = JSON.parse(e.data);
          handleIncomingChatMessage(msg);
        } catch (err) {}
      });

      state.eventSource.addEventListener('reaction', (e) => {
        try {
          const data = JSON.parse(e.data);
          applyReaction(data.messageId, data.emoji, false);
        } catch (err) {}
      });

      state.eventSource.addEventListener('receipt', (e) => {
        try {
          const data = JSON.parse(e.data);
          markMessageAsRead(data.messageId, false);
        } catch (err) {}
      });

      state.eventSource.addEventListener('clear', () => {
        state.messages = [];
        persistRoomMessages(false);
        renderAllMessages();
        showToast('Conversación limpiada en el servidor');
      });
    } catch (e) {
      // SSE not available (e.g., direct file:// opening)
    }
  }

  // --- WebRTC Peer-to-Peer & Cloud Sync Connection ---
  function connectToRoom(rawCode) {
    const roomCode = (rawCode || 'TELE-CHAT').trim().toUpperCase().replace(/\s+/g, '-');
    state.currentRoom = roomCode;
    addRecentRoom(roomCode);

    // Salvaguarda: si PeerJS aún no terminó de evaluarse (carga diferida), esperar 150ms
    if (typeof Peer === 'undefined') {
      setTimeout(() => connectToRoom(rawCode), 150);
      return;
    }

    // Update URL param without full reload
    const url = new URL(window.location);
    url.searchParams.set('room', roomCode);
    window.history.replaceState({}, '', url);

    // Update UI Badges
    dom.roomCodeBadge.textContent = `Código: ${roomCode}`;
    dom.modalRoomCode.textContent = roomCode;
    dom.headerRoomName.textContent = `Sala: ${roomCode}`;
    renderRecentRoomsUI();

    loadRoomMessages(roomCode);
    setupServerSSE(roomCode);

    // BroadcastChannel for instant local same-browser multi-tab sync
    if (state.broadcastChannel) {
      state.broadcastChannel.close();
    }
    state.broadcastChannel = new BroadcastChannel('telechat_room_' + roomCode);
    state.broadcastChannel.onmessage = (ev) => {
      handleIncomingPacket(ev.data, null);
    };

    // Close any prior PeerJS instance
    if (state.peerInstance) {
      state.peerInstance.destroy();
      state.peerInstance = null;
    }
    state.peers.clear();
    updateConnectionStatus('Conectando a la nube...');

    const hostPeerId = `tchat_${roomCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    // Attempt to register as Host
    try {
      const peer = new Peer(hostPeerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      peer.on('open', () => {
        state.isHost = true;
        state.peerInstance = peer;
        updateConnectionStatus('Esperando que otro usuario ingrese el código...');
        showToast(`Sala lista: ${roomCode}. ¡Comparte el código!`);
      });

      peer.on('connection', (conn) => {
        setupPeerEvents(conn);
      });

      peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          connectAsClientPeer(hostPeerId, roomCode);
        } else {
          updateConnectionStatus('Modo local y nube activo');
        }
      });
    } catch (e) {
      updateConnectionStatus('Modo local y nube activo');
    }
  }

  function connectAsClientPeer(hostPeerId, roomCode) {
    state.isHost = false;
    const clientPeerId = `tchat_cli_${state.currentUser.id}_${Math.random().toString(36).substr(2, 4)}`;

    try {
      const clientPeer = new Peer(clientPeerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      clientPeer.on('open', () => {
        state.peerInstance = clientPeer;
        const conn = clientPeer.connect(hostPeerId, { reliable: true });
        setupPeerEvents(conn);
      });

      clientPeer.on('connection', (incomingConn) => {
        setupPeerEvents(incomingConn);
      });

      clientPeer.on('error', () => {
        updateConnectionStatus('En línea (Sincronizado vía Nube)');
      });
    } catch (e) {
      updateConnectionStatus('En línea (Sincronizado vía Nube)');
    }
  }

  function setupPeerEvents(conn) {
    conn.on('open', () => {
      state.peers.set(conn.peer, conn);
      updateConnectionStatus('En línea — Conectado con usuario');
      showToast('¡Otro usuario se unió a la conversación!');

      conn.send({
        type: 'HANDSHAKE',
        user: state.currentUser,
        history: state.isHost ? state.messages : null
      });
    });

    conn.on('data', (packet) => {
      handleIncomingPacket(packet, conn);
    });

    conn.on('close', () => {
      state.peers.delete(conn.peer);
      if (state.peers.size === 0) {
        updateConnectionStatus('Esperando al otro usuario...');
      }
    });

    conn.on('error', () => {
      state.peers.delete(conn.peer);
    });
  }

  function updateConnectionStatus(text) {
    dom.headerStatusText.textContent = text;
    if (text.includes('En línea') || text.includes('Conectado')) {
      dom.headerStatusIndicator.classList.add('online');
    } else {
      dom.headerStatusIndicator.classList.remove('online');
    }
  }

  // --- Packet Broadcast & Dispatcher ---
  function broadcastPacket(packet) {
    state.peers.forEach((conn) => {
      if (conn.open) {
        try { conn.send(packet); } catch (e) {}
      }
    });

    if (state.broadcastChannel) {
      state.broadcastChannel.postMessage(packet);
    }
  }

  function handleIncomingPacket(packet, sourceConn) {
    if (!packet || !packet.type) return;

    switch (packet.type) {
      case 'HANDSHAKE':
        if (packet.user) {
          dom.headerRoomName.textContent = packet.user.name;
          dom.headerAvatar.textContent = getInitials(packet.user.name);
          dom.headerAvatar.style.background = packet.user.color || '#65c466';
        }
        if (packet.history && Array.isArray(packet.history) && state.messages.length === 0) {
          state.messages = packet.history;
          persistRoomMessages();
          renderAllMessages();
        }
        break;

      case 'CHAT_MESSAGE':
        handleIncomingChatMessage(packet.message, sourceConn, packet);
        break;

      case 'READ_RECEIPT':
        markMessageAsRead(packet.messageId);
        break;

      case 'REACTION':
        applyReaction(packet.messageId, packet.emoji);
        break;

      case 'TYPING':
        if (packet.userId !== state.currentUser.id) {
          showRemoteTyping(packet.userName);
        }
        break;

      case 'CLEAR_CHAT':
        state.messages = [];
        persistRoomMessages();
        renderAllMessages();
        showToast('Conversación limpiada');
        break;
    }
  }

  function handleIncomingChatMessage(incomingMsg, sourceConn = null, packet = null) {
    if (!incomingMsg || !incomingMsg.id) return;

    if (!state.messages.some(m => m.id === incomingMsg.id)) {
      state.messages.push(incomingMsg);
      persistRoomMessages();
      appendMessageToDOM(incomingMsg);
      SoundFX.playReceive();

      // If Host, relay to other peers
      if (state.isHost && sourceConn && packet) {
        state.peers.forEach((c) => {
          if (c.peer !== sourceConn.peer && c.open) {
            c.send(packet);
          }
        });
      }

      // Send read receipt back
      broadcastPacket({
        type: 'READ_RECEIPT',
        messageId: incomingMsg.id
      });
    }
  }

  function showRemoteTyping(remoteName) {
    dom.typingText.textContent = `${remoteName || 'El otro usuario'} está escribiendo...`;
    dom.typingIndicatorBar.classList.remove('hidden');

    clearTimeout(state.remoteTypingTimeout);
    state.remoteTypingTimeout = setTimeout(() => {
      dom.typingIndicatorBar.classList.add('hidden');
    }, 2000);
  }

  // --- Message Sending Logic ---
  function sendMessage() {
    const text = dom.messageInput.value.trim();
    const attachment = state.pendingAttachment;

    if (!text && !attachment) return;

    const newMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      senderId: state.currentUser.id,
      senderName: state.currentUser.name,
      senderColor: state.currentUser.color,
      text: text,
      timestamp: Date.now(),
      status: 'sent',
      attachment: attachment ? { ...attachment } : null,
      reactions: {}
    };

    state.messages.push(newMsg);
    persistRoomMessages();
    saveMessageToServer(newMsg);

    appendMessageToDOM(newMsg);
    SoundFX.playSend();

    broadcastPacket({
      type: 'CHAT_MESSAGE',
      message: newMsg
    });

    dom.messageInput.value = '';
    dom.messageInput.style.height = 'auto';
    clearAttachment();
    updateActionBtnState();
    renderRecentRoomsUI();
  }

  function markMessageAsRead(messageId, syncServer = true) {
    const msg = state.messages.find(m => m.id === messageId);
    if (msg) {
      msg.status = 'read';
      persistRoomMessages();
      const el = document.getElementById(messageId);
      if (el) {
        const checks = el.querySelector('.msg-checks');
        if (checks) checks.textContent = '✓✓';
      }
      if (syncServer && state.currentRoom) {
        fetch('/api/receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room: state.currentRoom, messageId })
        }).catch(() => {});
      }
    }
  }

  function applyReaction(messageId, emoji, syncServer = true) {
    const msg = state.messages.find(m => m.id === messageId);
    if (msg) {
      msg.reactions = msg.reactions || {};
      msg.reactions[emoji] = (msg.reactions[emoji] || 0) + 1;
      persistRoomMessages();
      const el = document.getElementById(messageId);
      if (el) {
        renderReactionsInMessage(el, msg);
      }
      if (syncServer && state.currentRoom) {
        fetch('/api/reaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room: state.currentRoom, messageId, emoji })
        }).catch(() => {});
      }
    }
  }

  // --- DOM Rendering for Messages (Telegram Style) ---
  function renderAllMessages() {
    const rows = dom.messagesContainer.querySelectorAll('.message-row');
    rows.forEach(r => r.remove());

    state.messages.forEach(msg => {
      appendMessageToDOM(msg, false);
    });

    scrollToBottom();
  }

  function appendMessageToDOM(msg, scroll = true) {
    const isMe = (msg.senderId === state.currentUser.id);

    const row = document.createElement('div');
    row.id = msg.id;
    row.className = `message-row ${isMe ? 'msg-outgoing' : 'msg-incoming'}`;

    let avatarHTML = '';
    if (!isMe) {
      avatarHTML = `
        <div class="msg-avatar" style="background: ${msg.senderColor || '#65c466'}">
          ${getInitials(msg.senderName)}
        </div>
      `;
    }

    let attachmentHTML = '';
    if (msg.attachment) {
      const att = msg.attachment;
      if (att.type === 'image') {
        attachmentHTML = `
          <div class="msg-image-wrapper">
            <img src="${att.dataUrl}" alt="${sanitizeHTML(att.name || 'Imagen')}" loading="lazy">
          </div>
        `;
      } else if (att.type === 'voice') {
        attachmentHTML = createVoicePlayerHTML(att);
      } else if (att.type === 'file') {
        attachmentHTML = `
          <div class="msg-file-card">
            <div class="file-badge-icon">📄</div>
            <div class="file-info">
              <div class="file-name">${sanitizeHTML(att.name)}</div>
              <div class="file-size">${formatFileSize(att.size || 0)}</div>
            </div>
            <a class="file-download-btn" href="${att.dataUrl}" download="${sanitizeHTML(att.name)}" title="Descargar">
              ⬇
            </a>
          </div>
        `;
      }
    }

    let authorHeaderHTML = '';
    if (!isMe) {
      authorHeaderHTML = `<div class="msg-author" style="color: ${msg.senderColor || '#65c466'}">${sanitizeHTML(msg.senderName)}</div>`;
    }

    let textHTML = '';
    if (msg.text) {
      textHTML = `<div class="msg-text">${renderMarkdownText(msg.text)}</div>`;
    }

    const checksSymbol = isMe ? (msg.status === 'read' ? '✓✓' : '✓') : '';

    row.innerHTML = `
      ${avatarHTML}
      <div class="message-bubble">
        ${authorHeaderHTML}
        ${attachmentHTML}
        ${textHTML}
        <div class="msg-meta">
          <span class="msg-time">${formatTime(msg.timestamp)}</span>
          ${isMe ? `<span class="msg-checks">${checksSymbol}</span>` : ''}
        </div>
        <div class="reactions-bar"></div>
      </div>
    `;

    // Bind Image Click for Lightbox
    const imgEl = row.querySelector('.msg-image-wrapper img');
    if (imgEl) {
      imgEl.addEventListener('click', () => {
        openLightbox(imgEl.src);
      });
    }

    // Bind Voice Playback if present
    const playBtn = row.querySelector('.voice-play-btn');
    if (playBtn && msg.attachment && msg.attachment.dataUrl) {
      initVoicePlayback(row, msg.attachment.dataUrl);
    }

    renderReactionsInMessage(row, msg);

    // Double click to react ❤️
    row.addEventListener('dblclick', () => {
      applyReaction(msg.id, '❤️');
      broadcastPacket({
        type: 'REACTION',
        messageId: msg.id,
        emoji: '❤️'
      });
    });

    dom.messagesContainer.appendChild(row);

    if (scroll) {
      scrollToBottom();
    }
  }

  function renderReactionsInMessage(rowEl, msg) {
    const bar = rowEl.querySelector('.reactions-bar');
    if (!bar) return;
    bar.innerHTML = '';
    if (!msg.reactions) return;

    Object.entries(msg.reactions).forEach(([emoji, count]) => {
      if (count > 0) {
        const pill = document.createElement('span');
        pill.className = 'reaction-pill';
        pill.textContent = `${emoji} ${count}`;
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          applyReaction(msg.id, emoji);
          broadcastPacket({
            type: 'REACTION',
            messageId: msg.id,
            emoji: emoji
          });
        });
        bar.appendChild(pill);
      }
    });
  }

  function scrollToBottom() {
    dom.messagesContainer.scrollTop = dom.messagesContainer.scrollHeight;
  }

  // --- Voice Note Audio Player (Telegram Waveform) ---
  function createVoicePlayerHTML(att) {
    const barsCount = 28;
    let barsHTML = '';
    for (let i = 0; i < barsCount; i++) {
      const h = Math.floor(6 + Math.random() * 18);
      barsHTML += `<span class="waveform-bar" style="height: ${h}px;"></span>`;
    }

    return `
      <div class="msg-voice-card">
        <button class="voice-play-btn" aria-label="Reproducir nota de voz">
          ▶
        </button>
        <div class="voice-waveform-container">
          ${barsHTML}
        </div>
        <span class="voice-duration">${att.duration || '0:00'}</span>
      </div>
    `;
  }

  // --- Shared Global Audio Player (Memory-Efficient) ---
  let activeAudio = null;
  let activeAudioBtn = null;
  let activeAudioBars = null;

  function stopActiveAudio() {
    if (activeAudio) {
      activeAudio.pause();
      if (activeAudioBtn) activeAudioBtn.textContent = '▶';
      if (activeAudioBars) activeAudioBars.forEach(b => b.classList.remove('played'));
      activeAudio = null;
      activeAudioBtn = null;
      activeAudioBars = null;
    }
  }

  function initVoicePlayback(rowEl, audioUrl) {
    const btn = rowEl.querySelector('.voice-play-btn');
    const bars = rowEl.querySelectorAll('.waveform-bar');

    btn.addEventListener('click', () => {
      if (activeAudio && activeAudioBtn === btn) {
        if (!activeAudio.paused) {
          activeAudio.pause();
          btn.textContent = '▶';
        } else {
          activeAudio.play();
          btn.textContent = '⏸';
        }
        return;
      }

      stopActiveAudio();
      const audio = new Audio(audioUrl);
      activeAudio = audio;
      activeAudioBtn = btn;
      activeAudioBars = bars;

      audio.play().catch(() => {});
      btn.textContent = '⏸';

      audio.ontimeupdate = () => {
        const progress = audio.currentTime / (audio.duration || 1);
        const playedBars = Math.floor(progress * bars.length);
        bars.forEach((bar, idx) => {
          if (idx <= playedBars) {
            bar.classList.add('played');
          } else {
            bar.classList.remove('played');
          }
        });
      };

      audio.onended = () => {
        btn.textContent = '▶';
        bars.forEach(b => b.classList.remove('played'));
        stopActiveAudio();
      };
    });
  }

  // --- Voice Recording via MediaRecorder with Safari/iOS fallback ---
  async function startVoiceRecording() {
    try {
      SoundFX.playRecordStart();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.audioChunks = [];

      // Determine supported MIME type
      let mimeType = 'audio/webm';
      if (window.MediaRecorder && !MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          mimeType = 'audio/aac';
        } else {
          mimeType = '';
        }
      }

      state.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      state.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) state.audioChunks.push(e.data);
      };

      state.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(state.audioChunks, { type: mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const durationSec = Math.max(1, Math.round((Date.now() - state.recordStartTime) / 1000));
          const mins = Math.floor(durationSec / 60);
          const secs = (durationSec % 60).toString().padStart(2, '0');

          state.pendingAttachment = {
            type: 'voice',
            name: `nota_de_voz_${Date.now()}.webm`,
            dataUrl: reader.result,
            duration: `${mins}:${secs}`
          };
          sendMessage();
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };

      state.mediaRecorder.start();
      state.recordStartTime = Date.now();

      dom.voiceRecordingOverlay.classList.remove('hidden');
      dom.messageInput.classList.add('hidden');
      dom.actionBtn.classList.add('recording');

      state.recordInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.recordStartTime) / 1000);
        const m = Math.floor(elapsed / 60);
        const s = (elapsed % 60).toString().padStart(2, '0');
        dom.recordingTimer.textContent = `${m}:${s}`;
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      showToast('Permiso de micrófono no disponible');
      stopVoiceRecording(false);
    }
  }

  function stopVoiceRecording(save = true) {
    clearInterval(state.recordInterval);
    dom.voiceRecordingOverlay.classList.add('hidden');
    dom.messageInput.classList.remove('hidden');
    dom.actionBtn.classList.remove('recording');

    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      if (!save) {
        state.mediaRecorder.onstop = null;
        state.mediaRecorder.stop();
      } else {
        state.mediaRecorder.stop();
      }
    }
    state.mediaRecorder = null;
  }

  // --- Attachments Handling (Images & Documents) with Image Auto-Compression ---
  function compressImageIfNeeded(file, maxDimension = 1280, quality = 0.85) {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.size < 600 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
        return;
      }

      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleSelectedFile(file) {
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const dataUrl = await compressImageIfNeeded(file);

    state.pendingAttachment = {
      type: isImage ? 'image' : 'file',
      name: file.name,
      size: file.size,
      dataUrl: dataUrl
    };

    dom.previewItemContent.innerHTML = isImage
      ? `<img class="preview-thumb" src="${dataUrl}"> <span>${sanitizeHTML(file.name)}</span>`
      : `<span>📄 ${sanitizeHTML(file.name)} (${formatFileSize(file.size)})</span>`;

    dom.attachmentPreviewBar.classList.remove('hidden');
    updateActionBtnState();
    dom.attachMenu.classList.add('hidden');
  }

  function clearAttachment() {
    state.pendingAttachment = null;
    dom.attachmentPreviewBar.classList.add('hidden');
    dom.previewItemContent.innerHTML = '';
    dom.imageFileInput.value = '';
    dom.docFileInput.value = '';
    dom.audioFileInput.value = '';
    updateActionBtnState();
  }

  function updateActionBtnState() {
    const hasContent = dom.messageInput.value.trim().length > 0 || state.pendingAttachment !== null;
    if (hasContent) {
      dom.micIcon.classList.add('hidden');
      dom.sendIcon.classList.remove('hidden');
      dom.actionBtn.title = 'Enviar mensaje';
    } else {
      dom.micIcon.classList.remove('hidden');
      dom.sendIcon.classList.add('hidden');
      dom.actionBtn.title = 'Grabar nota de voz';
    }
  }

  // --- Lightbox Viewer ---
  function openLightbox(src) {
    dom.lightboxImage.src = src;
    dom.lightboxDownloadLink.href = src;
    dom.lightboxOverlay.classList.remove('hidden');
  }

  function closeLightbox() {
    dom.lightboxOverlay.classList.add('hidden');
    dom.lightboxImage.src = '';
  }

  // --- In-Chat Search Logic ---
  function handleInChatSearch(query) {
    const cleanQuery = query.toLowerCase().trim();
    const rows = dom.messagesContainer.querySelectorAll('.message-row');
    let matches = 0;

    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      if (!cleanQuery || text.includes(cleanQuery)) {
        row.style.display = 'flex';
        if (cleanQuery && text.includes(cleanQuery)) matches++;
      } else {
        row.style.display = 'none';
      }
    });

    dom.searchMatchesCount.textContent = cleanQuery ? `${matches} encontrados` : '';
  }

  // --- Event Listeners Setup ---
  function setupEvents() {
    let lastTypingTime = 0;

    dom.messageInput.addEventListener('input', () => {
      // Evitar layout thrashing si el contenido sigue en una sola línea
      if (dom.messageInput.scrollHeight > 46 || dom.messageInput.style.height !== '') {
        dom.messageInput.style.height = 'auto';
        dom.messageInput.style.height = Math.min(dom.messageInput.scrollHeight, 120) + 'px';
      }
      updateActionBtnState();

      // Throttle typing packets to at most once every 1200ms
      const now = Date.now();
      if (now - lastTypingTime > 1200) {
        lastTypingTime = now;
        broadcastPacket({
          type: 'TYPING',
          userId: state.currentUser.id,
          userName: state.currentUser.name
        });
      }
    });

    dom.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    dom.actionBtn.addEventListener('click', () => {
      const hasContent = dom.messageInput.value.trim().length > 0 || state.pendingAttachment !== null;
      if (hasContent) {
        sendMessage();
      } else {
        if (!state.mediaRecorder) {
          startVoiceRecording();
        } else {
          stopVoiceRecording(true);
        }
      }
    });

    dom.cancelVoiceBtn.addEventListener('click', () => {
      stopVoiceRecording(false);
    });

    // Attachments Dropdown
    dom.attachBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dom.attachMenu.classList.toggle('hidden');
      dom.quickEmojisMenu.classList.add('hidden');
    });

    dom.imageFileInput.addEventListener('change', (e) => handleSelectedFile(e.target.files[0]));
    dom.docFileInput.addEventListener('change', (e) => handleSelectedFile(e.target.files[0]));
    dom.audioFileInput.addEventListener('change', (e) => handleSelectedFile(e.target.files[0]));
    dom.cancelAttachmentBtn.addEventListener('click', clearAttachment);

    // Emoji Picker
    dom.emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dom.quickEmojisMenu.classList.toggle('hidden');
      dom.attachMenu.classList.add('hidden');
    });

    dom.quickEmojisMenu.querySelectorAll('.emoji-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        dom.messageInput.value += opt.textContent;
        dom.quickEmojisMenu.classList.add('hidden');
        updateActionBtnState();
        dom.messageInput.focus();
      });
    });

    document.addEventListener('click', () => {
      dom.attachMenu.classList.add('hidden');
      dom.quickEmojisMenu.classList.add('hidden');
    });

    // In-Chat Search Bar Toggle & Inputs
    if (dom.toggleSearchBtn) {
      dom.toggleSearchBtn.addEventListener('click', () => {
        dom.chatSearchBar.classList.toggle('hidden');
        if (!dom.chatSearchBar.classList.contains('hidden')) {
          dom.inChatSearchInput.focus();
        } else {
          handleInChatSearch('');
        }
      });
    }

    if (dom.closeSearchBtn) {
      dom.closeSearchBtn.addEventListener('click', () => {
        dom.chatSearchBar.classList.add('hidden');
        dom.inChatSearchInput.value = '';
        handleInChatSearch('');
      });
    }

    if (dom.inChatSearchInput) {
      dom.inChatSearchInput.addEventListener('input', (e) => {
        handleInChatSearch(e.target.value);
      });
    }

    // Drag and drop support
    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dom.dragDropOverlay.classList.remove('hidden');
    });

    dom.dragDropOverlay.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dom.dragDropOverlay.classList.add('hidden');
    });

    dom.dragDropOverlay.addEventListener('dragover', (e) => e.preventDefault());

    dom.dragDropOverlay.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.dragDropOverlay.classList.add('hidden');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleSelectedFile(e.dataTransfer.files[0]);
      }
    });

    // Clipboard paste (Ctrl+V) images
    window.addEventListener('paste', (e) => {
      if (e.clipboardData && e.clipboardData.files.length > 0) {
        handleSelectedFile(e.clipboardData.files[0]);
      }
    });

    // Theme Toggle
    dom.themeToggleBtn.addEventListener('click', () => {
      const current = dom.html.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      dom.html.setAttribute('data-theme', next);
      localStorage.setItem(STORAGE_PREFIX + 'theme', next);
    });

    const savedTheme = localStorage.getItem(STORAGE_PREFIX + 'theme');
    if (savedTheme) {
      dom.html.setAttribute('data-theme', savedTheme);
    }

    // Sidebar Mobile Toggle
    dom.sidebarToggleBtn.addEventListener('click', () => {
      dom.sidebar.classList.toggle('open');
    });

    dom.menuBtn.addEventListener('click', () => {
      dom.roomModal.classList.remove('hidden');
    });

    // Room Modal triggers
    dom.newRoomBtn.addEventListener('click', () => {
      dom.roomModal.classList.remove('hidden');
    });
    dom.joinRoomBtn.addEventListener('click', () => {
      dom.roomModal.classList.remove('hidden');
    });
    dom.closeRoomModal.addEventListener('click', () => {
      dom.roomModal.classList.add('hidden');
    });

    dom.joinRoomForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = dom.roomCodeInput.value.trim();
      if (code) {
        connectToRoom(code);
        dom.roomModal.classList.add('hidden');
        dom.roomCodeInput.value = '';
      }
    });

    dom.createRandomRoomBtn.addEventListener('click', () => {
      const code = generateRoomCode();
      connectToRoom(code);
      dom.roomModal.classList.add('hidden');
    });

    dom.shareCodeBtn.addEventListener('click', () => {
      dom.roomModal.classList.remove('hidden');
    });

    dom.copyCodeDirect.addEventListener('click', () => {
      navigator.clipboard.writeText(state.currentRoom).then(() => {
        showToast('¡Código copiado al portapapeles!');
      });
    });

    dom.copyLinkDirect.addEventListener('click', () => {
      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${state.currentRoom}`;
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('¡Enlace de invitación copiado!');
      });
    });

    // Profile Modal
    dom.openProfileBtn.addEventListener('click', () => {
      dom.profileModal.classList.remove('hidden');
    });
    dom.myAvatarPreview.addEventListener('click', () => {
      dom.profileModal.classList.remove('hidden');
    });
    dom.closeProfileModal.addEventListener('click', () => {
      dom.profileModal.classList.add('hidden');
    });

    dom.avatarColorPalette.querySelectorAll('.color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        state.currentUser.color = dot.getAttribute('data-color');
        renderUserProfileUI();
      });
    });

    dom.saveProfileBtn.addEventListener('click', () => {
      const name = dom.userDisplayNameInput.value.trim();
      if (name) {
        state.currentUser.name = name;
        saveUserProfile();
        renderUserProfileUI();
        dom.profileModal.classList.add('hidden');
        showToast('Perfil actualizado');

        broadcastPacket({
          type: 'HANDSHAKE',
          user: state.currentUser
        });
      }
    });

    // Lightbox close
    dom.closeLightboxBtn.addEventListener('click', closeLightbox);
    dom.lightboxOverlay.addEventListener('click', (e) => {
      if (e.target === dom.lightboxOverlay) closeLightbox();
    });

    // Clear chat
    dom.clearChatBtn.addEventListener('click', async () => {
      if (confirm('¿Seguro que deseas vaciar los mensajes de esta sala?')) {
        state.messages = [];
        persistRoomMessages();
        renderAllMessages();
        broadcastPacket({ type: 'CLEAR_CHAT' });
        try {
          await fetch('/api/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room: state.currentRoom })
          });
        } catch (e) {}
        showToast('Historial limpiado');
      }
    });

    // Sidebar search filter for recent rooms
    dom.searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const items = dom.chatList.querySelectorAll('.chat-item');
      items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = (!query || text.includes(query)) ? 'flex' : 'none';
      });
    });
  }

  // --- Application Bootstrapping ---
  function init() {
    loadUserProfile();
    loadRecentRooms();
    setupEvents();

    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    const initialRoom = roomFromUrl || generateRoomCode();

    connectToRoom(initialRoom);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
