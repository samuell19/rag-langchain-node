"use client"
import type React from "react"
import { useState } from "react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  //adiciona as mensagens do usuario a lista de mensagens e faz um fetch pro back enviando as mensagens
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    //vai enviar uma requisição pro back 
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      })

      if (!response.ok) throw new Error("Failed to get response")

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
      }

      setMessages((prev) => [...prev, assistantMessage])
      
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      //vai pegar aquelas partes da resposta que estão sendo streamadas
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          console.log("Received chunk:", chunk)
          
          if (chunk) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id 
                  ? { ...msg, content: msg.content + chunk } 
                  : msg,
              ),
            )
          }
        }
      }
    } catch (error) {
      console.error("Error:", error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app-container">
      <div className="chat-container">
        <header className="header">
          <div className="logo">
            <div className="logo-icon">📚</div>
            <h1 className="app-title">RAG Assistant</h1>
          </div>
          <p className="app-description">
            Converse com seus documentos usando Retrieval-Augmented Generation
          </p>
        </header>

        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <div className="welcome-content">
                <h2 className="welcome-title">Bem-vindo ao RAG Assistant</h2>
                <p className="welcome-text">
                  Faça perguntas sobre o conteúdo dos seus documentos. 
                  Eu vou buscar informações relevantes e fornecer respostas precisas.
                </p>
                <div className="features">
                  <div className="feature">
                    <span className="feature-icon">🔍</span>
                    <span>Busca semântica</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">🤖</span>
                    <span>IA conversacional</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">📖</span>
                    <span>Baseado em documentos</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${message.role === "user" ? "message-user" : "message-assistant"}`}
                >
                  <div className="message-content">
                    <div className="message-avatar">
                      {message.role === "user" ? "👤" : "🤖"}
                    </div>
                    <div className="message-text">
                      {message.content}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="message message-assistant">
                  <div className="message-content">
                    <div className="message-avatar">🤖</div>
                    <div className="message-text loading-text">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                      Processando...
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="input-form">
          <div className="input-container">
            <input
              type="text"
              className="message-input"
              onChange={(e) => setInput(e.target.value)}
              value={input}
              placeholder="Digite sua pergunta sobre os documentos..."
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="send-button"
            >
              {isLoading ? (
                <div className="button-loading">⏳</div>
              ) : (
                <div className="button-icon">➤</div>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}