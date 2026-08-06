let currentUser = null;
let activeChatId = null;
let isRegistering = false;
let lastMessageId = 0;
let pollInterval = null;
let pendingFile = null;
let replyToMsg = null;
let allChats = [];
let msgPage = 1;
let msgTotal = 0;
let lastTypingSent = 0;
let mediaRecorder = null;
let recording = false;
let recTimer = null;
let forwardMsgId = null;
let reactTarget = null;
let groupManageMode = 'add';
let pinnedMsgId = null;
let profileUserId = null;
let profileUserChatId = null;
let pollOptionCount = 2;

function $(id) { return document.getElementById(id); }

function showToast(msg) {
    const t = $('toast');
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => t.style.display = 'none', 3000);
}

function toggleAuth() {
    isRegistering = !isRegistering;
    $('authBtn').textContent = isRegistering ? 'Register' : 'Sign In';
    $('authBtn').onclick = isRegistering ? register : login;
    document.querySelector('.auth-switch').textContent =
        isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Register";
}

async function api(url, opts = {}) {
    opts.credentials = 'include';
    const res = await fetch(url, opts);
    if (res.status === 401) { logout(true); throw new Error('Not authenticated'); }
    return res;
}

async function login() {
    const username = $('authUsername').value.trim();
    const password = $('authPassword').value;
    $('authError').textContent = '';
    try {
        const res = await fetch('/api/login', {
            method: 'POST', credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password})
        });
        const data = await res.json();
        if (!res.ok) { $('authError').textContent = data.error; return; }
        currentUser = data.user;
        initApp();
    } catch (e) { $('authError').textContent = 'Connection error'; }
}

async function register() {
    const username = $('authUsername').value.trim();
    const password = $('authPassword').value;
    $('authError').textContent = '';
    try {
        const res = await fetch('/api/register', {
            method: 'POST', credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password})
        });
        const data = await res.json();
        if (!res.ok) { $('authError').textContent = data.error; return; }
        currentUser = data.user;
        initApp();
    } catch (e) { $('authError').textContent = 'Connection error'; }
}

async function logout(silent) {
    if (!silent) await fetch('/api/logout', {method: 'POST', credentials: 'include'});
    if (pollInterval) clearInterval(pollInterval);
    currentUser = null; activeChatId = null; lastMessageId = 0; pendingFile = null; replyToMsg = null;
    $('authModal').style.display = 'flex';
    $('app').style.display = 'none';
}

async function initApp() {
    $('authModal').style.display = 'none';
    $('app').style.display = 'flex';
    $('currentUsername').textContent = currentUser.username;
    updateMyAvatar();
    await loadChats();
}

function updateMyAvatar() {
    const a = $('myAvatar');
    if (currentUser?.avatar) {
        a.innerHTML = `<img src="${currentUser.avatar}">`;
    } else {
        a.textContent = (currentUser?.username || '?')[0].toUpperCase();
        a.style.background = avatarColor(currentUser?.id || 0);
    }
}

function avatarColor(id) {
    const colors = ['#2AABEE','#E53935','#43A047','#FB8C00','#8E24AA','#00ACC1','#F4511E','#3949AB'];
    return colors[id % colors.length];
}

function isMobile() { return window.innerWidth <= 768; }

function showSidebar() {
    document.querySelector('aside').classList.remove('hidden');
    if (isMobile()) {
        $('chatView').style.display = 'none';
        $('noChat').style.display = 'flex';
    }
}

function showChatView() {
    if (isMobile()) document.querySelector('aside').classList.add('hidden');
}

// ==================== CHATS ====================

async function loadChats() {
    try {
        const res = await api('/api/chats');
        const data = await res.json();
        allChats = data.chats || [];
        renderChatList(allChats);
    } catch (e) { if (e.message !== 'Not authenticated') showToast('Failed to load chats'); }
}

function renderChatList(chats) {
    const list = $('chatList'); list.innerHTML = '';
    if (!chats.length) {
        list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:14px">No chats yet</div>';
        return;
    }
    chats.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'chat-item' + (chat.id === activeChatId ? ' active' : '');
        div.dataset.chatId = chat.id;

        const other = chat.members.find(m => m.id !== currentUser?.id);
        const isChannel = chat.type === 'channel';
        const name = chat.name || other?.username || 'Saved Messages';
        const initial = (name[0] || '#').toUpperCase();
        const isOnline = other?.online_status === 'online' && !isChannel;
        const last = chat.last_message || {};
        const time = last.created_at ? formatTime(last.created_at) : '';
        const unread = chat.unread_count || 0;

        let avatarHtml;
        if (isChannel) {
            avatarHtml = '<div class="avatar" style="background:var(--bg-search)">📢</div>';
        } else if (other?.avatar) {
            avatarHtml = `<div class="avatar ${isOnline ? 'online-dot' : ''}"><img src="${other.avatar}"></div>`;
        } else {
            avatarHtml = `<div class="avatar ${isOnline ? 'online-dot' : ''}" style="background:${avatarColor(chat.id)}">${initial}</div>`;
        }

        let lastText = last.poll ? '📊 Poll' : (last.text || last.file_type || 'No messages yet');
        if (last.is_scheduled) lastText = '⏰ ' + lastText;

        div.innerHTML = avatarHtml + `
            <div class="chat-preview">
                <div class="chat-top">
                    <span class="chat-name">${esc(name)}${isChannel ? '<span class="channel-tag">CH</span>' : ''}</span>
                    <span class="chat-time">${time}</span>
                </div>
                <div class="chat-bottom">
                    <span class="chat-msg">${esc(lastText)}</span>
                    ${unread ? `<span class="chat-unread">${unread > 99 ? '99+' : unread}</span>` : ''}
                </div>
            </div>
        `;
        div.onclick = () => selectChat(chat);
        list.appendChild(div);
    });
}

function filterChats(type) {
    if (type === 'all') renderChatList(allChats);
    else renderChatList(allChats.filter(c => c.type === type));
}

