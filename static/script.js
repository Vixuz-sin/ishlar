let currentUser = null;
let activeChatId = null;
let isRegistering = false;
let lastMessageId = 0;
let pollInterval = null;
let pendingFile = null;

function $(id) { return document.getElementById(id); }

function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 3000);
}

function toggleAuth() {
    isRegistering = !isRegistering;
    $('authBtn').textContent = isRegistering ? 'Register' : 'Sign In';
    $('authBtn').onclick = isRegistering ? register : login;
    document.querySelector('.auth-switch').textContent =
        isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Register";
}

async function login() {
    const username = $('authUsername').value.trim();
    const password = $('authPassword').value;
    $('authError').textContent = '';
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({username, password})
    });
    const data = await res.json();
    if (!res.ok) { $('authError').textContent = data.error; return; }
    currentUser = data.user;
    initApp();
}

async function register() {
    const username = $('authUsername').value.trim();
    const password = $('authPassword').value;
    $('authError').textContent = '';
    const res = await fetch('/api/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({username, password})
    });
    const data = await res.json();
    if (!res.ok) { $('authError').textContent = data.error; return; }
    currentUser = data.user;
    initApp();
}

async function logout() {
    await fetch('/api/logout', {method: 'POST'});
    if (pollInterval) clearInterval(pollInterval);
    currentUser = null;
    activeChatId = null;
    lastMessageId = 0;
    $('authModal').style.display = 'flex';
    $('app').style.display = 'none';
}

async function initApp() {
    $('authModal').style.display = 'none';
    $('app').style.display = 'flex';
    $('currentUsername').textContent = currentUser.username;
    await loadChats();
}

async function loadChats() {
    const res = await fetch('/api/chats');
    const data = await res.json();
    $('chatList').innerHTML = '';
    data.chats.forEach(renderChatItem);
}

function renderChatItem(chat) {
    const div = document.createElement('div');
    div.className = 'chat-item' + (chat.id === activeChatId ? ' active' : '');
    div.dataset.chatId = chat.id;
    const otherMember = chat.members.find(m => m.id !== currentUser?.id);
    const name = chat.name || otherMember?.username || 'Saved Messages';
    const initial = (name[0] || '#').toUpperCase();
    const avatarColors = ['#2AABEE','#E53935','#43A047','#FB8C00','#8E24AA','#00ACC1'];
    const colorIdx = (chat.id || 0) % avatarColors.length;
    const lastMsg = chat.last_message || {};
    div.innerHTML = `
        <div class="avatar" style="background:${avatarColors[colorIdx]}">${initial}</div>
        <div class="chat-preview">
            <div class="chat-top">
                <span class="chat-name">${escapeHtml(name)}</span>
                <span class="chat-time">${lastMsg.created_at ? formatTime(lastMsg.created_at) : ''}</span>
            </div>
            <div class="chat-bottom">
                <span class="chat-msg">${lastMsg.text || lastMsg.file_type || ''}</span>
            </div>
        </div>
    `;
    div.onclick = () => selectChat(chat);
    $('chatList').appendChild(div);
}

function selectChat(chat) {
    activeChatId = chat.id;
    showChatView();
    lastMessageId = 0;
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const el = document.querySelector(`.chat-item[data-chat-id="${chat.id}"]`);
    if (el) el.classList.add('active');
    const otherMember = chat.members.find(m => m.id !== currentUser?.id);
    const name = chat.name || otherMember?.username || 'Saved Messages';
    $('mainHeader').style.display = 'flex';
    $('noChat').style.display = 'none';
    $('messages').style.display = 'flex';
    $('inputBar').style.display = 'flex';
    $('chatName').textContent = name;
    $('chatStatus').textContent = 'online';
    $('messages').innerHTML = '';
    if (pollInterval) clearInterval(pollInterval);
    loadMessages(chat.id);
    pollInterval = setInterval(() => pollNewMessages(chat.id), 1500);
}

async function loadMessages(chatId) {
    const res = await fetch(`/api/chats/${chatId}/messages`);
    const data = await res.json();
    $('messages').innerHTML = '';
    data.messages.forEach(appendMessage);
    if (data.messages.length > 0) {
        lastMessageId = data.messages[data.messages.length - 1].id;
    }
    scrollToBottom();
}

async function pollNewMessages(chatId) {
    const res = await fetch(`/api/poll/messages?chat_id=${chatId}&after=${lastMessageId}`);
    const data = await res.json();
    if (!data.messages || data.messages.length === 0) return;
    data.messages.forEach(msg => {
        if (msg.id > lastMessageId) {
            appendMessage(msg);
            lastMessageId = msg.id;
        }
    });
    scrollToBottom();
    loadChats();
}

