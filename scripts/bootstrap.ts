import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
await mkdir(".data", { recursive: true, mode: 0o700 });
const password = randomBytes(20).toString("base64url");
const body = `ADMIN_PASSWORD=${password}\nSESSION_SECRET=${randomBytes(48).toString("hex")}\nDATABASE_URL=postgres://careerops:careerops@127.0.0.1:5432/careerops\nAPP_ORIGIN=http://localhost:3100\nPORT=3100\n`;
try {
  await writeFile(".env", body, { flag: "wx", mode: 0o600 });
  console.log(
    "Created .env with a generated owner password. View it locally to sign in. Replace DATABASE_URL with your database connection. No existing config was overwritten.",
  );
} catch (e: any) {
  if (e.code === "EEXIST")
    console.log(".env already exists; retained without changes.");
  else throw e;
}
