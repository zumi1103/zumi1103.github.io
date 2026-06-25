let editor;
let openFiles = {}; 
let currentTabId = null; 
let tabCounter = 0; 

// 起動時やタブを閉じた時に「空画面」の表示を切り替える関数
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
        automaticLayout: true
    });

    // エディタ内でCtrl+Sが押された時の処理
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async function() {
        await saveFile();
    });

    // 🌟エディタ内でAlt+Wが押された時もタブを閉じられるように設定
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyW, function() {
        if (currentTabId) closeTab(currentTabId);
    });
});

// ファイルハンドルを受け取ってエディタで開く共通関数
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

// --- 2. ファイルを開く処理（ボタンから複数選択） ---
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

// --- タブUI生成 ---
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

// --- タブ切り替え ---
function switchTab(tabId) {
    if (!openFiles[tabId]) return;
    currentTabId = tabId;
    editor.setModel(openFiles[tabId].model);
    
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

// --- タブ閉じる処理 ---
function closeTab(tabId) {
    if (!openFiles[tabId]) return;

    openFiles[tabId].model.dispose();
    delete openFiles[openFiles[tabId]]; // メモリから削除
    
    // UIから削除
    const tabEl = document.getElementById(tabId);
    if (tabEl) tabEl.remove();

    // 削除したデータを完全にopenFilesから消去
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

// --- 🌟4. キーボードショートカットの全体制御 ---
window.addEventListener('keydown', function(e) {
    // Ctrl + S (上書き保存)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
    }

    // Alt + W (選択中のタブを閉じる)
    if (e.altKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault(); // ブラウザ側の予期せぬ動作を防止
        if (currentTabId) {
            closeTab(currentTabId);
        }
    }
});

// --- トースト通知 ---
function showToast() {
    const toast = document.getElementById('toast');
    toast.className = 'toast-show';
    setTimeout(() => {
        toast.className = 'toast-hidden';
    }, 3000);
}

// 起動時に空画面の表示を判定
updateEmptyState();
