"use client"
import Image from "next/image"
import type React from "react"
import f1GPTLogo from "./assets/f11.png"
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
    <main className="min-h-screen bg-gradient-to-br from-red-600 to-red-800 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <Image
            src={f1GPTLogo}
            width={250}
            height={120}
            alt="F1 GPT Logo"
            className="mx-auto mb-4"
          />
          <h1 className="text-4xl font-bold">F1 GPT</h1>
        </div>

        <section className={`${messages.length === 0 ? "text-center" : ""} space-y-4`}>
          {messages.length === 0 ? (
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8">
              <p className="starter-text">Welcome to F1 GPT! Ask me anything about Formula 1.</p>
              <p className="text-red-200">
                From race results to driver stats, technical regulations to team histories - I'm here to help!
              </p>
            </div>
          ) : (
            <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`p-4 rounded-lg ${message.role === "user" ? "bg-white/20 ml-8" : "bg-white/10 mr-8"}`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              ))}
              {isLoading && (
                <div className="bg-white/10 mr-8 p-4 rounded-lg">
                  <p className="text-red-200">Thinking...</p>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8">
            <div className="flex gap-2">
              <input
                className="question-box"
                onChange={(e) => setInput(e.target.value)}
                value={input}
                placeholder="Ask me anything about Formula 1..."
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="submit-button"
              >
                {isLoading ? "..." : "Ask"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  )
}