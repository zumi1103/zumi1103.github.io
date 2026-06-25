let editor;
let openFiles = {}; 
let currentTabId = null; 
let tabCounter = 0; 

function updateEmptyState() {
    const emptyState = document.getElementById('empty-state');
    if (Object.keys(openFiles).length === 0) {
        emptyState.classList.remove('hidden'); 
    } else {
        emptyState.classList.add('hidden'); 
    }
}

// --- 1. Monaco Editor の初期化処理 ---
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: "",
        language: 'plaintext',
        theme: 'vs-dark',
        automaticLayout: true,
        mouseWheelZoom: true,
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async function() {
        await saveFile();
    });

    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyW, function() {
        if (currentTabId) closeTab(currentTabId);
    });

    document.getElementById('zoomInBtn').addEventListener('click', () => {
        editor.getAction('editor.action.fontZoomIn').run();
    });
    document.getElementById('zoomOutBtn').addEventListener('click', () => {
        editor.getAction('editor.action.fontZoomOut').run();
    });
    document.getElementById('zoomResetBtn').addEventListener('click', () => {
        editor.getAction('editor.action.fontZoomReset').run();
    });
});

async function openFileFromHandle(handle) {
    const file = await handle.getFile();
    const text = await file.text();

    const extMap = {
        'js': 'javascript', 'json': 'json', 'html': 'html', 'css': 'css',
        'ps1': 'powershell', 'py': 'python', 'xml': 'xml', 'md': 'markdown',
        'ts': 'typescript', 'sql': 'sql', 'java': 'java', 'cs': 'csharp',
        'c': 'c', 'cpp': 'cpp', 'sh': 'shell', 'bat': 'bat'
    };
    const ext = file.name.split('.').pop().toLowerCase();
    const language = extMap[ext] || 'plaintext';

    const model = monaco.editor.createModel(text, language);
    const tabId = 'tab_' + (++tabCounter);
    
    openFiles[tabId] = { handle: handle, model: model, name: file.name };

    createTabUI(tabId, file.name);
    switchTab(tabId);
    updateEmptyState(); 
}

// --- 2. ファイルを開く処理 ---
document.getElementById('openBtn').addEventListener('click', async () => {
    try {
        const handles = await window.showOpenFilePicker({ multiple: true });
        for (const handle of handles) {
            await openFileFromHandle(handle);
        }
    } catch (err) {
        console.log('ファイルの選択がキャンセルされました', err);
    }
});

// --- ドラッグ＆ドロップ対応 ---
document.body.addEventListener('dragover', (e) => {
    e.preventDefault(); 
});

document.body.addEventListener('drop', async (e) => {
    e.preventDefault();
    const items = e.dataTransfer.items;
    if (!items) return;

    const handlePromises = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
            handlePromises.push(item.getAsFileSystemHandle());
        }
    }

    try {
        const handles = await Promise.all(handlePromises);
        for (const handle of handles) {
            if (handle && handle.kind === 'file') {
                await openFileFromHandle(handle);
            }
        }
    } catch (err) {
        console.error('ドロップ処理エラー:', err);
    }
});

// --- タブUI生成・切り替え・閉じる ---
function createTabUI(tabId, fileName) {
    const tabsContainer = document.getElementById('tabs-container');
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.id = tabId;
    
    const nameEl = document.createElement('span');
    nameEl.textContent = fileName;
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';
    
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        closeTab(tabId);
    });

    tabEl.addEventListener('click', () => {
        switchTab(tabId);
    });

    tabEl.appendChild(nameEl);
    tabEl.appendChild(closeBtn);
    tabsContainer.appendChild(tabEl);
}

function switchTab(tabId) {
    if (!openFiles[tabId]) return;
    currentTabId = tabId;
    editor.setModel(openFiles[tabId].model);
    
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

function closeTab(tabId) {
    if (!openFiles[tabId]) return;

    openFiles[tabId].model.dispose();
    
    const tabEl = document.getElementById(tabId);
    if (tabEl) tabEl.remove();

    delete openFiles[tabId];

    if (currentTabId === tabId) {
        currentTabId = null;
        editor.setModel(null); 
        
        const remainingTabs = Object.keys(openFiles);
        if (remainingTabs.length > 0) {
            switchTab(remainingTabs[remainingTabs.length - 1]);
        }
    }
    updateEmptyState(); 
}

// --- 3. 保存処理 ---
async function saveFile() {
    if (!currentTabId || !openFiles[currentTabId]) return;
    try {
        const handle = openFiles[currentTabId].handle;
        const writable = await handle.createWritable();
        await writable.write(editor.getValue());
        await writable.close();
        showToast();
    } catch (err) {
        console.error('保存エラー:', err);
        alert('保存に失敗しました。');
    }
}

// --- 4. キーボードショートカット制御 ---
window.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
    }

    if (e.altKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        if (currentTabId) {
            closeTab(currentTabId);
        }
    }
});

function showToast() {
    const toast = document.getElementById('toast');
    toast.className = 'toast-show';
    setTimeout(() => {
        toast.className = 'toast-hidden';
    }, 3000);
}

// 🌟追加：ヘルプモーダルの制御
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeModalBtn = document.getElementById('closeModalBtn');

// 「i」ボタンをクリックで開く
helpBtn.addEventListener('click', () => {
    helpModal.classList.add('modal-show');
});

// 「×」ボタンで閉じる
closeModalBtn.addEventListener('click', () => {
    helpModal.classList.remove('modal-show');
});

// モーダルの外側（暗い背景部分）をクリックしても閉じる
helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
        helpModal.classList.remove('modal-show');
    }
});

updateEmptyState();
