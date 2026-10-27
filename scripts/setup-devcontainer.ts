import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const origin =
  process.env.CODESPACE_NAME &&
  process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? `https://${process.env.CODESPACE_NAME}-3100.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : "http://localhost:3100";
const body = `DATABASE_URL=postgres://careerops:development-only@db:5432/careerops\nADMIN_PASSWORD=${randomBytes(20).toString("base64url")}\nSESSION_SECRET=${randomBytes(48).toString("hex")}\nAPP_ORIGIN=${origin}\nHOST=0.0.0.0\nPORT=3100\n`;
try {
  await writeFile(".env", body, { flag: "wx", mode: 0o600 });
  console.log(
    "Created private development settings. Run npm start. The owner password is in .env; it is not committed.",
  );
} catch (e: any) {
  if (e.code === "EEXIST") console.log("Existing .env retained.");
  else throw e;
}