async function selectChat(chat) {
    activeChatId = chat.id;
    showChatView();
    lastMessageId = 0;
    if (replyToMsg) cancelReply();

    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const el = document.querySelector(`.chat-item[data-chat-id="${chat.id}"]`);
    if (el) el.classList.add('active');

    const other = chat.members.find(m => m.id !== currentUser?.id);
    const isChannel = chat.type === 'channel';
    const name = chat.name || other?.username || 'Saved Messages';
    const isOnline = other?.online_status === 'online' && !isChannel;

    $('noChat').style.display = 'none';
    $('chatView').style.display = 'flex';
    $('chatName').textContent = name;
    if (isChannel) {
        $('chatStatus').textContent = (chat.is_owner ? 'Owner · ' : '') + (chat.members?.length || 0) + ' subscribers';
        $('chatStatus').className = 'status';
    } else {
        $('chatStatus').textContent = isOnline ? 'online' : 'offline';
        $('chatStatus').className = 'status ' + (isOnline ? 'online' : 'offline');
    }

    const ca = $('chatAvatar');
    if (isChannel) {
        ca.textContent = '📢';
        ca.style.background = 'var(--bg-search)';
        ca.className = 'avatar small';
    } else if (other?.avatar) {
        ca.innerHTML = `<img src="${other.avatar}">`;
        ca.className = 'avatar small';
    } else {
        ca.textContent = (name[0] || '#').toUpperCase();
        ca.style.background = avatarColor(chat.id);
        ca.className = 'avatar small';
    }
    if (isOnline) ca.classList.add('online-dot');

    $('inputBar').style.display = (isChannel && !chat.is_owner) ? 'none' : 'flex';
    showPinnedBar(chat);

    $('messages').innerHTML = '';
    if (pollInterval) clearInterval(pollInterval);
    msgPage = 1;
    msgTotal = 0;
    await loadMessages(chat.id);
    markRead(chat.id);
    pollInterval = setInterval(() => {
        pollNewMessages(chat.id);
        pollTyping(chat.id);
    }, 1500);
}

async function markRead(chatId) {
    try {
        await fetch(`/api/chats/${chatId}/read`, {method:'POST', credentials:'include'});
        loadChats();
    } catch (e) {}
}

function showPinnedBar(chat) {
    const bar = $('pinnedBar');
    const pin = chat?.pinned_message;
    if (!pin) { bar.style.display = 'none'; pinnedMsgId = null; return; }
    pinnedMsgId = pin.id;
    $('pinnedSender').textContent = pin.sender?.username || 'You';
    $('pinnedText').textContent = (pin.text || pin.file_type || 'Message').slice(0, 60);
    bar.style.display = 'flex';
}

// ==================== MESSAGES ====================

async function loadMessages(chatId) {
    try {
        const res = await api(`/api/chats/${chatId}/messages?page=1`);
        const data = await res.json();
        $('messages').innerHTML = '';
        (data.messages || []).forEach(appendMessage);
        if (data.messages?.length) lastMessageId = data.messages[data.messages.length - 1].id;
        msgTotal = data.total || 0;
        scrollToBottom();
    } catch (e) {}
}

async function loadOlderMessages(chatId, page) {
    try {
        const m = $('messages');
        const oldHeight = m.scrollHeight;
        const res = await api(`/api/chats/${chatId}/messages?page=${page}`);
        const data = await res.json();
        const items = data.messages || [];
        if (!items.length) return;
        const frag = document.createDocumentFragment();
        items.forEach(msg => frag.appendChild(createMessageElement(msg)));
        m.prepend(frag);
        m.scrollTop = m.scrollHeight - oldHeight;
    } catch (e) {}
}

async function pollNewMessages(chatId) {
    try {
        const res = await api(`/api/poll/messages?chat_id=${chatId}&after=${lastMessageId}`);
        const data = await res.json();
        if (!data.messages?.length) return;
        data.messages.forEach(msg => {
            if (msg.id > lastMessageId) { appendMessage(msg); lastMessageId = msg.id; }
        });
        scrollToBottom();
        loadChats();
        if (chatId === activeChatId) markRead(chatId);
    } catch (e) {}
}

async function pollTyping(chatId) {
    try {
        const res = await fetch(`/api/poll/typing?chat_id=${chatId}`, {credentials:'include'});
        const data = await res.json();
        const st = $('chatStatus');
        if (!st || chatId !== activeChatId) return;
        const chat = allChats.find(c => c.id === chatId);
        if (chat?.type === 'channel') return;
        if (data.typing?.length) {
            st.textContent = data.typing.length === 1 ? `${data.typing[0]} typing...` : 'typing...';
            st.className = 'status typing';
        } else {
            const other = allChats.find(c => c.id === chatId)?.members.find(m => m.id !== currentUser?.id);
            const isOnline = other?.online_status === 'online';
            st.textContent = isOnline ? 'online' : 'offline';
            st.className = 'status ' + (isOnline ? 'online' : 'offline');
        }
    } catch (e) {}
}

function sendTyping() {
    if (!activeChatId) return;
    const now = Date.now();
    if (now - lastTypingSent < 2500) return;
    lastTypingSent = now;
    fetch('/api/typing', {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({chat_id: activeChatId})
    }).catch(() => {});
}

function appendMessage(msg) {
    $('messages').appendChild(createMessageElement(msg));
}

function createMessageElement(msg) {
    const isOwn = msg.sender?.id === currentUser?.id;
    const div = document.createElement('div');
    div.className = `msg ${isOwn ? 'msg-right' : 'msg-left'}` + (msg.pinned ? ' pinned-msg' : '');
    div.dataset.msgId = msg.id;

    let fileHtml = '';
    if (msg.file_path && msg.file_type) {
        if (msg.file_type === 'photo') {
            fileHtml = `<div class="msg-file"><img src="${msg.file_path}" onclick="window.open(this.src)" loading="lazy"></div>`;
        } else if (msg.file_type === 'video') {
            fileHtml = `<div class="msg-file"><video src="${msg.file_path}" controls preload="metadata" style="max-height:300px"></video></div>`;
        } else if (msg.file_type === 'audio') {
            fileHtml = `<div class="msg-file"><audio src="${msg.file_path}" controls preload="metadata" style="width:100%"></audio></div>`;
        } else if (msg.file_type === 'application') {
            const name = msg.file_path.split('/').pop();
            fileHtml = `<div class="msg-file" onclick="window.open('${msg.file_path}')"><span class="file-icon">📄</span><div class="file-info"><div class="file-name">${esc(name)}</div><div class="file-size">${msg.file_size ? (msg.file_size/1024).toFixed(1)+' KB' : ''}</div></div></div>`;
        } else {
            const name = msg.file_path.split('/').pop();
            fileHtml = `<div class="msg-file" onclick="window.open('${msg.file_path}')"><span class="file-icon">📎</span><div class="file-info"><div class="file-name">${esc(name)}</div><div class="file-size">${msg.file_size ? (msg.file_size/1024).toFixed(1)+' KB' : ''}</div></div></div>`;
        }
    }

    let replyHtml = '';
    if (msg.reply_to_data) {
        const r = msg.reply_to_data;
        replyHtml = `<div class="reply-badge" onclick="scrollToMsg(${r.id})"><span>${esc(r.sender || '')}</span><span>${esc(r.text || r.file_type || 'Message')}</span></div>`;
    }

    const edited = msg.edited ? '<span class="msg-edited">edited</span>' : '';
    const check = isOwn ? `<span class="msg-check">${msg.read ? '✓✓' : '✓'}</span>` : '';
    const time = formatTime(msg.created_at);
    const pinBadge = msg.pinned ? '<span class="pin-badge">📌</span>' : '';
    const schedBadge = msg.is_scheduled ? `<span class="sched-badge">⏰ ${formatSched(msg.scheduled_at)}</span> ` : '';

    let pollHtml = '';
    if (msg.poll) pollHtml = renderPoll(msg.poll);

    let reactionsHtml = '';
    if (msg.reactions?.length) {
        reactionsHtml = `<div class="reaction-row">${msg.reactions.map(r =>
            `<span class="reaction ${r.reacted ? 'mine' : ''}" onclick="event.stopPropagation();reactToMessage(${msg.id}, '${r.emoji}')">${r.emoji} ${r.count}</span>`
        ).join('')}</div>`;
    }

    const actions = `
        <div class="msg-actions">
            <span onclick="setReply(${msg.id})" title="Reply">💬</span>
            <span onclick="openReactions(${msg.id}, event)" title="React">😊</span>
            <span onclick="openForward(${msg.id})" title="Forward">↗️</span>
            <span onclick="togglePin(${msg.id})" title="${msg.pinned ? 'Unpin' : 'Pin'}">📌</span>
            ${isOwn ? `
            <span onclick="editMessage(${msg.id})" title="Edit">✏️</span>
            <span onclick="deleteMessage(${msg.id})" title="Delete">🗑️</span>` : ''}
        </div>
    `;

    div.innerHTML = actions + `
        <div class="msg-bubble ${replyHtml ? 'replying' : ''}">
            ${!isOwn && msg.sender ? `<div class="msg-sender">${esc(msg.sender.username)}</div>` : ''}
            ${replyHtml}
            ${fileHtml}
            ${pollHtml}
            ${msg.text ? `<div class="msg-text">${md(msg.text)}</div>` : ''}
            ${reactionsHtml}
            <div class="msg-meta">
                ${schedBadge}${pinBadge} ${edited} <span class="msg-time">${time}</span> ${check}
            </div>
        </div>
    `;

    div.onclick = (e) => {
        if (e.target.closest('.msg-actions')) return;
    };

    return div;
}

