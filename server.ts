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

// System instruction for Epic Consultancy Career Counselor
const SYSTEM_INSTRUCTION = `You are the friendly, expert AI Career Counselor for Epic Consultancy (एपिक कंसलटेंसी), the premier BPO placement agency and career consultancy in New Delhi.
Key Agency Details:
- Name: Epic Consultancy (एपिक कंसलटेंसी).
- Location: 1st Floor, A-109, Ganesh Nagar, Tilak Nagar, New Delhi, Delhi, 110018 (Plus Code: J3PR+F8 New Delhi, Delhi).
- Contact Phone: 099712 59325 / +91 99712 59325.
- Key Team & Mentors: Ananya Ma'am, Sunny Sir, Isha, and Nikhil.
- Specializations: Global & Domestic BPO Hiring (British Airways, Teleperformance, Concentrix, Genpact, Wipro), Voice & Blended customer support, Non-voice live chat & email, interview preparation (76+ mentions), helpful & supportive staff (119+ mentions), and 1-day offer letter expedited placement track.
- Placed Candidates & Ratings: 4.9/5.0 stars with 506 Google Reviews. Known for candidates receiving offer letters within 1 day (e.g. Kunal Singh) and top airline selections (e.g. Jayas Singh placed at British Airways).
- Working Hours: Open · Closes 7:00 PM (Daily walk-in evaluations welcome).
Tone: Warm, encouraging, professional, and practical. Keep responses concise, direct, and structured with bullet points where helpful. Guide candidates on how to crack interviews with confidence and invite them to visit the Tilak Nagar (Ganesh Nagar) office or apply online.`;

// Health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    agency: "Epic Consultancy",
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
    message: `Thank you, ${fullName}! Your application for ${processType || "BPO Placement"} has been received. Ananya Ma'am, Sunny Sir, and the Epic Consultancy team will contact you shortly at ${phone}.`,
    referenceId: "EC-" + Math.floor(100000 + Math.random() * 900000),
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
      let fallbackReply = `Hello! I'm the Career Counselor at Epic Consultancy (एपिक कंसलटेंसी). `;

      if (lower.includes("location") || lower.includes("address") || lower.includes("where") || lower.includes("office")) {
        fallbackReply += `Our office is at 1st Floor, A-109, Ganesh Nagar, Tilak Nagar, New Delhi, Delhi 110018 (Plus Code: J3PR+F8). We are open daily until 7:00 PM!`;
      } else if (lower.includes("ananya") || lower.includes("sunny") || lower.includes("interview") || lower.includes("british airways")) {
        fallbackReply += `Ananya Ma'am and Sunny Sir conduct dedicated 1-on-1 interview preparation drills so you can crack MNC client rounds (like British Airways, Teleperformance, and Concentrix) with high confidence! Many candidates even receive offer letters within 1 day.`;
      } else if (lower.includes("salary") || lower.includes("pay") || lower.includes("package")) {
        fallbackReply += `Domestic BPO packages in Delhi NCR range from ₹18,000 to ₹26,000/month, while International Voice & Airline accounts (like British Airways) offer ₹32,000 to ₹48,000/month plus performance incentives and both-way cabs.`;
      } else if (lower.includes("fresher") || lower.includes("experience")) {
        fallbackReply += `We welcome both freshers and experienced candidates! If you have good communication skills, Ananya Ma'am, Sunny Sir, and our team will train you and help you get placed with top MNCs quickly.`;
      } else {
        fallbackReply += `We specialize in genuine BPO placements with 4.9-star rating across 506 reviews. Feel free to call us at 099712 59325 or submit your application through the "Apply for Job" button!`;
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
      reply: "We are having a brief connection issue, but our counselors are available directly at 099712 59325. Please feel free to call or WhatsApp us!",
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
    console.log(`Epic Consultancy server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