function appendMessage(msg) {
    const isOwn = msg.sender?.id === currentUser?.id;
    const div = document.createElement('div');
    div.className = `msg ${isOwn ? 'msg-right' : 'msg-left'}`;
    let fileHtml = '';
    if (msg.file_path && msg.file_type) {
        if (msg.file_type === 'photo') {
            fileHtml = `<div class="msg-file"><img src="${msg.file_path}" onclick="window.open(this.src)" loading="lazy"></div>`;
        } else if (msg.file_type === 'video') {
            fileHtml = `<div class="msg-file"><video src="${msg.file_path}" controls preload="metadata" style="max-width:260px;border-radius:8px"></video></div>`;
        } else if (msg.file_type === 'audio') {
            fileHtml = `<div class="msg-file"><audio src="${msg.file_path}" controls preload="metadata" style="width:100%"></audio></div>`;
        } else {
            fileHtml = `<div class="msg-file"><span class="file-icon">📄</span><div class="file-info"><div class="file-name">${msg.file_path.split('/').pop()}</div><div class="file-size">${msg.file_size ? (msg.file_size/1024).toFixed(1)+' KB' : ''}</div></div></div>`;
        }
    }
    div.innerHTML = `
        <div class="msg-bubble">
            ${!isOwn && msg.sender ? `<div class="msg-sender">${escapeHtml(msg.sender.username)}</div>` : ''}
            ${fileHtml}
            ${msg.text ? `<div class="msg-text">${escapeHtml(msg.text)}</div>` : ''}
            <div class="msg-meta">
                <span class="msg-time">${formatTime(msg.created_at)}</span>
                ${isOwn ? '<span class="msg-check">✓✓</span>' : ''}
            </div>
        </div>
    `;
    $('messages').appendChild(div);
}

async function sendMessage() {
    const text = $('messageInput').value.trim();
    $('messageInput').value = '';
    if (!text && !pendingFile) return;
    if (pendingFile) {
        const formData = new FormData();
        formData.append('file', pendingFile.file);
        formData.append('chat_id', activeChatId);
        if (text) formData.append('caption', text);
        pendingFile = null;
        const res = await fetch('/api/upload', {method: 'POST', body: formData});
        const data = await res.json();
        if (data.message) {
            appendMessage(data.message);
            lastMessageId = data.message.id;
            scrollToBottom();
            loadChats();
        }
        return;
    }
    if (text) {
        const res = await fetch('/api/send', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({chat_id: activeChatId, text})
        });
        const data = await res.json();
        if (data.message) {
            appendMessage(data.message);
            lastMessageId = data.message.id;
            scrollToBottom();
            loadChats();
        }
    }
}

async function uploadFile(input) {
    const file = input.files[0];
    if (!file) return;
    const type = file.type.split('/')[0];
    if (!['image','video','audio'].includes(type)) {
        showToast('Only images, videos, and audio files are supported');
        return;
    }
    pendingFile = {file, type};
    showToast(`${file.name} attached`);
    input.value = '';
}

function searchUsers(query) {
    if (!query) { loadChats(); return; }
    fetch(`/api/users/search?q=${encodeURIComponent(query)}`)
        .then(r => { if (!r.ok) throw new Error('Search failed'); return r.json(); })
        .then(data => {
            $('chatList').innerHTML = '';
            if (data.users.length === 0) {
                $('chatList').innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:14px">No users found</div>';
                return;
            }
            data.users.forEach(u => {
                const div = document.createElement('div');
                div.className = 'chat-item';
                div.innerHTML = `
                    <div class="avatar" style="background:#2AABEE">${u.username[0].toUpperCase()}</div>
                    <div class="chat-preview">
                        <div class="chat-top"><span class="chat-name">${escapeHtml(u.username)}</span></div>
                        <div class="chat-bottom"><span class="chat-msg">Click to start chat</span></div>
                    </div>
                `;
                div.onclick = () => createPrivateChat(u);
                $('chatList').appendChild(div);
            });
        })
        .catch(() => { loadChats(); });
}

async function searchNewChat(query) {
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    renderUserList(data.users);
}

function renderUserList(users) {
    const ul = $('userList');
    ul.innerHTML = '';
    users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `<div class="avatar" style="background:#2AABEE">${u.username[0].toUpperCase()}</div><span>${escapeHtml(u.username)}</span>`;
        div.onclick = () => { createPrivateChat(u); $('newChatModal').style.display = 'none'; };
        ul.appendChild(div);
    });
}

async function createPrivateChat(user) {
    const res = await fetch('/api/chats', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({type: 'private', member_ids: [user.id]})
    });
    const data = await res.json();
    await loadChats();
    selectChat(data.chat);
}

function scrollToBottom() { const m = $('messages'); m.scrollTop = m.scrollHeight; }

function isMobile() { return window.innerWidth <= 768; }

function showSidebar() {
    document.querySelector('aside').classList.remove('hidden');
    if (isMobile()) {
        $('messages').style.display = 'none';
        $('inputBar').style.display = 'none';
        $('mainHeader').style.display = 'none';
        $('noChat').style.display = 'flex';
    }
}

function showChatView() {
    if (isMobile()) {
        document.querySelector('aside').classList.add('hidden');
    }
}

function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

document.addEventListener('DOMContentLoaded', async () => {
    const res = await fetch('/api/me');
    if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        initApp();
    }
});

$('newChatBtn').onclick = () => { $('newChatModal').style.display = 'flex'; searchNewChat(''); };
$('newChatModal').onclick = (e) => { if (e.target === $('newChatModal')) $('newChatModal').style.display = 'none'; };

document.querySelector('.burger').onclick = () => {
    const aside = document.querySelector('aside');
    aside.classList.toggle('hidden');
};

window.addEventListener('resize', () => {
    if (!isMobile()) {
        document.querySelector('aside').classList.remove('hidden');
    }
});
