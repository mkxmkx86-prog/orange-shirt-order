# 讀稿機 Teleprompter

輕量、免安裝的網頁讀稿機。純前端（HTML + CSS + Vanilla JS），部署在 GitHub Pages 上即可使用；
支援 PWA，第一次連網開啟後就能「加到主畫面」離線使用，適合校內活動主持、致詞、簡報排練。

## 功能（MVP）

- 講稿輸入區，內容自動存到瀏覽器 `localStorage`（重新整理不遺失）
- 播放控制：開始 / 暫停 / 重新開始
- 捲動速度滑桿，即時生效（數值 = 每秒捲動的像素數）
- 字級調整（20–160 px）
- 全螢幕播放模式：黑底白字、高對比、閱讀基準線
- 鏡像模式：左右翻轉（實體讀稿機玻璃用），另附上下翻轉
- 鍵盤快捷鍵
- 響應式版面，手機／平板／桌機皆可用
- PWA 離線支援（`manifest.json` + Service Worker，Cache First）

## 鍵盤快捷鍵（播放畫面）

| 按鍵 | 功能 |
| --- | --- |
| `空白鍵` | 播放 / 暫停 |
| `↑` `↓` | 加快 / 放慢捲動速度 |
| `+` `-` | 放大 / 縮小字級 |
| `R` | 從頭重來 |
| `M` | 鏡像切換 |
| `Esc` | 離開播放，回到編輯畫面 |

滑鼠滾輪（或觸控）可在播放中微調目前位置；點一下畫面等同播放／暫停。
控制列在播放時會自動淡出，移動滑鼠或觸控即再次出現。

## 檔案結構

```
teleprompter/
  index.html        # 編輯畫面 + 全螢幕播放畫面
  manifest.json     # PWA 設定檔
  sw.js             # Service Worker，Cache First 離線快取
  icons/            # PWA 圖示（192 / 512 / maskable）
  css/style.css
  js/app.js         # 主邏輯：捲動、播放控制、快捷鍵、全螢幕
  js/storage.js     # localStorage 存取
  README.md
```

## 部署到 GitHub Pages

1. 到 repo 的 **Settings → Pages**
2. **Source** 選 `Deploy from a branch`，Branch 選 `main`、資料夾選 `/ (root)`
3. 儲存後稍等一兩分鐘，網址為：
   `https://<帳號>.github.io/<repo 名稱>/teleprompter/`

> Service Worker 需要 HTTPS 才能運作。GitHub Pages 預設就是 HTTPS，
> 本機測試則可用 `http://localhost`（例如在此資料夾執行 `python3 -m http.server`）。

## 在手機／電腦上離線使用

1. **有網路時**，先用瀏覽器開啟上面的網址一次（讓 Service Worker 完成快取）
2. **手機**：瀏覽器選單選「加到主畫面」／「安裝應用程式」
   **電腦**：Chrome/Edge 網址列會出現「安裝」圖示，點下去即可
3. 之後即使沒有網路，也能從主畫面圖示或已安裝的捷徑直接開啟
4. 程式若有更新，需在**有網路時**重新開啟一次以更新快取

## 更新快取的注意事項

修改 `css`／`js` 後，請同步更新兩處，使用者才會拿到新版：

- `sw.js` 最上方的 `CACHE_NAME`（例如 `teleprompter-v1` → `teleprompter-v2`）
- `index.html` 與 `sw.js` 中靜態資源的 `?v=` 版本號

## V2 待辦

- 匯入 `.txt` 檔案
- 多份講稿管理（清單、切換、刪除）
- 計時器／倒數計時
- 分段標記與跳段
- QR Code 產生，方便用手機當第二螢幕
