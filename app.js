// Global state
let chats = [];
let currentChatId = null;
let allMediaItems = [];
let currentMediaIndex = 0;
let supportsDirectoryPicker = false;
let isSelectingFolder = false;
let needsMediaReload = false;

// DOM Elements
const zipInput = document.getElementById('zipInput');
const zipBtn = document.getElementById('zipBtn');
const filesInput = document.getElementById('filesInput');
const filesBtn = document.getElementById('filesBtn');
const fileCounter = document.getElementById('fileCounter');
const dropZone = document.getElementById('dropZone');
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
const loadingText = document.getElementById('loadingText');
const loadingProgress = document.getElementById('loadingProgress');
const mediaModal = document.getElementById('mediaModal');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');
const modalDownload = document.getElementById('modalDownload');
const modalPrev = document.getElementById('modalPrev');
const modalNext = document.getElementById('modalNext');
const manualBackupBtn = document.getElementById('manualBackupBtn');
const backupInfo = document.getElementById('backupInfo');
const toastContainer = document.getElementById('toastContainer');
const mediaReloadBtn = document.getElementById('mediaReloadBtn');
const mediaReloadInput = document.getElementById('mediaReloadInput');

// Event Listeners
zipBtn.addEventListener('click', () => zipInput.click());
filesBtn.addEventListener('click', () => filesInput.click());
restoreBtn.addEventListener('click', () => restoreInput.click());
zipInput.addEventListener('change', handleZipUpload);
filesInput.addEventListener('change', handleFilesUpload);

// Drag and drop events
if (dropZone) {
    dropZone.addEventListener('click', () => filesInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            handleDroppedFiles(files);
        }
    });
}

restoreInput.addEventListener('change', handleRestore);
clearAllBtn.addEventListener('click', clearAllChats);
openSidebar.addEventListener('click', () => sidebar.classList.remove('mobile-hidden'));
closeSidebar.addEventListener('click', () => sidebar.classList.add('mobile-hidden'));
modalClose.addEventListener('click', closeModal);
modalDownload.addEventListener('click', downloadCurrentMedia);
modalPrev.addEventListener('click', showPrevMedia);
modalNext.addEventListener('click', showNextMedia);
manualBackupBtn.addEventListener('click', manualBackup);
if (mediaReloadBtn) mediaReloadBtn.addEventListener('click', () => mediaReloadInput.click());
if (mediaReloadInput) mediaReloadInput.addEventListener('change', handleMediaReload);

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

// Handle ZIP upload
async function handleZipUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    loading.classList.add('active');
    try {
        for (const file of files) {
            await processZipFile(file);
        }
        renderChatList();
        updateBackupButton();
        if (chats.length > 0) {
            showToast('✅ Chat loaded successfully!', 'success');
        }
    } catch (error) {
        console.error('Error processing ZIP:', error);
        showToast('❌ Error processing ZIP file: ' + error.message, 'warning');
    } finally {
        loading.classList.remove('active');
        event.target.value = '';
    }
}

// Handle multiple files upload (PRIMARY METHOD FOR MOBILE)
async function handleFilesUpload(event) {
    const files = Array.from(event.target.files);
    if (!files.length) {
        showToast('⚠️ No files selected', 'warning');
        return;
    }
    
    await processFilesArray(files);
    event.target.value = '';
}

// Handle dropped files
async function handleDroppedFiles(files) {
    await processFilesArray(files);
}

// Process files array (common logic for select and drop)
async function processFilesArray(files) {
    // Show file count
    fileCounter.textContent = `📄 ${files.length} file${files.length > 1 ? 's' : ''} selected`;
    fileCounter.classList.add('active');
    
    loading.classList.add('active');
    try {
        await processMultipleFiles(files);
        renderChatList();
        updateBackupButton();
        
        if (chats.length > 0) {
            showToast('✅ Chat loaded successfully!', 'success');
        } else {
            showToast('⚠️ No valid chat files found', 'warning');
        }
    } catch (error) {
        console.error('Error processing files:', error);
        showToast('❌ Error: ' + error.message, 'warning');
    } finally {
        loading.classList.remove('active');
        setTimeout(() => {
            fileCounter.classList.remove('active');
        }, 3000);
    }
}


// Update loading text
function updateLoading(text, progress = '') {
    if (loadingText) loadingText.textContent = text;
    if (loadingProgress) loadingProgress.textContent = progress;
}

