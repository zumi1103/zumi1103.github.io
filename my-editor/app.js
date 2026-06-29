let editor;
let openFiles = {}; 
let currentTabId = null; 
let tabCounter = 0; 

let autoSaveEnabled = localStorage.getItem('autoSaveEnabled') === 'true'; 
let autoSaveTimeout = null;

function updateEmptyState() {
    const emptyState = document.getElementById('empty-state');
    const encodingSelect = document.getElementById('encodingSelect');
    
    if (Object.keys(openFiles).length === 0) {
        emptyState.classList.remove('hidden'); 
        encodingSelect.classList.add('hidden'); 
        document.getElementById('breadcrumbs-text').textContent = 'ファイルが開かれていません';
    } else {
        emptyState.classList.add('hidden'); 
        encodingSelect.classList.remove('hidden');
    }
}

function updateTabDirtyStatus(tabId, isDirty) {
    const tabEl = document.getElementById(tabId);
    if (!tabEl) return;
    const dirtyMark = tabEl.querySelector('.tab-dirty');
    if (dirtyMark) {
        if (isDirty) {
            dirtyMark.classList.remove('hidden');
        } else {
            dirtyMark.classList.add('hidden');
        }
    }
}

async function writeContentToFile(handle, content, encoding) {
    let writeData = content;
    if (encoding === 'utf8bom') {
        const encoder = new TextEncoder();
        const textBytes = encoder.encode(content);
        writeData = new Uint8Array(3 + textBytes.length);
        writeData.set([0xEF, 0xBB, 0xBF], 0);
        writeData.set(textBytes, 3);
    }
    const writable = await handle.createWritable();
    await writable.write(writeData);
    await writable.close();
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
        await saveFile(false); 
    });

    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyW, async function() {
        if (currentTabId) await closeTab(currentTabId);
    });

    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyN, function() {
        createNewFile();
    });

    editor.onDidChangeModelContent(() => {
        if (currentTabId && openFiles[currentTabId]) {
            if (!openFiles[currentTabId].isDirty) {
                openFiles[currentTabId].isDirty = true;
                updateTabDirtyStatus(currentTabId, true); 
            }
        }

        // 自動保存（PC上のファイルハンドルが確定している時のみ）
        if (autoSaveEnabled && currentTabId && openFiles[currentTabId].handle) {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(async () => {
                await saveFile(true); 
            }, 1500);
        }
    });

    document.getElementById('zoomInBtn').addEventListener('click', () => { editor.getAction('editor.action.fontZoomIn').run(); });
    document.getElementById('zoomOutBtn').addEventListener('click', () => { editor.getAction('editor.action.fontZoomOut').run(); });
    document.getElementById('zoomResetBtn').addEventListener('click', () => { editor.getAction('editor.action.fontZoomReset').run(); });
});

// 新規ファイル作成
function createNewFile() {
    const model = monaco.editor.createModel("", 'plaintext');
    const tabId = 'tab_' + (++tabCounter);
    
    openFiles[tabId] = {
        handle: null,
        model: model,
        name: `新規ファイル_${tabCounter}.txt`,
        isDirty: false,
        encoding: 'utf8',
        pathString: `新規ファイル > 新規ファイル_${tabCounter}.txt`
    };

    createTabUI(tabId, openFiles[tabId].name);
    switchTab(tabId);
    updateEmptyState();
}

// 名前を付けて保存
async function saveFileAs() {
    if (!currentTabId || !openFiles[currentTabId]) return;
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: openFiles[currentTabId].name
        });
        
        openFiles[currentTabId].handle = handle;
        openFiles[currentTabId].name = handle.name;
        openFiles[currentTabId].pathString = `ローカルファイル > ${handle.name}`;
        
        const tabEl = document.getElementById(currentTabId);
        if (tabEl) tabEl.querySelector('span').textContent = handle.name;
        
        const extMap = {
            'js': 'javascript', 'json': 'json', 'html': 'html', 'css': 'css',
            'ps1': 'powershell', 'py': 'python', 'xml': 'xml', 'md': 'markdown',
            'ts': 'typescript', 'sql': 'sql', 'java': 'java', 'cs': 'csharp',
            'c': 'c', 'cpp': 'cpp', 'sh': 'shell', 'bat': 'bat'
        };
        const ext = handle.name.split('.').pop().toLowerCase();
        const language = extMap[ext] || 'plaintext';
        monaco.editor.setModelLanguage(openFiles[currentTabId].model, language);

        const content = editor.getValue();
        await writeContentToFile(handle, content, openFiles[currentTabId].encoding);
        
        openFiles[currentTabId].isDirty = false;
        updateTabDirtyStatus(currentTabId, false);
        document.getElementById('breadcrumbs-text').textContent = openFiles[currentTabId].pathString;
        showToast();
    } catch (err) {
        console.log('名前を付けて保存がキャンセルされました', err);
    }
}