function scrollToMsg(id) {
    const el = document.querySelector(`[data-msg-id="${id}"]`);
    if (el) el.scrollIntoView({behavior:'smooth', block:'center'});
}

async function sendMessage() {
    const text = $('messageInput').value.trim();
    if (!text && !pendingFile) return;

    if (pendingFile) {
        const fd = new FormData();
        fd.append('file', pendingFile.file);
        fd.append('chat_id', activeChatId);
        if (text) fd.append('caption', text);
        if (replyToMsg) fd.append('reply_to', replyToMsg.id);
        pendingFile = null;
        cancelReply();
        try {
            const res = await api('/api/upload', {method:'POST', body:fd});
            const data = await res.json();
            if (data.error) { showToast(data.error); return; }
            if (data.message) {
                appendMessage(data.message);
                lastMessageId = data.message.id;
                scrollToBottom(); loadChats();
            }
        } catch (e) { if (e.message !== 'Not authenticated') showToast('Upload failed'); }
        return;
    }

    const payload = {chat_id: activeChatId, text};
    if (replyToMsg) payload.reply_to = replyToMsg.id;
    cancelReply();

    try {
        const res = await api('/api/send', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.error) { showToast(data.error); return; }
        if (data.message) {
            $('messageInput').value = '';
            appendMessage(data.message);
            lastMessageId = data.message.id;
            scrollToBottom(); loadChats();
        }
    } catch (e) { if (e.message !== 'Not authenticated') showToast('Failed to send'); }
}

// ==================== MESSAGE ACTIONS ====================

function setReply(msgId) {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (!el) return;
    const textEl = el.querySelector('.msg-text');
    const text = textEl ? textEl.textContent : 'Message';
    const sender = el.querySelector('.msg-sender');
    const name = sender ? sender.textContent : 'You';
    replyToMsg = {id: msgId, text: text.slice(0, 80), sender: name};
    $('replyLabel').textContent = `Replying to ${name}`;
    $('replyText').textContent = text.slice(0, 100);
    $('replyPreview').style.display = 'flex';
    $('messageInput').focus();
}

function cancelReply() {
    replyToMsg = null;
    $('replyPreview').style.display = 'none';
}

async function editMessage(msgId) {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    const textEl = el?.querySelector('.msg-text');
    const currentText = textEl ? textEl.textContent : '';
    const newText = prompt('Edit message:', currentText);
    if (!newText || newText === currentText) return;
    try {
        const res = await api(`/api/messages/${msgId}/edit`, {
            method:'PATCH', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({text: newText})
        });
        const data = await res.json();
        if (data.message) {
            el.querySelector('.msg-text').textContent = data.message.text;
            if (!el.querySelector('.msg-edited')) {
                const meta = el.querySelector('.msg-meta');
                meta.insertBefore(document.createElement('span'), meta.firstChild);
                const ed = meta.querySelector('.msg-edited') || meta.children[0];
                ed.className = 'msg-edited'; ed.textContent = 'edited';
            }
        }
    } catch (e) {}
}

async function deleteMessage(msgId) {
    if (!confirm('Delete this message?')) return;
    try {
        await api(`/api/messages/${msgId}/delete`, {method:'DELETE'});
        const el = document.querySelector(`[data-msg-id="${msgId}"]`);
        if (el) el.remove();
    } catch (e) {}
}

// ==================== UPLOAD ====================

async function uploadFile(input) {
    const file = input.files[0];
    if (!file) return;
    const type = file.type.split('/')[0] || 'application';
    pendingFile = {file, type};
    showToast(`📎 ${file.name} attached`);
    input.value = '';
}

// ==================== VOICE MESSAGES ====================

async function startRecording() {
    if (recording) return;
    if (!navigator.mediaDevices?.getUserMedia) { showToast('Mic not supported'); return; }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({audio:true});
        mediaRecorder = new MediaRecorder(stream);
        const chunks = [];
        mediaRecorder.ondataavailable = e => chunks.push(e.data);
        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            $('recordingBar').style.display = 'none';
            $('micBtn').classList.remove('active');
            clearInterval(recTimer);
            const blob = new Blob(chunks, {type:'audio/webm'});
            if (!blob.size || !activeChatId) return;
            const fd = new FormData();
            fd.append('file', blob, 'voice.webm');
            fd.append('chat_id', activeChatId);
            try {
                const res = await api('/api/upload', {method:'POST', body:fd});
                const data = await res.json();
                if (data.message) {
                    appendMessage(data.message);
                    lastMessageId = data.message.id;
                    scrollToBottom(); loadChats();
                }
            } catch (e) { if (e.message !== 'Not authenticated') showToast('Upload failed'); }
        };
        mediaRecorder.start();
        recording = true;
        $('micBtn').classList.add('active');
        $('recordingBar').style.display = 'flex';
        let secs = 0;
        recTimer = setInterval(() => {
            secs++;
            $('recTime').textContent = Math.floor(secs/60) + ':' + String(secs%60).padStart(2,'0');
            if (secs >= 60) stopRecording();
        }, 1000);
    } catch (e) { showToast('Mic access denied'); }
}

