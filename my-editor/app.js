let editor;
// 🌟変更点：複数ファイルを管理するための変数
let openFiles = {}; // 開いているファイルの情報を保存する辞書 { tabId: { handle, model, name } }
let currentTabId = null; // 現在画面に表示しているタブのID
let tabCounter = 0; // タブに一意のIDを付けるためのカウンター

// --- 1. Monaco Editor の初期化処理 ---
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: "// ファイルを開いてください\n",
        language: 'plaintext',
        theme: 'vs-dark',
        automaticLayout: true
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async function() {
        await saveFile();
    });
});

// --- 2. ファイルを開く処理 ---
document.getElementById('openBtn').addEventListener('click', async () => {
    try {
        const [handle] = await window.showOpenFilePicker();
        const file = await handle.getFile();
        const text = await file.text();

        // 言語の判定
        const extMap = {
            'js': 'javascript', 'json': 'json', 'html': 'html', 'css': 'css',
            'ps1': 'powershell', 'py': 'python', 'xml': 'xml', 'md': 'markdown',
            'ts': 'typescript', 'sql': 'sql', 'java': 'java', 'cs': 'csharp',
            'c': 'c', 'cpp': 'cpp', 'sh': 'shell', 'bat': 'bat'
        };
        const ext = file.name.split('.').pop().toLowerCase();
        const language = extMap[ext] || 'plaintext';

        // 🌟タブ管理：新しいModelを作り、辞書に保存する
        const model = monaco.editor.createModel(text, language);
        const tabId = 'tab_' + (++tabCounter);
        
        openFiles[tabId] = {
            handle: handle,
            model: model,
            name: file.name
        };

        // UI（画面上）にタブを追加して、そのタブに切り替える
        createTabUI(tabId, file.name);
        switchTab(tabId);

    } catch (err) {
        console.log('ファイルの選択がキャンセルされました', err);
    }
});

// --- 🌟新機能：タブのUIを作成する関数 ---
function createTabUI(tabId, fileName) {
    const tabsContainer = document.getElementById('tabs-container');
    
    // タブの要素を作る
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.id = tabId;
    
    // ファイル名部分
    const nameEl = document.createElement('span');
    nameEl.textContent = fileName;
    
    // 閉じる(×)ボタン
    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';
    
    // ×ボタンが押された時の処理
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // タブ自体のクリックイベントが発動するのを防ぐ
        closeTab(tabId);
    });

    // タブ自体がクリックされたら切り替える
    tabEl.addEventListener('click', () => {
        switchTab(tabId);
    });

    tabEl.appendChild(nameEl);
    tabEl.appendChild(closeBtn);
    tabsContainer.appendChild(tabEl);
}

// --- 🌟新機能：タブを切り替える関数 ---
function switchTab(tabId) {
    if (!openFiles[tabId]) return;

    currentTabId = tabId;
    
    // エディタの中身を、選んだタブのModelに差し替える
    editor.setModel(openFiles[tabId].model);

    // 見た目（CSS）のアクティブ状態を更新する
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

// --- 🌟新機能：タブを閉じる関数 ---
function closeTab(tabId) {
    // Modelのメモリを解放する
    openFiles[tabId].model.dispose();
    delete openFiles[tabId];

    // UIからタブを消す
    const tabEl = document.getElementById(tabId);
    tabEl.remove();

    // もし今開いているタブを閉じたら、画面をリセットするか別のタブを開く
    if (currentTabId === tabId) {
        currentTabId = null;
        editor.setModel(null); // エディタを空にする
        
        // 残っているタブがあれば、一番最後のタブを開く
        const remainingTabs = Object.keys(openFiles);
        if (remainingTabs.length > 0) {
            switchTab(remainingTabs[remainingTabs.length - 1]);
        }
    }
}

// --- 3. ファイルを上書き保存する処理 ---
async function saveFile() {
    if (!currentTabId || !openFiles[currentTabId]) {
        alert('保存するファイルが開かれていません。');
        return;
    }
    try {
        // 現在アクティブなタブの操作権限（ハンドル）を取得
        const handle = openFiles[currentTabId].handle;
        const writable = await handle.createWritable();
        
        // エディタの現在の内容を書き込む
        await writable.write(editor.getValue());
        await writable.close();

        showToast();
    } catch (err) {
        console.error('保存エラー:', err);
        alert('保存に失敗しました。');
    }
}

// --- 4. Ctrl+S の制御 ---
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



