import { createServer } from "node:http";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const port = Number(process.env.BARK_TEST_PORT || 8080);
const logPath = process.env.BARK_TEST_LOG || "/requests/requests.jsonl";

mkdirSync(dirname(logPath), { recursive: true });

createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "bark-target"}`);
  const [, deviceKey = "", title = "", body = ""] = url.pathname.split("/");
  appendFileSync(
    logPath,
    `${JSON.stringify({
      deviceKey: decodeURIComponent(deviceKey),
      title: decodeURIComponent(title),
      body: decodeURIComponent(body),
      group: url.searchParams.get("group"),
      createdAt: new Date().toISOString(),
    })}\n`,
  );
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ code: 200, message: "success" }));
}).listen(port, "0.0.0.0", () => {
  console.log(`Bark test server listening on ${port}`);
});
