let editor;
let openFiles = {}; 
let currentTabId = null; 
let tabCounter = 0; 

// 🌟新機能：開いているファイル数に応じて「空画面」と「エディタ」を切り替える関数
function updateEmptyState() {
    const emptyState = document.getElementById('empty-state');
    if (Object.keys(openFiles).length === 0) {
        emptyState.classList.remove('hidden'); // ファイルが0なら案内を表示
    } else {
        emptyState.classList.add('hidden'); // 1つでもあれば隠す
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

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async function() {
        await saveFile();
    });
});

// 🌟新機能：ファイルハンドルを受け取ってエディタで開く共通関数（複数対応用）
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
    updateEmptyState(); // 画面状態を更新
}

// --- 2. ファイルを開く処理（🌟ボタンから複数選択対応） ---
document.getElementById('openBtn').addEventListener('click', async () => {
    try {
        // multiple: true で複数ファイル選択を許可
        const handles = await window.showOpenFilePicker({ multiple: true });
        for (const handle of handles) {
            await openFileFromHandle(handle);
        }
    } catch (err) {
        console.log('ファイルの選択がキャンセルされました', err);
    }
});

// --- 🌟新機能：ドラッグ＆ドロップ対応（複数対応） ---
document.body.addEventListener('dragover', (e) => {
    e.preventDefault(); // ブラウザ標準の動作（画像として開く等）をキャンセル
});

document.body.addEventListener('drop', async (e) => {
    e.preventDefault();
    const items = e.dataTransfer.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
            // 単なるファイルではなく、上書き保存可能な「ハンドル」として取得
            const handle = await item.getAsFileSystemHandle();
            if (handle && handle.kind === 'file') {
                await openFileFromHandle(handle);
            }
        }
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
    openFiles[tabId].model.dispose();
    delete openFiles[tabId];
    document.getElementById(tabId).remove();

    if (currentTabId === tabId) {
        currentTabId = null;
        editor.setModel(null); 
        
        const remainingTabs = Object.keys(openFiles);
        if (remainingTabs.length > 0) {
            switchTab(remainingTabs[remainingTabs.length - 1]);
        }
    }
    updateEmptyState(); // 🌟追加：全部閉じたかチェックしてUI更新
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

// --- 4. Ctrl+S 制御 ---
window.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
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

// 🌟起動時に空画面の表示を判定
updateEmptyState();