function stopRecording() {
    if (mediaRecorder && recording) { mediaRecorder.stop(); recording = false; }
}

// ==================== FORWARD ====================

function openForward(msgId) {
    forwardMsgId = msgId;
    $('forwardModal').style.display = 'flex';
    const list = $('forwardList'); list.innerHTML = '';
    if (!allChats.length) { list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:10px">No chats</p>'; return; }
    allChats.forEach(c => {
        const other = c.members.find(m => m.id !== currentUser?.id);
        const name = c.name || other?.username || 'Saved Messages';
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `<div class="avatar" style="background:#2AABEE">${(name[0]||'#').toUpperCase()}</div><span>${esc(name)}</span>`;
        div.onclick = () => doForward(c.id);
        list.appendChild(div);
    });
}

async function doForward(chatId) {
    if (!forwardMsgId) return;
    try {
        const res = await api(`/api/messages/${forwardMsgId}/forward`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({chat_ids:[chatId]})
        });
        $('forwardModal').style.display = 'none';
        forwardMsgId = null;
        showToast('Forwarded');
        loadChats();
    } catch (e) {}
}

// ==================== CHAT MENU / DELETE CHAT ====================

function openChatMenu() {
    const chat = allChats.find(c => c.id === activeChatId);
    if (!chat) return;
    $('chatMenuTitle').textContent = chat.name || chat.members.find(m => m.id !== currentUser?.id)?.username || 'Chat';
    const isGroup = chat.type === 'group';
    const isChannel = chat.type === 'channel';
    const isPrivate = chat.type === 'private';
    document.querySelectorAll('.group-only').forEach(el =>
        el.style.display = isGroup ? 'flex' : 'none');
    document.querySelectorAll('.private-only').forEach(el =>
        el.style.display = isPrivate ? 'flex' : 'none');
    document.querySelectorAll('.channel-only').forEach(el =>
        el.style.display = isChannel ? 'flex' : 'none');
    document.querySelectorAll('.owner-only').forEach(el =>
        el.style.display = (isGroup && chat.is_owner) ? 'flex' : 'none');
    $('chatMenuModal').style.display = 'flex';
}

async function removeChat() {
    $('chatMenuModal').style.display = 'none';
    if (!confirm('Delete this chat?')) return;
    try {
        await api(`/api/chats/${activeChatId}/delete`, {method:'DELETE'});
        activeChatId = null;
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        $('chatView').style.display = 'none';
        $('noChat').style.display = 'flex';
        $('pinnedBar').style.display = 'none';
        pinnedMsgId = null;
        await loadChats();
        showSidebar();
    } catch (e) {}
}

// ==================== GROUP MANAGE ====================

async function openGroupManage(mode) {
    groupManageMode = mode;
    $('chatMenuModal').style.display = 'none';
    $('groupManageTitle').textContent = mode === 'remove' ? 'Remove Member' : 'Add Members';
    $('groupManageModal').style.display = 'flex';
    $('groupAddSearch').value = '';
    $('groupAddList').innerHTML = '';
    if (mode === 'remove') {
        const chat = allChats.find(c => c.id === activeChatId);
        const list = $('groupMembersList'); list.innerHTML = '';
        (chat?.members || []).forEach(u => {
            if (u.id === currentUser?.id) return;
            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `<div class="avatar" style="background:#2AABEE">${u.username[0].toUpperCase()}</div><span>${esc(u.username)}</span><span style="color:var(--danger);margin-left:auto">✕</span>`;
            div.onclick = () => removeGroupMember(u.id);
            list.appendChild(div);
        });
    } else {
        $('groupMembersList').innerHTML = '';
        renderGroupAddSearch('');
    }
}

function renderGroupAddSearch(q) {
    const url = q ? `/api/users/search?q=${encodeURIComponent(q)}` : '/api/users';
    fetch(url, {credentials:'include'}).then(r => r.json()).then(data => {
        const ul = $('groupAddList'); ul.innerHTML = '';
        const chat = allChats.find(c => c.id === activeChatId);
        const memberIds = (chat?.members || []).map(m => m.id);
        (data.users || []).forEach(u => {
            if (memberIds.includes(u.id)) return;
            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `<div class="avatar" style="background:#2AABEE">${u.username[0].toUpperCase()}</div><span>${esc(u.username)}</span>`;
            div.onclick = async () => {
                try {
                    await api(`/api/chats/${activeChatId}/manage`, {
                        method:'POST', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({action:'add_members', member_ids:[u.id]})
                    });
                    showToast(`${u.username} added`);
                    await loadChats();
                    openGroupManage('add');
                } catch (e) {}
            };
            ul.appendChild(div);
        });
    }).catch(() => {});
}

async function removeGroupMember(userId) {
    if (!confirm('Remove this member?')) return;
    try {
        await api(`/api/chats/${activeChatId}/manage`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({action:'remove_member', user_id:userId})
        });
        showToast('Removed');
        await loadChats();
        openGroupManage('remove');
    } catch (e) {}
}

async function renameGroup() {
    $('chatMenuModal').style.display = 'none';
    const chat = allChats.find(c => c.id === activeChatId);
    const name = prompt('New group name:', chat?.name || '');
    if (!name) return;
    try {
        await api(`/api/chats/${activeChatId}/manage`, {
            method:'PATCH', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({action:'rename', name})
        });
        showToast('Renamed');
        await loadChats();
    } catch (e) {}
}

// ==================== REACTIONS ====================

function openReactions(msgId, e) {
    e.stopPropagation();
    reactTarget = msgId;
    let picker = $('reactionPicker');
    if (!picker) {
        picker = document.createElement('div');
        picker.id = 'reactionPicker';
        picker.style.cssText = 'position:fixed;background:var(--bg-aside);border:1px solid var(--border);border-radius:12px;padding:6px;display:none;gap:2px;z-index:150;box-shadow:var(--shadow)';
        ['👍','❤️','😂','😮','😢','🔥'].forEach(em => {
            const s = document.createElement('span');
            s.textContent = em;
            s.style.cssText = 'width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;border-radius:8px;transition:0.15s';
            s.onmouseenter = function() { this.style.background = 'var(--bg-hover)'; };
            s.onmouseleave = function() { this.style.background = 'transparent'; };
            s.onclick = () => { reactToMessage(reactTarget, em); picker.style.display = 'none'; };
            picker.appendChild(s);
        });
        document.body.appendChild(picker);
    }
    const x = Math.min(e.clientX || window.innerWidth/2, window.innerWidth - 280);
    const y = Math.max(10, (e.clientY || 100) - 56);
    picker.style.display = 'flex';
    picker.style.left = x + 'px';
    picker.style.top = y + 'px';
}

