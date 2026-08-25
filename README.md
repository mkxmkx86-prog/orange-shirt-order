# 🍊 學校橘衣訂購管理系統

純 HTML / CSS / Vanilla JS + Firebase Firestore（Serverless），可直接放上 GitHub Pages。

## 檔案

| 檔案 | 說明 |
|---|---|
| `index.html` | 單頁應用（前台訂購 + 後台管理兩個分頁） |
| `style.css` | 橘色主題 + RWD |
| `app.js` | Firebase 初始化、Transaction 扣庫存、後台邏輯 |
| `firestore.rules` | 建議的安全性規則 |

## 部署步驟

1. **建立 Firebase 專案** → Firestore Database → 建立資料庫（正式模式）。
2. 專案設定 → 新增「網頁應用程式」→ 複製 `firebaseConfig`。
3. 貼到 `app.js` 最上方的 `firebaseConfig` 區塊。
4. Firestore「規則」分頁貼上 `firestore.rules` 內容並發布。
5. 把三個檔案 push 到 GitHub repo → Settings → Pages → 選 `main` / `root`。
6. 開啟網站 → 切到「管理後台」→ 輸入密碼 `hnes5901529` →
   系統會自動建立 10 個尺寸的 `inventory` 文件（預設各 30 件），
   再於庫存看板調整成實際數量即可。

> 預設庫存數量可改 `app.js` 的 `DEFAULT_STOCK`。

## 資料結構

```
inventory/{尺寸名稱}   { size: "M", stock: 30 }
orders/{autoId}        { gradeClass, studentName, size, quantity, timestamp }
```

## ⚠ 安全性提醒

後台密碼寫在前端 JS，只能擋「不小心點進來的人」，無法擋懂得看原始碼的人。
若需要真正的權限控管，請改用 Firebase Authentication，並把 `firestore.rules`
的 `orders` 讀取權限限制為管理員帳號。
