// Global state
let chats = [];
let currentChatId = null;
let allMediaItems = [];
let currentMediaIndex = 0;

// DOM Elements
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const restoreInput = document.getElementById('restoreInput');
const restoreBtn = document.getElementById('restoreBtn');
const chatList = document.getElementById('chatList');
const chatView = document.getElementById('chatView');
const clearAllBtn = document.getElementById('clearAllBtn');
const sidebar = document.getElementById('sidebar');
const openSidebar = document.getElementById('openSidebar');
const closeSidebar = document.getElementById('closeSidebar');
const mobileHeaderTitle = document.getElementById('mobileHeaderTitle');
const loading = document.getElementById('loading');
const mediaModal = document.getElementById('mediaModal');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');
const modalDownload = document.getElementById('modalDownload');
const modalPrev = document.getElementById('modalPrev');
const modalNext = document.getElementById('modalNext');

// Event Listeners
uploadBtn.addEventListener('click', () => fileInput.click());
restoreBtn.addEventListener('click', () => restoreInput.click());
fileInput.addEventListener('change', handleFileUpload);
restoreInput.addEventListener('change', handleRestore);
clearAllBtn.addEventListener('click', clearAllChats);
openSidebar.addEventListener('click', () => sidebar.classList.remove('mobile-hidden'));
closeSidebar.addEventListener('click', () => sidebar.classList.add('mobile-hidden'));
modalClose.addEventListener('click', closeModal);
modalDownload.addEventListener('click', downloadCurrentMedia);
modalPrev.addEventListener('click', showPrevMedia);
modalNext.addEventListener('click', showNextMedia);

// Parse WhatsApp chat text
function parseWhatsAppChat(text) {
    const messages = [];
    const lines = text.split('\n');
    
    // Multiple date/time patterns
    const patterns = [
        /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\s*[-–]\s*([^:]+):\s*(.*)$/,
        /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]\s*([^:]+):\s*(.*)$/
    ];
    
    let currentMessage = null;
    
    for (const line of lines) {
        if (!line.trim()) continue;
        
        let matched = false;
        
        for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match) {
                if (currentMessage) {
                    messages.push(currentMessage);
                }
                
                currentMessage = {
                    date: match[1],
                    time: match[2],
                    sender: match[3].trim(),
                    text: match[4].trim(),
                    timestamp: parseTimestamp(match[1], match[2]),
                    media: null
                };
                
                matched = true;
                break;
            }
        }
        
        if (!matched && currentMessage) {
            currentMessage.text += '\n' + line;
        }
    }
    
    if (currentMessage) {
        messages.push(currentMessage);
    }
    
    return messages.sort((a, b) => a.timestamp - b.timestamp);
}

// Parse timestamp
function parseTimestamp(dateStr, timeStr) {
    try {
        const dateParts = dateStr.split('/');
        let day, month, year;
        
        if (dateParts[2].length === 2) {
            year = 2000 + parseInt(dateParts[2]);
        } else {
            year = parseInt(dateParts[2]);
        }
        
        // Try DD/MM/YYYY format first
        if (parseInt(dateParts[0]) > 12) {
            day = parseInt(dateParts[0]);
            month = parseInt(dateParts[1]) - 1;
        } else if (parseInt(dateParts[1]) > 12) {
            // MM/DD/YYYY format
            month = parseInt(dateParts[0]) - 1;
            day = parseInt(dateParts[1]);
        } else {
            // Ambiguous, assume DD/MM/YYYY
            day = parseInt(dateParts[0]);
            month = parseInt(dateParts[1]) - 1;
        }
        
        let timeParts = timeStr.replace(/\s*(AM|PM|am|pm)\s*$/i, '').split(':');
        let hours = parseInt(timeParts[0]);
        const minutes = parseInt(timeParts[1]);
        
        if (/PM/i.test(timeStr) && hours < 12) {
            hours += 12;
        } else if (/AM/i.test(timeStr) && hours === 12) {
            hours = 0;
        }
        
        return new Date(year, month, day, hours, minutes).getTime();
    } catch (e) {
        return Date.now();
    }
}

// Format date for display
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }
}

// Format time for display
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

// Handle file upload
async function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    loading.classList.add('active');
    
    try {
        for (const file of files) {
            await processZipFile(file);
        }
        
        renderChatList();
        
        // Auto-download backup
        if (chats.length > 0) {
            setTimeout(() => downloadBackup(), 1000);
        }
    } catch (error) {
        console.error('Error processing files:', error);
        alert('Error processing files. Please check the console.');
    } finally {
        loading.classList.remove('active');
        fileInput.value = '';
    }
}

