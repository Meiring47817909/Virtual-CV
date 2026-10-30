// Virtual CV – site behaviour

// Opened from your own computer (file:// or localhost)? Talk to the local
// backend (python app.py on port 8000). Everywhere else, use the Hugging Face Space.
const IS_LOCAL =
  location.protocol === "file:" ||
  ["localhost", "127.0.0.1"].includes(location.hostname);
const CHAT_API = IS_LOCAL
  ? "http://localhost:8000/chat"
  : "https://meiring47817909-meiring-cv-bot.hf.space/chat";

// Pages the assistant is allowed to open, and the tab each one maps to.
const PAGES = {
  about: { target: "#me", name: "About Me" },
  cv: { target: "#cv", name: "Resume / CV" },
  projects: { target: "#projects", name: "Projects" },
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

document.addEventListener("DOMContentLoaded", function () {
  const sidebar = document.getElementById("sidebar");
  const toggleButton = document.getElementById("toggleSidebar");

  const chatToggle = document.getElementById("chat-toggle");
  const chatWindow = document.getElementById("chat-container");
  const closeChat = document.getElementById("close-chat");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-btn");
  const chatBody = document.getElementById("chat-messages");
  const typing = document.getElementById("typing-indicator");
  const avatar = document.getElementById("chat-avatar");
  const micBtn = document.getElementById("mic-btn");
  let stopVoice = () => {}; // replaced below when speech input is available

  // Sidebar Toggle
  toggleButton.addEventListener("click", () =>
    sidebar.classList.toggle("expanded"),
  );

  // Project videos: swap the poster for the real player on click, so the
  // video only loads when someone wants to watch it.
  document.querySelectorAll(".video-poster").forEach((poster) => {
    poster.addEventListener("click", () => {
      const frame = document.createElement("iframe");
      frame.src = poster.dataset.videoSrc;
      frame.title = poster.dataset.videoTitle || "Project video";
      frame.allow = "autoplay; fullscreen";
      frame.allowFullscreen = true;
      poster.replaceWith(frame);
    });
  });

  // ---------------------------------------------------------------
  // Chat window open / close
  // ---------------------------------------------------------------
  const chatIsOpen = () => chatWindow.classList.contains("open");

  function setChatOpen(open) {
    chatWindow.classList.toggle("open", open);
    chatWindow.setAttribute("aria-hidden", String(!open));
    chatToggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("chat-open", open);
    if (!open) stopVoice();
    if (open) setTimeout(() => chatInput.focus(), 150);
  }

  chatToggle.addEventListener("click", () => setChatOpen(!chatIsOpen()));
  closeChat.addEventListener("click", () => {
    setChatOpen(false);
    chatToggle.focus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && chatIsOpen()) {
      setChatOpen(false);
      chatToggle.focus();
    }
  });

  // ---------------------------------------------------------------
  // Sending questions
  // ---------------------------------------------------------------
  let busy = false;

  document.querySelectorAll("#quick-chips .chip-btn").forEach((chip) => {
    chip.addEventListener("click", () => sendPrompt(chip.dataset.prompt));
  });

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendPrompt(chatInput.value);
  });

  // ---------------------------------------------------------------
  // Voice input: the browser's built-in speech recognition
  // (Chrome, Edge and Safari; the mic stays hidden elsewhere)
  // ---------------------------------------------------------------
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  // Brave exposes the API but blocks the speech service behind it, so it
  // never hears anything: leave the mic hidden there.
  const voiceWorks = SpeechRecognition && micBtn && !navigator.brave;

  if (voiceWorks) {
    const recognition = new SpeechRecognition();
    recognition.lang = "en-ZA";
    recognition.interimResults = true; // write the words while you speak
    recognition.continuous = true; // keep listening through short pauses

    const SEND_AFTER_SILENCE_MS = 2000; // send this long after you stop talking
    const MAX_LISTEN_MS = 60000; // never listen longer than a minute
    const placeholder = chatInput.placeholder;
    const log = (...args) => console.debug("[voice]", ...args);

    let listening = false;
    let heard = "";
    let failed = false;
    let cancelled = false;
    let silenceTimer = null;
    let maxTimer = null;

    micBtn.hidden = false;

    function setListening(on, hint) {
      listening = on;
      micBtn.classList.toggle("listening", on);
      micBtn.setAttribute("aria-pressed", String(on));
      micBtn.setAttribute("aria-label", on ? "Stop listening" : "Speak your question");
      micBtn.title = on ? "Stop listening" : "Speak your question";
      chatInput.placeholder = on ? hint || "Listening…" : placeholder;
    }

    function clearTimers() {
      clearTimeout(silenceTimer);
      clearTimeout(maxTimer);
      silenceTimer = maxTimer = null;
    }

    stopVoice = () => {
      if (listening) {
        cancelled = true; // closing the chat cancels, it doesn't send
        recognition.abort();
      }
    };

    micBtn.addEventListener("click", () => {
      if (listening) {
        recognition.stop(); // send what was heard so far
        return;
      }
      if (busy) return;
      heard = "";
      failed = false;
      cancelled = false;
      chatInput.value = "";
      try {
        recognition.start();
        setListening(true, "Starting microphone…");
        maxTimer = setTimeout(() => recognition.stop(), MAX_LISTEN_MS);
      } catch (err) {
        log("could not start", err);
        setListening(false);
      }
    });

    // Status updates, so it is clear which step is (or isn't) happening
    recognition.onstart = () => log("started");
    recognition.onaudiostart = () => {
      log("microphone is on");
      if (listening && !heard) chatInput.placeholder = "Listening… speak now";
    };
    recognition.onsoundstart = () => log("sound detected");
    recognition.onspeechstart = () => {
      log("speech detected");
      if (listening && !heard) chatInput.placeholder = "Hearing you…";
    };

    recognition.onresult = (event) => {
      let text = "";
      for (const result of event.results) text += result[0].transcript;
      const latest = event.results[event.results.length - 1];
      heard = text.replace(/\s+/g, " ").trimStart();
      chatInput.value = heard;
      chatInput.scrollLeft = chatInput.scrollWidth; // keep the newest words in view
      log(latest && latest.isFinal ? "heard (final):" : "heard (live):", heard);

      // Each new word restarts the countdown; silence sends the question
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => recognition.stop(), SEND_AFTER_SILENCE_MS);
    };

    recognition.onerror = (event) => {
      log("error:", event.error, event.message || "");
      if (event.error === "aborted") return;
      failed = event.error !== "no-speech" || !heard;

      const tips = {
        "not-allowed":
          "I can't hear you yet: microphone access is blocked. Allow the microphone for this site (the icon at the left of the address bar), then tap the mic again.",
        "service-not-allowed":
          "Your browser isn't allowing its speech service on this page. Try Chrome or Edge, or type your question.",
        network:
          "Your browser couldn't reach its speech service, so I couldn't turn your voice into text. Check your internet connection, or try Chrome or Edge.",
        "audio-capture":
          "I couldn't find a microphone. Check that one is connected and switched on, or type your question.",
        "no-speech":
          "I didn't hear anything. Check that your microphone is on and is the one selected for this site (the icon at the left of the address bar, and Windows sound settings), then tap the mic and start speaking.",
      };

      if (event.error === "language-not-supported" && recognition.lang !== "en-US") {
        recognition.lang = "en-US"; // fall back from South African English
        appendMessage("bot", "Your browser doesn't support South African English for voice input, so I switched to US English. Tap the mic again.");
      } else if (tips[event.error] && !heard) {
        appendMessage("bot", tips[event.error]);
      }
    };

    recognition.onend = () => {
      log("stopped");
      clearTimers();
      setListening(false);
      const text = heard.trim();
      heard = "";
      if (text && !failed && !cancelled) sendPrompt(text);
    };
  }

  async function sendPrompt(text) {
    const question = (text || "").trim();
    if (!question || busy) return;
    busy = true;

    // Suggestion chips disappear once the conversation starts
    const chips = document.getElementById("quick-chips");
    if (chips) chips.remove();

    appendMessage("user", question);
    chatInput.value = "";
    sendBtn.disabled = true;
    showTyping(true);

    try {
      const response = await fetch(CHAT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question, page: currentPage() }),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      showTyping(false);
      appendMessage(
        "bot",
        data.answer || data.error || "I'm having trouble connecting to my brain!",
      );
      if (data.action) runAction(data.action);
      waveAvatar();
    } catch (error) {
      showTyping(false);
      appendMessage(
        "bot",
        "Server is waking up. Please try again in a moment.",
      );
    } finally {
      busy = false;
      sendBtn.disabled = false;
      chatInput.focus();
    }
  }

  // ---------------------------------------------------------------
  // Agent actions returned by the backend
  // ---------------------------------------------------------------
  // Which page the visitor is looking at, so the assistant knows the context
  function currentPage() {
    const active = document.querySelector("#sidebar .side-link.active");
    const target = active && active.getAttribute("data-bs-target");
    return Object.keys(PAGES).find((k) => PAGES[k].target === target) || "about";
  }

  async function runAction(action) {
    if (action.type === "navigate") {
      const page = PAGES[action.page]; // only known pages can be opened
      if (!page) return;
      showTab(page.target);
      appendNote("Opened " + page.name);
    } else if (action.type === "highlight" && typeof action.text === "string") {
      if (!window.cvViewer) return;
      showTab(PAGES.cv.target);
      const found = await window.cvViewer.highlight(action.text.slice(0, 120));
      appendNote(found ? "Highlighted in the CV" : "Couldn't find that in the CV");
    } else {
      return;
    }

    // On phones the chat covers the page, so step aside to show it
    if (window.innerWidth < 768) setTimeout(() => setChatOpen(false), 1200);
  }

  // ---------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------

  // User text is always shown as plain text. Bot replies are Markdown:
  // rendered with marked, then sanitised with DOMPurify so no scripts or
  // event handlers can ever reach the page.
  function appendMessage(sender, text) {
    const msg = document.createElement("div");
    msg.className = "message " + (sender === "bot" ? "bot-msg" : "user-msg");

    if (sender === "bot" && window.marked && window.DOMPurify) {
      const html = marked.parse(text, { breaks: true, gfm: true });
      msg.innerHTML = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ["p", "br", "strong", "em", "b", "i", "ul", "ol", "li",
          "code", "pre", "blockquote", "h3", "h4", "h5", "h6", "a", "table",
          "thead", "tbody", "tr", "th", "td", "hr"],
        ALLOWED_ATTR: ["href", "title"],
      });
      msg.querySelectorAll("a").forEach((a) => {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      });
    } else {
      msg.textContent = text;
    }

    chatBody.insertBefore(msg, typing);
    chatBody.scrollTop = chatBody.scrollHeight;
    return msg;
  }

  // Small status line under a reply when the assistant did something
  function appendNote(text) {
    const note = document.createElement("div");
    note.className = "action-note";
    note.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"></path></svg>';
    note.append(document.createTextNode(text));
    chatBody.insertBefore(note, typing);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function showTyping(on) {
    typing.style.display = on ? "flex" : "none";
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  // The header robot waves once each time the assistant replies
  function waveAvatar() {
    const player = avatar && avatar.dotLottie;
    if (!player || reduceMotion.matches) return;
    player.stop();
    player.play();
  }
});