// Process ZIP file
async function processZipFile(file) {
    updateLoading('Extracting ZIP file...', '');
    const zip = await JSZip.loadAsync(file);
    const files = Object.keys(zip.files);
    
    // Find chat text file
    const chatFile = files.find(f => f.endsWith('_chat.txt') || f.endsWith('.txt'));
    if (!chatFile) {
        throw new Error('No chat text file found in ZIP');
    }
    
    updateLoading('Reading chat text...', `Found: ${chatFile}`);
    const chatText = await zip.files[chatFile].async('text');
    updateLoading('Parsing messages...', '');
    const messages = parseWhatsAppChat(chatText);
    
    // Extract media files
    const mediaFiles = {};
    updateLoading('Extracting media files...', `0 / ${files.length}`);
    let mediaCount = 0;
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
            mediaCount++;
            if (mediaCount % 5 === 0) {
                updateLoading('Extracting media files...', `${mediaCount} / ${files.length}`);
            }
        }
    }
    
    // Link media to messages
    updateLoading('Linking media to messages...', `${Object.keys(mediaFiles).length} media files`);
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
    const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi', '.mkv', '.mp3', '.ogg', '.opus', '.m4a', '.wav'];
    return mediaExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
}

// Get media type
function getMediaType(fileName) {
    const ext = fileName.toLowerCase().split('.').pop();
    if (["jpg","jpeg","png","gif","webp"].includes(ext)) return 'image';
    if (["mp4","mov","avi","mkv"].includes(ext)) return 'video';
    if (["mp3","ogg","opus","m4a","wav"].includes(ext)) return 'audio';
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
        
        // Determine if sent or received
        // First sender in chat is the OTHER person, not the user
        const firstSender = chat.messages[0].sender;
        const isSent = msg.sender !== firstSender; // User messages are NOT from first sender
        messageDiv.classList.add(isSent ? 'sent' : 'received');
        
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
    updateBackupButton();
}

