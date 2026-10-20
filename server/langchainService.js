import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing. Add it to server/.env and restart the backend.');
  }

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    temperature: 0.3,
    maxOutputTokens: 2000
  });
}

// Direct Gemini API client for AQ. format keys
async function callGeminiAPI(systemPrompt, userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [{
        parts: [{ text: userPrompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2000,
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Medical Record Summarization Agent
export async function summarizeMedicalRecords(records, audience = 'doctor') {
  try {
    const model = getModel();

    const recordsText = records.map(r =>
      `Date: ${r.date}, Type: ${r.type}, Diagnosis: ${r.diagnosis || 'N/A'}, Notes: ${r.notes || 'N/A'}`
    ).join('\n');

    const systemPrompt = `You are a medical documentation assistant. Summarize the following patient medical records.

Instructions:
- For doctors: Provide a concise clinical summary highlighting key diagnoses, treatments, and trends
- For patients: Explain in simple, clear language without medical jargon
- Include the most recent findings and any concerning patterns
- Do not diagnose or make treatment recommendations
- Highlight items that need follow-up
- Keep the summary under 300 words
- Format the answer with short Markdown headings and bullets; never return one dense paragraph
- Use only headings that fit the available record details, and do not invent missing information

Audience: ${audience}`;

    const userPrompt = `Records:\n${recordsText}`;

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);

    return response.content;
  } catch (error) {
    throw new Error(`Medical record summary failed: ${error.message || 'AI provider request failed'}`);
  }
}

// Symptom Analysis Agent
export async function analyzeSymptoms(symptoms, patientContext = {}) {
  try {
    const model = getModel();

    const parser = StructuredOutputParser.fromNamesAndDescriptions({
      possibleConditions: 'List of 3-5 possible conditions that could explain these symptoms',
      urgencyLevel: 'One of: LOW, MEDIUM, HIGH, EMERGENCY',
      recommendedActions: 'List of recommended actions to take',
      disclaimer: 'Important medical disclaimer'
    });

    const formatInstructions = parser.getFormatInstructions();

    const contextText = Object.entries(patientContext)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');

    const symptomsText = Array.isArray(symptoms) ? symptoms.join(', ') : symptoms;

    const systemPrompt = `You are a medical triage assistant. Analyze the reported symptoms and provide guidance.

IMPORTANT SAFETY RULES:
- NEVER provide a definitive diagnosis
- Always include a strong disclaimer that this is not medical advice
- If symptoms suggest a life-threatening condition (chest pain, difficulty breathing, severe bleeding, etc.), set urgencyLevel to EMERGENCY
- For HIGH urgency, recommend immediate medical attention
- For MEDIUM urgency, recommend seeing a doctor within 24-48 hours
- For LOW urgency, suggest monitoring and scheduling a routine appointment
- Do not recommend specific medications or treatments
- Always recommend consulting with a healthcare professional

${formatInstructions}`;

    const userPrompt = `Symptoms: ${symptomsText}\nPatient Context: ${contextText}`;

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);

    try {
      return await parser.parse(response.content);
    } catch (error) {
      // Fallback if parsing fails
      return {
        possibleConditions: ['Unable to parse'],
        urgencyLevel: 'MEDIUM',
        recommendedActions: ['Please consult a healthcare professional'],
        disclaimer: 'This analysis is for informational purposes only and does not constitute medical advice.',
        rawResponse: response.content
      };
    }
  } catch (error) {
    throw new Error(`Symptom analysis failed: ${error.message || 'AI provider request failed'}`);
  }
}

// Drug Interaction Checker
export async function checkDrugInteractions(medications) {
  try {
    const model = getModel();

    const parser = StructuredOutputParser.fromNamesAndDescriptions({
      interactions: 'List of potential drug interactions found',
      severityLevel: 'Overall severity: MINIMAL, MODERATE, SEVERE',
      recommendations: 'List of recommendations for managing these interactions',
      disclaimer: 'Important disclaimer about professional consultation'
    });

    const formatInstructions = parser.getFormatInstructions();

    const medicationsText = Array.isArray(medications) ? medications.join(', ') : medications;

    const systemPrompt = `You are a medication safety assistant. Check for potential drug interactions.

INSTRUCTIONS:
- Identify potential drug-drug interactions
- Rate the overall severity based on clinical significance
- Provide recommendations for monitoring or management
- If no significant interactions are found, state that clearly
- Include a strong disclaimer to consult a pharmacist or doctor
- Do not provide dosage adjustments
- Note any common side effects of the combinations

${formatInstructions}`;

    const userPrompt = `Medications: ${medicationsText}`;

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);

    try {
      return await parser.parse(response.content);
    } catch (error) {
      return {
        interactions: ['Unable to parse interactions'],
        severityLevel: 'UNKNOWN',
        recommendations: ['Please consult a pharmacist or doctor'],
        disclaimer: 'This analysis is for informational purposes only. Always consult healthcare professionals.',
        rawResponse: response.content
      };
    }
  } catch (error) {
    throw new Error('AI service not configured. Please set GEMINI_API_KEY in server/.env');
  }
}

// Treatment Recommendation Engine
export async function suggestTreatmentOptions(diagnosis, patientRecords = []) {
  try {
    const model = getModel();

    const parser = StructuredOutputParser.fromNamesAndDescriptions({
      standardTreatments: 'List of standard treatment approaches for this condition',
      lifestyleRecommendations: 'List of lifestyle changes that may help',
      followUpRecommendations: 'Recommended follow-up schedule',
      redFlags: 'Symptoms or changes that require immediate attention',
      disclaimer: 'Strong medical disclaimer'
    });

    const formatInstructions = parser.getFormatInstructions();

    const historyText = patientRecords.map(r =>
      `${r.date}: ${r.type} - ${r.diagnosis || 'N/A'}`
    ).join('\n');

    const systemPrompt = `You are a clinical decision support assistant. Provide treatment options based on diagnosis and history.

IMPORTANT:
- Provide general treatment approaches, not specific prescriptions
- Include lifestyle recommendations that support recovery
- Suggest appropriate follow-up timelines
- Identify red flag symptoms that require immediate care
- NEVER prescribe specific medications or dosages
- Always defer to the treating physician's clinical judgment
- Include a strong disclaimer that this is not medical advice
- Consider the patient's history when making suggestions

${formatInstructions}`;

    const userPrompt = `Diagnosis: ${diagnosis}\nPatient History:\n${historyText}`;

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);

    try {
      return await parser.parse(response.content);
    } catch (error) {
      return {
        standardTreatments: ['Unable to parse'],
        lifestyleRecommendations: ['Consult healthcare provider'],
        followUpRecommendations: ['As recommended by physician'],
        redFlags: ['Worsening symptoms'],
        disclaimer: 'This is for informational purposes only. Always consult a healthcare professional.',
        rawResponse: response.content
      };
    }
  } catch (error) {
    throw new Error('AI service not configured. Please set GEMINI_API_KEY in server/.env');
  }
}

// Medical Chatbot with Conversation Memory
class MedicalChatbot {
  constructor() {
    this.model = null;
    this.conversationHistory = [];
    this.maxHistory = 10;
  }

  ensureModel() {
    if (!this.model) {
      this.model = getModel();
    }
  }

  addMessage(role, content) {
    this.conversationHistory.push({ role, content });
    // Keep only the last N messages
    if (this.conversationHistory.length > this.maxHistory) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistory);
    }
  }

  async chat(userMessage, patientContext = {}) {
    try {
      this.ensureModel();
      const systemPrompt = this.buildSystemPrompt(patientContext);

      // Build messages array
      const messages = [
        new SystemMessage(systemPrompt),
        ...this.conversationHistory.map(msg =>
          msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
        ),
        new HumanMessage(userMessage)
      ];

      const response = await this.model.invoke(messages);
      const assistantMessage = response.content;

      // Update conversation history
      this.addMessage('user', userMessage);
      this.addMessage('assistant', assistantMessage);

      return {
        response: assistantMessage,
        context: {
          messageCount: this.conversationHistory.length,
          hasHistory: this.conversationHistory.length > 2
        }
      };
    } catch (error) {
      return {
        response: `AI request failed: ${error.message || 'Unknown provider error'}`,
        error: error.message || 'AI provider request failed'
      };
    }
  }

  buildSystemPrompt(patientContext) {
    const contextText = Object.entries(patientContext)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    return `You are a helpful medical information assistant for HealthGuard AI.

Patient Context:
${contextText || 'No specific patient context provided'}

GUIDELINES:
- Provide general medical information and education
- NEVER diagnose or prescribe treatments
- Always include disclaimers that you are not a doctor
- Encourage users to consult healthcare professionals
- Explain medical terms in simple language
- If a question seems urgent, recommend seeking immediate medical care
- Be empathetic and supportive
- Keep responses under 120 words unless the user asks for detail
- Use short paragraphs and simple Markdown headings or bullets when listing information
- Put each heading or list item on its own line
- For symptom questions, ask only 2-3 useful follow-up questions and briefly list urgent warning signs
- Do not repeat the user's name or include a long generic disclaimer in every reply
- If you don't know something, admit it
- Do not make up information or statistics

Remember: You are an AI assistant, not a healthcare provider. Always direct users to professional medical care for diagnosis and treatment.`;
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  getHistoryCount() {
    return this.conversationHistory.length;
  }
}