// 🌟変更点：パンくず表示用の相対パス（pathString）を受け取れるように拡張
async function openFileFromHandle(handle, pathString = null) {
    // 既に全く同じファイル・パス構成で開かれている場合はタブ切り替えのみ行う
    for (const id in openFiles) {
        if (openFiles[id].handle && openFiles[id].handle.name === handle.name) {
            if (!pathString || openFiles[id].pathString === pathString) {
                switchTab(id);
                return;
            }
        }
    }

    const file = await handle.getFile();
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let encoding = 'utf8';
    
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        encoding = 'utf8bom';
    }
    
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(bytes);

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
    
    // パス指定が無い（ドラッグ＆ドロップなど）場合のデフォルトパンくず
    const finalPathString = pathString || `フォルダ外のファイル > ${file.name}`;
    
    openFiles[tabId] = { 
        handle: handle, 
        model: model, 
        name: file.name, 
        isDirty: false, 
        encoding: encoding,
        pathString: finalPathString
    };

    createTabUI(tabId, file.name);
    switchTab(tabId);
    updateEmptyState(); 
}

// --- 🌟新機能：フォルダを開き、再帰スキャンしてサイドバーにツリーを生成する処理 ---
document.getElementById('openDirBtn').addEventListener('click', async () => {
    try {
        const dirHandle = await window.showDirectoryPicker();
        const fileTreeContainer = document.getElementById('file-tree');
        fileTreeContainer.innerHTML = ''; // 初期化

        // ルートフォルダ要素の作成
        const rootEl = document.createElement('div');
        rootEl.className = 'tree-item tree-folder';
        rootEl.textContent = `📁 ${dirHandle.name}`;
        fileTreeContainer.appendChild(rootEl);

        // 再帰処理をスタート
        await traverseDirectory(dirHandle, fileTreeContainer, 1, dirHandle.name);
    } catch (err) {
        console.error('フォルダの選択がキャンセルまたは拒否されました:', err);
    }
});

// 🌟新機能：ディレクトリを走査する高度な再帰関数
async function traverseDirectory(dirHandle, containerEl, depth, currentPath) {
    const entries = [];
    for await (const entry of dirHandle.values()) {
        entries.push(entry);
    }
    
    // VSCodeに準拠：フォルダを上、ファイルを下に、それぞれ名前順でソート
    entries.sort((a, b) => {
        if (a.kind !== b.kind) {
            return a.kind === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
        const itemEl = document.createElement('div');
        itemEl.className = `tree-item indent-${depth}`; // 階層に応じたインデントクラスを付与
        
        // パンくず用の相対パス文字列を蓄積構築
        const newPath = `${currentPath} > ${entry.name}`;

        if (entry.kind === 'directory') {
            itemEl.classList.add('tree-folder');
            itemEl.textContent = `📁 ${entry.name}`;
            containerEl.appendChild(itemEl);
            // 深さを1増やしてさらに子階層を走査
            await traverseDirectory(entry, containerEl, depth + 1, newPath);
        } else {
            itemEl.classList.add('tree-file');
            itemEl.textContent = `📄 ${entry.name}`;
            
            // サイドバーのファイル名クリックでエディタで開く（相対パス情報を同封）
            itemEl.addEventListener('click', async () => {
                await openFileFromHandle(entry, newPath);
            });
            containerEl.appendChild(itemEl);
        }
    }
}

const encodingSelect = document.getElementById('encodingSelect');
encodingSelect.addEventListener('change', (e) => {
    if (currentTabId && openFiles[currentTabId]) {
        openFiles[currentTabId].encoding = e.target.value;
        if (!openFiles[currentTabId].isDirty) {
            openFiles[currentTabId].isDirty = true;
            updateTabDirtyStatus(currentTabId, true);
        }
    }
});

// --- 2. ファイルを開く / 新規作成ボタンのイベント ---
document.getElementById('openBtn').addEventListener('click', async () => {
    try {
        const handles = await window.showOpenFilePicker({ multiple: true });
        for (const handle of handles) { await openFileFromHandle(handle); }
    } catch (err) { console.log('ファイルの選択がキャンセルされました', err); }
});

document.getElementById('newBtn').addEventListener('click', () => {
    createNewFile();
});

// ドラッグ＆ドロップ対応
document.body.addEventListener('dragover', (e) => { e.preventDefault(); });
document.body.addEventListener('drop', async (e) => {
    e.preventDefault();
    const items = e.dataTransfer.items;
    if (!items) return;
    const handlePromises = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') { handlePromises.push(item.getAsFileSystemHandle()); }
    }
    try {
        const handles = await Promise.all(handlePromises);
        for (const handle of handles) { if (handle && handle.kind === 'file') { await openFileFromHandle(handle); } }
    } catch (err) { console.error('ドロップ処理エラー:', err); }
});

// --- タブUI生成・切り替え・閉じる ---
function createTabUI(tabId, fileName) {
    const tabsContainer = document.getElementById('tabs-container');
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.id = tabId;
    
    const nameEl = document.createElement('span');
    nameEl.textContent = fileName;
    
    const dirtyMark = document.createElement('span');
    dirtyMark.className = 'tab-dirty hidden';
    dirtyMark.textContent = '●';
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';
    
    closeBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); 
        await closeTab(tabId);
    });

    tabEl.addEventListener('click', () => { switchTab(tabId); });

    tabEl.appendChild(nameEl);
    tabEl.appendChild(dirtyMark); 
    tabEl.appendChild(closeBtn);
    tabsContainer.appendChild(tabEl);
}

