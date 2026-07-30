let currentUser = null;
let activeChatId = null;
let isRegistering = false;
let lastMessageId = 0;
let pollInterval = null;
let pendingFile = null;
let replyToMsg = null;
let allChats = [];

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
        const name = chat.name || other?.username || 'Saved Messages';
        const initial = (name[0] || '#').toUpperCase();
        const isOnline = other?.online_status === 'online';
        const last = chat.last_message || {};
        const time = last.created_at ? formatTime(last.created_at) : '';

        let avatarHtml = `<div class="avatar ${isOnline ? 'online-dot' : ''}" style="background:${avatarColor(chat.id)}">${initial}</div>`;
        if (other?.avatar) {
            avatarHtml = `<div class="avatar ${isOnline ? 'online-dot' : ''}"><img src="${other.avatar}"></div>`;
        }

        div.innerHTML = avatarHtml + `
            <div class="chat-preview">
                <div class="chat-top">
                    <span class="chat-name">${esc(name)}</span>
                    <span class="chat-time">${time}</span>
                </div>
                <div class="chat-bottom">
                    <span class="chat-msg">${last.text || last.file_type || 'No messages yet'}</span>
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
    const name = chat.name || other?.username || 'Saved Messages';
    const isOnline = other?.online_status === 'online';

    $('noChat').style.display = 'none';
    $('chatView').style.display = 'flex';
    $('chatName').textContent = name;
    $('chatStatus').textContent = isOnline ? 'online' : 'offline';
    $('chatStatus').className = 'status ' + (isOnline ? 'online' : 'offline');

    const ca = $('chatAvatar');
    if (other?.avatar) {
        ca.innerHTML = `<img src="${other.avatar}">`;
        ca.className = 'avatar small';
    } else {
        ca.textContent = (name[0] || '#').toUpperCase();
        ca.style.background = avatarColor(chat.id);
        ca.className = 'avatar small';
    }
    if (isOnline) ca.classList.add('online-dot');

    $('messages').innerHTML = '';
    if (pollInterval) clearInterval(pollInterval);
    await loadMessages(chat.id);
    pollInterval = setInterval(() => pollNewMessages(chat.id), 1500);
}

// ==================== MESSAGES ====================

async function loadMessages(chatId) {
    try {
        const res = await api(`/api/chats/${chatId}/messages`);
        const data = await res.json();
        $('messages').innerHTML = '';
        (data.messages || []).forEach(appendMessage);
        if (data.messages?.length) lastMessageId = data.messages[data.messages.length - 1].id;
        scrollToBottom();
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
    } catch (e) {}
}

function appendMessage(msg) {
    const isOwn = msg.sender?.id === currentUser?.id;
    const div = document.createElement('div');
    div.className = `msg ${isOwn ? 'msg-right' : 'msg-left'}`;
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
    const check = isOwn ? '<span class="msg-check">✓✓</span>' : '';
    const time = formatTime(msg.created_at);

    const actions = isOwn ? `
        <div class="msg-actions">
            <span onclick="editMessage(${msg.id})" title="Edit">✏️</span>
            <span onclick="deleteMessage(${msg.id})" title="Delete">🗑️</span>
        </div>
    ` : '';

    div.innerHTML = actions + `
        <div class="msg-bubble ${replyHtml ? 'replying' : ''}">
            ${!isOwn && msg.sender ? `<div class="msg-sender">${esc(msg.sender.username)}</div>` : ''}
            ${replyHtml}
            ${fileHtml}
            ${msg.text ? `<div class="msg-text">${esc(msg.text)}</div>` : ''}
            <div class="msg-meta">
                ${edited} <span class="msg-time">${time}</span> ${check}
            </div>
        </div>
    `;

    div.onclick = (e) => {
        if (e.target.closest('.msg-actions')) return;
    };

    $('messages').appendChild(div);
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
            if (data.message) {
                appendMessage(data.message);
                lastMessageId = data.message.id;
                scrollToBottom(); loadChats();
            }
        } catch (e) { if (e.message !== 'Not authenticated') showToast('Upload failed'); }
        return;
    }

    $('messageInput').value = '';
    const payload = {chat_id: activeChatId, text};
    if (replyToMsg) payload.reply_to = replyToMsg.id;
    cancelReply();

    try {
        const res = await api('/api/send', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.message) {
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
    fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {credentials:'include'})
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
        pa.innerHTML = `<img src="${currentUser.avatar}">`;
    } else {
        pa.textContent = (currentUser?.username || '?')[0].toUpperCase();
        pa.style.background = avatarColor(currentUser?.id || 0);
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

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', async () => {
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

// Sidebar burger
document.querySelector('.burger').onclick = () => {
    document.querySelector('aside').classList.toggle('hidden');
};

// Back button
$('backBtn').onclick = showSidebar;

// New chat button
$('newChatBtn').onclick = () => {
    $('newChatModal').style.display = 'flex';
    $('newChatSearch').value = '';
    $('userList').innerHTML = '';
    searchNewChat('');
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
    if (e.target.closest('.msg-actions') || e.target.closest('.msg-file') || e.target.closest('.reply-badge')) return;
    const msgId = parseInt(msgEl.dataset.msgId);
    if (msgId) setReply(msgId);
});
