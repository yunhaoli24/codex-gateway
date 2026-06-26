import { startDockerEnvironment } from './docker-environment'

export default async function globalSetup() {
  await startDockerEnvironment()
}