// Clear all chats
function clearAllChats() {
    if (confirm('Are you sure you want to clear all chats?')) {
        chats = [];
        currentChatId = null;
        renderChatList();
        updateBackupButton();
        chatView.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💬</div>
                <h2>Welcome to WhatsApp Chat Viewer</h2>
                <p>Upload WhatsApp chat ZIP files to view your conversations with full media support</p>
            </div>
        `;
        mobileHeaderTitle.textContent = 'WhatsApp Chat Viewer';
        showToast('🗑️ All chats cleared', 'info');
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Update backup button visibility and info
function updateBackupButton() {
    if (chats.length > 0) {
        manualBackupBtn.style.display = 'block';
        backupInfo.style.display = 'block';
        backupInfo.textContent = `${chats.length} chat${chats.length > 1 ? 's' : ''} ready to backup`;
    } else {
        manualBackupBtn.style.display = 'none';
        backupInfo.style.display = 'none';
    }
}

// Update media reload button visibility
function updateMediaReloadButton() {
    if (mediaReloadBtn) {
        if (needsMediaReload && chats.length > 0) {
            mediaReloadBtn.style.display = 'block';
        } else {
            mediaReloadBtn.style.display = 'none';
        }
    }
}

// Handle media reload after backup restore
async function handleMediaReload(event) {
    const files = Array.from(event.target.files);
    if (!files.length) {
        showToast('⚠️ No files selected', 'warning');
        return;
    }
    
    loading.classList.add('active');
    updateLoading('Reloading media files...', `${files.length} files`);
    
    try {
        let mediaUpdated = 0;
        
        // Process all uploaded files and match with existing media
        for (const file of files) {
            if (isMediaFile(file.name)) {
                const baseName = file.name.split('/').pop();
                const url = URL.createObjectURL(file);
                const mediaData = {
                    url: url,
                    name: baseName,
                    type: getMediaType(baseName)
                };
                
                // Update media in all chats
                for (const chat of chats) {
                    // Update in mediaFiles map
                    if (chat.mediaFiles && chat.mediaFiles[baseName]) {
                        chat.mediaFiles[baseName] = mediaData;
                        mediaUpdated++;
                    }
                    
                    // Update in messages
                    if (chat.messages) {
                        for (const msg of chat.messages) {
                            if (msg.media && msg.media.name === baseName) {
                                msg.media = mediaData;
                            }
                        }
                    }
                }
            }
        }
        
        // Re-render current chat if one is open
        if (currentChatId) {
            const currentChat = chats.find(c => c.id === currentChatId);
            if (currentChat) {
                renderChatView(currentChat);
            }
        }
        
        // Clear the flag and hide button
        needsMediaReload = false;
        updateMediaReloadButton();
        
        showToast(`✅ Media restored! ${mediaUpdated} file${mediaUpdated !== 1 ? 's' : ''} updated.`, 'success');
    } catch (error) {
        console.error('Error reloading media:', error);
        showToast('❌ Error reloading media: ' + error.message, 'warning');
    } finally {
        loading.classList.remove('active');
        event.target.value = '';
    }
}

// Manual backup function
function manualBackup() {
    if (chats.length === 0) {
        showToast('⚠️ No chats to backup', 'warning');
        return;
    }
    
    downloadBackup();
    showToast('✅ Backup saved to Downloads folder!', 'success');
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
    
    // Show warning before restoring
    const confirmed = confirm(
        '⚠️ IMPORTANT: Backup contains chat structure only.\n\n' +
        'Media files (images, videos, audio) are NOT included in the backup.\n\n' +
        'To view media, you\'ll need to re-upload the original ZIP/folder files after restoration.\n\n' +
        'Continue with restoration?'
    );
    
    if (!confirmed) {
        restoreInput.value = '';
        return;
    }
    
    loading.classList.add('active');
    
    try {
        const text = await file.text();
        const backup = JSON.parse(text);
        
        if (backup.chats && Array.isArray(backup.chats)) {
            // Clear existing chats first
            chats = [];
            
            // Restore chat structure (media URLs will be dead blob URLs)
            chats = backup.chats.map(chat => ({
                ...chat,
                // Mark that media needs re-upload
                mediaRestored: false
            }));
            
            renderChatList();
            updateBackupButton();
            
            // Set flag to show media reload button
            needsMediaReload = true;
            updateMediaReloadButton();
            
            showToast(
                `✅ Restored ${chats.length} chat${chats.length > 1 ? 's' : ''}! Please upload files to restore media.`,
                'success'
            );
            
            // Show additional info toast
            setTimeout(() => {
                showToast('📁 Click "Upload Files for Media" to restore images and videos', 'info');
            }, 4500);
        } else {
            throw new Error('Invalid backup file format');
        }
    } catch (error) {
        console.error('Error restoring backup:', error);
        showToast('❌ Error restoring backup. Please check the file.', 'warning');
    } finally {
        loading.classList.remove('active');
        restoreInput.value = '';
    }
}

// Make removeChat globally accessible
window.removeChat = removeChat;
window.openMediaModal = openMediaModal;

// Initialize on page load
updateBackupButton();
updateMediaReloadButton();

// Process multiple files from file input (MAIN METHOD)
async function processMultipleFiles(fileList) {
    updateLoading('Analyzing files...', `${fileList.length} files`);
    
    // Find all _chat.txt or .txt files
    const chatFiles = fileList.filter(f => f.name.endsWith('_chat.txt') || (f.name.endsWith('.txt') && !f.name.includes('Media')));
    if (chatFiles.length === 0) {
        throw new Error('No WhatsApp chat text file found (looked for _chat.txt or .txt)');
    }
    
    // Process each chat text file
    for (const chatFile of chatFiles) {
        updateLoading('Reading chat file...', chatFile.name);
        const chatText = await chatFile.text();
        updateLoading('Parsing messages...', '');
        const messages = parseWhatsAppChat(chatText);
        const mediaFiles = {};
        updateLoading('Processing media files...', `0 / ${fileList.length}`);
        let mediaProcessed = 0;
        // Find all media files in same folder structure
        for (const mediaFile of fileList) {
            if (isMediaFile(mediaFile.name)) {
                // Use full filename or base
                const baseName = mediaFile.name.split('/').pop();
                const url = URL.createObjectURL(mediaFile);
                mediaFiles[baseName] = {
                    url: url,
                    name: baseName,
                    type: getMediaType(baseName)
                };
            }
            mediaProcessed++;
            if (mediaProcessed % 10 === 0) {
                updateLoading('Processing media files...', `${mediaProcessed} / ${fileList.length}`);
            }
        }
        // Link media to messages
        updateLoading('Linking media...', `${Object.keys(mediaFiles).length} media files`);
        messages.forEach(msg => {
            const mediaPattern = /(IMG-|VID-|AUD-|PTT-|VOICE-|VIDE-|PHOTO-)[\w-]+\.[\w]+|<Media omitted>|\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|mkv|mp3|ogg|opus|m4a|wav)/gi;
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
        // Extract chat name from first message
        let chatName = 'Unknown Chat';
        if (messages.length > 0) {
            const senders = [...new Set(messages.map(m => m.sender))];
            chatName = senders.length > 1 ? senders.join(', ') : senders[0];
            if (chatName.length > 50) chatName = chatName.substring(0,47) + '...';
        }
        const chat = {
            id: Date.now() + Math.random(),
            name: chatName,
            messages: messages,
            mediaFiles: mediaFiles,
            lastMessage: messages[messages.length - 1]?.text || 'No messages',
            timestamp: messages[messages.length -1]?.timestamp || Date.now()
        };
        chats.push(chat);
    }
}

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
