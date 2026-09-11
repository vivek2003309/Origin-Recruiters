import express, { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialize Gemini AI client
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// System instruction for Origin Recruiters Career Counselor
const SYSTEM_INSTRUCTION = `You are the friendly, expert AI Career Counselor for Origin Recruiters (ओरिजिन रिक्रूटर्स), the leading BPO placement agency and career consultancy in New Delhi.
Key Agency Details:
- Location: 3rd Floor, Bhartiya Aviation Building, A-18, Opposite Metro Pillar No. 773 (Nearest Metro Station: Dwarka Mor), Sewak Park, New Delhi, Delhi 110059.
- Contact Phone: +91 98105 69750.
- Key Recruiter & Mentor: Sneha Singharwa (Lead Placement Specialist & Hiring Advisor).
- Specializations: Global & Domestic BPO Hiring (Teleperformance, Airbnb process, Concentrix, Genpact, Wipro), Voice & Blended support, Non-voice chat, AMCAT & voice assessment prep, 1-on-1 recruiter mentorship, and mock rounds.
- Placed Candidates: 480+ selected candidates in top MNC processes.
- Rating: 4.8/5.0 stars with 485+ Google Reviews.
- Working Hours: Open daily until 6:30 PM.
Tone: Warm, encouraging, professional, and practical. Keep responses concise, direct, and structured with bullet points where helpful. Guide candidates on how to crack tests and invite them to visit the Dwarka Mor office or apply online.`;

// Health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    agency: "Origin Recruiters",
  });
});

// Candidate quick application endpoint
app.post("/api/apply", (req: Request, res: Response) => {
  const { fullName, phone, email, experience, processType, notes } = req.body;
  if (!fullName || !phone) {
    return res.status(400).json({ error: "Full Name and Phone Number are required." });
  }

  console.log("New candidate application received:", {
    fullName,
    phone,
    email,
    experience,
    processType,
    notes,
    receivedAt: new Date().toISOString(),
  });

  return res.json({
    success: true,
    message: `Thank you, ${fullName}! Your application for ${processType || "BPO Placement"} has been received. Key recruiter Sneha Singharwa and the Origin Recruiters team will contact you shortly at ${phone}.`,
    referenceId: "OR-" + Math.floor(100000 + Math.random() * 900000),
  });
});

// Gemini low-latency chat endpoint
app.post("/api/chat", async (req: Request, res: Response) => {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "A message string is required." });
    }

    const ai = getGenAI();
    if (!ai) {
      // High-quality contextual fallback response when API key is not configured
      const lower = message.toLowerCase();
      let fallbackReply = `Hello! I'm the Career Counselor at Origin Recruiters. `;

      if (lower.includes("location") || lower.includes("address") || lower.includes("where") || lower.includes("office")) {
        fallbackReply += `Our office is located at 3rd Floor, Bhartiya Aviation Building, A-18, Opposite Metro Pillar No. 773 (Nearest Metro Station: Dwarka Mor), Sewak Park, New Delhi 110059. Walk-in interviews are welcome daily until 6:30 PM!`;
      } else if (lower.includes("versant") || lower.includes("amcat") || lower.includes("test") || lower.includes("airbnb")) {
        fallbackReply += `For Versant, voice assessments, and specialized accounts like Teleperformance (Airbnb process) and Concentrix, lead recruiter Sneha Singharwa conducts 1-on-1 mock rounds and presentation prep so you clear client rounds with confidence!`;
      } else if (lower.includes("salary") || lower.includes("pay") || lower.includes("package")) {
        fallbackReply += `Domestic BPO processes generally range between ₹18,000 to ₹26,000/month, while International Voice, Blended, and Premium accounts (like Airbnb/Teleperformance) offer ₹32,000 to ₹48,000/month plus performance incentives and both-way cabs.`;
      } else if (lower.includes("fresher") || lower.includes("experience")) {
        fallbackReply += `We actively place both freshers and experienced candidates! If you have good communication skills and a positive attitude, we have immediate openings with leading MNCs in Gurgaon, Noida, and Delhi.`;
      } else {
        fallbackReply += `We specialize in domestic & global BPO placements with dedicated guidance from Sneha Singharwa and our hiring team. Feel free to call us at +91 98105 69750 or submit your application through the "Apply for Job" button!`;
      }

      return res.json({ reply: fallbackReply, model: "local-assistant" });
    }

    // Format conversation history for Gemini multi-turn format
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (Array.isArray(history)) {
      for (const item of history) {
        if (item && item.role && item.text) {
          contents.push({
            role: item.role === "user" ? "user" : "model",
            parts: [{ text: item.text }],
          });
        }
      }
    }

    // Append the latest user query
    contents.push({
      role: "user",
      parts: [{ text: message }],
    });

    // Use gemini-3.1-flash-lite for ultra-fast, low-latency conversational response
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    const reply = response.text || "I am here to help you navigate your BPO career. How can I assist you today?";
    return res.json({ reply, model: "gemini-3.1-flash-lite" });
  } catch (error: any) {
    console.error("Gemini chat error:", error);
    return res.status(500).json({
      error: "Failed to generate AI response.",
      reply: "We are having a brief connection issue, but our recruiters are available directly at +91 98105 69750. Please feel free to call or WhatsApp us!",
    });
  }
});

// Vite middleware integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Origin Recruiters server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
