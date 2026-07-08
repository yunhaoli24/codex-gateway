import { createServer, type IncomingMessage } from "node:http";
import { connect as connectTcp, type Socket } from "node:net";

export class LocalHttpConnectProxy {
  private readonly sockets = new Set<Socket>();
  private readonly server = createServer((request, response) => {
    proxyHttpRequest(request, response.socket);
  });

  async listen() {
    this.server.on("connect", proxyConnectRequest);
    this.server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    return this.port();
  }

  async close() {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
  }

  private port() {
    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Local HTTP proxy did not bind to a TCP port");
    }
    return address.port;
  }
}

function proxyConnectRequest(request: IncomingMessage, clientSocket: Socket, head: Buffer) {
  const target = parseConnectTarget(request.url || "");
  if (!target) {
    clientSocket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }

  const upstream = connectTcp(target.port, target.host, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length) {
      upstream.write(head);
    }
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on("error", (error) => {
    if (!clientSocket.destroyed) {
      clientSocket.end(
        `HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n${error.message}\n`,
      );
    }
  });
  closePairOnError(clientSocket, upstream);
}

function proxyHttpRequest(request: IncomingMessage, clientSocket: Socket | null) {
  if (!clientSocket) {
    return;
  }
  const target = parseHttpTarget(request.url || "");
  if (!target) {
    clientSocket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }

  const upstream = connectTcp(target.port, target.host, () => {
    upstream.write(`${request.method || "GET"} ${target.path} HTTP/${request.httpVersion}\r\n`);
    for (const [name, value] of Object.entries(request.headers)) {
      if (/^proxy-connection$/i.test(name) || value == null) {
        continue;
      }
      const renderedValue = Array.isArray(value) ? value.join(", ") : value;
      upstream.write(`${name}: ${renderedValue}\r\n`);
    }
    upstream.write("\r\n");
    request.pipe(upstream);
    upstream.pipe(clientSocket);
  });
  upstream.on("error", (error) => {
    if (!clientSocket.destroyed) {
      clientSocket.end(
        `HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n${error.message}\n`,
      );
    }
  });
  closePairOnError(clientSocket, upstream);
}

function parseConnectTarget(value: string) {
  const match = value.match(/^([^:]+):(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    host: match[1],
    port: Number(match[2]),
  };
}

function parseHttpTarget(value: string) {
  try {
    const url = new URL(value);
    return {
      host: url.hostname,
      port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
      path: `${url.pathname}${url.search}`,
    };
  } catch {
    return null;
  }
}

function closePairOnError(left: Socket, right: Socket) {
  left.on("error", () => right.destroy());
  right.on("error", () => left.destroy());
  left.on("close", () => right.destroy());
  right.on("close", () => left.destroy());
}