// Process ZIP file
async function processZipFile(file) {
    const zip = await JSZip.loadAsync(file);
    const files = Object.keys(zip.files);
    
    // Find chat text file
    const chatFile = files.find(f => f.endsWith('_chat.txt') || f.endsWith('.txt'));
    if (!chatFile) {
        throw new Error('No chat text file found in ZIP');
    }
    
    const chatText = await zip.files[chatFile].async('text');
    const messages = parseWhatsAppChat(chatText);
    
    // Extract media files
    const mediaFiles = {};
    for (const fileName of files) {
        const file = zip.files[fileName];
        if (!file.dir && isMediaFile(fileName)) {
            const blob = await file.async('blob');
            const url = URL.createObjectURL(blob);
            const baseName = fileName.split('/').pop();
            mediaFiles[baseName] = {
                url: url,
                name: baseName,
                type: getMediaType(baseName)
            };
        }
    }
    
    // Link media to messages
    messages.forEach(msg => {
        const mediaPattern = /(IMG-|VID-|AUD-)[\w-]+\.\w+|<Media omitted>|\.(jpg|jpeg|png|gif|mp4|mov|avi|mp3|ogg|wav|opus)/gi;
        const matches = msg.text.match(mediaPattern);
        
        if (matches) {
            for (const match of matches) {
                for (const [fileName, mediaData] of Object.entries(mediaFiles)) {
                    if (fileName.includes(match.replace('<Media omitted>', '')) || match.includes(fileName)) {
                        msg.media = mediaData;
                        break;
                    }
                }
            }
        }
    });
    
    // Extract chat name from first message or filename
    let chatName = 'Unknown Chat';
    if (messages.length > 0) {
        const senders = [...new Set(messages.map(m => m.sender))];
        chatName = senders.length > 1 ? senders.join(', ') : senders[0];
        if (chatName.length > 50) {
            chatName = chatName.substring(0, 47) + '...';
        }
    }
    
    const chat = {
        id: Date.now() + Math.random(),
        name: chatName,
        messages: messages,
        mediaFiles: mediaFiles,
        lastMessage: messages[messages.length - 1]?.text || 'No messages',
        timestamp: messages[messages.length - 1]?.timestamp || Date.now()
    };
    
    chats.push(chat);
}

// Check if file is media
function isMediaFile(fileName) {
    const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.avi', '.mp3', '.ogg', '.wav', '.opus'];
    return mediaExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
}

// Get media type
function getMediaType(fileName) {
    const ext = fileName.toLowerCase().split('.').pop();
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'avi'].includes(ext)) return 'video';
    if (['mp3', 'ogg', 'wav', 'opus'].includes(ext)) return 'audio';
    return 'unknown';
}

// Render chat list
function renderChatList() {
    chatList.innerHTML = '';
    
    if (chats.length === 0) {
        chatList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">No chats loaded</div>';
        return;
    }
    
    chats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        if (chat.id === currentChatId) {
            chatItem.classList.add('active');
        }
        
        const initial = chat.name.charAt(0).toUpperCase();
        
        chatItem.innerHTML = `
            <div class="chat-avatar">${initial}</div>
            <div class="chat-info">
                <div class="chat-name">${chat.name}</div>
                <div class="chat-preview">${chat.lastMessage.substring(0, 50)}${chat.lastMessage.length > 50 ? '...' : ''}</div>
            </div>
            <button class="chat-remove" onclick="removeChat(${chat.id})">×</button>
        `;
        
        chatItem.addEventListener('click', (e) => {
            if (!e.target.classList.contains('chat-remove')) {
                openChat(chat.id);
            }
        });
        
        chatList.appendChild(chatItem);
    });
}

// Open chat
function openChat(chatId) {
    currentChatId = chatId;
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    
    renderChatView(chat);
    renderChatList();
    
    // Update mobile header
    mobileHeaderTitle.textContent = chat.name;
    
    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        sidebar.classList.add('mobile-hidden');
    }
}