async function reactToMessage(msgId, emoji) {
    try {
        const res = await api(`/api/messages/${msgId}/react`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({emoji})
        });
        const data = await res.json();
        if (data.message) {
            const old = document.querySelector(`[data-msg-id="${msgId}"]`);
            if (old) old.replaceWith(createMessageElement(data.message));
        }
    } catch (e) {}
}

// ==================== CHAT SEARCH ====================

async function searchInChat(q) {
    try {
        const res = await api(`/api/messages/search?chat_id=${activeChatId}&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        $('messages').innerHTML = '';
        (data.messages || []).slice().reverse().forEach(appendMessage);
    } catch (e) {}
}

// ==================== MEDIA GALLERY ====================

async function openMedia() {
    $('chatMenuModal').style.display = 'none';
    try {
        const res = await api(`/api/chats/${activeChatId}/media`);
        const data = await res.json();
        const grid = $('mediaGrid'); grid.innerHTML = '';
        const list = data.media || [];
        if (!list.length) {
            grid.innerHTML = '<p style="text-align:center;color:var(--text-muted);grid-column:1/-1;padding:20px">No media yet</p>';
        }
        list.forEach(m => {
            const d = document.createElement('div');
            d.className = 'media-item';
            if (m.file_type === 'photo') {
                d.innerHTML = `<img src="${m.file_path}" onclick="window.open(this.src)" loading="lazy">`;
            } else {
                d.innerHTML = `<video src="${m.file_path}" preload="metadata" muted onclick="window.open('${m.file_path}')"></video>`;
            }
            grid.appendChild(d);
        });
        $('mediaModal').style.display = 'flex';
    } catch (e) {}
}

// ==================== THEME (Auto / Light / Dark / Night Vision) ====================

function applyTheme() {
    const saved = localStorage.getItem('theme') || 'auto';
    if (saved === 'auto') {
        document.documentElement.dataset.theme =
            window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } else {
        document.documentElement.dataset.theme = saved;
    }
    updateThemeBtn();
}

function cycleTheme() {
    const order = ['auto', 'light', 'dark', 'night'];
    const cur = localStorage.getItem('theme') || 'auto';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    localStorage.setItem('theme', next);
    applyTheme();
    showToast('Theme: ' + ({auto:'Auto', light:'Light', dark:'Dark', night:'Night vision'}[next]));
}

function updateThemeBtn() {
    const btn = $('themeBtn');
    if (!btn) return;
    const saved = localStorage.getItem('theme') || 'auto';
    const labels = {auto:'🎨 Auto theme', light:'☀️ Light mode', dark:'🌙 Dark mode', night:'🌌 Night vision'};
    btn.textContent = labels[saved];
}

// ==================== SEARCH ====================

let searchTimeout = null;

$('searchInput').oninput = function() {
    clearTimeout(searchTimeout);
    const q = this.value.trim();
    searchTimeout = setTimeout(() => {
        if (!q) { renderChatList(allChats); return; }
        searchUsers(q);
    }, 300);
};

async function searchUsers(query) {
    try {
        const res = await api(`/api/users/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        const list = $('chatList'); list.innerHTML = '';
        if (!data.users?.length) {
            list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">No users found</div>';
            return;
        }
        data.users.forEach(u => {
            const div = document.createElement('div');
            div.className = 'chat-item';
            const initial = u.username[0].toUpperCase();
            div.innerHTML = `
                <div class="avatar" style="background:#2AABEE">${initial}</div>
                <div class="chat-preview">
                    <div class="chat-top"><span class="chat-name">${esc(u.username)}</span></div>
                    <div class="chat-bottom"><span class="chat-msg">Click to chat</span></div>
                </div>
            `;
            div.onclick = () => createPrivateChat(u);
            list.appendChild(div);
        });
    } catch (e) {}
}

async function searchNewChat(query) {
    try {
        const res = await api(`/api/users/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        renderUserList(data.users || []);
    } catch (e) {}
}

function renderUserList(users) {
    const ul = $('userList'); ul.innerHTML = '';
    users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `<div class="avatar" style="background:#2AABEE">${u.username[0].toUpperCase()}</div><span>${esc(u.username)}</span>`;
        div.onclick = () => { createPrivateChat(u); $('newChatModal').style.display = 'none'; };
        ul.appendChild(div);
    });
}

// ==================== GROUP ====================

let groupMembers = [];

function renderGroupSearch(query) {
    const url = query ? `/api/users/search?q=${encodeURIComponent(query)}` : '/api/users';
    fetch(url, {credentials:'include'})
        .then(r => r.json()).then(data => {
            const ul = $('groupUserList'); ul.innerHTML = '';
            (data.users || []).forEach(u => {
                if (groupMembers.find(m => m.id === u.id)) return;
                const div = document.createElement('div');
                div.className = 'user-item';
                div.innerHTML = `<div class="avatar" style="background:#2AABEE">${u.username[0].toUpperCase()}</div><span>${esc(u.username)}</span>`;
                div.onclick = () => addGroupMember(u);
                ul.appendChild(div);
            });
        }).catch(() => {});
}

function addGroupMember(user) {
    if (groupMembers.find(m => m.id === user.id)) return;
    groupMembers.push(user);
    renderSelectedUsers();
    $('groupSearch').value = '';
    $('groupUserList').innerHTML = '';
}

function removeGroupMember(id) {
    groupMembers = groupMembers.filter(m => m.id !== id);
    renderSelectedUsers();
}

function renderSelectedUsers() {
    const el = $('selectedUsers');
    el.innerHTML = groupMembers.map(m => `<span onclick="removeGroupMember(${m.id})">${esc(m.username)} ✕</span>`).join('');
}

async function createGroup() {
    const name = $('groupName').value.trim();
    if (!name) { showToast('Group name required'); return; }
    const ids = groupMembers.map(m => m.id);
    if (!ids.length) { showToast('Add at least one member'); return; }
    try {
        const res = await api('/api/group', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({name, member_ids: ids})
        });
        const data = await res.json();
        $('newGroupModal').style.display = 'none';
        $('groupName').value = '';
        groupMembers = [];
        renderSelectedUsers();
        await loadChats();
        selectChat(data.chat);
    } catch (e) {}
}

// ==================== PRIVATE CHAT ====================

async function createPrivateChat(user) {
    if (!user?.id) return;
    try {
        const res = await api('/api/chats', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({type:'private', member_ids:[user.id]})
        });
        const data = await res.json();
        if (!data.chat) return;
        await loadChats();
        selectChat(data.chat);
    } catch (e) {}
}

// ==================== PROFILE ====================

async function openProfile() {
    $('profileModal').style.display = 'flex';
    const pa = $('profileAvatar');
    if (currentUser?.avatar) {
        pa.innerHTML = `<img src="${currentUser.avatar}"><span class="avatar-change">📷</span>`;
        pa.style.background = '';
    } else {
        pa.textContent = (currentUser?.username || '?')[0].toUpperCase();
        pa.style.background = avatarColor(currentUser?.id || 0);
        const badge = document.createElement('span');
        badge.className = 'avatar-change';
        badge.textContent = '📷';
        pa.appendChild(badge);
    }
    $('profileBio').value = currentUser?.bio || '';
    $('profilePhone').value = currentUser?.phone || '';
}

async function updateProfile() {
    const bio = $('profileBio').value.trim();
    const phone = $('profilePhone').value.trim();
    try {
        const res = await api('/api/users/me/profile', {
            method:'PATCH', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({bio, phone})
        });
        const data = await res.json();
        if (data.user) currentUser = data.user;
        $('profileModal').style.display = 'none';
        showToast('Profile updated');
    } catch (e) {}
}

// ==================== USER PROFILE (OTHER USERS) ====================

async function openUserProfile() {
    const chat = allChats.find(c => c.id === activeChatId);
    if (!chat || chat.type !== 'private') return;
    const other = chat.members.find(m => m.id !== currentUser?.id);
    if (!other) return;
    $('chatMenuModal').style.display = 'none';
    try {
        const res = await api(`/api/users/${other.id}`);
        const data = await res.json();
        const u = data.user;
        profileUserId = u.id;
        profileUserChatId = u.chat_id;
        const pa = $('upAvatar');
        if (u.avatar) {
            pa.innerHTML = `<img src="${u.avatar}">`;
            pa.style.background = '';
        } else {
            pa.innerHTML = '';
            pa.textContent = u.username[0].toUpperCase();
            pa.style.background = avatarColor(u.id);
        }
        $('upName').textContent = u.username;
        $('upStatus').textContent = u.online_status === 'online' ? '🟢 online' : '🔴 offline';
        $('upBio').textContent = u.bio || (u.phone ? '📞 ' + u.phone : '');
        const blockBtn = $('upBlockBtn');
        blockBtn.textContent = u.is_blocked ? '🔓 Unblock' : '🚫 Block';
        blockBtn.className = u.is_blocked ? 'btn-soft' : 'danger';
        $('upMessageBtn').style.display = profileUserChatId ? 'block' : 'none';
        $('userProfileModal').style.display = 'flex';
    } catch (e) {}
}

async function toggleBlockUser() {
    const isBlocked = $('upBlockBtn').textContent.includes('Unblock');
    try {
        const res = await api(`/api/users/${profileUserId}/block`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({action: isBlocked ? 'unblock' : 'block'})
        });
        const data = await res.json();
        $('userProfileModal').style.display = 'none';
        showToast(data.is_blocked ? '🚫 Blocked' : '🔓 Unblocked');
        loadChats();
    } catch (e) {}
}

function profileGoChat() {
    if (!profileUserChatId) return;
    $('userProfileModal').style.display = 'none';
    const chat = allChats.find(c => c.id === profileUserChatId);
    if (chat) { selectChat(chat); return; }
    loadChats().then(() => {
        const c = allChats.find(x => x.id === profileUserChatId);
        if (c) selectChat(c);
    });
}

// ==================== CHANNELS ====================

function openNewChannel() {
    $('newChatModal').style.display = 'none';
    $('newChannelModal').style.display = 'flex';
    $('channelName').value = '';
}

async function createChannel() {
    const name = $('channelName').value.trim();
    if (!name) { showToast('Channel name required'); return; }
    try {
        const res = await api('/api/channel', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({name})
        });
        const data = await res.json();
        $('newChannelModal').style.display = 'none';
        await loadChats();
        selectChat(data.chat);
    } catch (e) {}
}

async function loadChannels(q) {
    const url = q ? `/api/channels?q=${encodeURIComponent(q)}` : '/api/channels';
    try {
        const res = await api(url);
        const data = await res.json();
        const list = $('channelList'); list.innerHTML = '';
        if (!data.channels?.length) {
            list.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:8px">No channels found</div>';
            return;
        }
        data.channels.forEach(ch => {
            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `<div class="avatar" style="background:var(--bg-search)">📢</div>
                <div style="flex:1;min-width:0">
                    <span>${esc(ch.name)}</span>
                    <span style="display:block;font-size:11px;color:var(--text-muted)">${ch.member_count} subscribers</span>
                </div>
                ${ch.subscribed ? '<span style="color:var(--success);font-size:12px">✓</span>' : ''}`;
            if (!ch.subscribed) div.onclick = () => joinChannel(ch.id);
            list.appendChild(div);
        });
    } catch (e) {}
}

async function joinChannel(chatId) {
    try {
        const res = await api(`/api/chats/${chatId}/join`, {method:'POST'});
        const data = await res.json();
        showToast('Joined ' + (data.chat?.name || 'channel'));
        $('newChatModal').style.display = 'none';
        await loadChats();
        selectChat(data.chat);
    } catch (e) {}
}

// ==================== POLLS ====================

function newPoll() {
    $('chatMenuModal').style.display = 'none';
    $('pollQuestion').value = '';
    $('pollMultiple').checked = false;
    $('pollOptions').innerHTML = '';
    pollOptionCount = 2;
    for (let i = 0; i < 2; i++) addPollOption();
    $('pollModal').style.display = 'flex';
}

function addPollOption() {
    const inp = document.createElement('input');
    inp.placeholder = 'Option ' + (pollOptionCount + 1);
    $('pollOptions').appendChild(inp);
    pollOptionCount++;
}

async function createPoll() {
    const question = $('pollQuestion').value.trim();
    const options = [...$('pollOptions').querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean);
    if (!question) { showToast('Question required'); return; }
    if (options.length < 2) { showToast('At least 2 options needed'); return; }
    try {
        const res = await api('/api/poll', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({chat_id: activeChatId, question, options, multiple: $('pollMultiple').checked})
        });
        const data = await res.json();
        if (data.error) { showToast(data.error); return; }
        $('pollModal').style.display = 'none';
        appendMessage(data.message);
        lastMessageId = data.message.id;
        scrollToBottom();
        loadChats();
    } catch (e) { if (e.message !== 'Not authenticated') showToast('Failed to create poll'); }
}

async function votePoll(pollId, index, e) {
    e.stopPropagation();
    try {
        const res = await api(`/api/poll/${pollId}/vote`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({option_index: index})
        });
        const data = await res.json();
        if (data.message) {
            const old = document.querySelector(`[data-msg-id="${data.message.id}"]`);
            if (old) old.replaceWith(createMessageElement(data.message));
        }
    } catch (e2) {}
}

// ==================== SLOW MODE ====================

async function setSlowMode() {
    $('chatMenuModal').style.display = 'none';
    const chat = allChats.find(c => c.id === activeChatId);
    const cur = chat?.slow_mode || 0;
    const val = prompt('Slow mode in seconds (0 = off, max 300):', String(cur));
    if (val === null) return;
    const secs = parseInt(val);
    if (isNaN(secs) || secs < 0) { showToast('Invalid value'); return; }
    try {
        const res = await api(`/api/chats/${activeChatId}/slow_mode`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({seconds: secs})
        });
        const data = await res.json();
        if (data.error) { showToast(data.error); return; }
        showToast(secs ? `🐢 Slow mode: ${secs}s` : 'Slow mode off');
        const c = allChats.find(x => x.id === activeChatId);
        if (c && data.chat) c.slow_mode = data.chat.slow_mode;
    } catch (e) {}
}

// ==================== SCHEDULED MESSAGES + AUTODELETE ====================

function toLocalInput(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function openSchedule() {
    $('chatMenuModal').style.display = 'none';
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    $('scheduleTime').value = toLocalInput(now);
    $('autodeleteSelect').value = '';
    $('scheduleModal').style.display = 'flex';
}

function closeSchedule() {
    $('scheduleModal').style.display = 'none';
}

async function scheduleSend() {
    const timeVal = $('scheduleTime').value;
    if (!timeVal) { showToast('Choose a time'); return; }
    const autodel = $('autodeleteSelect').value;
    const text = $('messageInput').value.trim();
    if (!text && !pendingFile) { showToast('Nothing to send'); return; }
    const scheduledAt = new Date(timeVal).toISOString();
    const autodeleteAt = autodel ? new Date(Date.now() + autodel * 1000).toISOString() : null;
    const replyId = replyToMsg ? replyToMsg.id : null;
    cancelReply();
    closeSchedule();

    if (pendingFile) {
        const fd = new FormData();
        fd.append('file', pendingFile.file);
        fd.append('chat_id', activeChatId);
        fd.append('scheduled_at', scheduledAt);
        if (autodeleteAt) fd.append('autodelete_at', autodeleteAt);
        if (text) fd.append('caption', text);
        if (replyId) fd.append('reply_to', replyId);
        pendingFile = null;
        try {
            const res = await api('/api/upload', {method:'POST', body:fd});
            const data = await res.json();
            if (data.message) {
                appendMessage(data.message);
                lastMessageId = data.message.id;
                showToast('⏰ Scheduled');
                loadChats();
            }
        } catch (e) { if (e.message !== 'Not authenticated') showToast('Upload failed'); }
        return;
    }

    const payload = {chat_id: activeChatId, text, scheduled_at: scheduledAt};
    if (autodeleteAt) payload.autodelete_at = autodeleteAt;
    if (replyId) payload.reply_to = replyId;
    try {
        const res = await api('/api/send', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.error) { showToast(data.error); return; }
        if (data.message) {
            $('messageInput').value = '';
            appendMessage(data.message);
            lastMessageId = data.message.id;
            showToast('⏰ Scheduled');
            loadChats();
        }
    } catch (e) { if (e.message !== 'Not authenticated') showToast('Failed to schedule'); }
}

// ==================== BOTTOM NAV (MOBILE) ====================

function setBnActive(id) {
    document.querySelectorAll('.bn-item').forEach(b => b.classList.remove('active'));
    $(id).classList.add('active');
}

function openNewChatModal() {
    $('newChatModal').style.display = 'flex';
    $('newChatSearch').value = '';
    $('userList').innerHTML = '';
    searchNewChat('');
    loadChannels('');
}

// ==================== UTILITY ====================

function scrollToBottom() {
    const m = $('messages');
    if (m) { m.scrollTop = m.scrollHeight; }
}

function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], {month:'short', day:'numeric'});
}

function esc(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function md(text) {
    let t = esc(text);
    t = t.replace(/```([^`]*)```/g, '<code class="md-code-block">$1</code>');
    t = t.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    t = t.replace(/\*([^*]+)\*/g, '<i>$1</i>');
    t = t.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    return t;
}

function formatSched(iso) {
    if (!iso) return 'scheduled';
    const d = new Date(iso);
    return d.toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
}

function renderPoll(p) {
    const votes = p.votes || {};
    const total = Object.values(votes).reduce((s, arr) => s + (arr ? arr.length : 0), 0);
    const opts = p.options.map((opt, i) => {
        const arr = votes[String(i)] || [];
        const count = arr.length;
        const mine = (p.my_votes || []).includes(i);
        const pct = total ? Math.round(count / total * 100) : 0;
        return `<div class="poll-option ${mine ? 'mine' : ''}" onclick="votePoll(${p.id}, ${i}, event)">
            <div class="poll-bar" style="width:${pct}%"></div>
            <span class="poll-opt-text">${esc(opt)}</span>
            <span class="poll-count">${count} · ${pct}%</span>
        </div>`;
    }).join('');
    const hint = p.multiple ? 'multiple choice' : (p.closed ? 'closed' : '');
    return `<div class="msg-poll">
        <div class="poll-question">${md(p.question)}</div>
        ${opts}
        <div class="poll-total">${total} votes${hint ? ' · ' + hint : ''}</div>
    </div>`;
}

async function togglePin(msgId) {
    try {
        const res = await api(`/api/messages/${msgId}/pin`, {method:'POST'});
        const data = await res.json();
        if (data.error) { showToast(data.error); return; }
        if (data.message) {
            const old = document.querySelector(`[data-msg-id="${msgId}"]`);
            if (old) old.replaceWith(createMessageElement(data.message));
            const chat = allChats.find(c => c.id === activeChatId);
            if (chat) {
                chat.pinned_message = data.message.pinned ? data.message : null;
                showPinnedBar(chat);
            }
        }
    } catch (e) { if (e.message !== 'Not authenticated') showToast('Failed to pin'); }
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', async () => {
    applyTheme();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    try {
        const res = await fetch('/api/me', {credentials:'include'});
        if (res.ok) {
            const data = await res.json();
            if (data.user) { currentUser = data.user; initApp(); return; }
        }
    } catch (e) {}
    $('authModal').style.display = 'flex';
});

// Message input enter key
$('messageInput').onkeydown = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
};

// Typing indicator
$('messageInput').oninput = sendTyping;

// Send button
$('sendBtn').onclick = sendMessage;

// File input
$('fileInput').onchange = function() { uploadFile(this); };

// Mic button
$('micBtn').onclick = startRecording;
$('recStop').onclick = stopRecording;

// Chat menu
$('chatMenuBtn').onclick = openChatMenu;

// Chat search
$('chatSearchBtn').onclick = () => {
    const sb = $('chatSearch');
    sb.style.display = sb.style.display === 'none' ? 'block' : 'none';
    if (sb.style.display === 'block') $('chatSearchInput').focus();
};
$('chatSearchClose').onclick = () => {
    $('chatSearch').style.display = 'none';
    $('chatSearchInput').value = '';
    if (activeChatId) loadMessages(activeChatId);
};
$('chatSearchInput').oninput = function() {
    const q = this.value.trim();
    if (q) searchInChat(q);
    else loadMessages(activeChatId);
};

// Load older messages on scroll up
$('messages').onscroll = function() {
    if (this.scrollTop < 40 && msgPage * 50 < msgTotal) {
        msgPage++;
        loadOlderMessages(activeChatId, msgPage);
    }
};

// Sidebar burger
document.querySelector('.burger').onclick = () => {
    document.querySelector('aside').classList.toggle('hidden');
};

// Back button
$('backBtn').onclick = showSidebar;

// New chat button
$('newChatBtn').onclick = () => { openNewChatModal(); setBnActive('bnNew'); };

// Bottom nav (mobile)
$('bnChats').onclick = () => { showSidebar(); setBnActive('bnChats'); };
$('bnContacts').onclick = () => { openNewChatModal(); setBnActive('bnContacts'); };
$('bnNew').onclick = () => { openNewChatModal(); setBnActive('bnNew'); };
$('bnSettings').onclick = () => { openProfile(); setBnActive('bnSettings'); };

// New chat search
$('newChatSearch').oninput = function() {
    searchNewChat(this.value.trim());
    loadChannels(this.value.trim());
};

// Open group creation modal
function openNewGroup() {
    $('newChatModal').style.display = 'none';
    $('newGroupModal').style.display = 'flex';
    $('groupName').value = '';
    $('groupSearch').value = '';
    groupMembers = [];
    renderSelectedUsers();
    $('groupUserList').innerHTML = '';
    renderGroupSearch('');
}

// Group member search
$('groupSearch').oninput = function() {
    renderGroupSearch(this.value.trim());
};

// Group add-member search
$('groupAddSearch').oninput = function() {
    renderGroupAddSearch(this.value.trim());
};

// New group button (in icons - use ✎ long press or add a separate way)
// For now, add group creation via a separate trigger
// Let's add it to the newChatBtn long-press or use a different approach
// Actually, let's add a "New Group" button to the new chat modal

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(m => {
    m.onclick = function(e) { if (e.target === this) this.style.display = 'none'; };
});

// Search toggle
$('searchToggle').onclick = () => {
    const sb = $('searchBar');
    sb.style.display = sb.style.display === 'none' ? 'block' : 'none';
    if (sb.style.display === 'block') $('searchInput').focus();
};

// Chat tabs
document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = function() {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        filterChats(this.dataset.tab);
    };
});