// Tab Visibility Logic
// The aurora background shows on every tab now, and the chat button stays
// available everywhere; these just keep the class site.css expects.
function addBackground() {
  document.getElementById("pageBackground").classList.add("background");
}

function removeBackground() {
  document.getElementById("pageBackground").classList.remove("background");
}

// Switch tabs from anywhere on the page ("View projects", the assistant, ...)
function showTab(target) {
  const link = document.querySelector(
    '#sidebar [data-bs-target="' + target + '"]',
  );
  if (link) {
    bootstrap.Tab.getOrCreateInstance(link).show();
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
  }
}

// Chat robot: wave once, rest, wave again. Stays still while the chat is
// open (and always for visitors who prefer reduced motion).
const WAVE_PAUSE_MS = 20000;

(function setupChatRobot() {
  const robot = document.querySelector("#chat-toggle dotlottie-wc");
  const chat = document.getElementById("chat-container");
  if (!robot || !chat) return;

  const chatIsOpen = () => chat.classList.contains("open");
  let player = null;
  let timer = null;

  function wave() {
    clearTimeout(timer);
    timer = null;
    if (!player || chatIsOpen() || reduceMotion.matches) return;
    player.stop(); // back to the first frame
    player.play(); // one wave (the animation does not loop)
  }

  function waveLater() {
    clearTimeout(timer);
    timer = setTimeout(wave, WAVE_PAUSE_MS);
  }

  // The player is created once the dotLottie module has loaded.
  function attach() {
    player = robot.dotLottie;
    if (!player) {
      setTimeout(attach, 100);
      return;
    }
    player.addEventListener("complete", () => {
      if (!chatIsOpen()) waveLater();
    });
    if (player.isLoaded) wave();
    else player.addEventListener("load", wave);
  }

  // Watch the chat window opening and closing.
  new MutationObserver(() => {
    if (chatIsOpen()) {
      clearTimeout(timer);
      timer = null;
      if (player) player.stop();
    } else {
      waveLater();
    }
  }).observe(chat, { attributes: true, attributeFilter: ["class"] });

  attach();
})();