// Render chat view
function renderChatView(chat) {
    chatView.innerHTML = `
        <div class="chat-header">
            <div class="chat-header-avatar">${chat.name.charAt(0).toUpperCase()}</div>
            <div class="chat-header-info">
                <h2>${chat.name}</h2>
                <p>${chat.messages.length} messages</p>
            </div>
        </div>
        <div class="messages-container" id="messagesContainer"></div>
    `;
    
    const messagesContainer = document.getElementById('messagesContainer');
    let lastDate = null;
    
    // Collect all media for modal navigation
    allMediaItems = [];
    
    chat.messages.forEach((msg, index) => {
        const msgDate = formatDate(msg.timestamp);
        
        if (msgDate !== lastDate) {
            const dateSeparator = document.createElement('div');
            dateSeparator.className = 'date-separator';
            dateSeparator.innerHTML = `<span>${msgDate}</span>`;
            messagesContainer.appendChild(dateSeparator);
            lastDate = msgDate;
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        
        // Determine if sent or received (simple heuristic)
        const isFirstSender = msg.sender === chat.messages[0].sender;
        messageDiv.classList.add(isFirstSender ? 'sent' : 'received');
        
        let mediaHtml = '';
        if (msg.media) {
            const mediaIndex = allMediaItems.length;
            allMediaItems.push(msg.media);
            
            if (msg.media.type === 'image') {
                mediaHtml = `<div class="message-media" onclick="openMediaModal(${mediaIndex})"><img src="${msg.media.url}" alt="Image"></div>`;
            } else if (msg.media.type === 'video') {
                mediaHtml = `<div class="message-media" onclick="openMediaModal(${mediaIndex})"><video src="${msg.media.url}" controls></video></div>`;
            } else if (msg.media.type === 'audio') {
                mediaHtml = `<div class="message-media"><audio src="${msg.media.url}" controls></audio></div>`;
            }
        }
        
        messageDiv.innerHTML = `
            <div class="message-bubble">
                <div class="message-sender">${msg.sender}</div>
                <div class="message-text">${escapeHtml(msg.text)}</div>
                ${mediaHtml}
                <div class="message-time">${formatTime(msg.timestamp)}</div>
            </div>
        `;
        
        messagesContainer.appendChild(messageDiv);
    });
    
    // Scroll to bottom with smooth behavior
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Open media modal
function openMediaModal(index) {
    currentMediaIndex = index;
    showMediaInModal(index);
    mediaModal.classList.add('active');
}

// Show media in modal
function showMediaInModal(index) {
    if (index < 0 || index >= allMediaItems.length) return;
    
    const media = allMediaItems[index];
    modalContent.innerHTML = '';
    
    if (media.type === 'image') {
        const img = document.createElement('img');
        img.src = media.url;
        img.alt = media.name;
        modalContent.appendChild(img);
    } else if (media.type === 'video') {
        const video = document.createElement('video');
        video.src = media.url;
        video.controls = true;
        video.autoplay = true;
        modalContent.appendChild(video);
    }
}

// Close modal
function closeModal() {
    mediaModal.classList.remove('active');
    modalContent.innerHTML = '';
}

// Download current media
function downloadCurrentMedia() {
    if (currentMediaIndex >= 0 && currentMediaIndex < allMediaItems.length) {
        const media = allMediaItems[currentMediaIndex];
        const a = document.createElement('a');
        a.href = media.url;
        a.download = media.name;
        a.click();
    }
}

// Show previous media
function showPrevMedia() {
    if (currentMediaIndex > 0) {
        currentMediaIndex--;
        showMediaInModal(currentMediaIndex);
    }
}

// Show next media
function showNextMedia() {
    if (currentMediaIndex < allMediaItems.length - 1) {
        currentMediaIndex++;
        showMediaInModal(currentMediaIndex);
    }
}

// Remove chat
function removeChat(chatId) {
    chats = chats.filter(c => c.id !== chatId);
    
    if (currentChatId === chatId) {
        currentChatId = null;
        chatView.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💬</div>
                <h2>Welcome to WhatsApp Chat Viewer</h2>
                <p>Upload WhatsApp chat ZIP files to view your conversations with full media support</p>
            </div>
        `;
        mobileHeaderTitle.textContent = 'WhatsApp Chat Viewer';
    }
    
    renderChatList();
}

// Clear all chats
function clearAllChats() {
    if (confirm('Are you sure you want to clear all chats?')) {
        chats = [];
        currentChatId = null;
        renderChatList();
        chatView.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💬</div>
                <h2>Welcome to WhatsApp Chat Viewer</h2>
                <p>Upload WhatsApp chat ZIP files to view your conversations with full media support</p>
            </div>
        `;
        mobileHeaderTitle.textContent = 'WhatsApp Chat Viewer';
    }
}

// Download backup
function downloadBackup() {
    const backup = {
        version: '1.0',
        timestamp: Date.now(),
        chats: chats.map(chat => ({
            ...chat,
            // Keep media URLs as they are blob URLs
        }))
    };
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Handle restore
async function handleRestore(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    loading.classList.add('active');
    
    try {
        const text = await file.text();
        const backup = JSON.parse(text);
        
        if (backup.chats && Array.isArray(backup.chats)) {
            chats = backup.chats;
            renderChatList();
            alert(`Restored ${chats.length} chat(s) from backup!`);
        } else {
            throw new Error('Invalid backup file format');
        }
    } catch (error) {
        console.error('Error restoring backup:', error);
        alert('Error restoring backup. Please check the file.');
    } finally {
        loading.classList.remove('active');
        restoreInput.value = '';
    }
}

// Make removeChat globally accessible
window.removeChat = removeChat;
window.openMediaModal = openMediaModal;

// Keyboard shortcuts for modal
document.addEventListener('keydown', (e) => {
    if (mediaModal.classList.contains('active')) {
        if (e.key === 'Escape') {
            closeModal();
        } else if (e.key === 'ArrowLeft') {
            showPrevMedia();
        } else if (e.key === 'ArrowRight') {
            showNextMedia();
        }
    }
});

// Close modal on background click
mediaModal.addEventListener('click', (e) => {
    if (e.target === mediaModal) {
        closeModal();
    }
});