// Settings/Profile button
$('settingsBtn').onclick = openProfile;

// Avatar upload
$('avatarUpload').onchange = async function() {
    const file = this.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
        const res = await api('/api/upload/photo', {method:'POST', body:fd});
        const data = await res.json();
        if (data.avatar) {
            currentUser.avatar = data.avatar;
            updateMyAvatar();
            openProfile();
            showToast('Photo updated');
        }
    } catch (e) {}
};

// Schedule on right-click of send button
$('sendBtn').addEventListener('contextmenu', e => { e.preventDefault(); openSchedule(); });

// System theme change -> auto theme
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if ((localStorage.getItem('theme') || 'auto') === 'auto') applyTheme();
    });
}

// Swipe gestures on mobile
let touchStartX = null;
document.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, {passive:true});
document.addEventListener('touchend', e => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const aside = document.querySelector('aside');
    if (dx > 70 && aside.classList.contains('hidden') && !e.target.closest('.modal')) {
        showSidebar();
    } else if (dx < -70 && !aside.classList.contains('hidden') && isMobile() && !e.target.closest('.modal')) {
        aside.classList.add('hidden');
    }
    touchStartX = null;
}, {passive:true});

// Reply close
$('replyClose').onclick = cancelReply;

// Resize handler
window.addEventListener('resize', () => {
    if (!isMobile()) document.querySelector('aside').classList.remove('hidden');
});