// Export a singleton instance
export const medicalChatbot = new MedicalChatbot();

// Health Anomaly Detection
export async function detectAnomalies(records) {
  try {
    const model = getModel();

    const parser = StructuredOutputParser.fromNamesAndDescriptions({
      anomalies: 'List of potential anomalies or concerning patterns detected',
      trends: 'List of observed trends in the data',
      recommendations: 'List of recommendations for further investigation',
      urgency: 'Overall urgency: LOW, MEDIUM, HIGH'
    });

    const formatInstructions = parser.getFormatInstructions();

    const recordsText = records.map(r =>
      `Date: ${r.date}, Type: ${r.type}, Diagnosis: ${r.diagnosis || 'N/A'}, Vitals: ${r.vitals || 'N/A'}, Notes: ${r.notes || 'N/A'}`
    ).join('\n');

    const systemPrompt = `You are a medical data analyst. Analyze patient records for anomalies and concerning patterns.

ANALYSIS TASKS:
- Look for unusual values or patterns in the data
- Identify trends over time (improving, worsening, stable)
- Flag any values that fall outside normal ranges (if available)
- Note gaps or inconsistencies in the records
- Suggest what should be investigated further
- Rate the overall urgency of follow-up

IMPORTANT:
- Do not diagnose
- If reference ranges are not provided, mention this limitation
- Focus on objective observations from the data
- Recommend appropriate follow-up actions

${formatInstructions}`;

    const userPrompt = `Records:\n${recordsText}`;

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);

    try {
      return await parser.parse(response.content);
    } catch (error) {
      return {
        anomalies: ['Unable to parse'],
        trends: ['Unknown'],
        recommendations: ['Review with healthcare provider'],
        urgency: 'MEDIUM',
        rawResponse: response.content
      };
    }
  } catch (error) {
    throw new Error('AI service not configured. Please set GEMINI_API_KEY in server/.env');
  }
}

// Export all services
export default {
  summarizeMedicalRecords,
  analyzeSymptoms,
  checkDrugInteractions,
  suggestTreatmentOptions,
  medicalChatbot,
  detectAnomalies
};
