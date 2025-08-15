// Front-end chat script (clean)
const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chatForm");
const inputEl = document.getElementById("messageInput");
const personaSwitchEl = document.getElementById("personaSwitch");
const themeToggleEl = document.getElementById("themeToggle");

let activePersona = "hitesh";
const chatHistory = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function addMessage(role, content) {
  if (!messagesEl) return;
  const row = el("div", "flex gap-2");
  const isUser = role === "user";
  const avatar = el(
    "div",
    `w-8 h-8 rounded-lg grid place-items-center text-sm font-bold ${
      isUser ? "bg-indigo-600 text-white" : "bg-emerald-600 text-white dark:bg-emerald-500"
    }`,
    isUser ? "U" : "AI"
  );

  const bubble = el(
    "div",
    `bubble px-4 py-3 max-w-[75%] whitespace-pre-wrap ${
      isUser
        ? "bg-indigo-50/70 dark:bg-indigo-900/40 border border-indigo-200/70 dark:border-indigo-800"
        : "bg-white/80 backdrop-blur dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700"
    }`
  );
  bubble.textContent = content;

  if (isUser) {
    row.classList.add("justify-end");
    row.appendChild(bubble);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(bubble);
  }

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  try { localStorage.setItem("theme", theme); } catch (e) { /* ignore */ }
}

// Init theme safely
const saved = (() => { try { return localStorage.getItem("theme"); } catch (e) { return null; } })();
setTheme(saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

// Wire persona buttons (delegated)
if (personaSwitchEl) {
  personaSwitchEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    if (!id) return;
    activePersona = id;
    // Update UI active state
    Array.from(personaSwitchEl.querySelectorAll("button")).forEach((b) => {
      if (b === btn) {
        b.classList.add("bg-indigo-600", "text-white");
        b.classList.remove("bg-transparent", "text-slate-800", "dark:text-slate-200");
      } else {
        b.classList.remove("bg-indigo-600", "text-white");
        b.classList.add("bg-transparent", "text-slate-800", "dark:text-slate-200");
      }
    });
  });
}

if (themeToggleEl) {
  themeToggleEl.addEventListener("click", () => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "light" : "dark");
  });
}

if (formEl) {
  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const content = inputEl.value.trim();
    if (!content) return;

    addMessage("user", content);
    chatHistory.push({ role: "user", content });
    inputEl.value = "";

    // Temporary typing indicator
    const typing = el("div", "text-sm text-slate-500 dark:text-slate-400", "Thinking…");
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId: activePersona,
          message: content,
          history: chatHistory,
        }),
      });
      const data = await res.json();
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      if (data.error) throw new Error(data.error);
      addMessage("assistant", data.reply);
      chatHistory.push({ role: "assistant", content: data.reply });
    } catch (err) {
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      const msg = err && err.message ? err.message : "Failed to send message";
      addMessage("assistant", `Error: ${msg}`);
    }
  });
}

        

