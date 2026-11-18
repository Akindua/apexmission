const fs = require("fs");
let f = "src/routes/api/client-portal/deliverables.ts";
let c = fs.readFileSync(f, "utf8");
c = c.replace(/insertError \|\| !deliverables/g, "error || !deliverables");
c = c.replace(
  /console\.error\("\[ClientDeliverables\] Query error:\), insertError\)/g,
  'console.error("[ClientDeliverables] Query error:", error)',
);
fs.writeFileSync(f, c);
console.log("done");
