import fs from "fs";
import path from "path";

console.log("⚙️ INITIALIZING LOCAL PARSER BOUNDARY VALIDATION CHECK...");

const mockFilePath = path.resolve(process.cwd(), "public/mock-mission-test.txt");

if (!fs.existsSync(mockFilePath)) {
  console.error("🚨 CRITICAL BLOCKER: The file 'public/mock-mission-test.txt' was not found. Please create it first.");
  process.exit(1);
}

// Read the text specs content out of your local testing mock file
const fileRawContent = fs.readFileSync(mockFilePath, "utf8");

// Mock parser check simulation function replicating the gpt-6-astra system prompt parameters
function simulateSystemParser(rawText) {
  console.log("\n--- 📖 INGESTING INSTANCE DATA TARGET CONTENT ---");
  console.log(`Ingested string length: ${rawText.length} characters.`);

  // Regex boundaries simulate structural array parsing extractions
  const hasHighTier = rawText.includes("HIGH-IMPACT VECTORS");
  const hasMediumTier = rawText.includes("MEDIUM-IMPACT VECTORS");
  const hasLowTier = rawText.includes("LOW-IMPACT VECTORS");
  const hasDailyAction = rawText.includes("CATALYST ACTION");

  console.log("\n--- 🧠 EVALUATING PROMPT INSTRUCTION MATRICES ---");
  console.log(`[RULE 1] High-Impact Tier Target Found?  --> ${hasHighTier ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`[RULE 2] Medium-Impact Tier Target Found?--> ${hasMediumTier ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`[RULE 3] Low-Impact Tier Target Found?   --> ${hasLowTier ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`[RULE 4] Daily Catalyst Action Extracted? --> ${hasDailyAction ? "✅ PASS" : "❌ FAIL"}`);

  if (hasHighTier && hasMediumTier && hasLowTier && hasDailyAction) {
    console.log("\n🎉 PARSER RULES VERIFIED: The structured text layout completely matches the AI system guidelines matrix.");
    return true;
  } else {
    console.error("\n❌ PARSER ERROR: Missing required structural data nodes inside document schema compilation mapping.");
    return false;
  }
}

const verificationPassed = simulateSystemParser(fileRawContent);
process.exit(verificationPassed ? 0 : 1);
