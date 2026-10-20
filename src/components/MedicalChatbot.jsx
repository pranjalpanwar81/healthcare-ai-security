import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Loader2, X, Bot } from 'lucide-react';
import { api } from '../api';
import FormattedAIText from './FormattedAIText';

function MedicalChatbot({ token, patientId }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I\'m your medical information assistant. I can help answer general health questions, explain medical terms, and provide wellness information. Remember, I\'m not a doctor - always consult a healthcare professional for medical advice.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);
    setError('');

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const result = await api.aiChat(token, {
        message: userMessage,
        patientId,
        clearHistory: false
      });

      setMessages(prev => [...prev, { role: 'assistant', content: result.response }]);
    } catch (err) {
      setError(err.message || 'Failed to get response');
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'I apologize, but I encountered an error. Please try again or consult with a healthcare professional.' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = async () => {
    try {
      await api.aiChat(token, { message: '', clearHistory: true });
      setMessages([
        { role: 'assistant', content: 'Chat cleared. How can I help you today?' }
      ]);
    } catch (err) {
      console.error('Failed to clear chat:', err);
    }
  };

  return (
    <section className="medical-chatbot">
      <div className="chatbot-header">
        <div className="header-left">
          <Bot className="bot-icon" />
          <div>
            <h2>Medical Assistant</h2>
            <p>Ask health questions (not for emergencies)</p>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={clearChat}>
          <X className="btn-icon" />
          Clear
        </button>
      </div>

      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-content">
              {msg.role === 'assistant' && <Bot className="message-icon" />}
              {msg.role === 'assistant' ? <FormattedAIText text={msg.content} className="assistant-reply" /> : <p>{msg.content}</p>}
            </div>
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div className="message-content">
              <Bot className="message-icon" />
              <Loader2 className="spinner spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="chat-error">
          {error}
        </div>
      )}

      <form onSubmit={sendMessage} className="chat-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a health question..."
          disabled={loading}
        />
        <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="btn-icon spin" /> : <Send className="btn-icon" />}
        </button>
      </form>

      <div className="chatbot-disclaimer">
        <p>⚠️ This is for informational purposes only. For medical emergencies, call emergency services immediately.</p>
      </div>
    </section>
  );
}

export default MedicalChatbot;
