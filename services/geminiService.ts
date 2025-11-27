import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeneratedSchedule, LunchConfig } from "../types";
import { format, differenceInMinutes, parse, isAfter, isBefore } from "date-fns";

export const analyzeScheduleWithGemini = async (
  schedule: GeneratedSchedule,
  configSummary: string,
  employeeNames: Record<string, string>
): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // 1. Calculate stats per employee for the prompt
  const stats = Object.keys(employeeNames).length > 0
    ? Object.keys(employeeNames).map(empId => {
      const blocks = schedule.blocks.filter(b => b.employeeId === empId);
      const oceanMinutes = blocks.filter(b => b.station === 'Ocean')
        .reduce((acc, b) => acc + differenceInMinutes(new Date(b.endTime), new Date(b.startTime)), 0);
      const floorMinutes = blocks.filter(b => b.station === 'Floor -1')
        .reduce((acc, b) => acc + differenceInMinutes(new Date(b.endTime), new Date(b.startTime)), 0);
      const name = employeeNames[empId] || empId;
      return `- ${name}: Ocean ${oceanMinutes} min, Floor -1 ${floorMinutes} min`;
    }).join('\n')
    : "No employee names provided, skipping detailed per-person summary.";

  const issuesText = schedule.issues.map(i =>
    `- GAP: ${i.message} (${i.station})`
  ).join('\n');

  const blocksSummary = schedule.blocks.slice(0, 60).map(b =>
    `${employeeNames[b.employeeId] || b.employeeId}: ${b.station} ${format(new Date(b.startTime), 'HH:mm')}-${format(new Date(b.endTime), 'HH:mm')}`
  ).join('\n');

  const prompt = `
    Act as a Museum Operations Manager. Analyze this daily staff rotation schedule.
    CONTEXT:
    Configuration: ${configSummary}
    
    REQUIREMENTS:
    1. Coverage: Check if stations are covered at all times.
    2. Overlaps: If staff share a station at the same time, flag it as "High Interaction / Potential Chatting" (acceptable but good to know).
    3. Breaks: IGNORE breaks (an extra floater covers them, so gaps in personal schedules are fine, only gaps in station coverage matter).
    4. Station Time Summary:
       - Summarize total time each person spends at "Ocean" (important for capacity limits).
       - Summarize total time each person spends at "Floor -1" (important for crowd control).
       - Use the Calculated Stats provided below.
    DATA:
    Calculated Stats (Use these for your summary):
    ${stats}
    Coverage Gaps (System Detected):
    ${issuesText.length > 0 ? issuesText : "No gaps detected by system."}
    Schedule Sample:
    ${blocksSummary}
    ...
    Provide a concise, professional assessment in Markdown. Use bullet points.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text || "Unable to generate analysis.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error connecting to AI Assistant. Please check your connection.";
  }
};

export const generateLunchPlan = async (
  schedule: GeneratedSchedule,
  lunchConfig: LunchConfig,
  numEmployees: number,
  employeeNames: Record<string, string>
): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // Filter schedule to only show relevant blocks around lunch time for context
  const today = new Date();
  const winStart = parse(lunchConfig.windowStart, 'HH:mm', today);
  const winEnd = parse(lunchConfig.windowEnd, 'HH:mm', today);

  const relevantBlocks = schedule.blocks
    .filter(b => !isBefore(new Date(b.endTime), winStart) && !isAfter(new Date(b.startTime), winEnd))
    .slice(0, 50)
    .map(b => `${employeeNames[b.employeeId] || b.employeeId} is at ${b.station} from ${format(new Date(b.startTime), 'HH:mm')} to ${format(new Date(b.endTime), 'HH:mm')}`)
    .join('\n');

  const prompt = `
    Act as a Museum Logistics Expert. Create a Lunch Rotation Strategy.
    
    GOAL:
    Schedule ${lunchConfig.duration}-minute lunch breaks for all ${numEmployees} employees between ${lunchConfig.windowStart} and ${lunchConfig.windowEnd}.
    
    CONSTRAINT:
    - The existing stations MUST remain covered.
    - Suggest adding "Floater" staff (extra employees) to cover these breaks.
    - Calculate exactly how many extra Floaters are needed.
    
    DATA:
    - Employees: ${numEmployees}
    - Lunch Window: ${lunchConfig.windowStart} - ${lunchConfig.windowEnd}
    - Break Duration: ${lunchConfig.duration} min (includes travel time)
    
    CURRENT SCHEDULE CONTEXT (Activity during lunch window):
    ${relevantBlocks}

    OUTPUT INSTRUCTIONS:
    1. Recommendation: How many extra "Floater" staff are needed? (e.g., "Add 1 Floater from 12:00 to 14:00").
    2. The Plan: A chronological list of who goes to lunch and who covers them.
       Example format:
       * **12:00 - 12:35**: [Employee] to Lunch. Floater covers [Station].
       * **12:35 - 13:10**: [Next Employee] to Lunch...
    
    Keep it concise and actionable. Return Markdown.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text || "Unable to generate lunch plan.";
  } catch (error) {
    console.error("Gemini Lunch Error:", error);
    return "Error connecting to AI Assistant.";
  }
};
