const API_BASE = "https://immunology-operating-intervals-keep.trycloudflare.com";

function getToken() {
  return localStorage.getItem("token") || "";
}
function setToken(t) {
  localStorage.setItem("token", t);
}
function clearToken() {
  localStorage.removeItem("token");
}

async function api(path, { method = "GET", headers = {}, body = null } = {}) {
  const h = { ...headers };
  const token = getToken();
  if (token) h["Authorization"] = "Bearer " + token;

  const res = await fetch(API_BASE + path, { method, headers: h, body });
  const ct = res.headers.get("content-type") || "";

  let data = null;
  if (ct.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const msg = (data && data.error) ? data.error : (typeof data === "string" ? data : "请求失败");
    throw new Error(msg);
  }
  return data;
}

function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className =
    "fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow text-white text-sm " +
    (type === "err" ? "bg-red-600" : type === "ok" ? "bg-emerald-600" : "bg-slate-800");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function requireAuth() {
  if (!getToken()) {
    location.href = "login.html";
  }
}

function logout() {
  clearToken();
  location.href = "login.html";
}
// ========= 登录弹窗（Tailwind） =========
function showLoginModal() {
  return new Promise((resolve, reject) => {
    // 避免重复弹出
    if (document.getElementById("loginModalMask")) return;

    const mask = document.createElement("div");
    mask.id = "loginModalMask";
    mask.className = "fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4";

    mask.innerHTML = `
      <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-lg font-semibold">需要登录</div>
            <div class="text-sm text-slate-400 mt-1">请先登录后再下载</div>
          </div>
          <button id="lmClose" class="text-slate-400 hover:text-slate-200">✕</button>
        </div>

        <div class="mt-5 space-y-3">
          <div>
            <label class="text-sm text-slate-300">用户名</label>
            <input id="lmUser" class="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="text-sm text-slate-300">密码</label>
            <input id="lmPass" type="password" class="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 outline-none focus:border-indigo-500" />
          </div>
          <div class="flex gap-2 pt-2">
            <button id="lmLogin" class="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 font-medium">登录</button>
            <button id="lmCancel" class="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2">取消</button>
          </div>
          <div id="lmErr" class="text-sm text-red-400 hidden"></div>
        </div>
      </div>
    `;

    document.body.appendChild(mask);

    const close = () => {
      mask.remove();
      reject(new Error("用户取消登录"));
    };

    mask.querySelector("#lmClose").addEventListener("click", close);
    mask.querySelector("#lmCancel").addEventListener("click", close);

    mask.querySelector("#lmLogin").addEventListener("click", async () => {
      const username = mask.querySelector("#lmUser").value.trim();
      const password = mask.querySelector("#lmPass").value.trim();
      const err = mask.querySelector("#lmErr");

      err.classList.add("hidden");
      err.textContent = "";

      try {
        const data = await api("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        setToken(data.token);
        toast("登录成功", "ok");
        mask.remove();
        resolve(data.token);
      } catch (e) {
        err.textContent = e.message || "登录失败";
        err.classList.remove("hidden");
      }
    });
  });
}

// 确保已登录：没有 token 就弹窗登录；有 token 直接返回
async function ensureLoggedIn() {
  const t = getToken();
  if (t) return t;
  return await showLoginModal();
}

// 带 token 下载（如果未登录会弹窗登录；如果 token 失效 401 会重新弹窗）
async function downloadWithToken(id, filename) {
  let token = await ensureLoggedIn();

  let res = await fetch(`${API_BASE}/api/files/${id}/download`, {
    headers: { "Authorization": "Bearer " + token }
  });

  // token 过期/无效：弹窗重新登录，再试一次
  if (res.status === 401) {
    clearToken();
    token = await ensureLoggedIn();
    res = await fetch(`${API_BASE}/api/files/${id}/download`, {
      headers: { "Authorization": "Bearer " + token }
    });
  }

  if (!res.ok) throw new Error("下载失败（状态码 " + res.status + "）");

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
// ===== 带 token 获取文件 blob（401 自动重登再试一次）=====
async function fetchBlobWithToken(url) {
  let token = getToken();
  if (!token) {
    // 没 token 就走你之前的登录弹窗逻辑（如果你已实现 ensureLoggedIn）
    if (typeof ensureLoggedIn === "function") token = await ensureLoggedIn();
    else throw new Error("未登录");
  }

  let res = await fetch(url, { headers: { "Authorization": "Bearer " + token } });

  if (res.status === 401) {
    clearToken();
    if (typeof ensureLoggedIn === "function") token = await ensureLoggedIn();
    else throw new Error("登录已失效");
    res = await fetch(url, { headers: { "Authorization": "Bearer " + token } });
  }

  if (!res.ok) throw new Error("请求失败（状态码 " + res.status + "）");
  return await res.blob();
}

// ===== 微信上那种遮罩预览（Lightbox）=====
let __lightboxUrl = null;

function openLightbox({ title, blob, mimeType }) {
  // 清理旧的
  if (__lightboxUrl) {
    URL.revokeObjectURL(__lightboxUrl);
    __lightboxUrl = null;
  }

  __lightboxUrl = URL.createObjectURL(blob);

  const mask = document.createElement("div");
  mask.id = "lightboxMask";
  mask.className = "fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3";
  mask.innerHTML = `
    <div class="absolute top-3 left-3 right-3 flex items-center justify-between text-white">
      <div class="text-sm truncate max-w-[70%]">${title || ""}</div>
      <button id="lbClose" class="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20">关闭</button>
    </div>
    <div id="lbBody" class="w-full max-w-3xl max-h-[85vh] flex items-center justify-center"></div>
  `;

  const body = mask.querySelector("#lbBody");

  if ((mimeType || "").startsWith("video/")) {
    const v = document.createElement("video");
    v.src = __lightboxUrl;
    v.controls = true;
    v.playsInline = true;
    v.className = "w-full max-h-[85vh] rounded-2xl";
    body.appendChild(v);
  } else {
    const img = document.createElement("img");
    img.src = __lightboxUrl;
    img.className = "max-w-full max-h-[85vh] rounded-2xl select-none";
    img.style.transform = "scale(1)";
    img.style.transition = "transform 120ms ease";

    // 简易缩放：双击放大/还原（手机也好用）
    let zoomed = false;
    img.addEventListener("dblclick", () => {
      zoomed = !zoomed;
      img.style.transform = zoomed ? "scale(2)" : "scale(1)";
    });

    body.appendChild(img);
  }

  const close = () => {
    mask.remove();
    if (__lightboxUrl) {
      URL.revokeObjectURL(__lightboxUrl);
      __lightboxUrl = null;
    }
  };

  mask.addEventListener("click", (e) => {
    if (e.target === mask) close(); // 点遮罩关闭
  });
  mask.querySelector("#lbClose").addEventListener("click", close);

  document.body.appendChild(mask);
}

// 预览：从后端下载 blob，再打开 lightbox（带 token）
async function previewFile(id, originalName, mimeType) {
  const blob = await fetchBlobWithToken(`${API_BASE}/api/files/${id}/download`);
  openLightbox({ title: originalName, blob, mimeType });
}


