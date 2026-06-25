let editor; // エディタ本体の変数
let currentFileHandle = null; // 現在開いているファイルの操作権限（ハンドル）

// --- 1. Monaco Editor の初期化処理 ---
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
require(['vs/editor/editor.main'], function () {
    // エディタの作成
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: "// ここにコードが表示されます\n",
        language: 'javascript',
        theme: 'vs-dark', // VSCode風のダークテーマ
        automaticLayout: true // ウィンドウサイズ変更に自動で追従する
    });

    // エディタ内でCtrl+Sが押された時の処理を登録
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async function() {
        await saveFile();
    });
});

// --- 2. ファイルを開く処理 ---
document.getElementById('openBtn').addEventListener('click', async () => {
    try {
        // PC内のファイルを選択させるダイアログを表示
        const [handle] = await window.showOpenFilePicker();
        currentFileHandle = handle;

        // ファイルのデータを読み込む
        const file = await currentFileHandle.getFile();
        const text = await file.text();

        // 画面にファイル名を表示
        document.getElementById('fileName').textContent = file.name;

        // 拡張子から言語を判定（簡易的）
        const extMap = {
            'js': 'javascript',
            'json': 'json',
            'html': 'html',
            'css': 'css',
            'ps1': 'powershell',
            'py': 'python',
            'xml': 'xml',
            'md': 'markdown',
            'ts': 'typescript',
            'sql': 'sql',
            'java': 'java',
            'cs': 'csharp',
            'c': 'c',
            'cpp': 'cpp',
            'sh': 'shell',
            'bat': 'bat'
        };

        // 拡張子を取得して対応表から言語を探す。見つからなければ 'plaintext' にする
        const ext = file.name.split('.').pop().toLowerCase();
        const language = extMap[ext] || 'plaintext';

        // エディタに読み込んだテキストと言語ルールをセット
        const model = monaco.editor.createModel(text, language);
        editor.setModel(model);

    } catch (err) {
        console.log('ファイルの選択がキャンセルされました', err);
    }
});

// --- 3. ファイルを上書き保存する処理 ---
async function saveFile() {
    if (!currentFileHandle) {
        alert('まずはファイルを開いてください。');
        return;
    }
    try {
        // 上書き保存用のストリームを作成
        const writable = await currentFileHandle.createWritable();
        // エディタの現在の内容を書き込む
        await writable.write(editor.getValue());
        // ファイルを閉じて保存完了
        await writable.close();

        // 保存成功の通知を出す
        showToast();
        
        // ユーザーに保存できたことを通知（VSCodeっぽく目立たないようにしてもOK）
        console.log('保存完了!'); 
    } catch (err) {
        console.error('保存エラー:', err);
        alert('保存に失敗しました。');
    }
}

// --- 4. ブラウザ全体のCtrl+Sを無効化し、自作の保存処理を優先させる ---
window.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault(); // ブラウザ標準の「Webページを保存」ダイアログを止める
        saveFile(); // 自作の保存処理を走らせる
    }
});

// 🌟ここを追加：通知を表示して、3秒後に隠す関数
function showToast() {
    const toast = document.getElementById('toast');
    toast.className = 'toast-show'; // 表示用クラスに切り替えてアニメーション発動
    
    // 3000ミリ秒（3秒）後に再び非表示にする
    setTimeout(() => {
        toast.className = 'toast-hidden';
    }, 3000);
}





