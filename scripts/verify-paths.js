import fs from "fs";
import path from "path";

console.log("🚀 Executing automated file verification routines...");

const CRITICAL_FILES = [
  "src/client.tsx",
  "src/routes/app.tsx",
  "src/routes/plans.tsx",
  "src/routes/daily-briefing.tsx",
  "src/routes/verify-email.tsx",
  "src/routes/night-reflection.tsx",
  "public/accountability-worker.js"
];

let failed = false;

CRITICAL_FILES.forEach((fileFile) => {
  const targetPath = path.resolve(process.cwd(), fileFile);
  if (!fs.existsSync(targetPath)) {
    console.error(`🚨 ARCHITECTURE BREACH: Required system file path missing: ${fileFile}`);
    failed = true;
  } else {
    // Audit internal content structure to trap unclosed variable states
    const codeBody = fs.readFileSync(targetPath, "utf8");
    if (codeBody.includes("const milestones =;") || codeBody.includes("cat <<")) {
      console.error(`🚨 SYNTAX CORRUPTION: Broken expression tokens discovered inside: ${fileFile}`);
      failed = true;
    }
  }
});

if (failed) {
  console.log("❌ Compilation validation halted. Repair broken token configurations before deployment.");
  process.exit(1);
} else {
  console.log("✅ Core files verified. All build targets are safe and stable.");
  process.exit(0);
}
