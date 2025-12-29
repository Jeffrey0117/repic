import { useState, useCallback } from 'react';

const translations = {
    en: {
        open_folder: "Open Folder",
        screenshot: "Screenshot",
        edit: "Edit",
        delete: "Delete",
        save: "Save",
        info: "Info",
        cancel: "Cancel",
        done: "Done",
        adjust_annotate: "Adjust & Annotate",
        drawing: "Drawing",
        select_folder: "Select a folder to begin",
        capturing: "CAPTURING...",
        discard_changes: "Discard changes?",
        close_image: "Close image?",
        refresh: "Refresh/Reset",
        copy: "Copy",
        edit_area: "Edit Area",
        gallery_view: "Gallery View",
        settings: "Settings",
        toggle_info: "Toggle Info Panel",
    },
    'zh-TW': {
        open_folder: "開啟資料夾",
        screenshot: "螢幕擷取",
        edit: "編輯",
        delete: "刪除",
        save: "儲存",
        info: "資訊",
        cancel: "取消",
        done: "完成",
        adjust_annotate: "調整與標註",
        drawing: "正在繪製",
        select_folder: "請選擇資料夾以開始",
        capturing: "擷取中...",
        discard_changes: "放棄變更？",
        close_image: "關閉圖片？",
        refresh: "重新整理/重設",
        copy: "複製",
        edit_area: "編輯區域",
        gallery_view: "圖庫檢視",
        settings: "設定",
        toggle_info: "切換資訊面板",
    },
    ja: {
        open_folder: "フォルダを開く",
        screenshot: "スクリーンショット",
        edit: "編集",
        delete: "削除",
        save: "保存",
        info: "情報",
        cancel: "キャンセル",
        done: "完了",
        adjust_annotate: "調整と注釈",
        drawing: "描画中",
        select_folder: "フォルダを選択してください",
        capturing: "キャプチャ中...",
        discard_changes: "変更を破棄しますか？",
        close_image: "画像を閉じますか？",
        refresh: "更新/リセット",
        copy: "コピー",
        edit_area: "編集エリア",
        gallery_view: "ギャラリー表示",
        settings: "設定",
        toggle_info: "情報パネルの切り替え",
    }
};

export const useTranslation = () => {
    const [lang, setLang] = useState(localStorage.getItem('repic_lang') || 'en');

    const t = useCallback((key) => {
        return translations[lang][key] || key;
    }, [lang]);

    const changeLanguage = (newLang) => {
        if (translations[newLang]) {
            setLang(newLang);
            localStorage.setItem('repic_lang', newLang);
        }
    };

    return { t, lang, changeLanguage };
};
