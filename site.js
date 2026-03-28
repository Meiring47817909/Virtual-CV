document.addEventListener("DOMContentLoaded", function () {
  const sidebar = document.getElementById("sidebar");
  const toggleButton = document.getElementById("toggleSidebar");
  const chatToggle = document.getElementById("chat-toggle");
  const chatContainer = document.getElementById("chat-container");
  const closeChat = document.getElementById("close-chat");
  const sendBtn = document.getElementById("send-btn");
  const chatInput = document.getElementById("chat-input");
  const chatMessages = document.getElementById("chat-messages");

  // Sidebar Toggle
  toggleButton.addEventListener("click", () =>
    sidebar.classList.toggle("expanded"),
  );

  // Chat Window Toggle
  chatToggle.addEventListener("click", () => {
    chatContainer.style.display =
      chatContainer.style.display === "flex" ? "none" : "flex";
  });
  closeChat.addEventListener(
    "click",
    () => (chatContainer.style.display = "none"),
  );

  // Sending to Hugging Face
  async function handleSend() {
    const question = chatInput.value.trim();
    if (!question) return;

    appendMessage("user", question);
    chatInput.value = "";
    const loadingMsg = appendMessage("bot", "<i>Thinking...</i>");

    try {
      const response = await fetch(
        "https://meiring47817909-meiring-cv-bot.hf.space/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: question }),
        },
      );
      const data = await response.json();
      loadingMsg.remove();
      appendMessage(
        "bot",
        data.answer || "I'm having trouble connecting to my brain!",
      );
    } catch (error) {
      loadingMsg.remove();
      appendMessage(
        "bot",
        "Server is waking up. Please try again in a moment.",
      );
    }
  }

  function appendMessage(sender, text) {
    const msg = document.createElement("div");
    msg.className = `${sender}-message`;
    msg.innerHTML = text;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msg;
  }

  sendBtn.addEventListener("click", handleSend);
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleSend();
  });
});

// Tab Visibility Logic
function addBackground() {
  document.getElementById("pageBackground").classList.add("background");
  document.getElementById("chat-toggle").style.display = "none";
  document.getElementById("chat-container").style.display = "none";
}

function removeBackground() {
  document.getElementById("pageBackground").classList.remove("background");
  document.getElementById("chat-toggle").style.display = "block";
}
