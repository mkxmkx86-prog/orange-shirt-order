/* =========================================================
   學校橘衣訂購管理系統  app.js
   Firebase Web SDK v10 (modular, CDN)
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, setDoc,
  onSnapshot, query, orderBy, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------------------------------------------------------
   1) 🔧 請在此填入你自己的 Firebase 專案憑證
   （Firebase Console → 專案設定 → 你的應用程式 → SDK 設定）
--------------------------------------------------------- */
const firebaseConfig = {
  apiKey:            "AIzaSyDe9sv_Ajj5cWIP-iMF-csQ75cVtVahcYM",
  authDomain:        "hnes-orange-shirt.firebaseapp.com",
  projectId:         "hnes-orange-shirt",
  storageBucket:     "hnes-orange-shirt.firebasestorage.app",
  messagingSenderId: "444585899877",
  appId:             "1:444585899877:web:3f16919e4df4926734d38c"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* --------------------- 常數設定 --------------------- */
const ADMIN_PASSWORD = "hnes5901529";
const CLASSES = ["一甲", "二甲", "三甲", "四甲", "五甲", "六甲"];
const SIZES   = ["8號", "9號", "10號", "XS", "S", "M", "L", "XL", "2L", "3XL"];
const DEFAULT_STOCK = 30;               // 初始化時每個尺寸預設庫存
const UNIT_PRICE    = 200;              // 每件單價（元）

const INV_COL    = "inventory";
const ORDERS_COL = "orders";

/* --------------------- 狀態 --------------------- */
let inventory    = {};   // { "M": 12, ... }
let orders       = [];   // [{id, gradeClass, studentName, size, quantity, unitPrice, subtotal, timestamp}]
let selectedSize = null;
let isAdmin      = false;
let unsubOrders  = null;

/* --------------------- 小工具 --------------------- */
const $ = (id) => document.getElementById(id);
let toastTimer;
function toast(msg, isErr = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (isErr ? " err" : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
function money(n) { return "NT$ " + Number(n || 0).toLocaleString("zh-TW"); }
/** 舊訂單若沒有 subtotal 欄位，以數量 x 單價回推 */
function amountOf(o) { return Number(o.subtotal ?? (Number(o.quantity) || 0) * UNIT_PRICE); }
function fmtTime(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* =========================================================
   ★★★ 核心：Firestore Transaction 扣庫存 + 寫訂單 ★★★
   -------------------------------------------------------
   同一個交易內：
     1. 先「讀」該尺寸的庫存文件（transaction.get 會鎖定該文件版本）
     2. 驗證 stock >= quantity，不足直接 throw（交易自動 rollback）
     3. 「寫」扣減後的庫存 + 新增訂單文件
   兩個寫入具原子性：要嘛都成功、要嘛都不發生。
   若同時有其他人在改同一份庫存文件，Firestore 會偵測到版本衝突，
   自動重跑整個 callback（重新讀到最新庫存再判斷一次），因此不會超賣。
   ⚠ callback 可能被重跑多次，所以裡面不可有副作用（不要改 UI / alert），
      且訂單文件的 ref 要在交易外先建立好，避免重跑時產生多筆。
========================================================= */
async function placeOrderTransaction({ gradeClass, studentName, size, quantity }) {
  const invRef   = doc(db, INV_COL, size);          // 文件 ID = 尺寸名稱
  const orderRef = doc(collection(db, ORDERS_COL)); // 先取得訂單 ID

  await runTransaction(db, async (transaction) => {
    // --- 讀取並鎖定庫存 ---
    const invSnap = await transaction.get(invRef);
    if (!invSnap.exists()) {
      throw new Error(`尺寸「${size}」尚未在庫存中建立，請聯絡管理老師。`);
    }

    const current = Number(invSnap.data().stock) || 0;

    // --- 驗證庫存 ---
    if (current < quantity) {
      throw new Error(`庫存不足！「${size}」目前僅剩 ${current} 件，無法訂購 ${quantity} 件。`);
    }

    // --- 同時扣庫存 + 寫訂單（原子性） ---
    transaction.update(invRef, { stock: current - quantity });
    transaction.set(orderRef, {
      gradeClass,
      studentName,
      size,
      quantity,
      unitPrice: UNIT_PRICE,                 // 保留下單當時的單價
      subtotal:  UNIT_PRICE * quantity,      // 應繳金額
      timestamp: serverTimestamp()
    });
  });

  return orderRef.id;
}

/* =========================================================
   庫存：即時監聽 + 初始化 + 手動調整
========================================================= */
function watchInventory() {
  onSnapshot(collection(db, INV_COL), (snap) => {
    inventory = {};
    snap.forEach((d) => { inventory[d.id] = Number(d.data().stock) || 0; });
    renderSizeGrid();
    if (isAdmin) renderInventoryTable();
  }, (err) => {
    console.error(err);
    $("sizeGrid").innerHTML = `<p class="error">庫存讀取失敗：${err.message}</p>`;
  });
}

/** 若 inventory collection 尚未建立，自動補齊全部尺寸文件 */
async function ensureInventoryDocs() {
  const snap = await getDocs(collection(db, INV_COL));
  const existing = new Set(snap.docs.map((d) => d.id));
  const missing = SIZES.filter((s) => !existing.has(s));
  if (missing.length === 0) return;
  await Promise.all(missing.map((s) =>
    setDoc(doc(db, INV_COL, s), { size: s, stock: DEFAULT_STOCK })
  ));
  toast(`已初始化 ${missing.length} 個尺寸的庫存（各 ${DEFAULT_STOCK} 件）`);
}

/** 管理端手動設定庫存（同樣用 transaction，避免與訂單扣減互相覆蓋） */
async function setStock(size, newStock) {
  const invRef = doc(db, INV_COL, size);
  await runTransaction(db, async (t) => {
    const s = await t.get(invRef);
    if (!s.exists()) t.set(invRef, { size, stock: newStock });
    else t.update(invRef, { stock: newStock });
  });
}

/* =========================================================
   前台 UI
========================================================= */
function initForm() {
  const sel = $("gradeClass");
  CLASSES.forEach((c) => sel.add(new Option(c, c)));

  const fc = $("filterClass");
  CLASSES.forEach((c) => fc.add(new Option(c, c)));
  const fs = $("filterSize");
  SIZES.forEach((s) => fs.add(new Option(s, s)));
}

function renderSizeGrid() {
  const grid = $("sizeGrid");
  if (Object.keys(inventory).length === 0) {
    grid.innerHTML = `<p class="loading">庫存讀取中…</p>`;
    return;
  }

  // 選到的尺寸若已被賣完，先取消選取
  if (selectedSize && (inventory[selectedSize] ?? 0) <= 0) selectedSize = null;

  grid.innerHTML = "";
  SIZES.forEach((size) => {
    const stock = inventory[size] ?? 0;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "size-btn" + (selectedSize === size ? " selected" : "");
    btn.disabled = stock <= 0;                       // 庫存 0 → 反灰不可選
    btn.innerHTML =
      `<span class="s-name">${size}</span>` +
      `<span class="s-stock">${stock > 0 ? `剩 ${stock} 件` : "已售完"}</span>`;
    btn.addEventListener("click", () => selectSize(size));
    grid.appendChild(btn);
  });

  updateQtyLimit();
}

function selectSize(size) {
  selectedSize = size;
  $("orderError").hidden = true;
  renderSizeGrid();
}

function updateQtyLimit() {
  const qty = $("quantity");
  if (!selectedSize) {
    qty.max = 1; qty.value = 1; qty.disabled = true;
    $("qtyHint").textContent = "請先選擇尺寸";
    updateAmount();
    return;
  }
  const max = inventory[selectedSize] ?? 0;
  qty.disabled = false;
  qty.max = max;
  if (Number(qty.value) > max) qty.value = max;
  if (Number(qty.value) < 1) qty.value = 1;
  $("qtyHint").textContent = `「${selectedSize}」最多可訂 ${max} 件（每件 ${UNIT_PRICE} 元）`;
  updateAmount();
}

/** 依目前選取的尺寸與數量，即時算出應繳金額 */
function updateAmount() {
  const q = parseInt($("quantity").value, 10);
  const ok = selectedSize && Number.isInteger(q) && q >= 1;
  $("amountText").textContent = ok ? `${money(q * UNIT_PRICE)}` : "—";
  $("amountText").title = ok ? `${q} 件 × ${UNIT_PRICE} 元` : "";
}

async function handleSubmit(e) {
  e.preventDefault();
  $("orderError").hidden = true;

  const gradeClass  = $("gradeClass").value;
  const studentName = $("studentName").value.trim();
  const quantity    = parseInt($("quantity").value, 10);

  // --- 前端驗證（真正的把關仍在 Transaction 內） ---
  if (!gradeClass)   return showFormError("請選擇班級。");
  if (!studentName)  return showFormError("請填寫姓名。");
  if (!selectedSize) return showFormError("請選擇尺寸。");
  if (!Number.isInteger(quantity) || quantity < 1) return showFormError("訂購數量須為 1 以上的整數。");
  if (quantity > (inventory[selectedSize] ?? 0))   return showFormError("訂購數量超過目前庫存。");

  const btn = $("submitBtn");
  const size = selectedSize;
  btn.disabled = true;
  btn.textContent = "送出中…";

  try {
    await placeOrderTransaction({ gradeClass, studentName, size, quantity });
    $("successDetail").innerHTML =
      `${gradeClass}　${studentName}　${size}　${quantity} 件<br>` +
      `應繳金額 <b>${money(quantity * UNIT_PRICE)}</b>，請向導師繳費。`;
    $("orderFormWrap").hidden = true;
    $("successBox").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    resetForm();
  } catch (err) {
    console.error(err);
    showFormError(err.message || "訂購失敗，請稍後再試。");
    toast(err.message || "訂購失敗", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "送出訂單";
  }
}

function showFormError(msg) {
  const e = $("orderError");
  e.textContent = msg;
  e.hidden = false;
}

function resetForm() {
  $("orderForm").reset();
  selectedSize = null;
  renderSizeGrid();
  updateAmount();
  $("orderError").hidden = true;
}

/* =========================================================
   後台 UI
========================================================= */
function login() {
  const pwd = $("adminPwd").value;
  if (pwd !== ADMIN_PASSWORD) {
    $("loginError").hidden = false;
    return;
  }
  isAdmin = true;
  sessionStorage.setItem("orangeAdmin", "1");
  $("loginError").hidden = true;
  $("adminPwd").value = "";
  openAdmin();
}

async function openAdmin() {
  isAdmin = true;
  $("loginBox").hidden = true;
  $("adminPanel").hidden = false;
  try { await ensureInventoryDocs(); } catch (e) { console.warn(e); }
  watchOrders();
  renderInventoryTable();
}

function logout() {
  isAdmin = false;
  sessionStorage.removeItem("orangeAdmin");
  if (unsubOrders) { unsubOrders(); unsubOrders = null; }
  $("adminPanel").hidden = true;
  $("loginBox").hidden = false;
}

function watchOrders() {
  if (unsubOrders) unsubOrders();
  const q = query(collection(db, ORDERS_COL), orderBy("timestamp", "desc"));
  unsubOrders = onSnapshot(q, (snap) => {
    orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderOrders();
    renderInventoryTable();
  }, (err) => {
    console.error(err);
    toast("訂單讀取失敗：" + err.message, true);
  });
}

function soldBySize() {
  const sold = {};
  SIZES.forEach((s) => { sold[s] = 0; });
  orders.forEach((o) => { sold[o.size] = (sold[o.size] || 0) + (Number(o.quantity) || 0); });
  return sold;
}

function renderInventoryTable() {
  const sold = soldBySize();
  const tbody = $("invTable").querySelector("tbody");
  tbody.innerHTML = "";

  SIZES.forEach((size) => {
    const stock = inventory[size] ?? 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${size}</b></td>
      <td class="stock-cell ${stock === 0 ? "stock-0" : ""}">${stock}</td>
      <td>${sold[size] || 0}</td>
      <td>${money((sold[size] || 0) * UNIT_PRICE)}</td>
      <td>
        <input type="number" min="0" step="1" value="${stock}" data-size="${size}">
        <button class="btn-mini" data-save="${size}">更新</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button[data-save]").forEach((b) => {
    b.addEventListener("click", async () => {
      const size = b.dataset.save;
      const input = tbody.querySelector(`input[data-size="${size}"]`);
      const val = parseInt(input.value, 10);
      if (!Number.isInteger(val) || val < 0) return toast("請輸入 0 以上的整數", true);
      b.disabled = true;
      try {
        await setStock(size, val);
        toast(`「${size}」庫存已更新為 ${val} 件`);
      } catch (e) {
        toast("更新失敗：" + e.message, true);
      } finally { b.disabled = false; }
    });
  });

  const totalStock = SIZES.reduce((a, s) => a + (inventory[s] ?? 0), 0);
  const totalSold  = Object.values(sold).reduce((a, b) => a + b, 0);
  const totalMoney = orders.reduce((a, o) => a + amountOf(o), 0);
  $("statsBar").innerHTML = `
    <div class="stat"><b>${orders.length}</b><span>訂單筆數</span></div>
    <div class="stat"><b>${totalSold}</b><span>已售出件數</span></div>
    <div class="stat"><b>${totalStock}</b><span>剩餘總庫存</span></div>
    <div class="stat"><b>${money(totalMoney)}</b><span>應收總金額</span></div>`;
}

function filteredOrders() {
  const fc = $("filterClass").value;
  const fs = $("filterSize").value;
  const sortBy = $("sortBy").value;

  const list = orders.filter((o) =>
    (!fc || o.gradeClass === fc) && (!fs || o.size === fs)
  );

  const t = (o) => (o.timestamp && o.timestamp.toMillis ? o.timestamp.toMillis() : 0);
  const sorters = {
    time_desc: (a, b) => t(b) - t(a),
    time_asc:  (a, b) => t(a) - t(b),
    class:     (a, b) => CLASSES.indexOf(a.gradeClass) - CLASSES.indexOf(b.gradeClass) || t(b) - t(a),
    name:      (a, b) => String(a.studentName).localeCompare(String(b.studentName), "zh-Hant"),
    size:      (a, b) => SIZES.indexOf(a.size) - SIZES.indexOf(b.size) || t(b) - t(a)
  };
  return list.sort(sorters[sortBy] || sorters.time_desc);
}

function renderOrders() {
  const list = filteredOrders();
  const tbody = $("orderTable").querySelector("tbody");
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:#8a7d70">目前沒有符合條件的訂單。</td></tr>`;
  } else {
    list.forEach((o) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmtTime(o.timestamp)}</td>
        <td>${o.gradeClass}</td>
        <td>${o.studentName}</td>
        <td>${o.size}</td>
        <td>${o.quantity}</td>
        <td>${money(amountOf(o))}</td>
        <td><button class="btn-mini btn-del" data-del="${o.id}">刪除</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("button[data-del]").forEach((b) => {
      b.addEventListener("click", () => removeOrder(b.dataset.del));
    });
  }

  const totalQty   = list.reduce((a, o) => a + (Number(o.quantity) || 0), 0);
  const totalMoney = list.reduce((a, o) => a + amountOf(o), 0);
  $("orderCount").textContent =
    `顯示 ${list.length} 筆訂單，合計 ${totalQty} 件，金額 ${money(totalMoney)}。`;
}

/** 刪除訂單並把庫存加回去（同樣以 transaction 保持一致） */
async function removeOrder(id) {
  const o = orders.find((x) => x.id === id);
  if (!o) return;
  if (!confirm(`確定刪除這筆訂單？\n${o.gradeClass} ${o.studentName} ${o.size} ${o.quantity} 件（${money(amountOf(o))}）\n（庫存會自動加回）`)) return;

  const orderRef = doc(db, ORDERS_COL, id);
  const invRef   = doc(db, INV_COL, o.size);
  try {
    await runTransaction(db, async (t) => {
      const ord = await t.get(orderRef);
      const inv = await t.get(invRef);
      if (!ord.exists()) throw new Error("訂單已不存在。");
      const qty = Number(ord.data().quantity) || 0;
      if (inv.exists()) t.update(invRef, { stock: (Number(inv.data().stock) || 0) + qty });
      t.delete(orderRef);
    });
    toast("訂單已刪除，庫存已回補");
  } catch (e) {
    toast("刪除失敗：" + e.message, true);
  }
}

function exportCsv() {
  const list = filteredOrders();
  const rows = [["時間", "班級", "姓名", "尺寸", "數量", "單價", "金額"]];
  list.forEach((o) => rows.push([
    fmtTime(o.timestamp), o.gradeClass, o.studentName, o.size, o.quantity,
    Number(o.unitPrice ?? UNIT_PRICE), amountOf(o)
  ]));
  rows.push(["合計", "", "", "",
             list.reduce((a, o) => a + (Number(o.quantity) || 0), 0), "",
             list.reduce((a, o) => a + amountOf(o), 0)]);
  const csv = "﻿" + rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `橘衣訂單_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* =========================================================
   分頁切換 & 事件綁定
========================================================= */
function switchView(name) {
  document.querySelectorAll(".tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) =>
    v.classList.toggle("active", v.id === `view-${name}`));
  window.scrollTo({ top: 0 });
}

function bind() {
  document.querySelectorAll(".tab-btn").forEach((b) =>
    b.addEventListener("click", () => switchView(b.dataset.view)));

  $("orderForm").addEventListener("submit", handleSubmit);
  $("quantity").addEventListener("input", () => { $("orderError").hidden = true; updateAmount(); });
  $("againBtn").addEventListener("click", () => {
    $("successBox").hidden = true;
    $("orderFormWrap").hidden = false;
  });

  $("loginBtn").addEventListener("click", login);
  $("adminPwd").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
  $("logoutBtn").addEventListener("click", logout);

  ["filterClass", "filterSize", "sortBy"].forEach((id) =>
    $(id).addEventListener("change", renderOrders));
  $("exportBtn").addEventListener("click", exportCsv);
}

/* --------------------- 啟動 --------------------- */
initForm();
bind();
watchInventory();
updateQtyLimit();
if (sessionStorage.getItem("orangeAdmin") === "1") openAdmin();