function switchTab(tabId) {
    if (!openFiles[tabId]) return;
    currentTabId = tabId;
    editor.setModel(openFiles[tabId].model);
    encodingSelect.value = openFiles[tabId].encoding;
    
    // 🌟新機能：タブ切り替え時、上部のパンくずリスト（相対パス）を連動書き換え
    document.getElementById('breadcrumbs-text').textContent = openFiles[tabId].pathString;
    
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    editor.focus();
}

async function closeTab(tabId) {
    if (!openFiles[tabId]) return;

    if (openFiles[tabId].isDirty && (!openFiles[tabId].handle || !autoSaveEnabled)) {
        const confirmClose = confirm(`「${openFiles[tabId].name}」への変更は保存されていません。\n保存せずに閉じますか？`);
        if (!confirmClose) return; 
    }

    if (autoSaveEnabled && openFiles[tabId].isDirty && openFiles[tabId].handle) {
        clearTimeout(autoSaveTimeout);
        const content = (currentTabId === tabId) ? editor.getValue() : openFiles[tabId].model.getValue();
        await writeContentToFile(openFiles[tabId].handle, content, openFiles[tabId].encoding);
    }

    openFiles[tabId].model.dispose();
    const tabEl = document.getElementById(tabId);
    if (tabEl) tabEl.remove();
    delete openFiles[tabId];

    if (currentTabId === tabId) {
        currentTabId = null;
        editor.setModel(null); 
        const remainingTabs = Object.keys(openFiles);
        if (remainingTabs.length > 0) { switchTab(remainingTabs[remainingTabs.length - 1]); }
    }
    updateEmptyState(); 
}

// 保存処理
async function saveFile(isSilent = false) {
    if (!currentTabId || !openFiles[currentTabId]) return;
    
    if (!openFiles[currentTabId].handle) {
        if (isSilent) return; 
        await saveFileAs();
        return;
    }

    try {
        const content = editor.getValue();
        await writeContentToFile(openFiles[currentTabId].handle, content, openFiles[currentTabId].encoding);
        openFiles[currentTabId].isDirty = false;
        updateTabDirtyStatus(currentTabId, false); 
        if (!isSilent) showToast(); 
    } catch (err) {
        console.error('保存エラー:', err);
        if (!isSilent) alert('保存に失敗しました。');
    }
}

// キーボードショートカット制御
window.addEventListener('keydown', async function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        await saveFile(false);
    }
    if (e.altKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        if (currentTabId) await closeTab(currentTabId);
    }
    if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        createNewFile();
    }
});

function showToast() {
    const toast = document.getElementById('toast');
    toast.className = 'toast-show';
    setTimeout(() => { toast.className = 'toast-hidden'; }, 3000);
}

// ヘルプモーダルと設定メニューの制御
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeModalBtn = document.getElementById('closeModalBtn');
helpBtn.addEventListener('click', () => { helpModal.classList.add('modal-show'); });
closeModalBtn.addEventListener('click', () => { helpModal.classList.remove('modal-show'); });
helpModal.addEventListener('click', (e) => { if (e.target === helpModal) { helpModal.classList.remove('modal-show'); } });

const settingsBtn = document.getElementById('settingsBtn');
const settingsMenu = document.getElementById('settingsMenu');
const autoSaveToggle = document.getElementById('autoSaveToggle');
autoSaveToggle.checked = autoSaveEnabled;

settingsBtn.addEventListener('click', (e) => { e.stopPropagation(); settingsMenu.classList.toggle('menu-hidden'); });
document.addEventListener('click', (e) => { if (!settingsBtn.contains(e.target) && !settingsMenu.contains(e.target)) { settingsMenu.classList.add('menu-hidden'); } });
autoSaveToggle.addEventListener('change', (e) => { autoSaveEnabled = e.target.checked; localStorage.setItem('autoSaveEnabled', autoSaveEnabled); });

updateEmptyState();
