import { useState, useRef, useEffect } from "react";
import ChatMessage from "./components/ChatMessage.jsx";

const WELCOME = {
  role: "assistant",
  content:
    "Hello! Ask me anything about your data warehouse — I'll translate your question into SQL using Groq and run it against DuckDB via MCP.",
  tool: null,
};

const SUGGESTIONS = [
  "Which product had the highest total revenue?",
  "Show me the top 5 products by quantity sold",
  "What is the average unit price per product?",
];

export default function App() {
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(question) {
    const q = question.trim();
    if (!q || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        data.error
          ? { role: "assistant", error: data.error }
          : { role: "assistant", ...data },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", error: `Network error: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    send(input);
  }

  const onlyWelcome = messages.length === 1;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="header-icon">◈</span>
          <h1 className="header-title">Platform Lab Chat</h1>
        </div>
        <div className="header-pills">
          <span className="pill">DuckDB</span>
          <span className="pill">Groq</span>
          <span className="pill">MCP</span>
        </div>
      </header>

      <main className="messages">
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {loading && (
          <div className="message assistant">
            <div className="bubble assistant-bubble">
              <div className="typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {onlyWelcome && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggestion" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form className="input-row" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your data…"
          disabled={loading}
          autoFocus
        />
        <button
          className="send-btn"
          type="submit"
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
