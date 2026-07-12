import { createServer } from "node:http";
import { WebSocketServer } from "/home/codex/.nvm/versions/node/v22.0.0/lib/node_modules/ws/wrapper.mjs";

const server = createServer((request, response) => {
  if (request.url === "/api/message") {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ message: "remote-preview-http-ok" }));
    return;
  }
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(`<!doctype html><meta charset="utf-8"><title>Remote Preview E2E</title>
    <h1>remote-preview-page</h1><p id="http">loading</p><p id="ws">loading</p>
    <script>
      fetch('/api/message').then(r=>r.json()).then(({message})=>document.querySelector('#http').textContent=message);
      const socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/browser-preview/websocket?path=/socket');
      socket.addEventListener('open',()=>socket.send('remote-preview-websocket'));
      socket.addEventListener('message',event=>document.querySelector('#ws').textContent=event.data);
      socket.addEventListener('error',()=>document.querySelector('#ws').textContent='websocket-error');
      socket.addEventListener('close',event=>document.querySelector('#ws').textContent='websocket-closed-'+event.code+'-'+event.reason);
    </script>`);
});
const sockets = new WebSocketServer({ noServer: true });
sockets.on("connection", (socket) =>
  socket.on("message", (message, isBinary) => socket.send(message, { binary: isBinary })),
);
server.on("upgrade", (request, socket, head) => {
  sockets.handleUpgrade(request, socket, head, (webSocket) =>
    sockets.emit("connection", webSocket),
  );
});
server.listen(4173, "127.0.0.1");
