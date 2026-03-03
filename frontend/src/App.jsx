import { useState, useRef, useEffect } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/chat";

const WELCOME_MESSAGE = {
  role: "assistant",
  content: "Hi, I'm PediTriage — an AI-powered pediatric symptom triage assistant.\n\nI'm here to help you figure out how urgently your child needs medical attention. I'll ask a few focused questions and give you a clear recommendation.\n\nWhat's going on with your child today?",
  isWelcome: true,
};

const TRIAGE_CONFIG = {
  HOME: {
    label: "Monitor at Home",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.3)",
    icon: "🏠",
    pulse: "#22c55e",
  },
  CALL_DOCTOR: {
    label: "Call Your Pediatrician",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.3)",
    icon: "📞",
    pulse: "#f59e0b",
  },
  GO_TO_ER: {
    label: "Go to the ER Now",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.3)",
    icon: "🚨",
    pulse: "#ef4444",
  },
};

// ─── Utility ─────────────────────────────────────────────────────────────────
function parseSSEStream(text) {
  let profileData = null;
  let triageData = null;

  // extract profile from SSE profile event
  const profileEventMatch = text.match(/event: profile\ndata: (.+)/);
  if (profileEventMatch) {
    try { profileData = JSON.parse(profileEventMatch[1]); } catch {}
  }

  // extract triage result block
  const triageMatch = text.match(/<triage_result>([\s\S]*?)<\/triage_result>/);
  if (triageMatch) {
    try {
      let raw = triageMatch[1].trim()
        .replace(/: True/g, ": true")
        .replace(/: False/g, ": false")
        .replace(/: None/g, ": null");
      triageData = JSON.parse(raw);
    } catch {}
  }

  // get display text — handle both cases: with and without profile event
  let content = "";
  const dataMatch = text.match(/^data: ([\s\S]*?)\n\nevent:/);
  if (dataMatch) {
    content = dataMatch[1]; // normal response with profile event
  } else {
    // emergency response or single event — grab everything after "data: "
    const simpleMatch = text.match(/^data: ([\s\S]*)/);
    if (simpleMatch) content = simpleMatch[1];
  }

  content = content
    .replace(/<symptom_profile>[\s\S]*?<\/symptom_profile>/g, "")
    .replace(/<triage_result>[\s\S]*?<\/triage_result>/g, "")
    .replace(/\.([A-Z])/g, '. $1')
    .replace(/\?([A-Z])/g, '? $1')
    .trim();

  return { displayText: content, profileData, triageData };
}

// ─── Components ──────────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "14px 18px" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: "50%",
          background: "#60a5fa",
          animation: "bounce 1.2s ease-in-out infinite",
          animationDelay: `${i * 0.2}s`,
        }} />
      ))}
    </div>
  );
}

function MessageBubble({ message, isLatest }) {
  const isUser = message.role === "user";

  return (
    <div style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: 12,
      animation: isLatest ? "fadeSlideIn 0.3s ease-out" : "none",
    }}>
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, marginRight: 10, flexShrink: 0, marginTop: 4,
          boxShadow: "0 0 12px rgba(59,130,246,0.4)",
        }}>
          🩺
        </div>
      )}
      <div style={{
        maxWidth: "72%",
        padding: "12px 16px",
        borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        background: isUser
          ? "linear-gradient(135deg, #3b82f6, #2563eb)"
          : "rgba(255,255,255,0.06)",
        border: isUser ? "none" : "1px solid rgba(255,255,255,0.1)",
        color: "#f1f5f9",
        fontSize: 14,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        boxShadow: isUser
          ? "0 4px 14px rgba(59,130,246,0.3)"
          : "0 2px 8px rgba(0,0,0,0.2)",
      }}>
        {message.content}
      </div>
    </div>
  );
}

function StreamingBubble({ text }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, marginRight: 10, flexShrink: 0, marginTop: 4,
        boxShadow: "0 0 12px rgba(59,130,246,0.4)",
      }}>
        🩺
      </div>
      <div style={{
        maxWidth: "72%",
        padding: "12px 16px",
        borderRadius: "18px 18px 18px 4px",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "#f1f5f9",
        fontSize: 14,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}>
        {text}
        <span style={{
          display: "inline-block", width: 2, height: 14,
          background: "#60a5fa", marginLeft: 2, verticalAlign: "middle",
          animation: "cursorBlink 1s ease-in-out infinite",
        }} />
      </div>
    </div>
  );
}

