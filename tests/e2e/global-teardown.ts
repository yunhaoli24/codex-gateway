import { stopDockerEnvironment } from "./docker-environment";

export default async function globalTeardown() {
  await stopDockerEnvironment();
}