// Emoji button - simple emoji picker
const emojis = ['😊','😂','❤️','👍','🔥','🎉','😍','🤔','🙏','💪','😢','😡','🥳','😎','🤗','💯','⭐','👋','✌️','💖'];
let emojiPickerVisible = false;
$('emojiBtn').onclick = function() {
    if (emojiPickerVisible) return;
    emojiPickerVisible = true;
    const picker = document.createElement('div');
    picker.id = 'emojiPicker';
    picker.style.cssText = 'position:fixed;bottom:70px;left:16px;background:var(--bg-modal);border:1px solid var(--border);border-radius:12px;padding:10px;display:grid;grid-template-columns:repeat(5,1fr);gap:4px;z-index:50;box-shadow:var(--shadow)';
    emojis.forEach(e => {
        const s = document.createElement('span');
        s.textContent = e;
        s.style.cssText = 'width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:8px;font-size:20px;transition:0.15s';
        s.onmouseenter = function() { this.style.background = 'var(--bg-hover)'; };
        s.onmouseleave = function() { this.style.background = 'transparent'; };
        s.onclick = () => {
            $('messageInput').value += e;
            $('messageInput').focus();
            picker.remove();
            emojiPickerVisible = false;
        };
        picker.appendChild(s);
    });
    document.body.appendChild(picker);
    const closePicker = (e) => {
        if (!picker.contains(e.target) && e.target !== this) {
            picker.remove(); emojiPickerVisible = false;
            document.removeEventListener('click', closePicker);
        }
    };
    setTimeout(() => document.addEventListener('click', closePicker), 100);
};

// Add reply on message right-click or long tap
document.addEventListener('click', function(e) {
    const msgEl = e.target.closest('.msg');
    if (!msgEl) return;
    if (e.target.closest('.msg-actions') || e.target.closest('.msg-file') || e.target.closest('.reply-badge') || e.target.closest('.reaction-row')) return;
    const msgId = parseInt(msgEl.dataset.msgId);
    if (msgId) setReply(msgId);
});

// Long press on mobile to show message actions
let longPressTimer = null;
document.addEventListener('touchstart', function(e) {
    const msgEl = e.target.closest('.msg');
    if (!msgEl || e.target.closest('.msg-actions')) return;
    const actions = msgEl.querySelector('.msg-actions');
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
        document.querySelectorAll('.msg-actions').forEach(a => a.style.display = 'none');
        if (actions) actions.style.display = 'flex';
        if (navigator.vibrate) navigator.vibrate(15);
    }, 400);
});
document.addEventListener('touchend', () => clearTimeout(longPressTimer));
document.addEventListener('touchmove', () => clearTimeout(longPressTimer));
document.addEventListener('touchstart', function(e) {
    if (!e.target.closest('.msg-actions')) {
        document.querySelectorAll('.msg-actions').forEach(a => a.style.display = 'none');
    }
});