function TriageVerdict({ result, onDismiss }) {
  const [expanded, setExpanded] = useState(false);
  const config = TRIAGE_CONFIG[result.tier] || TRIAGE_CONFIG.HOME;

  return (
    <div style={{
      margin: "16px 0",
      borderRadius: 16,
      border: `1px solid ${config.border}`,
      background: config.bg,
      overflow: "hidden",
      animation: "fadeSlideIn 0.4s ease-out",
      boxShadow: `0 0 24px ${config.color}22`,
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: `${config.color}22`,
          border: `2px solid ${config.color}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20,
          boxShadow: `0 0 16px ${config.color}44`,
        }}>
          {config.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 2,
            color: config.color, textTransform: "uppercase", marginBottom: 2,
          }}>
            Triage Result
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>
            {config.label}
          </div>
        </div>
        <div style={{
          padding: "4px 10px", borderRadius: 20,
          background: `${config.color}22`,
          border: `1px solid ${config.color}44`,
          fontSize: 11, fontWeight: 700, color: config.color,
          letterSpacing: 1, textTransform: "uppercase",
        }}>
          {result.tier.replace("_", " ")}
        </div>
      </div>

      {/* Headline */}
      <div style={{
        padding: "0 20px 16px",
        fontSize: 14, color: "#cbd5e1", lineHeight: 1.6,
      }}>
        {result.headline}
      </div>

      {/* Expandable detail */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "10px 20px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 12, color: "#64748b",
          userSelect: "none",
          transition: "background 0.2s",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        <span>Clinical reasoning & what to watch for</span>
        <span style={{
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s",
          fontSize: 10,
        }}>▼</span>
      </div>

      {expanded && (
        <div style={{
          padding: "16px 20px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          animation: "fadeSlideIn 0.2s ease-out",
        }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
              color: "#64748b", textTransform: "uppercase", marginBottom: 8,
            }}>
              Reasoning
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7 }}>
              {result.reasoning}
            </div>
          </div>

          {result.watch_for?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
                color: "#64748b", textTransform: "uppercase", marginBottom: 8,
              }}>
                Watch For
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {result.watch_for.map((item, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    fontSize: 13, color: "#94a3b8",
                  }}>
                    <span style={{ color: config.color, marginTop: 1, flexShrink: 0 }}>→</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            fontSize: 11, color: "#475569", lineHeight: 1.6,
            fontStyle: "italic",
          }}>
            ⚠️ {result.disclaimer}
          </div>
        </div>
      )}
    </div>
  );
}

function SymptomProfileBadge({ profile }) {
  if (!profile) return null;
  const items = [
    profile.child_age_years && `Age: ${profile.child_age_years}y`,
    profile.fever_present && `Fever${profile.fever_temp_f ? `: ${profile.fever_temp_f}°F` : ""}`,
    profile.duration_hours && `${profile.duration_hours}h duration`,
    ...(profile.symptoms || []),
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <div style={{
      padding: "8px 16px",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
    }}>
      <span style={{ fontSize: 10, color: "#475569", letterSpacing: 1, textTransform: "uppercase" }}>
        Collected:
      </span>
      {items.map((item, i) => (
        <span key={i} style={{
          padding: "2px 8px", borderRadius: 10,
          background: "rgba(59,130,246,0.12)",
          border: "1px solid rgba(59,130,246,0.2)",
          fontSize: 11, color: "#60a5fa",
        }}>
          {item}
        </span>
      ))}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [symptomProfile, setSymptomProfile] = useState({});
  const [triageResult, setTriageResult] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage = { role: "user", content: text };
    const newMessages = [...messages.filter(m => !m.isWelcome), userMessage];

    // keep welcome for display but don't send it
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setStreamingText("");
    setTriageResult(null);

    console.log("Sending symptom_profile:", symptomProfile);

    try {
      abortRef.current = new AbortController();
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          symptom_profile: symptomProfile,
          state: "INTAKE",
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });

        // update streaming display
        const { displayText } = parseSSEStream(fullText);

        const xmlStart = displayText.search(/<symptom_profile>|<triage_result>/);
        const safeDisplay = xmlStart > -1
          ? displayText.slice(0, xmlStart).trim()
          : displayText;

        setStreamingText(safeDisplay);
      }
      

      // parse final result
      const { displayText, profileData, triageData } = parseSSEStream(fullText);

      if (profileData) setSymptomProfile(profileData);
      if (triageData) setTriageResult(triageData);

      // commit to messages
      setMessages(prev => [...prev, {
        role: "assistant",
        content: displayText,
        triageResult: triageData,
      }]);
      setStreamingText("");

    } catch (err) {
      if (err.name !== "AbortError") {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        }]);
        setStreamingText("");
      }
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function resetChat() {
    abortRef.current?.abort();
    setMessages([WELCOME_MESSAGE]);
    setInput("");
    setIsLoading(false);
    setStreamingText("");
    setSymptomProfile({});
    setTriageResult(null);
    inputRef.current?.focus();
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #040d1a;
          font-family: 'DM Sans', sans-serif;
          color: #f1f5f9;
          height: 100vh;
          overflow: hidden;
        }

        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }

        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        @keyframes gridPulse {
          0%, 100% { opacity: 0.03; }
          50% { opacity: 0.06; }
        }

        @keyframes auraPulse {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.05); opacity: 0.25; }
        }

        textarea:focus { outline: none; }
        textarea { resize: none; }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      {/* Background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden" }}>
        {/* Grid */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `
            linear-gradient(rgba(59,130,246,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          animation: "gridPulse 4s ease-in-out infinite",
        }} />
        {/* Aura */}
        <div style={{
          position: "absolute", top: "20%", left: "50%",
          transform: "translateX(-50%)",
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)",
          animation: "auraPulse 6s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      </div>

      {/* App Shell */}
      <div style={{
        position: "relative", zIndex: 1,
        height: "100vh", display: "flex", flexDirection: "column",
        maxWidth: 760, margin: "0 auto",
        padding: "0 16px",
      }}>

        {/* Header */}
        <div style={{
          padding: "20px 0 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
              boxShadow: "0 0 20px rgba(59,130,246,0.4)",
            }}>
              🩺
            </div>
            <div>
              <div style={{
                fontFamily: "Syne, sans-serif",
                fontSize: 20, fontWeight: 800,
                background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: -0.5,
              }}>
                PediTriage AI
              </div>
              <div style={{ fontSize: 11, color: "#475569", letterSpacing: 0.5 }}>
                Pediatric Symptom Triage Assistant
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 20,
              background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.2)",
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 6px #22c55e",
              }} />
              <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 500 }}>Online</span>
            </div>
            <button
              onClick={resetChat}
              style={{
                padding: "6px 14px", borderRadius: 20,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#64748b", fontSize: 12, cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#94a3b8"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#64748b"; }}
            >
              New chat
            </button>
          </div>
        </div>

        {/* Symptom profile badge */}
        <SymptomProfileBadge profile={symptomProfile} />

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto",
          padding: "20px 0",
          display: "flex", flexDirection: "column",
        }}>
          {messages.map((msg, i) => (
            <div key={i}>
              <MessageBubble message={msg} isLatest={i === messages.length - 1 && !isLoading} />
              {msg.triageResult && (
                <TriageVerdict result={msg.triageResult} />
              )}
            </div>
          ))}

          {isLoading && !streamingText && <TypingIndicator />}
          {streamingText && <StreamingBubble text={streamingText} />}

          <div ref={messagesEndRef} />
        </div>

        {/* Disclaimer */}
        <div style={{
          padding: "8px 0",
          textAlign: "center",
          fontSize: 10, color: "#334155", lineHeight: 1.5,
          flexShrink: 0,
        }}>
          Not medical advice • Portfolio project • Always consult a healthcare professional
        </div>

        {/* Input */}
        <div style={{
          padding: "12px 0 20px",
          flexShrink: 0,
        }}>
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-end",
            padding: "12px 12px 12px 18px",
            borderRadius: 20,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 0 0 1px rgba(59,130,246,0)",
            transition: "all 0.2s",
          }}
          onFocus={() => {}}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your child's symptoms..."
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: "#f1f5f9",
                fontSize: 14,
                lineHeight: 1.6,
                fontFamily: "DM Sans, sans-serif",
                maxHeight: 120,
                overflowY: "auto",
              }}
              onInput={e => {
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              style={{
                width: 38, height: 38, borderRadius: 12,
                background: input.trim() && !isLoading
                  ? "linear-gradient(135deg, #3b82f6, #2563eb)"
                  : "rgba(255,255,255,0.06)",
                border: "none",
                cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0,
                transition: "all 0.2s",
                boxShadow: input.trim() && !isLoading
                  ? "0 4px 14px rgba(59,130,246,0.4)"
                  : "none",
              }}
            >
              {isLoading ? "⏳" : "↑"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}